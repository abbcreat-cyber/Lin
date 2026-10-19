import {checkCombat} from './combat-check.mjs?v=1.2.0';
import {TroopPipeline,PIPELINE_VERSION} from './pipeline.mjs?v=1.2.0';
export function checkMap(atlas,ids,examples,onProgress=()=>{},layout){
 const results=[];if(examples.length!==3)throw Error('快速验收需要恰好3个不同起点');
 for(const [index,pair] of examples.entries()){
  const engine=new TroopPipeline({atlas,ids,layout,combatEnabled:false});const activeIds=engine.ids,bounds=engine.bounds;for(let p=0;p<ids.length;p++){const x=p%atlas.width,y=Math.floor(p/atlas.width);if((x<bounds.x0||x>=bounds.x1||y<bounds.y0||y>=bounds.y1)&&(activeIds[p]||engine.pixelOwners[p]))throw Error('框外仍存在可玩地块');}engine.prepare(pair);const points=()=>engine.troops.snapshot().flatMap(a=>a.troops);const idle=points();for(let i=0;i<25;i++)engine.update(.05);const moving=points();if(!moving.some((s,i)=>Math.hypot(s.x-idle[i].x,s.y-idle[i].y)>1))throw Error(pair.label+'：待机没有巡游');
  const before=points();engine.begin();if(JSON.stringify(points())!==JSON.stringify(before))throw Error(pair.label+'：下令发生瞬移');
  const army=engine.troops.armies.get(engine.force);if(army.troops.filter(s=>s.reserve).length/army.troops.length!==.2)throw Error('留守比例错误');
  const contact=engine.troops.contacts;engine.troops.contacts=()=>0;for(let i=0;i<10;i++)engine.update(.05);if(engine.battle.clock.elapsed!==0)throw Error('无接触仍在推进');engine.troops.contacts=contact;
  let pausedTest=false,steps=0;while(engine.history.length<2&&steps++<2200){engine.update(.05);for(const s of engine.troops.points()){if(!engine.troops.fits(s.owner,s.x,s.y))throw Error(pair.label+'：兵身越界');if(s.reserve&&ids[Math.floor(s.y)*atlas.width+Math.floor(s.x)]!==s.home)throw Error('留守兵离开驻地');}if(!pausedTest&&engine.battle.clock.elapsed>2){engine.setPaused(true);const snap=JSON.stringify(points()),elapsed=engine.battle.clock.elapsed;for(let i=0;i<10;i++)engine.update(.05);if(snap!==JSON.stringify(points())||elapsed!==engine.battle.clock.elapsed)throw Error('暂停没有冻结');engine.setPaused(false);pausedTest=true;}}
  if(engine.history.length>=2&&engine.history[0].target!==pair.target)throw Error(pair.label+'：首个指定区域未通过');if(engine.troops.points().length!==idle.length)throw Error('跨占领时部队数量发生变化');
  if(engine.history.length<2)throw Error(pair.label+'：没有自动完成连续两块地');if(engine.history.some(x=>x.elapsed!==20))throw Error('推进计时错误');for(let p=0;p<ids.length;p++)if(!activeIds[p]&&engine.pixelOwners[p])throw Error('海域或框外装饰被占领');engine.prepare(pair);if(!engine.pixelOwners.every((id,p)=>id===activeIds[p]))throw Error('重置失败');
  const result={label:pair.label,source:pair.source,target:pair.target,passed:true,idlePatrol:true,noTeleport:true,reserveRatio:.2,contactRequired:true,bodyContainment:true,pause:true,consecutiveCaptures:2,captureSeconds:20,waterUnchanged:true,exteriorInactive:true,reset:true};result.combat=checkCombat(atlas,ids,layout,pair);results.push(result);onProgress({done:index+1,total:3,label:pair.label});
 }
 return {passed:true,engineVersion:PIPELINE_VERSION,playableArea:new TroopPipeline({atlas,ids,layout,combatEnabled:false}).atlas.playableArea,method:'same pipeline, fixed simulation steps; no real-time 20-second wait',results};
}
