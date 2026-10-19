/** Shared, deterministic contact combat. Occupying empty land never deals damage. */
export const COMBAT_RULES={health:100,damage:8,interval:.8,range:28,guardRadius:12};
export class ContactCombat{
 constructor(troops){this.troops=troops;this.protected=new Uint16Array(troops.ids.length);this.touched=[];this.reset();}
 reset(){this.protected.fill(0);this.touched=[];this.time=0;this.hits=0;this.losses=new Map();this.effects=[];this.engagements=0;}
 lineClear(a,b){const t=this.troops,n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y));for(let i=0;i<=n;i++){const owner=t.ownerAt(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n);if(!owner||(owner!==a.owner&&owner!==b.owner))return false;}return true;}
 update(dt,active=true){
  this.time+=dt;this.effects=this.effects.filter(e=>e.until>this.time);this.engagements=0;
  const points=this.troops.points(),damage=new Map(),range=COMBAT_RULES.range*this.troops.bodyScale;
  for(const s of points){s.hp??=COMBAT_RULES.health;s.cooldown=Math.max(0,(s.cooldown||0)-dt);s.fighting=false;if(!active)continue;
   let target=null,best=range;for(const other of points){if(other.owner===s.owner)continue;const d=Math.hypot(s.x-other.x,s.y-other.y);if(d<=best&&this.lineClear(s,other)){best=d;target=other;}}
   if(!target)continue;s.fighting=true;s.facing={x:target.x,y:target.y};s.engagedUntil=this.troops.time+.15;this.engagements++;
   if(s.cooldown>0)continue;s.cooldown=COMBAT_RULES.interval;damage.set(target,(damage.get(target)||0)+COMBAT_RULES.damage);this.hits++;
   this.effects.push({type:'hit',x:s.x,y:s.y,tx:target.x,ty:target.y,owner:s.owner,until:this.time+.22});
  }
  // Apply simultaneous damage before removing anyone, so array order cannot decide a duel.
  for(const [s,amount] of damage){s.hp=Math.max(0,s.hp-amount);s.hitUntil=this.troops.time+.18;}
  for(const army of this.troops.armies.values()){
   for(const s of army.troops)if(s.hp<=0){this.losses.set(s.owner,(this.losses.get(s.owner)||0)+1);this.effects.push({type:'fall',x:s.x,y:s.y,owner:s.owner,until:this.time+.65});}
   army.troops=army.troops.filter(s=>s.hp>0);
  }
  this.effects=this.effects.slice(-240);this.rebuildProtection();
 }
 rebuildProtection(){
  for(const p of this.touched)this.protected[p]=0;this.touched.length=0;
  const {width:w,height:h,bodyScale}=this.troops,r=COMBAT_RULES.guardRadius*bodyScale;
  for(const s of this.troops.points())for(let y=Math.max(0,Math.floor(s.y-r));y<=Math.min(h-1,Math.ceil(s.y+r));y++)for(let x=Math.max(0,Math.floor(s.x-r));x<=Math.min(w-1,Math.ceil(s.x+r));x++){
   if((x-s.x)**2+(y-s.y)**2>r*r)continue;const p=y*w+x;if(!this.troops.ids[p])continue;
   const old=this.protected[p];if(!old)this.touched.push(p);this.protected[p]=old&&old!==s.owner?65535:s.owner;
  }
 }
 blocks(owner,p){return this.protected[p]!==0&&this.protected[p]!==owner;}
 snapshot(){return {hits:this.hits,engaged:this.engagements,losses:Object.fromEntries(this.losses),alive:Object.fromEntries([...this.troops.armies].map(([id,a])=>[id,a.troops.length]))};}
}
