const defaults=(await fetch('template.json').then(r=>r.json())).defaults;
document.getElementById('template-top').style.top=defaults.topSafeFraction*100+'%';
document.getElementById('template-gift').style.height=defaults.bottomSafeFraction*100+'%';
let saved={};try{saved=JSON.parse(localStorage.getItem('map-template-guides-v1')||'{}')}catch{}
for(const input of document.querySelectorAll('[data-guide]')){
  const key=input.dataset.guide;
  input.checked=saved[key]!==false;
  const sync=()=>document.getElementById('template-'+key).hidden=!input.checked;
  sync();input.addEventListener('change',()=>{sync();saved[key]=input.checked;try{localStorage.setItem('map-template-guides-v1',JSON.stringify(saved))}catch{}});
}
