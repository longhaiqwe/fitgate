"""Local Real-ESRGAN-general-x4v3 restoration of the existing video frames.
Requires PyTorch with MPS and the official model/architecture in build/video-upscale.
The source architecture has only the BasicSR registry decorator removed.
This improves an existing low-resolution video; it is not native HD generation.
"""
from pathlib import Path
import sys,time
import torch
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2]
base=root/'build/video-upscale'
sys.path.insert(0,str(base))
from srvgg_arch import SRVGGNetCompact
model=SRVGGNetCompact(num_in_ch=3,num_out_ch=3,num_feat=64,num_conv=32,upscale=4,act_type='prelu')
state=torch.load(base/'realesr-general-x4v3.pth',map_location='cpu',weights_only=True)
model.load_state_dict(state.get('params_ema',state.get('params',state)));model=model.eval().to('mps').half()
torch.set_num_threads(2)
source=root/'artifacts/panda-exact-pose/frames';out=root/'artifacts/clarity-review/upscaled';out.mkdir(exist_ok=True)
paths=sorted(source.glob('*.png')) if '--all' in sys.argv else [source/'0070.png']
with torch.inference_mode():
 for index,file in enumerate(paths):
  target=out/file.name
  if target.exists():continue
  start=time.monotonic();full=Image.open(file).convert('RGB')
  matte=Image.open(root/'artifacts/panda-exact-pose/finished'/file.name).getchannel('A')
  bbox=matte.getbbox()
  if not bbox:
   full.resize((2048,1152),Image.Resampling.LANCZOS).save(target);continue
  x0=max(0,((bbox[0]-24)//32)*32);y0=max(0,((bbox[1]-24)//32)*32)
  x1=min(full.width,((bbox[2]+55)//32)*32);y1=min(full.height,((bbox[3]+55)//32)*32)
  im=full.crop((x0,y0,x1,y1))
  data=torch.from_numpy(np.array(im).transpose(2,0,1).copy()).unsqueeze(0).to('mps',dtype=torch.float16)/255
  result=model(data).clamp(0,1).float().cpu().squeeze(0).permute(1,2,0).numpy()
  result=Image.fromarray((result*255).round().astype('uint8')).resize((im.width*2,im.height*2),Image.Resampling.LANCZOS)
  canvas=full.resize((2048,1152),Image.Resampling.LANCZOS);canvas.paste(result,(x0*2,y0*2));canvas.save(target)
  del data,result,canvas
  if index%8==0:torch.mps.empty_cache()
  print(f'{index+1}/{len(paths)} {file.name} {time.monotonic()-start:.2f}s',flush=True)
