import {TroopPipeline} from './pipeline.mjs?v=1.2.0';
export function checkCombat(atlas,ids,layout,pair){
 const engine=new TroopPipeline({atlas,ids,layout}),assert=(value,message)=>{if(!value)throw Error(pair.label+'：'+message);};
 const positions=()=>engine.troops.points().map(s=>({token:s.token,x:s.x,y:s.y,hp:s.hp}));
 const step=()=>{const before=new Map(positions().map(s=>[s.token,s]));engine.update(.05);for(const s of engine.troops.points()){
  assert(engine.troops.fits(s.owner,s.x,s.y),'交战时兵身越过疆域或地图框');const old=before.get(s.token);assert(old&&Math.hypot(s.x-old.x,s.y-old.y)<=24*engine.troops.scale*.05+.001,'交战时出现瞬移或凭空增兵');
 }};
 engine.prepare(pair);engine.begin();let steps=0,localResistance=false;
 while(steps++<1600){step();const b=engine.battle;localResistance||=b.wave.order.some(p=>engine.combat.blocks(b.sourceOwner,p)&&engine.pixelOwners[p]!==b.sourceOwner);
  if((engine.combat.losses.get(pair.source)||0)>0&&(engine.combat.losses.get(pair.target)||0)>0)break;
 }
 assert(engine.combat.hits>0,'没有真实接触攻击');assert((engine.combat.losses.get(pair.source)||0)>0&&(engine.combat.losses.get(pair.target)||0)>0,'双方没有真实战损');assert(localResistance,'守军没有阻挡局部蚕食');
 const duel=engine.combat.snapshot();
 engine.setPaused(true);const paused=JSON.stringify([positions(),engine.combat.snapshot(),engine.pixelOwners]);engine.update(.1);assert(JSON.stringify([positions(),engine.combat.snapshot(),engine.pixelOwners])===paused,'暂停后仍在交战');
 engine.prepare(pair);engine.begin();for(let i=0;i<20;i++)step();
 const main=engine.troops.armies.get(engine.force),outgoing=engine.battle;engine.raidHome();for(let i=0;i<16;i++)step();
 assert(main.underAttack&&main.guardField,'后方遇袭没有守军迎敌');assert(main.order==='attack'&&engine.orders.get(engine.force)===outgoing&&outgoing.orderActive,'后方遇袭擅自改了主力指令');
 const beforeRecall=positions(),progress=outgoing.progress;engine.recall();assert(JSON.stringify(beforeRecall)===JSON.stringify(positions()),'回防命令改变位置或血量');assert(!outgoing.orderActive&&main.order==='defend','没有切换回防指令');
 let moved=false;for(let i=0;i<80;i++){step();for(const s of main.troops.filter(s=>!s.reserve)){const old=beforeRecall.find(v=>v.token===s.token);if(old&&Math.hypot(s.x-old.x,s.y-old.y)>1)moved=true;}}
 assert(moved,'主力收到回防后没有实际行军');assert(outgoing.progress===progress,'回防后原进攻仍在吞噬');
 engine.prepare(pair);assert(engine.combat.hits===0&&engine.combat.losses.size===0&&engine.combat.effects.length===0,'重置没有清理战斗');assert(engine.troops.points().every(s=>s.hp===100),'重置没有恢复血量');
 return {passed:true,duel,localResistance:true,localDefense:true,mainOrderPreserved:true,recallNoTeleport:true,recallMoved:true,oldAttackStopped:true,bodyContainment:true,pause:true,reset:true};
}
