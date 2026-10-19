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

// Only completed artwork stages are selectable. No stage-3 runtime is loaded here.
const views={base:project.stages[0],target:project.stages[1]};
function selectView(mode){
 const stage=views[mode];
 if(!stage?.file||stage.status==='locked')return;
 document.getElementById('terrain').src=stage.file;
 document.getElementById('terrain').alt=stage.number===1?'已确认的四大陆与中央斗兽场原始地形':'四大陆、中央斗兽场、中心岛与桥梁的完整彩色分区设计';
 document.getElementById('modeLabel').textContent=`第 ${stage.number} 阶段 · ${stage.name} v${stage.version||1}`;
 document.querySelector('.original-link').href=stage.file;
 for(const button of document.querySelectorAll('[data-mode]')){
   const active=button.dataset.mode===mode;
   button.setAttribute('aria-pressed',String(active));
   if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
 }
}
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>selectView(button.dataset.mode));
selectView('target');
