import {buildWave,insideRoute,FrontierClock,recolorPixel} from './frontier.mjs';
const $=id=>document.getElementById(id);
const canvas=$('map'),units=$('units'),ctx=canvas.getContext('2d',{willReadFrequently:true}),ux=units.getContext('2d');
const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
const [atlas,bytes,base,target,material,borderImage,borderBytes]=await Promise.all([fetch('territories.json').then(r=>r.json()),fetch('territories.u16').then(r=>r.arrayBuffer()),image('base.png'),image('reference.png'),image('material.png'),image('borders.png'),fetch('borders.u8').then(r=>r.arrayBuffer())]);
const {width:W,height:H,territories}=atlas,ids=new Uint16Array(bytes);
canvas.width=units.width=W;canvas.height=units.height=H;
ctx.drawImage(base,0,0);const basePixels=ctx.getImageData(0,0,W,H);
ctx.drawImage(target,0,0);const targetPixels=ctx.getImageData(0,0,W,H);
ctx.drawImage(material,0,0);const materialPixels=ctx.getImageData(0,0,W,H),borderMask=new Uint8Array(borderBytes);
ctx.drawImage(borderImage,0,0);const initialComposite=ctx.getImageData(0,0,W,H);
const livePixels=new ImageData(new Uint8ClampedArray(basePixels.data),W,H);
// Each indexed territory has independent ownership. Target material is a reference
// texture, never the authority for hit testing, movement or occupancy.
const territoryPixels=Array.from({length:territories.length+1},()=>[]);
for(let p=0;p<ids.length;p++)territoryPixels[ids[p]].push(p);
const owners=Uint16Array.from({length:territories.length+1},(_,i)=>i);
const pixelOwners=ids.slice();
const colors=[null,...territories.map(t=>t.color)];
let mode='live',selection=0,battle=null,raf=0,lastTime=0,drawn=-1,completed=0;
function restore(){
  owners.forEach((_,i)=>owners[i]=i);
  pixelOwners.set(ids);
  // Composite the exact initial material for every mask, including the water's
  // reference correction. The original base remains a separate immutable asset.
  for(const pixels of territoryPixels)for(const p of pixels){const i=p*4;for(let k=0;k<4;k++)livePixels.data[i+k]=initialComposite.data[i+k];}
  battle=null;selection=0;drawn=-1;completed=0;cancelAnimationFrame(raf);ux.clearRect(0,0,W,H);$('pause').disabled=true;$('pause').textContent='暂停';$('progress').style.width='0%';$('status').textContent='先选出兵领地，再选相邻目标；或直接播放推进演示。';render();
}
function render(){if(mode==='base')ctx.drawImage(base,0,0);else if(mode==='target')ctx.drawImage(target,0,0);else ctx.putImageData(livePixels,0,0);units.hidden=mode!=='live';}
function selectMode(value){mode=value;document.querySelectorAll('[data-mode]').forEach(e=>{e.setAttribute('aria-pressed',String(e.dataset.mode===mode));if(e.dataset.mode===mode)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});document.getElementById('region-overlay').hidden=mode!=='live'||!document.getElementById('inspect-regions').checked;document.querySelector('.original-link').href=value==='base'?'terrain-v1.png':'colored-v2.png';$('modeLabel').textContent={live:'第 3 阶段 · 可吞噬领地',base:'第 1 阶段 · 原始地形 v1',target:'第 2 阶段 · 彩色分区 v2'}[mode];if(battle&&mode!=='live')battle.clock.paused=true;$('pause').textContent=battle?.clock.paused?'继续':'暂停';render();}
document.querySelectorAll('[data-mode]').forEach(e=>e.onclick=()=>selectMode(e.dataset.mode));
function pathToFront(source,wave,goal){
  const tail=[];let p=goal;while(ids[p]===wave.target){tail.push(p);p=wave.parent[p];}
  const start=territories[source-1].center,head=insideRoute(ids,W,H,start[1]*W+start[0],p,id=>id===source);
  if(!head.length)return null;return head.concat(tail.reverse());
}
function start(source,destination){
  if(owners[source]===owners[destination])throw new Error('两块领地已属同一方，请选择其他目标');
  const wave=buildWave(ids,W,H,source,destination),clock=new FrontierClock(wave,20);
  const choices=Array.from(wave.order).filter(p=>wave.distance[p]>=wave.max*.68);
  const soldiers=[];
  for(let i=0;i<24;i++){const goal=i<4?wave.order[wave.order.length-1]:choices[Math.floor((i+.5)*choices.length/24)];const route=pathToFront(source,wave,goal);if(route)soldiers.push({route,cursor:Math.max(0,Math.min(i%5,route.length-2)),delay:.2+(i%4)*.12});}
  if(!soldiers.length)throw new Error('该通路没有可达的出兵位置');
  battle={source,target:destination,wave,clock,soldiers,recolored:0,sourceOwner:owners[source],complete:false,contacts:0};
  selection=source;drawn=-1;selectMode('live');$('pause').disabled=false;$('pause').textContent='暂停';$('status').textContent='部队集结行军中，抵达边界前不改变地块颜色。';lastTime=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
}
function paintFront(){
  const b=battle;if(!b)return;const limit=Math.floor(b.clock.limit);if(limit===drawn)return;drawn=limit;
  const old=colors[b.target],next=colors[b.sourceOwner];
  let minX=W,minY=H,maxX=0,maxY=0;const edges=new Set();
  while(b.recolored<b.wave.order.length){const p=b.wave.order[b.recolored];if(b.wave.distance[p]>limit)break;b.recolored++;
    pixelOwners[p]=b.sourceOwner;
    const i=p*4,original=Array.from(materialPixels.data.subarray(i,i+3)),changed=recolorPixel(original,old,next);
    for(let k=0;k<3;k++)livePixels.data[i+k]=changed[k];
    const x=p%W,y=Math.floor(p/W);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy,q=yy*W+xx;if(xx>=0&&xx<W&&yy>=0&&yy<H&&borderMask[q])edges.add(q);}
  }
  // The old border is an independent layer. Shared edges disappear as their
  // two sides acquire the same owner; untouched borders retain exact artwork.
  for(const p of edges){
    const x=p%W,y=Math.floor(p/W),owner=pixelOwners[p];let divided=false;
    for(let dy=-3;dy<=3&&!divided;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const other=pixelOwners[yy*W+xx];if(other>0&&other!==owner){divided=true;break;}}
    const source=divided?targetPixels:materialPixels,i=p*4,original=Array.from(source.data.subarray(i,i+3)),changed=recolorPixel(original,colors[ids[p]],colors[owner]);
    for(let k=0;k<3;k++)livePixels.data[i+k]=changed[k];
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(mode==='live'&&minX<=maxX)ctx.putImageData(livePixels,0,0,minX,minY,maxX-minX+1,maxY-minY+1);
  $('progress').style.width=`${b.clock.progress*100}%`;
}
function tick(now){
  const dt=Math.min(.06,(now-lastTime)/1000);lastTime=now;const b=battle;if(!b)return;
  if(!b.clock.paused){
    let contact=0;
    for(const s of b.soldiers){
      if(s.delay>0){s.delay-=dt;continue;}
      let budget=dt*95;
      while(budget>0&&s.cursor<s.route.length-1){
        const next=s.route[Math.min(s.route.length-1,Math.floor(s.cursor)+1)];
        if(ids[next]===b.target&&b.wave.distance[next]>b.clock.limit)break;
        const step=Math.min(budget,1);s.cursor=Math.min(s.route.length-1,s.cursor+step);budget-=step;
      }
      const p=s.route[Math.floor(s.cursor)],d=b.wave.distance[p];
      if(d>=Math.max(0,b.clock.limit-4)||b.clock.limit<0&&ids[p]===b.source&&s.route[Math.min(s.route.length-1,Math.floor(s.cursor)+1)]!==undefined&&ids[s.route[Math.min(s.route.length-1,Math.floor(s.cursor)+1)]]===b.target)contact++;
    }
    b.contacts=contact;
    if(!b.complete){b.clock.step(dt,contact>=3);paintFront();}
    if(b.clock.progress>=1&&!b.complete){b.complete=true;owners[b.target]=b.sourceOwner;completed++;$('status').textContent='本块推进完成，部队继续活动。可再选相邻地块进攻。';}
    else if(!b.complete&&b.clock.progress>0)$('status').textContent=`正在从接壤处推进 · ${Math.floor(b.clock.progress*100)}%\n累计推进 ${b.clock.elapsed.toFixed(1)} 秒`;
  }
  drawSoldiers(now);raf=requestAnimationFrame(tick);
}
function drawSoldiers(now){
  ux.clearRect(0,0,W,H);if(!battle)return;const b=battle,col=`rgb(${colors[b.sourceOwner].join(',')})`;
  if(!b.complete&&b.clock.progress>0){ux.fillStyle='#182c28aa';const limit=Math.floor(b.clock.limit);for(const p of b.wave.order)if(b.wave.distance[p]===limit)ux.fillRect(p%W,Math.floor(p/W),1,1);}
  b.soldiers.forEach((s,i)=>{
    let cursor=s.cursor;
    if(b.complete){if(!b.clock.paused){const tail=Math.min(28,s.route.length-1);s.patrolCursor=s.route.length-1-(Math.sin(now*.0016+i)*.5+.5)*tail;}cursor=s.patrolCursor??s.cursor;}
    const p=s.route[Math.floor(cursor)],x=p%W,y=Math.floor(p/W);
    ux.fillStyle='#0a191be0';ux.beginPath();ux.ellipse(x,y+6,5,2.4,0,0,Math.PI*2);ux.fill();
    ux.strokeStyle='#0d1715';ux.lineWidth=2;ux.fillStyle=col;ux.fillRect(x-3,y-2,6,7);ux.strokeRect(x-3,y-2,6,7);
    ux.fillStyle='#edd7ac';ux.beginPath();ux.arc(x,y-4,2.4,0,Math.PI*2);ux.fill();
    ux.strokeStyle='#e4dfc3';ux.beginPath();ux.moveTo(x+5,y+5);ux.lineTo(x+5,y-10);ux.stroke();
    if(i%5===0){ux.fillStyle=col;ux.beginPath();ux.moveTo(x+5,y-10);ux.lineTo(x+12,y-8);ux.lineTo(x+5,y-5);ux.fill();}
  });
}
units.onclick=event=>{
  if(battle&&!battle.complete){$('status').textContent='当前正在推进，可暂停或恢复原貌后重新选择。';return;}
  const box=units.getBoundingClientRect(),scale=Math.max(box.width/W,box.height/H),offsetX=(W*scale-box.width)/2,offsetY=(H*scale-box.height)/2,x=Math.floor((event.clientX-box.left+offsetX)/scale),y=Math.floor((event.clientY-box.top+offsetY)/scale),id=ids[y*W+x];
  if(!id){$('status').textContent='这里是海域，请选择陆地。';return;}
  if(!selection){selection=id;$('status').textContent='已选出兵领地，请再点一块与它接壤的领地。';return;}
  if(id===selection){selection=0;$('status').textContent='已取消选择。';return;}
  try{start(selection,id);}catch(error){$('status').textContent=error.message;}
};
$('pause').onclick=()=>{if(!battle)return;battle.clock.paused=!battle.clock.paused;$('pause').textContent=battle.clock.paused?'继续':'暂停';};
$('reset').onclick=restore;
const demoPairs=[];
for(const t of territories)if(t.area>7000&&t.center[0]>W*.25&&t.center[0]<W*.8&&t.center[1]>H*.3&&t.center[1]<H*.65)for(const n of t.neighbors){const other=territories[n-1];if(other.area>6000)demoPairs.push({source:n,target:t.id,score:t.area-Math.abs(t.center[1]-H*.48)*10});}
demoPairs.sort((a,b)=>b.score-a.score);
const examples=await fetch('demo-pairs.json').then(r=>r.json());
for(const pair of examples){const option=document.createElement('option');option.value=String(examples.indexOf(pair));option.textContent=pair.label;$('demo-region').appendChild(option);}
$('demo').onclick=()=>{restore();const pair=examples[Number($('demo-region').value)]||demoPairs[0];try{start(pair.source,pair.target);}catch(error){$('status').textContent=error.message;}};
restore();$('demo').disabled=$('reset').disabled=false;
window.mapLab={atlas,ids,owners,pixelOwners,basePixels,targetPixels,livePixels,start,reset:restore,selectMode,get battle(){return battle;},demoPairs,examples,initialDifference(){let count=0,max=0;for(let i=0;i<livePixels.data.length;i+=4){let changed=false;for(let k=0;k<3;k++){const d=Math.abs(livePixels.data[i+k]-targetPixels.data[i+k]);max=Math.max(max,d);changed ||= d!==0;}if(changed)count++;}return {changedPixels:count,maxChannelDifference:max};}};

// Library deep links open the selected production stage.
const requestedStage=new URLSearchParams(location.search).get("stage");
if(["base","target","live"].includes(requestedStage))selectMode(requestedStage);
