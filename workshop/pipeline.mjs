import {PersistentPixelTroops,TROOP_RULES} from './troop-rules.mjs?v=1.2.0';
import {buildWave,FrontierClock,neighbors} from '../templates/six-realms/frontier.mjs';
import {clipPlayableMap} from './playable-area.mjs?v=1.1.0';
import {ContactCombat} from './combat.mjs?v=1.2.0';
export const PIPELINE_VERSION='1.2.0';
/** Shared territory, troop, contact combat and recall simulation. */
export class TroopPipeline{
 constructor({atlas,ids,layout,owners,pixelOwners,combatEnabled=true,onPaint=()=>{},onStart=()=>{}}){
  const clipped=clipPlayableMap(atlas,ids,layout);this.atlas=clipped.atlas;this.ids=clipped.ids;this.bounds=clipped.bounds;
  this.owners=owners||Uint16Array.from({length:atlas.territories.length+1},(_,i)=>i);this.pixelOwners=pixelOwners||this.ids.slice();
  for(let p=0;p<this.ids.length;p++)if(!this.ids[p])this.pixelOwners[p]=0;
  this.onPaint=onPaint;this.onStart=onStart;this.combatEnabled=combatEnabled;
  this.troops=new PersistentPixelTroops({...this.atlas,ids:this.ids,owners:this.owners,pixelOwners:this.pixelOwners});this.combat=new ContactCombat(this.troops);
  this.fronts=new Map();this.orders=new Map();this.battle=null;this.history=[];this.blocked=new Map();this.paused=false;this.running=false;this.wait=0;this.status='idle';
 }
 prepare(pair){
  this.owners.forEach((_,i)=>this.owners[i]=i);this.pixelOwners.set(this.ids);this.troops.reset();this.combat.reset();this.troops.ensure(pair.source);
  if(this.combatEnabled)this.addDefender(pair.target);
  this.fronts.clear();this.orders.clear();this.history=[];this.blocked.clear();this.battle=null;this.paused=false;this.running=false;this.pair=pair;this.force=this.owners[pair.source];this.wait=0;this.status='idle';
 }
 addDefender(target){try{return this.troops.ensure(target);}catch(error){if(!error.message.includes('过窄'))throw error;return null;}}
 createBattle(owner,source,target){
  if(!this.atlas.territories[source-1]?.active||!this.atlas.territories[target-1]?.active)throw Error('框外属于装饰区域，不能出兵或占领');
  const army=this.troops.armies.get(owner)||this.troops.ensure(source);if(!army.troops.some(s=>!s.reserve))throw Error('主力已损失，无法继续进攻');
  const routing=this.ids.slice(),marker=this.atlas.territories.length+1;
  for(let p=0;p<routing.length;p++)if(this.pixelOwners[p]===owner)routing[p]=marker;
  const wave=buildWave(routing,this.atlas.width,this.atlas.height,marker,target),defenderOwner=this.owners[target];
  if(this.combatEnabled&&defenderOwner!==owner)this.addDefender(target);
  const b={source,target,sourceOwner:owner,defenderOwner,wave,clock:new FrontierClock(wave,TROOP_RULES.captureSeconds),recolored:0,complete:false,contacts:0,frontDistance:-1,progress:0,noProgress:0,orderActive:true};
  const old=this.orders.get(owner);if(old)old.orderActive=false;
  this.fronts.set(owner+':'+target,b);this.orders.set(owner,b);this.troops.orderOwner(owner,target);b.soldiers=army.troops;return b;
 }
 start(source,target){const owner=this.force||this.owners[source],b=this.createBattle(owner,source,target);this.battle=b;this.pair={...this.pair,source:this.troops.armies.get(owner).home,target};this.setPaused(false);this.status='advancing';this.onStart(b);return b;}
 begin(pair=this.pair){
  const army=this.troops.armies.get(this.force);if(!army?.troops.some(s=>!s.reserve))throw Error('主力已损失，请恢复原貌后重新演示');
  if(!this.battle){this.force=this.owners[pair.source];this.start(pair.source,pair.target);}
  else if(!this.battle.complete){this.battle.orderActive=true;this.troops.orderOwner(this.force,this.battle.target);}
  this.running=true;this.setPaused(false);this.status='advancing';if(this.battle)this.battle.clock.paused=false;
 }
 attack(source,target){const owner=this.owners[source];return this.createBattle(owner,source,target);}
 recall(owner=this.force){
  const a=this.troops.armies.get(owner);if(!a?.troops.length)throw Error('没有可以回防的部队');
  const b=this.orders.get(owner);if(b)b.orderActive=false;this.troops.recall(owner);if(owner===this.force){this.running=false;this.status='recalling';}this.setPaused(false);
 }
 raidHome(){
  if(!this.combatEnabled)throw Error('请先开启对战演示');const a=this.troops.armies.get(this.force);
  if(!a?.troops.length)throw Error('本方已无部队，请恢复原貌');
  if([...this.orders.values()].some(b=>b.orderActive&&!b.complete&&b.target===a.home&&b.sourceOwner!==a.owner))throw Error('后方正在遇袭，守军已经迎敌');
  const options=this.atlas.territories[a.home-1].neighbors.filter(id=>this.owners[id]!==a.owner).sort((x,y)=>(x===this.battle?.target)-(y===this.battle?.target)||this.atlas.territories[y-1].area-this.atlas.territories[x-1].area);
  for(const source of options){try{return this.attack(source,a.home);}catch{}}
  throw Error('此处没有能容纳敌军的相邻后方地块，请换一个演示起点');
 }
 next(){
  const last=this.atlas.territories[(this.battle?.target||this.pair.source)-1].center,candidates=new Map(),width=this.atlas.width;
  for(let p=0;p<this.ids.length;p++)if(this.pixelOwners[p]===this.force)for(const q of neighbors(p,width,this.atlas.height)){
   if(!this.ids[q]||this.pixelOwners[q]===this.force)continue;const target=this.ids[q];if(this.blocked.get(target)===this.history.length)continue;
   const score=Math.hypot(q%width-last[0],Math.floor(q/width)-last[1]);if(!candidates.has(target)||score<candidates.get(target).score)candidates.set(target,{source:this.ids[p],target,score});
  }
  for(const p of [...candidates.values()].sort((a,b)=>a.score-b.score||a.target-b.target)){try{this.start(p.source,p.target);return true;}catch{this.blocked.set(p.target,this.history.length);}}
  this.running=false;this.status=this.blocked.size?'blocked':'reachable-complete';this.troops.stop(this.force);return false;
 }
 advance(b,dt){
  const army=this.troops.armies.get(b.sourceOwner);
  if(!army?.troops.some(s=>!s.reserve)){b.orderActive=false;this.troops.stop(b.sourceOwner);if(b===this.battle){this.running=false;this.status='repelled';}return;}
  b.contacts=this.troops.contacts(b.sourceOwner);b.clock.step(dt,b.contacts>=TROOP_RULES.minimumContact);
  const before=b.recolored;
  if(!this.combatEnabled){
   while(b.recolored<b.wave.order.length&&b.wave.distance[b.wave.order[b.recolored]]<=b.clock.limit)this.pixelOwners[b.wave.order[b.recolored++]]=b.sourceOwner;
   if(b.recolored>before)this.onPaint(b,before,b.recolored);b.frontDistance=b.clock.limit;
  }else{
   const changed=[];let owned=0,first=Infinity;
   for(const p of b.wave.order){
    if(this.pixelOwners[p]!==b.sourceOwner&&b.contacts&&b.wave.distance[p]<=b.clock.limit&&!this.combat.blocks(b.sourceOwner,p)&&neighbors(p,this.atlas.width,this.atlas.height).some(q=>this.pixelOwners[q]===b.sourceOwner)){
     this.pixelOwners[p]=b.sourceOwner;changed.push(p);
    }
    if(this.pixelOwners[p]===b.sourceOwner)owned++;else first=Math.min(first,b.wave.distance[p]);
   }
   b.recolored=owned;b.frontDistance=Number.isFinite(first)?first-1:b.wave.max;
   if(changed.length)this.onPaint({...b,wave:{...b.wave,order:Uint32Array.from(changed)}},0,changed.length);
  }
  b.progress=b.recolored/b.wave.order.length;b.noProgress=b.recolored===before?b.noProgress+dt:0;
  if(b.recolored===b.wave.order.length&&b.clock.progress>=1){
   b.complete=true;b.orderActive=false;if(this.ids.every((id,p)=>id!==b.target||this.pixelOwners[p]===b.sourceOwner))this.owners[b.target]=b.sourceOwner;
   this.troops.captured(b.sourceOwner,b.target);this.blocked.delete(b.target);
   if(b===this.battle){this.history.push({source:b.source,target:b.target,elapsed:b.clock.elapsed});this.wait=.6;this.status='captured';}
  }else if(!this.combatEnabled&&b.noProgress>8&&b===this.battle){this.blocked.set(b.target,this.history.length);b.orderActive=false;this.troops.stop(b.sourceOwner);this.next();}
 }
 update(dt){
  if(this.paused)return;dt=Math.min(.1,Math.max(0,dt));if(!dt)return;
  const active=[...this.orders.values()].filter(b=>b.orderActive&&!b.complete);
  this.troops.update(dt,active);if(this.combatEnabled)this.combat.update(dt,active.length>0);
  for(const b of active)this.advance(b,dt);
  if(this.running&&(!this.battle||this.battle.complete)){this.wait-=dt;if(this.wait<=0)this.next();}
  if(!this.troops.armies.get(this.force)?.troops.length){this.running=false;this.status='defeated';}
  if(this.status==='recalling'&&this.troops.armies.get(this.force)?.order==='idle')this.status='defending';
 }
 setPaused(value){this.paused=value;for(const b of this.orders.values())b.clock.paused=value;}
 snapshot(){return {version:PIPELINE_VERSION,status:this.status,running:this.running,paused:this.paused,captured:this.history.length,target:this.battle?.target,elapsed:this.battle?.clock.elapsed||0,progress:this.battle?.progress||0,skipped:this.blocked.size,combatEnabled:this.combatEnabled,combat:this.combat.snapshot(),underAttack:!!this.troops.armies.get(this.force)?.underAttack};}
}
