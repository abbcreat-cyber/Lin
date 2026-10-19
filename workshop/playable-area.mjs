/** The structural map opening is the gameplay boundary, independent of UI visibility.
 * Artwork is centered with CSS object-fit:cover. Only complete pixels inside it are active. */
export function playableBounds(width,height,layout){
 const {source:s,mapOpening:r}=layout||{};
 if(!s||!r||![s.width,s.height,r.width,r.height,width,height].every(n=>Number.isFinite(n)&&n>0)||![r.x,r.y].every(Number.isFinite))throw Error('缺少有效地图框内缘，禁止建立可玩地块');
 const scale=Math.max(s.width/width,s.height/height),ox=(width*scale-s.width)/2,oy=(height*scale-s.height)/2;
 const bounds={x0:Math.max(0,Math.ceil((r.x+ox)/scale)),y0:Math.max(0,Math.ceil((r.y+oy)/scale)),x1:Math.min(width,Math.floor((r.x+r.width+ox)/scale)),y1:Math.min(height,Math.floor((r.y+r.height+oy)/scale))};
 if(bounds.x1<=bounds.x0||bounds.y1<=bounds.y0)throw Error('地图框内缘没有可玩面积');
 return bounds;
}
export function insidePlayable(bounds,x,y){return x>=bounds.x0&&x<bounds.x1&&y>=bounds.y0&&y<bounds.y1;}
export function clipPlayableMap(atlas,rawIds,layout){
 const {width:w,height:h}=atlas;
 if(rawIds.length!==w*h)throw Error('地图数据尺寸错误');
 const profile=layout||atlas.playableArea?.layout,bounds=playableBounds(w,h,profile),ids=new Uint16Array(rawIds.length);
 const rows=atlas.territories.map(t=>({...t,area:0,active:false,center:[-1,-1],neighbors:[]})),stats=rows.map(()=>({x:0,y:0,best:Infinity,neighbors:new Set()}));
 for(let y=bounds.y0;y<bounds.y1;y++)for(let x=bounds.x0;x<bounds.x1;x++){
  const p=y*w+x,id=rawIds[p];if(!id)continue;if(!rows[id-1])throw Error('未知领地编号');ids[p]=id;rows[id-1].area++;stats[id-1].x+=x;stats[id-1].y+=y;
 }
 for(let p=0;p<ids.length;p++){const id=ids[p];if(!id)continue;const t=rows[id-1],s=stats[id-1],x=p%w,y=Math.floor(p/w),distance=(x-s.x/t.area)**2+(y-s.y/t.area)**2;
  t.active=true;if(distance<s.best){s.best=distance;t.center=[x,y];}
  for(const q of [x+1<w?p+1:-1,y+1<h?p+w:-1])if(q>=0&&ids[q]&&ids[q]!==id){s.neighbors.add(ids[q]);stats[ids[q]-1].neighbors.add(id);}
 }
 rows.forEach((t,i)=>t.neighbors=[...stats[i].neighbors].sort((a,b)=>a-b));
 const playableArea={version:1,kind:'map-frame-opening',bounds,layout:{source:{width:profile.source.width,height:profile.source.height},mapOpening:{...profile.mapOpening}},activeTerritories:rows.filter(t=>t.active).length};
 return {atlas:{...atlas,territories:rows,playableArea},ids,bounds};
}
