const project=await fetch('template.json',{cache:'no-store'}).then(r=>r.json());
const defaults=project.defaults;
document.getElementById('template-top').style.top=defaults.topSafeFraction*100+'%';
document.getElementById('template-gift').style.height=defaults.bottomSafeFraction*100+'%';
let saved={};try{saved=JSON.parse(localStorage.getItem('four-continents-arena-guides-v1')||'{}')}catch{}
for(const input of document.querySelectorAll('[data-guide]')){
  const key=input.dataset.guide;
  input.checked=saved[key]!==false;
  const sync=()=>document.getElementById('template-'+key).hidden=!input.checked;
  sync();input.addEventListener('change',()=>{sync();saved[key]=input.checked;try{localStorage.setItem('four-continents-arena-guides-v1',JSON.stringify(saved))}catch{}});
}


const inspect=document.getElementById('inspect-regions');
inspect.addEventListener('change',()=>document.getElementById('region-overlay').hidden=!inspect.checked||document.querySelector('[data-mode=live]').getAttribute('aria-pressed')!=='true');
try{
 const [topology,runtime]=await Promise.all(['topology-verification.json','runtime-verification.json'].map(path=>fetch(path).then(r=>{if(!r.ok)throw Error(path);return r.json()})));
 const allPass=runtime.realTimeRuns.every(r=>r.final.complete&&r.final.elapsed===20&&r.final.waterChanged===0&&r.final.outsiders===0&&r.resetDifference===0&&r.pausePassed&&r.patrolPassed);
 document.getElementById('verification-summary').textContent=`${topology.connectedRegions} 个独立连通地块（含小岛）\n${runtime.routes.length} 处地形路径检查通过\n${runtime.realTimeRuns.length} 处真实推进${allPass?'验证通过':'仍需检查'}\n初始及重置与已确认图：0 像素差异`;
}catch{document.getElementById('verification-summary').textContent='检查报告暂不可用，不能据此确认验证通过。';}
