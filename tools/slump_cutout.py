from PIL import Image
import numpy as np
from scipy import ndimage
out={}
for g in ['mob01','mob02','mob04','mob05']:
    src=np.array(Image.open(g+'_src.png')).astype(int); raw=np.array(Image.open(g+'_raw.png'))
    R,G,B=src[...,0],src[...,1],src[...,2]
    wood=(R-B>18)&(R>G)&(G>=B-5)&(R<175)&(R>35)
    rows=wood.sum(1); ys=np.where(rows>src.shape[1]*0.3)[0]; y0,y1=ys.min(),ys.max()
    wood&=(R>40)&(R<150)
    Hh=src.shape[0]; yy=np.arange(Hh)[:,None]
    band=(yy>=y0-3)&(yy<=y1+3)
    rem=wood&band
    # posts: wood components below the band that touch it, narrow and tall
    lab,n=ndimage.label(wood&(yy>y1-2))
    for i,sl in enumerate(ndimage.find_objects(lab)):
        if sl is None: continue
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if h>80 and w<130 and sl[0].start>=y0-4 and 60<=R[lab==i+1].mean()<=150: rem|=(lab==i+1)
    rem|=band&(R-B>14)&(R<150)&(R>35)&(G<=R)
    rem=ndimage.binary_dilation(rem,iterations=2)
    alpha=raw[...,3].copy().astype(int)
    alpha[rem & (alpha>0)]=0
    # posts: wood columns below beam already removed; keep largest component
    m=alpha>100; lab,n=ndimage.label(m); 
    if n>1:
        sz=ndimage.sum(m,lab,range(1,n+1)); keep=lab==(np.argmax(sz)+1)
        keep=ndimage.binary_dilation(keep,iterations=3)&(alpha>0); alpha[~keep]=0
    rgb=raw[...,:3].astype(float); a2=alpha.copy()
    # fill: in beam band, columns with body just above and just below
    lo,hi=max(0,y0-6),min(src.shape[0]-1,y1+6)
    filled=0
    cxs=np.where((a2[y0-3:y0-1]>128).any(0))[0]; xlim=np.percentile(cxs,40) if len(cxs) else src.shape[1]
    for x in range(src.shape[1]):
        if x<xlim and a2[lo-3,x]>200 and a2[hi+3,x]>200:
            c0=rgb[lo-3,x].copy(); c1=rgb[hi+3,x].copy()
            for y in range(lo-1,hi+2):
                t=(y-lo+1)/(hi-lo+3); rgb[y,x]=c0*(1-t)+c1*t; a2[y,x]=255; filled+=1
    img=np.dstack([rgb.clip(0,255).astype(np.uint8),a2.clip(0,255).astype(np.uint8)])
    im=Image.fromarray(img,'RGBA'); bb=im.split()[3].point(lambda v:255 if v>128 else 0).getbbox()
    im=im.crop(bb); im.save(g+'_slump_cut.png')
    H=im.height; ry=(bb[3]-y0)/H
    # rx: contact span = columns with body within 6px above beam top
    band=a2[y0-3:y0-1, bb[0]:bb[2]]>128; xs=np.where(band.any(0))[0]
    # pick the girl's torso contact: rightmost contiguous region? use median
    A2=np.array(im.split()[3])>128; W2=im.width; tops=[np.argmax(A2[:,x]) if A2[:,x].any() else 9999 for x in range(int(W2*0.6))]; rx=float(int(np.argmin(tops)))/W2
    out[g]={'ry':round(ry,3),'rx':round(rx,3),'beam':(int(y0),int(y1)),'filled':filled,'size':im.size}
    print(g,out[g])
import json; json.dump(out,open('slump_meta.json','w'))
