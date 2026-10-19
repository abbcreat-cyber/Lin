import {recolorPixel} from '../templates/six-realms/frontier.mjs';
/** Identical territory compositing for the HTML workshop and native mini-game. */
export function paintTerritory(surface,b,from,to){
 const {width:W,height:H,ids,pixelOwners,colors,material,target,live,borders}=surface;
 let minX=W,minY=H,maxX=0,maxY=0;const edges=new Set();
 const include=p=>{const x=p%W,y=Math.floor(p/W);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);};
 const paint=(p,source)=>{if(!ids[p])return;const i=p*4,changed=recolorPixel(Array.from(source.subarray(i,i+3)),colors[ids[p]],colors[pixelOwners[p]]);for(let k=0;k<3;k++)live[i+k]=changed[k];include(p);};
 for(let j=from;j<to;j++){const p=b.wave.order[j];if(!ids[p])continue;paint(p,material);const x=p%W,y=Math.floor(p/W);
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy,q=yy*W+xx;if(xx>=0&&xx<W&&yy>=0&&yy<H&&ids[q]&&borders[q])edges.add(q);}
 }
 for(const p of edges){const x=p%W,y=Math.floor(p/W),owner=pixelOwners[p];let divided=false;
  for(let dy=-3;dy<=3&&!divided;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const other=pixelOwners[yy*W+xx];if(other>0&&other!==owner){divided=true;break;}}
  paint(p,divided?target:material);
 }
 return minX<=maxX?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null;
}
