const root=new URL('./',import.meta.url);
export const config=await fetch(new URL('manifest.json',root),{cache:'no-store'}).then(r=>r.json());
const cache=new Map();
function load(file){if(!cache.has(file))cache.set(file,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('素材加载失败：'+file));image.src=new URL(file,root); }));return cache.get(file)}
export function drawFrame(ctx,image,source,outer,inner){
 const xs=[0,source[0],source[0]+source[2],image.width],ys=[0,source[1],source[1]+source[3],image.height];
 const xd=[outer.x,inner.x,inner.x+inner.width,outer.x+outer.width],yd=[outer.y,inner.y,inner.y+inner.height,outer.y+outer.height];
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){ctx.drawImage(image,xs[x],ys[y],xs[x+1]-xs[x],ys[y+1]-ys[y],xd[x],yd[y],xd[x+1]-xd[x],yd[y+1]-yd[y]);}
}
const participationCache=new Map();
async function strip(profile=config){const p=profile.participation,key=JSON.stringify(p);if(participationCache.has(key))return participationCache.get(key);const img=await load(p.file),c=document.createElement('canvas');c.width=p.rect[2];c.height=p.rect[3];const ctx=c.getContext('2d');ctx.drawImage(img,...p.rect,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<data.data.length;i+=4){const alpha=Math.max(0,Math.min(1,(Math.max(...data.data.subarray(i,i+3))-p.matteKey.threshold)/p.matteKey.range));data.data[i+3]*=alpha;}ctx.putImageData(data,0,0);participationCache.set(key,c);return c;}
export async function mount(canvas,initial={}){
 let activeConfig=config;
 const state={enabled:true,mapFrame:'azure',giftFrame:'gold',...initial};let generation=0;
 const ctx=canvas.getContext('2d'),box=canvas.parentElement;let lastError='';
 async function render(){const config=activeConfig;const token=++generation;if(!state.enabled){canvas.hidden=true;return;}canvas.hidden=false;const m=config.frames.map.find(x=>x.id===state.mapFrame),g=config.frames.gift.find(x=>x.id===state.giftFrame);if(!m||!g)throw Error('未知皮肤编号');
  try{const [map,gift,header,...icons]=await Promise.all([load(m.file),load(g.file),strip(config),...config.gifts.map(x=>load(x.file))]);if(token!==generation)return;
   const size=box.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(size.width*dpr);canvas.height=Math.round(size.height*dpr);ctx.setTransform(canvas.width/config.source.width,0,0,canvas.height/config.source.height,0,0);ctx.clearRect(0,0,config.source.width,config.source.height);
   const opening=config.mapOpening;ctx.fillStyle=`rgba(0,0,0,${config.exteriorDimOpacity ?? 0.8})`;ctx.beginPath();ctx.rect(0,0,config.source.width,config.source.height);ctx.rect(opening.x,opening.y,opening.width,opening.height);ctx.fill('evenodd');
   drawFrame(ctx,map,m.railRect||m.sourceOpening,config.mapFrame,opening);
   const f=config.giftFrame;ctx.drawImage(gift,f.x,f.y,f.width,f.height);
   const p=config.participation;ctx.drawImage(header,p.x,p.y,p.width,p.height);
   const cx=config.source.width/2,cy=config.source.height-f.centerFromBottom;
   const text=(value,x,y,size,color,align='center')=>{ctx.font=`bold ${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=1.4;ctx.strokeStyle='#080808';ctx.strokeText(value,x,y);ctx.fillStyle=color;ctx.fillText(value,x,y);};
   config.gifts.forEach((item,i)=>{const x=cx+config.giftLayout.firstCenterX+i*config.giftLayout.pitch;ctx.drawImage(icons[i],x-14.5,cy-27-14.5,29,29);text(item.name,x,cy-7,9.5,'#fff1cf');text(item.effect,x,cy+7,10.5,'#ffe18c');item.previewLines.forEach((line,k)=>text(line,x,cy+21+k*12,9,k?'#fff2d4':'#8ffff0'));if(i){ctx.strokeStyle='#9b743b88';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-23,cy-36);ctx.lineTo(x-23,cy+41);ctx.stroke();}});
   config.commands.forEach(([command,meaning],i)=>{const y=cy-35+i*11.5;text(command,cx-4+98-25,y,9,'#fff6de','left');text(meaning,cx-4+154-26,y,9,'#ffe344','left')});text('队长下令 · 点赞增兵',cx-4+125,cy+35,8.5,'#fff2d4');
   lastError='';canvas.dataset.ready='true';canvas.dispatchEvent(new CustomEvent('ui-rendered'));
  }catch(error){lastError=error.message;canvas.dataset.error=lastError;throw error;}
 }
 const observer=new ResizeObserver(()=>render().catch(console.error));observer.observe(box);await render();
 return {setProfile:async profile=>{activeConfig=profile||config;await render()},set:async change=>{Object.assign(state,change);await render()},snapshot:()=>({state:{...state},layout:activeConfig,error:lastError,ready:canvas.dataset.ready==='true'}),destroy:()=>observer.disconnect()};
}
