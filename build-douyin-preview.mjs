// Build this workflow's own mini-game. No Cocos project or unrelated build is modified.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),id=Number(process.argv[2]||2),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))),map=catalog.maps.find(m=>m.id===id);
if(!map)throw Error('未知地图编号');
const output=path.join(root,'douyin-preview',`map-${String(id).padStart(3,'0')}`),source=path.join(root,map.directory);fs.mkdirSync(output,{recursive:true});
const ui=JSON.parse(fs.readFileSync(path.join(root,map.uiProfile||'ui/manifest.json'))),presentation=map.presentation?JSON.parse(fs.readFileSync(path.join(root,map.presentation))):{...ui.defaultSelection,enabled:true};
const copy=(from,to)=>{const dest=path.join(output,to);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(from,dest);};
for(const file of ['territories.json','territories.u16','material.png','borders.u8','demo-pairs.json'])copy(path.join(source,file),'map/'+file.replace('territories.u16','territories.bin').replace('borders.u8','borders.bin'));
copy(path.join(source,map.colored),'map/reference.png');
const imagePaths=new Set([ui.participation.file,...ui.gifts.map(g=>g.file),...['map','gift'].map(kind=>ui.frames[kind].find(f=>f.id===presentation[kind+'Frame']).file)]);
for(const file of imagePaths)copy(path.join(root,'ui',file),'ui/'+file);
fs.writeFileSync(path.join(output,'map-config.json'),JSON.stringify({mapId:id,name:map.name,ui,presentation,engineVersion:'1.2.0',view:'audience',sourceDirectory:map.directory}));
// Bundle only local, reviewed ES modules. The portable build needs Node, not npm dependencies.
const modules=new Map(),order=[];
function visit(filename){
 filename=path.resolve(filename);if(modules.has(filename))return;
 if(!filename.startsWith(root+path.sep))throw Error('模块路径越界');modules.set(filename,{});
 let text=fs.readFileSync(filename,'utf8');const exports=[];
 text=text.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,ref)=>{
  const dependency=path.resolve(path.dirname(filename),ref.split('?')[0]);visit(dependency);
  return `const {${names.replace(/\s+as\s+/g,':')}}=modules[${JSON.stringify(path.relative(root,dependency).replaceAll('\\','/'))}];`;
 });
 text=text.replace(/export\s+(const|let|class|function)\s+(\w+)/g,(_,kind,name)=>{exports.push(name);return kind+' '+name});
 const key=path.relative(root,filename).replaceAll('\\','/');modules.set(filename,{key,text,exports});order.push(filename);
}
visit(path.join(root,'douyin/entry.mjs'));
fs.writeFileSync(path.join(output,'game.js'),`'use strict';\n(function(){const modules={};\n${order.map(f=>{const m=modules.get(f);return `modules[${JSON.stringify(m.key)}]=(function(){\n${m.text}\nreturn {${m.exports.join(',')}};})();`}).join('\n')}\n})();`);
fs.writeFileSync(path.join(output,'game.json'),JSON.stringify({deviceOrientation:'portrait',showStatusBar:false},null,2));
const projectFile=path.join(output,'project.config.json');const existing=fs.existsSync(projectFile)?JSON.parse(fs.readFileSync(projectFile)):{};
fs.writeFileSync(projectFile,JSON.stringify({...existing,appid:existing.appid||'',projectname:map.name+' · 工作流预览',setting:{urlCheck:false,es6:true,minified:false}},null,2));
fs.writeFileSync(path.join(output,'README.md'),`# ${map.name} · 当前工作流预览\n\n地图编号 ${id}，独立于旧 Cocos 工程。game.js 直接打包当前 TroopPipeline、ContactCombat 和地块染色模块。\n\n按 ui.audience 显示观众裁剪范围。自动开始第一个演示，轻触暂停/继续；向下滑动回防，双击切换三个演示起点。\n\n开发者工具项目配置使用本工程自己的 AppID 或工具的测试配置；不沿用其他工程的配置。\n`);
console.log(JSON.stringify({directory:output,mapId:id,name:map.name,modules:order.length,view:'audience',mapFrame:presentation.mapFrame,giftFrame:presentation.giftFrame}));
