export function neighbors(index,width,height) {
  const x=index%width,y=Math.floor(index/width),out=[];
  if(x)out.push(index-1);if(x+1<width)out.push(index+1);
  if(y)out.push(index-width);if(y+1<height)out.push(index+width);
  return out;
}

// A flood front starts ONLY at an actual shared border, and never crosses water.
export function buildWave(ids,width,height,source,target) {
  if(source===target||source<1||target<1)throw new Error('请选择两个不同领地');
  const distance=new Int32Array(ids.length).fill(-1),parent=new Int32Array(ids.length).fill(-1);
  const queue=new Int32Array(ids.length);let head=0,tail=0,max=0;
  for(let p=0;p<ids.length;p++)if(ids[p]===target){
    const adjacent=neighbors(p,width,height).find(q=>ids[q]===source);
    if(adjacent!==undefined){distance[p]=0;parent[p]=adjacent;queue[tail++]=p;}
  }
  const seedCount=tail;
  if(!seedCount)throw new Error('两块领地不接壤，不能跨海进攻');
  while(head<tail){const p=queue[head++];for(const q of neighbors(p,width,height))if(ids[q]===target&&distance[q]<0){distance[q]=distance[p]+1;max=Math.max(max,distance[q]);parent[q]=p;queue[tail++]=q;}}
  return {source,target,distance,parent,order:queue.slice(0,tail),seedCount,max};
}

export function insideRoute(ids,width,height,start,goal,allowed) {
  if(!allowed(ids[start])||!allowed(ids[goal]))return [];
  const parent=new Int32Array(ids.length).fill(-1),queue=new Int32Array(ids.length);
  let head=0,tail=1;queue[0]=start;parent[start]=start;
  while(head<tail&&parent[goal]<0){const p=queue[head++];for(const q of neighbors(p,width,height))if(parent[q]<0&&allowed(ids[q])){parent[q]=p;queue[tail++]=q;}}
  if(parent[goal]<0)return [];
  const path=[];for(let p=goal;;p=parent[p]){path.push(p);if(p===start)break;}return path.reverse();
}

export class FrontierClock {
  constructor(wave,seconds=20){this.wave=wave;this.seconds=seconds;this.elapsed=0;this.limit=-1;this.paused=false;}
  step(dt,hasContact){
    if(this.paused||!hasContact||this.elapsed>=this.seconds)return this.limit;
    this.elapsed=Math.min(this.seconds,this.elapsed+Math.min(dt,.1));
    this.limit=this.elapsed===this.seconds?this.wave.max:this.elapsed/this.seconds*this.wave.max;
    return this.limit;
  }
  get progress(){return this.elapsed/this.seconds;}
}

// Preserve the region's fine material variations, replace its ownership color.
export function recolorPixel(rgb,oldColor,newColor) {
  return rgb.map((v,k)=>Math.max(0,Math.min(255,Math.round(v+newColor[k]-oldColor[k]))));
}
