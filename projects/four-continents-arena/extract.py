"""Turn the approved raster design into an indexed, editable territory atlas."""
from pathlib import Path
import json, shutil, hashlib, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.color import rgb2lab
from skimage.segmentation import watershed
from skimage.measure import find_contours, approximate_polygon
from sklearn.cluster import MiniBatchKMeans

OUT=Path(__file__).resolve().parent
OUT.mkdir(parents=True,exist_ok=True)
BASE=OUT/'base.png'
TARGET=OUT/'reference.png'
assert TARGET.is_file(), "Approved reference is required"
if not BASE.is_file():BASE=TARGET
rgb=np.asarray(Image.open(TARGET).convert('RGB'))
H,W=rgb.shape[:2]
smooth=ndi.gaussian_filter(rgb.astype(float),(1.5,1.5,0))/255
lab=rgb2lab(smooth)
r,g,b=np.moveaxis(smooth,-1,0)
# A blue/cyan territory is not water. Cross-check the approved uncolored terrain.
base_rgb=np.asarray(Image.open(BASE).convert('RGB'))
assert base_rgb.shape==rgb.shape
base_smooth=ndi.gaussian_filter(base_rgb.astype(float),(1.5,1.5,0))/255
br,bg,bb=np.moveaxis(base_smooth,-1,0)
sea=((b>g*.92)&(r<g*.62)&(r<.30)) & ((bb>bg*.95)&(br<bg*.72)&(br<.36))
sea=ndi.binary_opening(sea,iterations=1)
water,n=ndi.label(sea);sizes=np.bincount(water.ravel());sizes[0]=0
sea=sizes[water]>30
land=~sea
# A light rim at the coast belongs to its adjacent land, not to the ocean.
labfeat=lab.copy();labfeat[...,0]*=.18
features=labfeat[land]
model=MiniBatchKMeans(n_clusters=10,random_state=1831,n_init=5,batch_size=8192).fit(features[::4])
colors=np.full((H,W),-1,dtype=np.int16);colors[land]=model.predict(features)
markers=np.zeros((H,W),np.int32);count=0
for k in range(10):
    # Pale coast highlights and gray architectural trim are material, not new territories.
    mask=ndi.binary_opening((colors==k)&(np.hypot(lab[...,1],lab[...,2])>22),iterations=2)
    cc,n=ndi.label(mask);sizes=np.bincount(cc.ravel());sizes[0]=0
    for v in np.where(sizes>260)[0]:
        count+=1;markers[cc==v]=count
# Grow stable palette interiors to the actual painted borders, leaving no gaps.
gradient=np.hypot(ndi.sobel(lab[...,1]),ndi.sobel(lab[...,2]))
gradient+=np.maximum(0,ndi.gaussian_filter(lab[...,0],3)-lab[...,0])*4
labels=watershed(gradient,markers,mask=land,compactness=.001)
# Drop coastal slivers and isolated small texture components from the land mask.
orphans=land&(labels==0)
if orphans.any():
    _,near=ndi.distance_transform_edt(labels==0,return_indices=True)
    labels[orphans]=labels[tuple(near)][orphans]
# Texture shading can split one painted region into two palette clusters.
# Merge only similarly colored neighbors with NO visible dark dividing line.
means={i:np.median(lab[labels==i],axis=0) for i in range(1,count+1) if np.any(labels==i)}
parents=np.arange(count+1)
def root(i):
    while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
    return i
shared={}
for dy,dx in [(0,1),(1,0)]:
    a=labels[:H-dy,:W-dx];c=labels[dy:,dx:]
    yy,xx=np.where((a>0)&(c>0)&(a!=c))
    for y,x in zip(yy,xx):
        key=tuple(sorted((int(a[y,x]),int(c[y,x]))))
        shared.setdefault(key,[]).append(float(lab[y,x,0]))
for (a,b),values in shared.items():
    if np.linalg.norm(means[a]-means[b])<14 and np.mean(values)-(means[a][0]+means[b][0])/2>-12:
        parents[root(b)]=root(a)
lookup=np.array([root(i) for i in range(count+1)])
labels=lookup[labels]
# Split disconnected islands after growth/merge. A shared color does not imply a land connection.
connected=np.zeros_like(labels,dtype=np.int32);connected_count=0
for old in np.unique(labels):
    if not old:continue
    cc,n=ndi.label(labels==old)
    for part in range(1,n+1):
        mask=cc==part
        if mask.sum()<18:
            land[mask]=False
            continue
        connected_count+=1;connected[mask]=connected_count
labels=connected;count=connected_count
rows=[];new=np.zeros_like(labels,dtype=np.uint16)
for old in range(1,count+1):
    mask=labels==old
    if not mask.any():continue
    i=len(rows)+1;new[mask]=i
    dist=ndi.distance_transform_edt(mask)
    cy,cx=np.unravel_index(np.argmax(dist),dist.shape)
    color=np.median(rgb[mask],axis=0).astype(int).tolist()
    contours=find_contours(np.pad(mask.astype(np.uint8),1),.5)
    polygons=[]
    for contour in contours:
        if len(contour)<12:continue
        points=approximate_polygon(contour,1.2)-1
        polygons.append([[round(float(p[1]),2),round(float(p[0]),2)] for p in points])
    rows.append(dict(id=i,color=color,area=int(mask.sum()),center=[int(cx),int(cy)],rings=polygons))
labels=new
border=np.zeros((H,W),bool)
for dy,dx in [(0,1),(1,0)]:
    a=labels[:H-dy,:W-dx];c=labels[dy:,dx:]
    cut=(a!=c)&(a>0)&(c>0)
    border[:H-dy,:W-dx]|=cut;border[dy:,dx:]|=cut
border=ndi.binary_dilation(border,iterations=3)&(labels>0)
body=rgb.copy()
for row in rows:
    mask=labels==row['id'];interior=mask&~border
    if not interior.any():continue
    _,near=ndi.distance_transform_edt(~interior,return_indices=True)
    replace=mask&border
    body[replace]=rgb[near[0][replace],near[1][replace]]
Image.fromarray(body).save(OUT/'material.png')
edge=np.zeros((H,W,4),np.uint8);edge[border,:3]=rgb[border];edge[border,3]=255
Image.fromarray(edge).save(OUT/'borders.png')
(OUT/'borders.u8').write_bytes(border.astype(np.uint8).tobytes())
adj=[set() for _ in rows]
portals={}
for dy,dx in [(0,1),(1,0)]:
    a=labels[:H-dy,:W-dx];c=labels[dy:,dx:]
    yy,xx=np.where((a>0)&(c>0)&(a!=c))
    for y,x in zip(yy,xx):
        i,j=int(a[y,x]),int(c[y,x]);key=f'{min(i,j)}:{max(i,j)}'
        adj[i-1].add(j);adj[j-1].add(i)
        portals.setdefault(key,[]).append([int(x),int(y)])
for row,neighbors in zip(rows,adj):row['neighbors']=sorted(neighbors)
(OUT/'territories.u16').write_bytes(labels.astype('<u2').tobytes())
encoded=np.zeros((H,W,4),np.uint8);encoded[...,0]=labels%256;encoded[...,1]=labels//256;encoded[...,3]=255
Image.fromarray(encoded).save(OUT/'territories-id.png')
compact={'width':W,'height':H,'territories':[{k:r[k] for k in ['id','color','area','center','neighbors']} for r in rows]}
(OUT/'runtime-atlas.json').write_text(json.dumps(compact,separators=(',',':')),encoding='utf8')
if False:
    (ROOT/'cocos-map-war/assets/scripts/phone-map-data.ts').write_text('// Generated from the seam-repaired phone map.\nexport const PHONE_ATLAS = '+json.dumps(compact,separators=(',',':'))+';\n',encoding='utf8')
data=dict(width=W,height=H,territories=rows,portals=portals)
(OUT/'territories.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
report={'width':W,'height':H,'territoryCount':len(rows),'landPixels':int(land.sum()),'unassignedLandPixels':int(np.sum(land&(labels==0))),'connectedIds':True,'baseSha256':hashlib.sha256(BASE.read_bytes()).hexdigest(),'referenceSha256':hashlib.sha256(TARGET.read_bytes()).hexdigest()}
(OUT/'extraction.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))

# Inspection artifacts: indexed map is diagnostic only, never used as the displayed artwork.
rng=np.random.default_rng(7);palette=rng.integers(65,240,(len(rows)+1,3),dtype=np.uint8);palette[0]=[5,24,41]
diag=palette[labels];Image.fromarray(diag).save(OUT/'debug-regions.png')
Image.fromarray((land*255).astype(np.uint8)).save(OUT/'debug-land-mask.png')
