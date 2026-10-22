"""Inspect an alpha video against the entrance and final-reference requirements.
This checks pixels and timing, not the subjective naturalness of a gait.
Usage: python3 review-sequence.py VIDEO REGISTERED_FINAL_PNG OUTPUT_DIR
"""
import json,subprocess,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
video,reference,out=Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
frames=out/'frames';frames.mkdir(exist_ok=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-c:v','libvpx-vp9','-i',str(video),'-fps_mode','passthrough','-y',str(frames/'%05d.png')],check=True)
files=sorted(frames.glob('*.png'));first=Image.open(files[0]).convert('RGBA');size=first.size
areas=[];bounds=[];deltas=[];previous=None
for path in files:
 image=Image.open(path).convert('RGBA');a=np.array(image);alpha=a[:,:,3]/255
 bounds.append(image.getchannel('A').point(lambda x:255 if x>64 else 0).getbbox())
 areas.append(int((alpha>.25).sum()))
 # Premultiplication prevents invisible RGB from counting as scene changes.
 premul=np.concatenate([a[:,:,:3]*alpha[:,:,None],a[:,:,3:4]],axis=2)
 if previous is not None:deltas.append(float(np.mean(np.abs(premul-previous))))
 previous=premul
last=np.array(Image.open(files[-1]).convert('RGBA')).astype(float)
ref=np.array(Image.open(reference).convert('RGBA').resize(size,Image.Resampling.LANCZOS)).astype(float)
alpha_last=last[:,:,3:4]/255;alpha_ref=ref[:,:,3:4]/255
final_error=float(np.abs(last[:,:,:3]*alpha_last-ref[:,:,:3]*alpha_ref).mean())
first_visible=next((i for i,n in enumerate(areas) if n>20),None)
report={'frames':len(files),'size':size,'initialVisiblePixels':areas[0],'firstVisibleFrame':first_visible,'firstVisibleBounds':bounds[first_visible] if first_visible is not None else None,'finalReferencePremultipliedMAE':final_error,'largestFrameDifference':max(deltas,default=0),'areas':areas,'bounds':bounds,'frameDifferences':deltas,'manualReviewRequired':['alternating foot contact','weight transfer','same face and markings','continuous lowering to reference pose']}
(out/'pixels.json').write_text(json.dumps(report,indent=2))
thumbs=Image.new('RGB',(1200,900),'#bcbcbc');draw=ImageDraw.Draw(thumbs)
for slot,index in enumerate(np.linspace(0,len(files)-1,16).astype(int)):
 im=Image.open(files[index]).convert('RGBA');im.thumbnail((300,200));x=(slot%4)*300;y=(slot//4)*225;thumbs.paste(im,(x,y),im.getchannel('A'));draw.text((x+8,y+204),f'frame {index}',fill='black')
thumbs.save(out/'contact.jpg')
print(json.dumps({k:v for k,v in report.items() if k not in ['areas','bounds','frameDifferences']},indent=2))
assert areas[0]==0,'The sequence must start with the panda completely offscreen'
assert first_visible is not None and bounds[first_visible][0]<=2,'First appearance must touch the left screen edge'
assert final_error<8,'Final pose must match the registered reference; requires visual review too'
