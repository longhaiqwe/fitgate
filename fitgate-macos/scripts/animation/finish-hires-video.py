"""Assemble locally restored motion and native-detail reference at 2048x1152.
Run restore-video.py first. Geometry, frame order and duration stay unchanged.
"""
from pathlib import Path
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parents[2]
source=root/'artifacts/panda-exact-pose';work=root/'artifacts/clarity-review'
out=work/'finished';out.mkdir(exist_ok=True)
original=Image.open(source/'reference.png').convert('RGBA')
poster=Image.new('RGBA',(2048,1152));poster.alpha_composite(original.resize((1408,1040),Image.Resampling.LANCZOS),(448,96))
poster.save(root/'public/assets/panda-poster.png')
for i in range(1,146):
 name=f'{i:04}.png'
 rgb=Image.open(work/'upscaled'/name).convert('RGBA')
 matte=Image.open(source/'finished'/name).getchannel('A').resize((2048,1152),Image.Resampling.LANCZOS)
 rgb.putalpha(matte);rgb.save(out/name)
old=np.array(rgb,dtype=np.float32);ref=np.array(poster,dtype=np.float32)
a=old[:,:,3:4]/255;b=ref[:,:,3:4]/255
for i in range(146,158):
 t=min(1,(i-145)/4);t=t*t*(3-2*t)
 alpha=a*(1-t)+b*t
 color=(old[:,:,:3]*a*(1-t)+ref[:,:,:3]*b*t)/np.maximum(alpha,1e-8)
 result=np.concatenate([color,alpha*255],axis=2).clip(0,255).round().astype('uint8')
 Image.fromarray(result).save(out/f'{i:04}.png')
print('Assembled 157 frames at 2048x1152; final frame uses native-detail reference.')
