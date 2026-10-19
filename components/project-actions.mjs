const root=new URL('../',import.meta.url);
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session;
export async function request(path,data={}){
 if(!session){const response=await fetch(new URL('api/session',root),{cache:'no-store'});if(!response.ok)throw Error('请使用“启动地图库.cmd”启动新版工作流，然后刷新页面。');session=await response.json();}
 const response=await fetch(new URL(path,root),{method:'POST',headers:{'X-Workflow-Token':session.token,'Content-Type':data instanceof File?'application/octet-stream':'application/json'},body:data instanceof File?data:JSON.stringify(data)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'操作未完成，请重试');return result;
}
export function presentationFor(id){try{return JSON.parse(localStorage.getItem('workshop-map-'+id))?.ui}catch{return undefined}}
const dialog=document.createElement('dialog');dialog.className='project-transfer';dialog.innerHTML='<button type="button" class="transfer-close" aria-label="关闭">×</button><div class="transfer-content"></div>';document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
const content=dialog.querySelector('.transfer-content');let operation=0;
export async function shareProject(id){
 const ticket=++operation;content.innerHTML='<p class="transfer-eyebrow">PROJECT / 分享项目</p><h2>发给别人，接着一起做。</h2><p>正在整理三阶段图片、动态地块和配套素材…</p><div class="transfer-progress" role="status">正在生成项目压缩包</div>';dialog.showModal();
 try{const result=await request('api/projects/'+id+'/share',{presentation:presentationFor(id)});if(ticket!==operation)return;
  content.innerHTML=`<p class="transfer-eyebrow">PROJECT / 分享项目</p><h2>${escapeHtml(result.name)}</h2><p>把这个项目压缩包发给对方。对方已有工作流引擎时，拖入地图库就能继续制作。</p><div class="transfer-includes"><span>三阶段地图与制作记录</span><span>可吞噬地块与演示起点</span><span>地图框、礼物框及素材</span></div><p class="transfer-note">公共素材按内容识别：已有的复用，缺少的补齐。工作流引擎不用重复打包。</p><a class="transfer-primary" download href="${new URL(result.url,root)}">下载项目压缩包 <small>${(result.bytes/1024/1024).toFixed(1)} MB</small></a><p class="transfer-footnote">接收方使用“导入项目”，三阶段文件与配件会一起进入地图库。</p>`;
 }catch(error){content.innerHTML=`<p class="transfer-eyebrow">分享项目</p><h2>还没打包成功</h2><p role="alert">${escapeHtml(error.message)}</p><button class="transfer-primary" id="retry-share">重新打包</button>`;content.querySelector('button').onclick=()=>shareProject(id);}
}
export async function importProject(file){
 if(!file)return;const ticket=++operation;if(!dialog.open)dialog.showModal();
 if(!/\.zip$/i.test(file.name)||file.size>160*1024*1024){content.innerHTML='<h2>请选择地图项目压缩包</h2><p role="alert">需要通过“发给别人”导出的 ZIP 文件，大小不超过 160 MB。</p>';return;}
 content.innerHTML=`<p class="transfer-eyebrow">IMPORT / 导入项目</p><h2>正在接收这张地图</h2><p>${escapeHtml(file.name)}</p><div class="transfer-progress" role="status">校验三阶段文件与素材，识别重复配件…</div>`;
 try{const result=await request('api/projects/import',file);if(ticket!==operation)return;
  content.innerHTML=`<p class="transfer-eyebrow">IMPORT / ${result.duplicate?'已在图库中':'导入完成'}</p><h2>${escapeHtml(result.name)}</h2><p>${result.duplicate?'这份项目已经导入过，直接打开原来的地图即可。':`已保存为本地 <b>${String(result.mapId).padStart(3,'0')}</b> 号地图，原有地图均保留。`}</p><div class="transfer-stats"><span><b>${result.reusedAssets}</b> 个公共配件已复用</span><span><b>${result.addedAssets}</b> 个缺失配件已补齐</span></div><a class="transfer-primary" href="${new URL('workshop/?map='+result.mapId,root)}">打开这张地图 →</a><p class="transfer-note">首次打开后，运行一次快速验收，确认本机的小兵推进、对战与回防。</p>`;
  window.dispatchEvent(new CustomEvent('map-library-changed',{detail:result}));
 }catch(error){content.innerHTML=`<p class="transfer-eyebrow">导入项目</p><h2>这份项目还不能导入</h2><p role="alert">${escapeHtml(error.message)}</p><p class="transfer-note">现有地图不会被这次失败的导入替换。</p>`;}
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-share-map]');if(button){e.preventDefault();shareProject(Number(button.dataset.shareMap));}});
const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';input.hidden=true;document.body.append(input);input.onchange=()=>{importProject(input.files[0]);input.value=''};
document.querySelectorAll('[data-import-project]').forEach(button=>button.addEventListener('click',()=>input.click()));
const zone=document.getElementById('project-dropzone');let depth=0;
if(zone){document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();depth++;zone.classList.add('dragging');}});document.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;zone.classList.remove('dragging')}});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()});document.addEventListener('drop',e=>{if(!e.dataTransfer?.files.length)return;e.preventDefault();depth=0;zone.classList.remove('dragging');if(e.dataTransfer.files.length!==1){content.innerHTML='<h2>一次导入一个地图项目</h2><p>请只拖入一个项目压缩包。</p>';dialog.showModal();return;}importProject(e.dataTransfer.files[0]);});}
