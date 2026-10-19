import {config as defaultLayout} from '../ui/renderer.mjs?v=4';
import {insidePlayable} from './playable-area.mjs?v=1.1.0';
import {TroopPipeline,PIPELINE_VERSION} from './pipeline.mjs?v=1.2.0';
import {paintTerritory} from './territory-paint.mjs';
export async function mountMap({directory,terrain,colored,hasExamples,onModeChange,layout=defaultLayout}){
const resource=path=>new URL(path,directory).href;
const $=id=>document.getElementById(id);
const canvas=$('map'),units=$('units'),ctx=canvas.getContext('2d',{willReadFrequently:true}),ux=units.getContext('2d');
const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=resource(src);});
const [rawAtlas,bytes,base,target,material,borderImage,borderBytes]=await Promise.all([fetch(resource('territories.json')).then(r=>r.json()),fetch(resource('territories.u16')).then(r=>r.arrayBuffer()),image(terrain),image(colored),image('material.png'),image('borders.png'),fetch(resource('borders.u8')).then(r=>r.arrayBuffer())]);
const pipeline=new TroopPipeline({atlas:rawAtlas,ids:new Uint16Array(bytes),layout,onPaint:(b,from,to)=>paintFront(b,from,to),onStart:b=>{battle=b;drawn=-1;}});
const {atlas,ids,owners,pixelOwners,troops}=pipeline,{width:W,height:H,territories}=atlas;
const overlay=$('region-overlay'),bounds=pipeline.bounds;const r=layout.mapOpening,s=layout.source;overlay.style.clipPath=`inset(${r.y/s.height*100}% ${(s.width-r.x-r.width)/s.width*100}% ${(s.height-r.y-r.height)/s.height*100}% ${r.x/s.width*100}%)`;
canvas.width=units.width=W;canvas.height=units.height=H;
ctx.drawImage(base,0,0);const basePixels=ctx.getImageData(0,0,W,H);
ctx.drawImage(target,0,0);const targetPixels=ctx.getImageData(0,0,W,H);
ctx.drawImage(material,0,0);const materialPixels=ctx.getImageData(0,0,W,H),borderMask=new Uint8Array(borderBytes);
ctx.drawImage(borderImage,0,0);const initialComposite=ctx.getImageData(0,0,W,H);
const livePixels=new ImageData(new Uint8ClampedArray(basePixels.data),W,H);
// Each indexed territory has independent ownership. Target material is a reference
// texture, never the authority for hit testing, movement or occupancy.
const colors=[null,...territories.map(t=>t.color)];
let mode='live',selection=0,battle=null,raf=0,lastTime=0,drawn=-1,completed=0,paused=false,disposed=false,lastStatus=0;
let validatorWorker=null;

function restore(){
 pipeline.combatEnabled=$('combat-enabled').checked;pipeline.prepare(examples[Number($('demo-region').value)]||examples[0]);livePixels.data.set(targetPixels.data);battle=null;selection=0;drawn=-1;completed=0;pipeline.setPaused(mode!=='live');cancelAnimationFrame(raf);ux.clearRect(0,0,W,H);
 $('pause').disabled=false;$('pause').textContent=pipeline.paused?'继续':'暂停';$('progress').style.width='0%';$('status').textContent=pipeline.combatEnabled?'双方在己方领地巡游。开始推进后，守军会迎敌；后方遇袭可下令主力回防。':'无人防守演示：接触前线后，连续攻占相邻地块。';$('raid-home').disabled=$('recall-order').disabled=!pipeline.combatEnabled;updateLedger();render();lastTime=performance.now();raf=requestAnimationFrame(tick);
}
function render(){if(mode==='base')ctx.drawImage(base,0,0);else if(mode==='target')ctx.drawImage(target,0,0);else ctx.putImageData(livePixels,0,0);units.hidden=mode!=='live';}
function selectMode(value){mode=value;document.querySelectorAll('[data-mode]').forEach(e=>{e.setAttribute('aria-pressed',String(e.dataset.mode===mode));if(e.dataset.mode===mode)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});document.getElementById('region-overlay').hidden=mode!=='live'||!document.getElementById('inspect-regions').checked;document.querySelector('.original-link').href=resource(value==='base'?terrain:colored);$('modeLabel').textContent={live:'第 3 阶段 · 可吞噬领地',base:'第 1 阶段 · 原始地形',target:'第 2 阶段 · 彩色分区'}[mode];if(mode!=='live')pipeline.setPaused(true);$('pause').textContent=pipeline.paused?'继续':'暂停';render();onModeChange?.(value);}

function start(source,target){pipeline.force=owners[source];pipeline.start(source,target);pipeline.running=true;selection=0;selectMode('live');$('pause').textContent='暂停';}
function paintFront(b,from,to){
 const dirty=paintTerritory({width:W,height:H,ids,pixelOwners,colors,material:materialPixels.data,target:targetPixels.data,live:livePixels.data,borders:borderMask},b,from,to);
 if(mode==='live'&&dirty)ctx.putImageData(livePixels,0,0,dirty.x,dirty.y,dirty.width,dirty.height);
}
function tick(now){
 if(disposed)return;const dt=Math.min(.06,(now-lastTime)/1000);lastTime=now;pipeline.update(dt);battle=pipeline.battle;
 if(now-lastStatus>180){lastStatus=now;const st=pipeline.snapshot();updateLedger();const labels={repelled:'主力损失 · 进攻停止',defeated:'本方部队已全部阵亡',recalling:st.underAttack?'主力回防中 · 守军正在迎敌':'主力沿己方领地返回',defending:'已回到驻地',captured:'已占领 · 正在选择下一块相邻地',blocked:'剩余前线不可达', 'reachable-complete':'可达地块推进完成'};
  if(battle||st.underAttack||st.status!=='idle'){const phase=labels[st.status]||(st.combat.engaged?'双方交战 · 守军阻挡局部蚕食':st.underAttack?'后方遇袭 · 守军抵抗，主力继续原指令':battle?.contacts?'沿前线逐步蚕食':'向前线行军');$('status').textContent=phase+'\n已占 '+st.captured+' 块 · 本块 '+Math.floor(st.progress*100)+'%'+(st.underAttack&&st.status!=='recalling'?'\n后方告急：可下令主力回防':'');$('progress').style.width=st.progress*100+'%';}
 }

 drawSoldiers();raf=requestAnimationFrame(tick);
}
function updateLedger(){const c=pipeline.combat.snapshot(),own=c.alive[pipeline.force]||0,other=Object.entries(c.alive).filter(([id])=>Number(id)!==pipeline.force).reduce((n,[,v])=>n+v,0),lost=c.losses[pipeline.force]||0,enemyLost=Object.entries(c.losses).filter(([id])=>Number(id)!==pipeline.force).reduce((n,[,v])=>n+v,0);$('combat-ledger').innerHTML=pipeline.combatEnabled?`<span>本方 <b>${own}</b><small>阵亡 ${lost} · 留守 ${troops.armies.get(pipeline.force)?.troops.filter(s=>s.reserve).length||0}</small></span><span>敌方 <b>${other}</b><small>阵亡 ${enemyLost} · 交锋 ${c.hits} 次</small></span>`:'';}
function drawSoldiers(){
 ux.clearRect(0,0,W,H);ux.save();ux.beginPath();ux.rect(bounds.x0,bounds.y0,bounds.x1-bounds.x0,bounds.y1-bounds.y0);ux.clip();for(const s of troops.points()){
  const {x,y}=s,col=`rgb(${colors[s.owner].join(',')})`,scale=troops.bodyScale;
  ux.save();ux.translate(x,y);ux.scale(scale,scale);ux.fillStyle='#081215a0';ux.beginPath();ux.ellipse(0,1.8,2.8,1.1,0,0,Math.PI*2);ux.fill();
  ux.fillStyle=s.hitUntil>troops.time?'#fff3c9':col;ux.strokeStyle=s.fighting?'#ffcc6e':'#101b20';ux.lineWidth=.65;ux.fillRect(-2.2,-1.5,4.4,4);ux.strokeRect(-2.2,-1.5,4.4,4);ux.fillStyle='#eed7ab';ux.beginPath();ux.arc(0,-2.7,1.3,0,Math.PI*2);ux.fill();
  if(s.token%10===0&&troops.flagFits(s)){ux.strokeStyle='#dac89b';ux.lineWidth=.6;ux.beginPath();ux.moveTo(1,2);ux.lineTo(1,-9);ux.stroke();ux.fillStyle=col;ux.beginPath();ux.moveTo(1,-9);ux.lineTo(5,-7);ux.lineTo(1,-5);ux.fill();}
  if(s.hp<100){ux.fillStyle='#111c22';ux.fillRect(-3.5,-6.5,7,1.5);ux.fillStyle=s.hp<35?'#fa735c':'#b4f7bf';ux.fillRect(-3.5,-6.5,7*s.hp/100,1.5);}
  if(s.fighting&&s.facing){const angle=Math.atan2(s.facing.y-y,s.facing.x-x);ux.strokeStyle='#ffe1a0';ux.lineWidth=1;ux.beginPath();ux.moveTo(Math.cos(angle)*2,Math.sin(angle)*2);ux.lineTo(Math.cos(angle)*6,Math.sin(angle)*6);ux.stroke();}
  ux.restore();
 }
 for(const e of pipeline.combat.effects){ux.save();const left=e.until-pipeline.combat.time;ux.globalAlpha=Math.max(0,Math.min(1,left/(e.type==='hit'?.22:.65)));if(e.type==='hit'){ux.strokeStyle='#ffe2a4';ux.lineWidth=1.3;ux.beginPath();ux.moveTo(e.x,e.y);ux.lineTo(e.tx,e.ty);ux.stroke();ux.fillStyle='#fff4d9';ux.fillRect(e.tx-1.4,e.ty-1.4,2.8,2.8);}else{ux.strokeStyle='#e5c39c';ux.lineWidth=1.1;ux.beginPath();ux.arc(e.x,e.y,2+(.65-left)*5,0,Math.PI*2);ux.stroke();}ux.restore();}ux.restore();
}
units.onclick=event=>{
  const box=units.getBoundingClientRect(),scale=Math.max(box.width/W,box.height/H),offsetX=(W*scale-box.width)/2,offsetY=(H*scale-box.height)/2,x=Math.floor((event.clientX-box.left+offsetX)/scale),y=Math.floor((event.clientY-box.top+offsetY)/scale),id=ids[y*W+x];
  if(!insidePlayable(bounds,x,y))return;
  if(!id){$('status').textContent='这里是海域，请选择陆地。';return;}
  if(!selection){try{troops.ensure(id);selection=id;$('status').textContent='已选出兵领地，请再点一块与它接壤的领地。';}catch(error){$('status').textContent=error.message;}return;}
  if(id===selection){selection=0;$('status').textContent='已取消选择。';return;}
  try{start(selection,id);}catch(error){$('status').textContent=error.message;}
};
$('pause').onclick=()=>{pipeline.setPaused(!pipeline.paused);$('pause').textContent=pipeline.paused?'继续':'暂停';};
$('reset').onclick=restore;
$('combat-enabled').onchange=restore;
$('raid-home').onclick=()=>{try{pipeline.raidHome();selectMode('live');pipeline.setPaused(false);$('pause').textContent='暂停';$('status').textContent='敌军正在进攻后方，守军就近迎敌；主力保持原进攻指令。';}catch(e){$('status').textContent=e.message;}};
$('recall-order').onclick=()=>{try{pipeline.recall();selectMode('live');$('pause').textContent='暂停';$('status').textContent='已下令主力回防，沿己方领地返回。';}catch(e){$('status').textContent=e.message;}};
const demoPairs=[];
for(const t of territories)if(t.area>7000&&t.center[0]>W*.25&&t.center[0]<W*.8&&t.center[1]>H*.3&&t.center[1]<H*.65)for(const n of t.neighbors){const other=territories[n-1];if(other.area>6000)demoPairs.push({source:n,target:t.id,score:t.area-Math.abs(t.center[1]-H*.48)*10});}
demoPairs.sort((a,b)=>b.score-a.score);
const examples=(hasExamples?await fetch(resource('demo-pairs.json')).then(r=>r.json()):demoPairs.slice(0,3).map((p,i)=>({...p,label:'接壤地块演示 '+(i+1)}))).slice(0,3);if(examples.length!==3)throw Error('需要3个不同区域的演示配置');
$('demo-region').replaceChildren();
for(const pair of examples){const option=document.createElement('option');option.value=String(examples.indexOf(pair));option.textContent=pair.label;$('demo-region').appendChild(option);}
const onDemoChange=()=>restore();$('demo-region').addEventListener('change',onDemoChange);
$('demo').onclick=()=>{try{pipeline.begin(examples[Number($('demo-region').value)]||examples[0]);selectMode('live');$('pause').textContent='暂停';}catch(error){$('status').textContent=error.message;}};
$('quick-check').onclick=()=>{validatorWorker?.terminate();$('quick-check').disabled=true;$('quick-result').textContent='正在用同一引擎快速模拟3个区域…';validatorWorker=new Worker(new URL('./quick-check.worker.mjs?v=1.2.0',import.meta.url),{type:'module'});validatorWorker.onmessage=({data})=>{if(data.type==='progress')$('quick-result').textContent=`已完成 ${data.done}/3：${data.label}`;else if(data.type==='complete'){$('quick-result').textContent=`3/3 通过 · ${(data.result.durationMs/1000).toFixed(2)} 秒\n巡游、80/20留守、接触门槛、连续占领、兵身限界、框外禁入、双方战损、守军迎敌、主力回防与重置均通过。`;window.lastTroopAcceptance=data.result;$('quick-check').disabled=false;validatorWorker.terminate();}else{$('quick-result').textContent='验收未通过：'+data.message;$('quick-check').disabled=false;validatorWorker.terminate();}};validatorWorker.onerror=e=>{$('quick-result').textContent='验收运行失败：'+e.message;$('quick-check').disabled=false;validatorWorker.terminate();};validatorWorker.postMessage({directory:directory.href});};
restore();$('demo').disabled=$('reset').disabled=$('combat-enabled').disabled=false;
const api={atlas,bounds,ids,owners,pixelOwners,basePixels,targetPixels,livePixels,start,reset:restore,selectMode,get battle(){return battle;},demoPairs,examples,troops,pipeline,prepare:restore,get paused(){return pipeline.paused;},get mode(){return mode;},dispose(){disposed=true;validatorWorker?.terminate();$('demo-region').removeEventListener('change',onDemoChange);cancelAnimationFrame(raf);battle=null;units.onclick=null;},initialDifference(){let count=0,max=0;for(let i=0;i<livePixels.data.length;i+=4){let changed=false;for(let k=0;k<3;k++){const d=Math.abs(livePixels.data[i+k]-targetPixels.data[i+k]);max=Math.max(max,d);changed ||= d!==0;}if(changed)count++;}return {changedPixels:count,maxChannelDifference:max};}};

return api;
}
