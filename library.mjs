import './components/project-actions.mjs';
import './components/select.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=path=>{const u=new URL(path,location.href);if(u.origin!==location.origin||!['http:','https:'].includes(u.protocol))throw Error('无效资源地址');return u.href;};
let maps=[],timer;
const date=s=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
function render(){
 const q=$('search').value.trim().replace(/^#/, '').toLowerCase();
 const visible=maps.filter(m=>!q||String(m.id)===q||String(m.id).padStart(3,'0')===q||m.name.toLowerCase().includes(q)||m.tags.join(' ').includes(q));
 visible.sort((a,b)=>$('sort').value==='newest'?new Date(b.createdAt)-new Date(a.createdAt):$('sort').value==='oldest'?new Date(a.createdAt)-new Date(b.createdAt):a.id-b.id);
 $('result-count').textContent=`${visible.length} / ${maps.length}`;$('empty').hidden=!!visible.length;
 $('map-grid').innerHTML=visible.map(m=>{const root=m.directory+'/';return `<article class="map-card" data-map-id="${m.id}"><a class="cover" href="${url('workshop/?map='+m.id)}" aria-label="打开 ${m.id} 号 ${escape(m.name)}">${m.territoryCount||m.coverReady?`<img src="${url(root+m.cover)}" alt="${escape(m.name)}地图" loading="eager">`:'<span class="cover-placeholder">待绘山河<small>先从地形开始</small></span>'}<span class="map-number"><small>No.</small>${String(m.id).padStart(3,'0')}</span><span class="cover-caption">彩色分区设计<b>9:16</b></span></a><div class="card-body"><div class="card-eyebrow">MAP / ${String(m.id).padStart(3,'0')} ${m.id===1?'<span class="default-badge">默认地图</span>':''}</div><h3>${escape(m.name)}</h3><p class="subtitle">${escape(m.subtitle)}</p><time class="date" datetime="${escape(m.createdAt)}" title="${escape(m.createdAtBasis)}">制作时间 <strong>${date(m.createdAt)}</strong><span>${escape(m.dateLabel)}</span></time><div class="tags">${m.tags.map(tag=>`<span>${escape(tag)}</span>`).join('')}<span>${m.territoryCount} 个地块</span></div><div class="availability"><i></i>${escape(m.stage3Status)}</div><div class="actions"><a class="open" href="${url('workshop/?map='+m.id)}">进入工坊 →</a><button class="copy" data-id="${m.id}">复制替换指令</button></div><button class="share-project" data-share-map="${m.id}"><span><strong>发给别人</strong><small>完整地图项目 · 配件自动去重</small></span><span aria-hidden="true">↗</span></button></div></article>`;}).join('');
}
$('search').addEventListener('input',render);$('sort').addEventListener('change',render);$('clear-search').onclick=()=>{$('search').value='';render();$('search').focus()};
$('map-grid').addEventListener('click',async event=>{const button=event.target.closest('button.copy');if(!button)return;const m=maps.find(m=>m.id===Number(button.dataset.id));try{await navigator.clipboard.writeText(m.instruction);$('toast').textContent=`已复制 ${m.id} 号地图替换指令，粘贴给 AI 即可`;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500)}catch{$('copy-text').value=m.instruction;$('copy-dialog').showModal();$('copy-text').focus();$('copy-text').select()}});
async function refreshLibrary(){try{const response=await fetch('catalog.json',{cache:'no-store'});if(!response.ok)throw Error('读取失败');maps=(await response.json()).maps;$('map-count').textContent=maps.length;render()}catch(error){$('map-grid').innerHTML='<p class="loading">地图库加载失败，请检查本地服务后刷新。</p>';console.error(error)}}
await refreshLibrary();window.addEventListener('map-library-changed',refreshLibrary);

try{const id=JSON.parse(localStorage.getItem("workshop-last-map"));if(maps.some(m=>m.id===id))document.getElementById("resume-workshop").href="workshop/?map="+id;}catch{}
