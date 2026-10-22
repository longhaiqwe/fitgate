"""Finish licensed video frames after local Vision segmentation.
The selected shot includes a light stone step next to the black hind paw.
Remove its bright residue only in that shot's fixed lower-right region.
This is a video alpha-matte cleanup, not generation of replacement anatomy.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
root=Path(__file__).resolve().parents[2]
source=root/'artifacts/free-video/walking-alpha'
out=root/'artifacts/free-video/finished-frames';out.mkdir(exist_ok=True)
for file in sorted(source.glob('*.png'))[:280]:
    a=np.array(Image.open(file).convert('RGBA'))
    # Small ROI avoids running morphology over the full video frame.
    roi=a[770:880,475:640]
    light=np.zeros(roi.shape[:2],dtype='uint8')
    light[10:100,10:155]=(roi[10:100,10:155,:3].min(axis=2)>85)*255
    removal=np.array(Image.fromarray(light).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(0.6)))
    roi[:,:,3]=(roi[:,:,3].astype(float)*(1-removal/255)).astype('uint8')
    Image.fromarray(a).crop((212,264,788,968)).save(out/file.name)
print('Finished 280 frames at 30 fps.')
