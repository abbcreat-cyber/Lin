"""Local-only workflow API: projects, approvals and portable archives."""
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone
import json, re, secrets, subprocess, threading, uuid
from project_exchange import atomic_json, read_json, get_map, contained, export_project, import_project, MAX_ARCHIVE

LOCK = threading.RLock()
TOKEN = secrets.token_urlsafe(32)

def create_project(root,data):
    name=str(data.get('name','')).strip()[:60]
    brief=str(data.get('brief','')).strip()[:6000]
    if not name or not brief:raise ValueError('请填写地图名称和制作要求')
    catalog=read_json(root/'catalog.json');map_id=catalog['nextMapId'];relative=f'projects/map-{map_id:03}';folder=contained(root,relative)
    if folder.exists():raise ValueError('项目编号已被使用，请刷新后重试')
    defaults=read_json(root/'templates/six-realms/template.json')['defaults'];ui=read_json(root/'ui/manifest.json');selection={'enabled':True,**ui['defaultSelection']}
    for kind in ['map','gift']:
        chosen=(data.get('presentation') or {}).get(kind+'Frame')
        if chosen and any(f['id']==chosen for f in ui['frames'][kind]):selection[kind+'Frame']=chosen
    now=datetime.now(timezone.utc).isoformat()
    item={'id':map_id,'projectUid':str(uuid.uuid4()),'slug':f'map-{map_id:03}','name':name,'subtitle':'新建地图 · 等待地形图','description':brief,'directory':relative,'createdAt':now,'createdAtBasis':'实际创建时间','dateLabel':'项目创建时间','cover':'terrain.png','terrain':'terrain.png','colored':'colored.png','territoryCount':0,'tags':['新建地图'],'stage3Status':'第一阶段待制作','package':f'packages/map-{map_id:03}.zip','presentation':relative+'/presentation.json','workshopUrl':f'workshop/?map={map_id}','instruction':f'继续制作 {map_id} 号「{name}」，读取 brief.json 和 template.json，只完成当前授权阶段。'}
    template={'mapLibraryId':map_id,'name':name,'currentStage':1,'status':'building','userRequest':brief,'defaults':defaults,'stages':[{'number':1,'name':'原始地形','status':'building','file':'terrain.png'},{'number':2,'name':'彩色分区','status':'locked','file':'colored.png'},{'number':3,'name':'动态领地','status':'locked','file':'index.html','dependencies':['territories.json','territories.u16','material.png','borders.png','borders.u8','demo-pairs.json']}],'behaviorEngine':{'entry':'../../workshop/pipeline.mjs','version':'1.2.0','demoCount':3}}
    folder.mkdir(parents=True);atomic_json(folder/'brief.json',{'name':name,'requirements':brief,'aspectRatio':'9:16','approvalPerStage':True});atomic_json(folder/'template.json',template);atomic_json(folder/'presentation.json',selection)
    catalog['maps'].append(item);catalog['nextMapId']=map_id+1;atomic_json(root/'catalog.json',catalog)
    return {'mapId':map_id,'map':item,'projectPath':str(folder)}

def project_status(root, map_id):
    _,item=get_map(root,map_id);folder=contained(root,item['directory']);template=read_json(folder/'template.json')
    assets={key:(folder/item[key]).is_file() for key in ['terrain','colored']}
    assets['live']=all((folder/f).is_file() for f in ['territories.json','territories.u16','demo-pairs.json','material.png','borders.png','borders.u8'])
    report=read_json(folder/'quick-acceptance.json') if (folder/'quick-acceptance.json').is_file() else None
    return {'map':item,'template':template,'assets':assets,'acceptance':report,'projectPath':str(folder)}

def run_acceptance(root,map_id):
    status=project_status(root,map_id)
    if not status['assets']['live']: raise ValueError('第三阶段数据尚未完成')
    result=subprocess.run(['node',str(root/'accept-map.mjs'),str(map_id)],cwd=root,capture_output=True,text=True,encoding='utf-8',timeout=90)
    report=read_json(Path(status['projectPath'])/'quick-acceptance.json')
    if result.returncode or not report.get('passed'): raise ValueError(report.get('error') or '地图验收未通过')
    return report

class WorkflowHandler(SimpleHTTPRequestHandler):
    def __init__(self,*args,directory=None,**kwargs):
        self.root=Path(directory).resolve();super().__init__(*args,directory=str(self.root),**kwargs)
    def valid_host(self):
        return self.headers.get('Host','').split(':')[0] in ['localhost','127.0.0.1']
    def json_response(self,status,data):
        raw=json.dumps(data,ensure_ascii=False).encode('utf-8');self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        if self.path.split('?')[0].endswith(('.mjs','.js','.json','.html')):self.send_header('Cache-Control','no-store')
        super().end_headers()
    def do_GET(self):
        if not self.valid_host():self.send_error(403);return
        path=urlparse(self.path).path
        try:
            if path=='/api/session':return self.json_response(200,{'token':TOKEN,'apiVersion':1,'root':str(self.root)})
            if path=='/api/catalog':return self.json_response(200,read_json(self.root/'catalog.json'))
            match=re.fullmatch(r'/api/projects/(\d+)',path)
            if match:return self.json_response(200,project_status(self.root,int(match[1])))
            if path.startswith('/api/'):return self.json_response(404,{'error':'没有找到这个操作'})
            if path.startswith('/.'):return self.send_error(404)
            return super().do_GET()
        except (ValueError,KeyError,OSError) as e:self.json_response(400,{'error':str(e)})
    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Workflow-Token')!=TOKEN:return self.json_response(403,{'error':'请刷新本地工作流后重试'})
        origin=self.headers.get('Origin')
        if origin and urlparse(origin).netloc!=self.headers.get('Host'):return self.json_response(403,{'error':'只允许本地工作流页面操作'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=MAX_ARCHIVE:return self.json_response(413,{'error':'文件为空或超过 160 MB'})
            raw=self.rfile.read(size);path=urlparse(self.path).path
            with LOCK:
                if path=='/api/projects/import':return self.json_response(200,import_project(self.root,raw))
                data=json.loads(raw)
                if path=='/api/projects':return self.json_response(200,create_project(self.root,data))
                match=re.fullmatch(r'/api/projects/(\d+)/(share|acceptance)',path)
                if not match:return self.json_response(404,{'error':'没有找到这个操作'})
                map_id=int(match[1]);action=match[2]
                if action=='share':result=export_project(self.root,map_id,data.get('presentation'))
                elif action=='acceptance':result=run_acceptance(self.root,map_id)
                self.json_response(200,result)
        except Exception as e:
            self.json_response(400,{'error':str(e)[:800]})
