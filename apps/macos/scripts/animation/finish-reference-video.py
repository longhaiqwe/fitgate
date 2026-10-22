"""Matte cleanup and registered final-frame restoration for the free LTX clip.
No retiming, translated stills, optical-flow morphs, or replacement action shots.
"""
from pathlib import Path
from PIL import Image
import numpy as np
from scipy import ndimage
root=Path(__file__).resolve().parents[2]
p=root/'artifacts/panda-exact-pose';out=p/'finished';out.mkdir(exist_ok=True)
ref=Image.open(p/'reference.png').convert('RGBA').resize((704,520),Image.Resampling.LANCZOS)
poster=Image.new('RGBA',(1024,576));poster.alpha_composite(ref,(224,48))
# Keep the rest texture at near-native reference resolution even if producing
# the original low-resolution entrance clip for comparison.
hires=Image.new('RGBA',(2048,1152))
hires.alpha_composite(Image.open(p/'reference.png').convert('RGBA').resize((1408,1040),Image.Resampling.LANCZOS),(448,96))
hires.save(root/'public/assets/panda-poster.png')
Image.open(p/'reference.png').save(root/'public/assets/panda-rest.png')
ref=np.array(poster,dtype=float)
for i in range(1,146):
    a=np.array(Image.open(p/'alpha'/f'{i:04}.png').convert('RGBA'))
    if i<=10:
        # Vision misses the partly offscreen nose. The neutral-gray studio
        # background supplies a deterministic matte for these edge fragments.
        rgb=np.array(Image.open(p/'frames'/f'{i:04}.png').convert('RGB'))
        diff=np.max(np.abs(rgb.astype(float)-128),axis=2)
        mask=diff>18
        labels,n=ndimage.label(mask)
        keep=np.zeros_like(mask)
        for label in range(1,n+1):
            ys,xs=np.where(labels==label)
            if len(xs)>8 and xs.min()<3:keep|=labels==label
        # Pad the screen edge so enclosed gray fur is also kept.
        padded=np.pad(keep,((0,0),(1,0)),constant_values=False)
        padded[:,0]=padded[:,1]
        keep=ndimage.binary_fill_holes(padded)[:,1:]
        alpha=ndimage.gaussian_filter(keep.astype(float),.45)
        a=np.dstack([rgb,(alpha*255).astype('uint8')])
    if i==1:a[:,:,3]=0
    Image.fromarray(a).save(out/f'{i:04}.png')
# The last generated frame is already in the requested posture. Restore only
# its remaining codec/texture differences after the movement has finished.
old=a.astype(float);aa=old[:,:,3:4]/255;bb=ref[:,:,3:4]/255
for i in range(146,158):
    t=(i-145)/12;t=t*t*(3-2*t)
    alpha=aa*(1-t)+bb*t
    rgb=(old[:,:,:3]*aa*(1-t)+ref[:,:,:3]*bb*t)/np.maximum(alpha,1e-8)
    a=np.concatenate([rgb,alpha*255],axis=2).clip(0,255).astype('uint8')
    Image.fromarray(a).save(out/f'{i:04}.png')
print('157 frames; 24 fps; final source image registered at (224,48).')
