import {TroopPipeline} from '../workshop/pipeline.mjs';
import {paintTerritory} from '../workshop/territory-paint.mjs';
const storage=tt.getFileSystemManager();
const read=(file,encoding)=>storage.readFileSync(file,encoding);
const json=file=>JSON.parse(read(file,'utf8'));
const buffer=file=>{const value=read(file);return value instanceof ArrayBuffer?value:value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)};
const config=json('map-config.json'),layout=config.ui,atlas=json('map/territories.json'),examples=json('map/demo-pairs.json');
const canvas=tt.createCanvas(),ctx=canvas.getContext('2d');
const offscreen=(w,h)=>{const c=typeof tt.createOffscreenCanvas==='function'?tt.createOffscreenCanvas({type:'2d',width:w,height:h}):tt.createCanvas();c.width=w;c.height=h;return c;};
const load=file=>new Promise((resolve,reject)=>{const img=tt.createImage();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('素材加载失败：'+file));img.src=file;});
const imageCache=new Map();
let engine,surface,pixels,scene,sceneCtx,header,viewScale=1,viewX=0,viewY=0,last=0,example=0,ready=false,lastTap=0,touchStart=null;
function resize(){const info=tt.getSystemInfoSync(),w=info.windowWidth||info.screenWidth,h=info.windowHeight||info.screenHeight,dpr=info.pixelRatio||1;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);if(canvas.style){canvas.style.width=w+'px';canvas.style.height=h+'px';}const a=layout.audience;viewScale=Math.max(w/a.width,h/a.height);viewX=(w-a.width*viewScale)/2-a.x*viewScale;viewY=(h-a.height*viewScale)/2-a.y*viewScale;ctx.setTransform(dpr*viewScale,0,0,dpr*viewScale,dpr*viewX,dpr*viewY);}
function frame(image,source,outer,inner){const xs=[0,source[0],source[0]+source[2],image.width],ys=[0,source[1],source[1]+source[3],image.height],xd=[outer.x,inner.x,inner.x+inner.width,outer.x+outer.width],yd=[outer.y,inner.y,inner.y+inner.height,outer.y+outer.height];for(let y=0;y<3;y++)for(let x=0;x<3;x++)ctx.drawImage(image,xs[x],ys[y],xs[x+1]-xs[x],ys[y+1]-ys[y],xd[x],yd[y],xd[x+1]-xd[x],yd[y+1]-yd[y]);}
function overlay(){
 const r=layout.mapOpening,s=layout.source;ctx.fillStyle=`rgba(0,0,0,${layout.exteriorDimOpacity??.8})`;ctx.fillRect(0,0,s.width,r.y);ctx.fillRect(0,r.y+r.height,s.width,s.height-r.y-r.height);ctx.fillRect(0,r.y,r.x,r.height);ctx.fillRect(r.x+r.width,r.y,s.width-r.x-r.width,r.height);
 const m=layout.frames.map.find(f=>f.id===config.presentation.mapFrame),g=layout.frames.gift.find(f=>f.id===config.presentation.giftFrame);frame(imageCache.get(m.file),m.railRect||m.sourceOpening,layout.mapFrame,r);
 const f=layout.giftFrame;ctx.drawImage(imageCache.get(g.file),f.x,f.y,f.width,f.height);const p=layout.participation;ctx.drawImage(header,p.x,p.y,p.width,p.height);
 const cx=s.width/2,cy=s.height-f.centerFromBottom;
 function text(value,x,y,size,color,align='center'){ctx.font=`bold ${size}px sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=1.4;ctx.strokeStyle='#080808';ctx.strokeText(value,x,y);ctx.fillStyle=color;ctx.fillText(value,x,y);}
 layout.gifts.forEach((item,i)=>{const x=cx+layout.giftLayout.firstCenterX+i*layout.giftLayout.pitch;ctx.drawImage(imageCache.get(item.file),x-14.5,cy-41.5,29,29);text(item.name,x,cy-7,9.5,'#fff1cf');text(item.effect,x,cy+7,10.5,'#ffe18c');item.previewLines.forEach((line,k)=>text(line,x,cy+21+k*12,9,k?'#fff2d4':'#8ffff0'));if(i){ctx.strokeStyle='#9b743b88';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-23,cy-36);ctx.lineTo(x-23,cy+41);ctx.stroke();}});
 layout.commands.forEach(([command,meaning],i)=>{const y=cy-35+i*11.5;text(command,cx+69,y,9,'#fff6de','left');text(meaning,cx+124,y,9,'#ffe344','left')});text('队长下令 · 点赞增兵',cx+121,cy+35,8.5,'#fff2d4');
}
function soldiers(){
 const b=engine.bounds,t=engine.troops;ctx.save();ctx.beginPath();ctx.rect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);ctx.clip();
 for(const s of t.points()){
  const color=`rgb(${surface.colors[s.owner].join(',')})`;ctx.save();ctx.translate(s.x,s.y);ctx.scale(t.bodyScale,t.bodyScale);ctx.fillStyle='#081215a0';ctx.beginPath();ctx.ellipse(0,1.8,2.8,1.1,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=s.hitUntil>t.time?'#fff3c9':color;ctx.strokeStyle=s.fighting?'#ffcc6e':'#101b20';ctx.lineWidth=.65;ctx.fillRect(-2.2,-1.5,4.4,4);ctx.strokeRect(-2.2,-1.5,4.4,4);ctx.fillStyle='#eed7ab';ctx.beginPath();ctx.arc(0,-2.7,1.3,0,Math.PI*2);ctx.fill();
  if(s.token%10===0&&t.flagFits(s)){ctx.strokeStyle='#dac89b';ctx.beginPath();ctx.moveTo(1,2);ctx.lineTo(1,-9);ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(1,-9);ctx.lineTo(5,-7);ctx.lineTo(1,-5);ctx.fill();}
  if(s.hp<100){ctx.fillStyle='#111c22';ctx.fillRect(-3.5,-6.5,7,1.5);ctx.fillStyle=s.hp<35?'#fa735c':'#b4f7bf';ctx.fillRect(-3.5,-6.5,7*s.hp/100,1.5);}ctx.restore();
 }
 for(const e of engine.combat.effects){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,(e.until-engine.combat.time)/(e.type==='hit'?.22:.65)));ctx.strokeStyle='#ffe2a4';ctx.lineWidth=1.3;ctx.beginPath();if(e.type==='hit'){ctx.moveTo(e.x,e.y);ctx.lineTo(e.tx,e.ty);}else ctx.arc(e.x,e.y,4,0,Math.PI*2);ctx.stroke();ctx.restore();}ctx.restore();
}
function draw(){ctx.clearRect(-100,-100,layout.source.width+200,layout.source.height+200);const s=layout.source,fit=Math.max(s.width/atlas.width,s.height/atlas.height),ox=(atlas.width*fit-s.width)/2,oy=(atlas.height*fit-s.height)/2;ctx.save();ctx.translate(-ox,-oy);ctx.scale(fit,fit);ctx.drawImage(scene,0,0);soldiers();ctx.restore();overlay();}
function reset(index=example){example=index%examples.length;engine.prepare(examples[example]);pixels.data.set(surface.target);sceneCtx.putImageData(pixels,0,0);engine.begin();}
function tick(now){if(!ready)return;const dt=Math.min(.06,Math.max(0,(now-last)/1000));last=now;engine.update(dt);draw();requestAnimationFrame(tick);}
async function start(){
 const files=new Set([layout.participation.file,...layout.gifts.map(g=>g.file),...['map','gift'].map(kind=>layout.frames[kind].find(f=>f.id===config.presentation[kind+'Frame']).file)]);
 await Promise.all([...files].map(async file=>imageCache.set(file,await load('ui/'+file))));const [target,material]=await Promise.all([load('map/reference.png'),load('map/material.png')]);
 scene=offscreen(atlas.width,atlas.height);sceneCtx=scene.getContext('2d');sceneCtx.drawImage(material,0,0);const materialPixels=sceneCtx.getImageData(0,0,atlas.width,atlas.height);sceneCtx.drawImage(target,0,0);pixels=sceneCtx.getImageData(0,0,atlas.width,atlas.height);const targetPixels=new Uint8ClampedArray(pixels.data);
 engine=new TroopPipeline({atlas,ids:new Uint16Array(buffer('map/territories.bin')),layout,onPaint:(b,from,to)=>{const dirty=paintTerritory(surface,b,from,to);if(dirty)sceneCtx.putImageData(pixels,0,0,dirty.x,dirty.y,dirty.width,dirty.height);}});
 surface={width:atlas.width,height:atlas.height,ids:engine.ids,pixelOwners:engine.pixelOwners,colors:[null,...atlas.territories.map(t=>t.color)],material:materialPixels.data,target:targetPixels,live:pixels.data,borders:new Uint8Array(buffer('map/borders.bin'))};
 const p=layout.participation;header=offscreen(p.rect[2],p.rect[3]);const h=header.getContext('2d');h.drawImage(imageCache.get(p.file),...p.rect,0,0,header.width,header.height);const data=h.getImageData(0,0,header.width,header.height);for(let i=0;i<data.data.length;i+=4)data.data[i+3]*=Math.max(0,Math.min(1,(Math.max(data.data[i],data.data[i+1],data.data[i+2])-p.matteKey.threshold)/p.matteKey.range));h.putImageData(data,0,0);
 resize();reset();ready=true;last=performance.now();
 globalThis.__MAP_WORKFLOW__={mapId:config.mapId,name:config.name,view:config.view,engine,reset,begin:()=>engine.begin(),pause:()=>engine.setPaused(!engine.paused),raid:()=>engine.raidHome(),recall:()=>engine.recall(),snapshot:()=>({mapId:config.mapId,name:config.name,view:config.view,layout:{source:layout.source,audience:layout.audience,mapOpening:layout.mapOpening},...engine.snapshot()})};
 tt.onTouchStart(e=>{const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY,time:Date.now()}});
 tt.onTouchEnd(e=>{if(!touchStart)return;const t=e.changedTouches[0],now=Date.now();try{if(t.clientY-touchStart.y>50)engine.recall();else if(now-lastTap<320){reset(example+1);lastTap=0;}else{engine.setPaused(!engine.paused);lastTap=now;}}catch(error){console.warn(error.message)}touchStart=null;});
 if(tt.onWindowResize)tt.onWindowResize(resize);requestAnimationFrame(tick);console.info('[山河制图台]',config.name,'地图编号',config.mapId,'观众取景',config.view,'引擎',config.engineVersion);
}
start().catch(error=>{console.error('[山河制图台预览失败]',error);tt.showModal?.({title:'地图加载失败',content:String(error.message),showCancel:false});});
