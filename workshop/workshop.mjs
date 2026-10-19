import {buildAiRequest} from './ai-request.mjs';
import {request} from '../components/project-actions.mjs';
import {mountFramePicker} from '../ui/frame-picker.mjs';
import '../components/select.mjs';
import {mount as mountUi,config} from '../ui/renderer.mjs?v=4';
import {mountMap} from './runtime.mjs?v=7';
const $=id=>document.getElementById(id),catalog=await fetch('../catalog.json',{cache:'no-store'}).then(r=>r.json());
const modes=['base','target','live'],panels=['map','appearance','feedback'];
let current,manifest,state,api,picker,loading=false,available={},overlay=await mountUi($('ui-presentation'),{enabled:false});
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const stateKey=id=>'workshop-map-'+id;
const displayNames={base:'原始地形',target:'彩色分区',live:'动态领地'};
function persist(){if(!current||!state)return;write(stateKey(current.id),state);write('workshop-last-map',current.id);$('workshop-nav').href='./?map='+current.id;}
function route(push=false){const url=new URL(location.href);url.search=new URLSearchParams(current?{map:current.id,stage:state.stage,panel:state.panel}:{new:'1',panel:state.panel});history[push?'pushState':'replaceState']({},'',url);persist();}
function feedbackContext(){if(current)$('feedback-context').textContent=`${current.id} 号 · ${current.name} / ${displayNames[state.stage]}`;}
function setPanel(panel,save=true){if(!panels.includes(panel))panel='map';state.panel=panel;for(const name of panels)$('panel-'+name).hidden=name!==panel;for(const button of document.querySelectorAll('[data-panel]'))button.setAttribute('aria-pressed',String(button.dataset.panel===panel));feedbackContext();if(save)route();}
function onMode(mode){state.stage=mode;feedbackContext();$('demo-hint').textContent=mode==='live'?'自动逐块推进；遇守军接战，后方遇袭由守军抵抗，主力可下令回防。':'正在查看静态阶段；开始推进会回到动态领地。';route();}
function syncGuides(){for(const input of document.querySelectorAll('[data-guide]')){$('template-'+input.dataset.guide).hidden=!input.checked;}const d=manifest?.defaults||{};$('template-top').style.top=(d.topSafeFraction??.05)*100+'%';$('template-gift').style.height=(d.bottomSafeFraction??.138497)*100+'%';}
async function applyUi(){await overlay.set(state.ui);$('ui-visible').checked=state.ui.enabled;picker?.refresh();persist();}
for(const m of catalog.maps){const o=document.createElement('option');o.value=m.id;o.textContent=m.name;$('map-picker').append(o)}
picker=mountFramePicker({frames:config.frames,getState:()=>state?.ui||config.defaultSelection,onSelect:async(kind,id)=>{if(loading)throw Error('请等待地图加载完成');state.ui[kind+'Frame']=id;state.ui.enabled=true;await applyUi();}});
for(const gift of config.gifts){const a=document.createElement('a');a.href='../ui/'+gift.file;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=a.href;img.alt=gift.name;const name=document.createElement('span');name.textContent=gift.name;const small=document.createElement('small');small.textContent=gift.diamonds+' 钻';a.append(img,name,small);$('gift-assets').append(a);}
async function staticMap(directory){const loaded={};for(const mode of ['base','target'])if(available[mode]){const file=mode==='base'?current.terrain:current.colored;loaded[mode]=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=new URL(file,directory);});}
 return {selectMode(mode){if(!loaded[mode]){for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));$('modeLabel').textContent='等待第一阶段地形图';document.querySelector('.original-link').hidden=true;return;}const img=loaded[mode],canvas=$('map');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);$('units').hidden=true;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));$('modeLabel').textContent=displayNames[mode];document.querySelector('.original-link').href=img.src;onMode(mode);},dispose(){},initialDifference(){return null;}};
}
async function openMap(id,{stage,panel,push=false}={}){
 if(loading)return;document.body.classList.remove('new-map-mode');$('new-map-panel').hidden=true;$('request-skin').disabled=false;$('package-link').disabled=false;for(const b of document.querySelectorAll('[data-panel]'))b.disabled=false;loading=true;$('map-picker').disabled=true;$('loading').hidden=false;$('loading').textContent='正在打开地图…';persist();api?.dispose();window.mapLab=null;
 for(const id of ['demo','pause','reset','quick-check','raid-home','recall-order','combat-enabled'])$(id).disabled=true;current=catalog.maps.find(m=>m.id===Number(id))||catalog.maps[0];$('map-picker').value=current.id;$('quick-result').textContent='当前地图尚未运行快速验收。';window.lastTroopAcceptance=null;
 try{
 const directory=new URL('../'+current.directory+'/',location.href);manifest=await fetch(new URL('template.json',directory),{cache:'no-store'}).then(r=>r.json());
 const profile=current.presentation?await fetch(new URL('../'+current.presentation,location.href)).then(r=>r.json()):{...config.defaultSelection,enabled:false};
 const saved=read(stateKey(current.id),{});state={stage:'live',panel:'map',guides:{source:true,audience:true,safe:true},draft:'',scope:'stage',demoIndex:0,...saved,ui:{...config.defaultSelection,...profile,...saved.ui}};
 modes.forEach((mode,i)=>{const s=manifest.stages[i];available[mode]=!!s?.file&&!['locked','building'].includes(s.status);const button=document.querySelector(`[data-mode=${mode}]`);button.disabled=!available[mode];$('state-'+mode).textContent=!available[mode]?(i===0?'待生成':'待确认上一阶段'):s.status==='approved'?'已确认':mode==='live'?'可预览 · 待验收':'可对照';});
 state.stage=available[stage]?stage:available[state.stage]?state.stage:(modes.find(m=>available[m])||'base');state.panel=panels.includes(panel)?panel:state.panel;
 document.querySelector('.original-link').hidden=false;$('map-number').textContent='No. '+String(current.id).padStart(3,'0');$('map-status').textContent=current.id===catalog.defaultMapId?'默认基础模板':current.subtitle;$('package-link').dataset.shareMap=current.id;
 if(!available.base&&!state.draft)state.draft='请先生成第一阶段地形原图，默认9:16，不加文字或势力颜色。生成后展示给我确认，再进入下一阶段。\n地图要求：'+(typeof manifest.userRequest==='string'?manifest.userRequest:JSON.stringify(manifest.userRequest||{}));$('prompt-intro').checked=!state.promptIntroCopied;$('feedback').value=state.draft;$('request-scope').value=state.scope;$('request-output').hidden=true;$('feedback-result').textContent='首次复制会附上工作流入口、项目路径和当前阶段的操作说明。';$('draft-status').textContent=state.draft?'已恢复本机草稿':'本机草稿';
 for(const input of document.querySelectorAll('[data-guide]'))input.checked=state.guides[input.dataset.guide]!==false;syncGuides();$('inspect-regions').checked=false;$('region-overlay').hidden=true;
 const hasExamples=manifest.stages[2]?.dependencies?.includes('demo-pairs.json');const diagnostic=!!manifest.stages[2]?.verification;$('inspect-regions').disabled=!diagnostic;if(diagnostic)$('region-overlay').src=new URL('debug-regions.png',directory);else $('region-overlay').removeAttribute('src');
 $('verification-summary').textContent=`${current.territoryCount} 个地块 · 三阶段分别保留\n只在明确确认后推进下一制作阶段。`;
 const projectLayout=current.uiProfile?await fetch(new URL('../'+current.uiProfile,location.href),{cache:'no-store'}).then(r=>r.json()):config;await overlay.setProfile(projectLayout);await applyUi();
 api=available.live?await mountMap({directory,terrain:current.terrain,colored:current.colored,hasExamples,onModeChange:onMode,layout:projectLayout}):await staticMap(directory);
 $('empty-project').hidden=Object.values(available).some(Boolean);window.mapLab=api;if(api.atlas?.playableArea)$('verification-summary').textContent=`框内 ${api.atlas.playableArea.activeTerritories} 个可玩地块 · 框外仅作装饰\n跨框地块仅框内可吞噬，框外不可出兵、寻路或点击。`;if($('demo-region').options.length)$('demo-region').value=String(Math.min(state.demoIndex,$('demo-region').options.length-1));api.prepare?.();$('quick-check').disabled=!available.live;api.selectMode(state.stage);setPanel(state.panel,false);route(push);$('loading').hidden=true;
 }catch(error){$('loading').textContent='载入失败：'+error.message+'。请重新选择地图重试。';$('status').textContent='地图未就绪';console.error(error);}finally{loading=false;$('map-picker').disabled=false;}
}
$('demo-region').onchange=()=>{state.demoIndex=Number($('demo-region').value);persist();};
$('map-picker').onchange=e=>e.target.value==='new'?newMap():openMap(e.target.value,{push:true});
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{if(!loading&&available[button.dataset.mode])api.selectMode(button.dataset.mode)};
for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{if(!loading)setPanel(button.dataset.panel)};
for(const input of document.querySelectorAll('[data-guide]'))input.onchange=()=>{state.guides[input.dataset.guide]=input.checked;syncGuides();persist()};
$('ui-visible').onchange=async e=>{if(!loading){state.ui.enabled=e.target.checked;await applyUi()}};
$('inspect-regions').onchange=e=>$('region-overlay').hidden=!e.target.checked||state.stage!=='live';
$('request-skin').onclick=()=>{state.scope='both';$('request-scope').value='both';setPanel('feedback');$('feedback').focus();};
$('feedback').oninput=()=>{state.draft=$('feedback').value;persist();$('draft-status').textContent='已存本机草稿'};
$('request-scope').onchange=e=>{state.scope=e.target.value;persist()};
let workflowRoot;
$('copy-feedback').onclick=async()=>{
 const text=$('feedback').value.trim();if(!text){$('feedback-result').textContent='先写下想调整的内容。';$('feedback').focus();return;}
 if(!current)return;const map=current,requestState=state,stage=state.stage,scope=state.scope,introduction=$('prompt-intro').checked,button=$('copy-feedback');button.disabled=true;
 try{
  if(!workflowRoot){const response=await fetch('../api/session',{cache:'no-store'});if(!response.ok)throw Error('无法读取工作流目录，请通过启动地图库.cmd打开后重试。');workflowRoot=(await response.json()).root;}
  if(current!==map||state!==requestState)return;
  const message=buildAiRequest({root:workflowRoot,map,stage,scope,requirements:text,introduction,origin:new URL('../',location.href).href});
  $('request-output').value=message;$('request-output').hidden=false;
  try{await navigator.clipboard.writeText(message);if(current!==map||state!==requestState)return;
   if(introduction){state.promptIntroCopied=true;$('prompt-intro').checked=false;persist();}
   $('feedback-result').textContent=introduction?'已复制，包含首次接手说明、实际目录和交付位置。粘贴给 AI 即可开始。':'已复制本次要求；换一个 AI 时，可勾选“附带首次接手说明”重新复制。';
  }catch{$('feedback-result').textContent='要求已整理在下方，请手动复制；首次接手说明仍会保留。';$('request-output').select();}
 }catch(error){$('feedback-result').textContent=error.message;}finally{button.disabled=false;}
};
window.addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);openMap(q.get('map'),{stage:q.get('stage'),panel:q.get('panel')});});
async function newMap(){
 api?.dispose();api=null;window.mapLab=null;available={};$('map').getContext('2d').clearRect(0,0,$('map').width,$('map').height);$('units').getContext('2d').clearRect(0,0,$('units').width,$('units').height);current=null;manifest=null;state={stage:'base',panel:'map',guides:{source:true,audience:true,safe:true},ui:{...config.defaultSelection,enabled:true},draft:'',scope:'stage'};
 document.body.classList.add('new-map-mode');$('new-map-panel').hidden=false;$('loading').hidden=true;$('empty-project').hidden=false;$('map-number').textContent='NEW';$('map-status').textContent='新建地图';$('package-link').disabled=true;$('modeLabel').textContent='第一阶段 · 等待地形图';document.querySelector('.original-link').hidden=true;
 if(!$('map-picker').querySelector('option[value=new]')){const option=document.createElement('option');option.value='new';option.textContent='新建地图';$('map-picker').append(option);}$('map-picker').value='new';$('request-skin').disabled=true;
 for(const b of document.querySelectorAll('[data-mode]')){b.disabled=true;b.setAttribute('aria-pressed',String(b.dataset.mode==='base'));}for(const mode of modes)$('state-'+mode).textContent=mode==='base'?'待制作':'待确认上一阶段';
 document.querySelector('[data-panel=feedback]').disabled=true;syncGuides();await overlay.set({enabled:true,...config.defaultSelection});$('ui-visible').checked=true;
 $('new-map-form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;$('new-map-result').textContent='正在创建地图项目…';try{const result=await request('api/projects',{name:$('new-map-name').value,brief:$('new-map-brief').value,presentation:state.ui});catalog.maps.push(result.map);const option=document.createElement('option');option.value=result.mapId;option.textContent=result.map.name;$('map-picker').append(option);$('package-link').disabled=false;await openMap(result.mapId,{stage:'base',panel:'feedback',push:true});}catch(e){$('new-map-result').textContent=e.message;}finally{button.disabled=false;}};
}
const query=new URLSearchParams(location.search);if(query.has('new'))await newMap();else await openMap(query.get('map')||read('workshop-last-map',catalog.defaultMapId),{stage:query.get('stage'),panel:query.get('panel')});
window.workshop={snapshot:()=>({mapId:current?.id??null,stage:state.stage,panel:state.panel,ui:{...state.ui},loading,available:{...available},draft:state.draft}),overlay};
