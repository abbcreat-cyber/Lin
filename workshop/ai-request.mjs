const stageNames={base:'第一阶段：地形原图',target:'第二阶段：彩色分区',live:'第三阶段：动态领地'};
export function buildAiRequest({root,map,stage,scope='stage',requirements,introduction=true,origin}){
 if(!root||!map?.directory||!stageNames[stage])throw Error('缺少工作流或项目定位信息');
 if(!introduction){
  const task=scope==='stage'?stageNames[stage]:({map:'地图框',gift:'礼物框',both:'地图框和礼物框'}[scope]||'框素材');
  return `继续 ${map.id} 号「${map.name}」的${task}。\n${requirements.trim()}\n完成后在工坊展示，等我确认。`;
 }
 const workflow=root.replaceAll('\\','/').replace(/\/$/,''),project=workflow+'/'+map.directory;
 const preview=new URL('workshop/',origin.endsWith('/')?origin:origin+'/');preview.search=new URLSearchParams({map:map.id,stage,panel:scope==='stage'?'map':'appearance'});
 const parts=[];
 if(introduction)parts.push(`这是“山河制图台”本地地图制作工作流：地形原图 → 彩色分区 → 可吞噬、对战的动态地图，每阶段由我确认后再继续。\n工作流根目录：${workflow}\n请先读根目录的 AGENTS.md、STAGE-REVIEW.md，再读本项目的 template.json 和 brief.json（若存在），按里面的要求开始。`);
 parts.push(`项目：${map.id} 号「${map.name}」\n项目目录：${project}\n本次${scope==='stage'?'只做'+stageNames[stage]:'修改'+({map:'地图框',gift:'礼物框',both:'地图框和礼物框'}[scope]||'框素材')}。\n要求：${requirements.trim()}`);
 if(scope!=='stage')parts.push(`先读 ${workflow}/ui/manifest.json 和 ui/README.md，沿用尺寸、位置与框内开口，复用已有礼物素材。新素材保存到本工作流，装配到本项目预览。`);
 else if(stage==='base')parts.push(`用生图工具生成 9:16 地形原图，不加文字或势力颜色，等比显示、不拉伸。保存到 ${project}/${map.terrain}；将 template.json 第一阶段状态设为 awaiting-user-approval，并更新 catalog.json 中本图的 cover 和 coverReady，让工坊显示新图。`);
 else if(stage==='target')parts.push(`以已确认的 ${map.terrain} 为底图，保持地形与海岸，对全部陆地分区上色（包括中心、陆桥和山林）。保存到 ${project}/${map.colored}，更新本阶段档案与封面为待确认。`);
 else parts.push(`先读 ${workflow}/workshop/ENGINE.md，按契约生成地块数据并接入共用引擎，配置3处演示。只有地图框内参与吞噬、寻路和战斗，框外只作装饰。运行 node accept-map.mjs ${map.id} 并修复失败项，更新本阶段为待确认。`);
 parts.push(`完成后在工坊展示结果：${preview.href}\n只完成当前任务，等我确认后再进入下一地图阶段。`);
 return parts.join('\n\n');
}
