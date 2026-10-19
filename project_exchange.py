"""Portable data-only project archives. Never imports executable engine code."""
from pathlib import Path, PurePosixPath
import array, copy, hashlib, io, json, os, re, shutil, stat, tempfile, uuid, zipfile
from datetime import datetime, timezone
from PIL import Image

FORMAT = 'shanhe-map-project'
DATA_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.json', '.u16', '.u8', '.md', '.txt'}
MAX_ARCHIVE = 160 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, path)

def safe_name(value):
    if not isinstance(value, str) or not value or '\\' in value or ':' in value or '\x00' in value:
        raise ValueError('压缩包中存在无效文件路径')
    path = PurePosixPath(value)
    if path.is_absolute() or any(x in ('..', '.') or x.endswith((' ', '.')) for x in path.parts):
        raise ValueError('压缩包中的文件路径越界')
    if any(re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', x, re.I) for x in path.parts):
        raise ValueError('不支持的文件名称')
    return path

def contained(root, relative):
    path = (Path(root) / str(safe_name(relative))).resolve()
    if not path.is_relative_to(Path(root).resolve()):
        raise ValueError('文件路径越出项目目录')
    return path

def digest(data):
    return hashlib.sha256(data).hexdigest()

def get_map(root, map_id):
    catalog = read_json(root / 'catalog.json')
    item = next((m for m in catalog['maps'] if m['id'] == int(map_id)), None)
    if not item:
        raise ValueError('没有找到这张地图')
    return catalog, item

def export_project(root, map_id, selection=None):
    root = Path(root).resolve()
    catalog, item = get_map(root, map_id)
    if not item.get('projectUid'):
        item['projectUid'] = str(uuid.uuid4())
        atomic_json(root / 'catalog.json', catalog)
    folder = contained(root, item['directory'])
    profile = read_json(contained(root,item['uiProfile'])) if item.get('uiProfile') else read_json(root / 'ui/manifest.json')
    presentation = read_json(folder / 'presentation.json') if (folder / 'presentation.json').exists() else {'enabled': True, **profile['defaultSelection']}
    if selection:
        for kind in ['map','gift']:
            chosen=selection.get(kind+'Frame')
            if chosen and any(f['id']==chosen for f in profile['frames'][kind]):presentation[kind+'Frame']=chosen
        presentation['enabled']=bool(selection.get('enabled',True))
    objects, project_files, shared_files = {}, {}, {}
    def add(path, mapping, key):
        raw = path.read_bytes(); sha = digest(raw)
        objects.setdefault(sha, raw)
        mapping[key] = {'sha256': sha, 'bytes': len(raw)}
    for file in sorted(folder.rglob('*')):
        if file.is_file() and not file.is_symlink() and file.suffix.lower() in DATA_SUFFIXES:
            add(file, project_files, file.relative_to(folder).as_posix())
    # Carry fallback copies of referenced shared assets once per hash. The receiving
    # engine reuses its identical assets and only installs the missing ones.
    for file in sorted((root / 'ui/assets').rglob('*')):
        if file.is_file() and file.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}:
            add(file, shared_files, file.relative_to(root / 'ui').as_posix())
    manifest = {'format': FORMAT, 'schemaVersion': 1, 'engineMinimum': '1.2.0', 'projectUid': item['projectUid'],
                'exportedAt': datetime.now(timezone.utc).isoformat(), 'map': item, 'presentation': presentation,
                'uiProfile': profile, 'projectFiles': project_files, 'sharedFiles': shared_files}
    manifest['contentId'] = digest(json.dumps({k: manifest[k] for k in ['projectUid', 'projectFiles', 'sharedFiles', 'presentation', 'uiProfile']}, sort_keys=True).encode())
    target = root / 'packages' / ('project-' + str(map_id).zfill(3) + '.zip')
    target.parent.mkdir(exist_ok=True)
    temp = target.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('project.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        for sha, raw in objects.items():
            archive.writestr('objects/' + sha, raw)
    os.replace(temp, target)
    return {'url': 'packages/' + target.name, 'name': item['name'], 'bytes': target.stat().st_size,
            'projectUid': item['projectUid'], 'projectFiles': len(project_files), 'sharedAssets': len(shared_files),
            'uniqueObjects': len(objects), 'contentId': manifest['contentId']}

def decode_project(raw):
    if len(raw) > MAX_ARCHIVE:
        raise ValueError('项目压缩包超过 160 MB')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries) > 5000 or sum(e.file_size for e in entries) > MAX_EXPANDED:
            raise ValueError('项目解压后的大小或文件数量超出限制')
        names = [e.filename for e in entries]
        if len(set(names)) != len(names):
            raise ValueError('压缩包有重复文件名称')
        for entry in entries:
            safe_name(entry.filename)
            if stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1:
                raise ValueError('不接受链接文件或加密压缩包')
        if 'project.json' not in names:
            raise ValueError('这不是地图项目压缩包。请让对方用“发给别人”重新导出。')
        if archive.getinfo('project.json').file_size > 4 * 1024 * 1024:
            raise ValueError('项目清单过大')
        manifest = json.loads(archive.read('project.json'))
        if manifest.get('format') != FORMAT or manifest.get('schemaVersion') != 1:
            raise ValueError('项目格式不兼容，请使用相同版本的工作流引擎')
        uuid.UUID(manifest['projectUid'])
        blobs = {}
        for key in ['projectFiles', 'sharedFiles']:
            for name, info in manifest[key].items():
                safe_name(name)
                if PurePosixPath(name).suffix.lower() not in DATA_SUFFIXES:
                    raise ValueError('项目包只接受地图数据和素材，不安装脚本')
                sha = info['sha256']
                if not re.fullmatch('[0-9a-f]{64}', sha):
                    raise ValueError('无效素材校验值')
                if sha not in blobs:
                    data = archive.read('objects/' + sha)
                    if digest(data) != sha:
                        raise ValueError('项目素材校验失败，压缩包可能损坏')
                    blobs[sha] = data
                if len(blobs[sha]) != info['bytes']:
                    raise ValueError('项目素材大小与清单不一致')
        expected = digest(json.dumps({k: manifest[k] for k in ['projectUid', 'projectFiles', 'sharedFiles', 'presentation', 'uiProfile']}, sort_keys=True).encode())
        if expected != manifest.get('contentId'):
            raise ValueError('项目内容校验失败')
        files = manifest['projectFiles']
        if 'template.json' not in files:
            raise ValueError('缺少三阶段项目档案')
        template = json.loads(blobs[files['template.json']['sha256']])
        # References may name source text, but never navigate out of this project.
        for key in ['terrain', 'colored', 'cover']:
            safe_name(manifest['map'][key])
        if 'territories.json' in files:
            atlas = json.loads(blobs[files['territories.json']['sha256']])
            w, h = atlas['width'], atlas['height']
            if not isinstance(w, int) or not isinstance(h, int) or not 16 <= w <= 4096 or not 16 <= h <= 4096 or w*h > 10_000_000:
                raise ValueError('地图像素尺寸不支持')
            if 'territories.u16' not in files or files['territories.u16']['bytes'] != w*h*2:
                raise ValueError('动态地块数据不完整')
            ids = array.array('H'); ids.frombytes(blobs[files['territories.u16']['sha256']])
            if max(ids) > len(atlas['territories']) or len(atlas['territories']) > 10000:
                raise ValueError('地块编号无效')
            for i, row in enumerate(atlas['territories'], 1):
                if row['id'] != i or len(row['color']) != 3 or any(not isinstance(c, (int,float)) or not 0 <= c <= 255 for c in row['color']):
                    raise ValueError('地块颜色或编号无效')
                if any(not isinstance(n, int) or not 1 <= n <= len(atlas['territories']) for n in row['neighbors']):
                    raise ValueError('地块接壤数据无效')
        # Validate image payloads before touching the receiving library.
        for key in ['projectFiles','sharedFiles']:
            for name, info in manifest[key].items():
                if PurePosixPath(name).suffix.lower() in {'.png','.jpg','.jpeg','.webp'}:
                    with Image.open(io.BytesIO(blobs[info['sha256']])) as image:
                        if image.width*image.height > 30_000_000:
                            raise ValueError('图片尺寸超出限制')
                        image.verify()
        return manifest, blobs, template

def import_project(root, raw):
    root = Path(root).resolve()
    package, blobs, template = decode_project(raw)
    catalog = read_json(root / 'catalog.json')
    previous = next((m for m in catalog['maps'] if m.get('importContentId') == package['contentId']), None)
    if not previous:
        for candidate in catalog['maps']:
            if candidate.get('projectUid')!=package['projectUid']:continue
            folder=contained(root,candidate['directory'])
            if all(contained(folder,name).is_file() and digest(contained(folder,name).read_bytes())==info['sha256'] for name,info in package['projectFiles'].items()):
                current_selection=read_json(folder/'presentation.json') if (folder/'presentation.json').exists() else read_json(root/'ui/manifest.json')['defaultSelection']
                if all(current_selection.get(k)==package['presentation'].get(k) for k in ['mapFrame','giftFrame']):previous=candidate;break
    local_ui = read_json(root / 'ui/manifest.json')
    remote_ui = package['uiProfile']
    for key in ['source','mapOpening','mapFrame','giftFrame','audience']:
        if local_ui[key] != remote_ui[key]:
            raise ValueError('此项目使用不同的取景尺寸，请先用相同布局的工作流引擎导入')
    # Shared image references must resolve to declared blobs; never trust external URLs.
    references = [f['file'] for group in remote_ui['frames'].values() for f in group]
    references += [g['file'] for g in remote_ui['gifts']] + [remote_ui['participation']['file']]
    if any(ref not in package['sharedFiles'] for ref in references):
        raise ValueError('公共素材依赖不完整')
    existing = {}
    for path in (root / 'ui/assets').rglob('*'):
        if path.is_file():
            existing.setdefault(digest(path.read_bytes()), path.relative_to(root / 'ui').as_posix())
    local_refs={f['file'] for group in local_ui['frames'].values() for f in group}|{g['file'] for g in local_ui['gifts']}|{local_ui['participation']['file']}
    file_map, added, reused = {}, 0, 0
    for name, info in package['sharedFiles'].items():
        sha = info['sha256']
        if sha in existing:
            file_map[name] = existing[sha]; reused += 1
        else:
            file_map[name] = name if name in local_refs and not contained(root/'ui',name).exists() else 'assets/imported/' + sha + PurePosixPath(name).suffix.lower()
            existing[sha] = file_map[name]; added += 1
    aliases = {}
    for kind in ['map','gift']:
        aliases[kind] = {}
        for frame in remote_ui['frames'][kind]:
            mapped = file_map[frame['file']]
            match = next((f for f in local_ui['frames'][kind] if f['file'] == mapped and f.get('railRect') == frame.get('railRect')), None)
            if match:
                aliases[kind][frame['id']] = match['id']; continue
            new = copy.deepcopy(frame); new['file'] = mapped
            if any(f['id'] == new['id'] for f in local_ui['frames'][kind]):
                new['id'] += '-' + package['sharedFiles'][frame['file']]['sha256'][:8]
            if any(f['id'] == new['id'] for f in local_ui['frames'][kind]):
                new['id'] += '-' + uuid.uuid4().hex[:6]
            local_ui['frames'][kind].append(new); aliases[kind][frame['id']] = new['id']
    if previous:
        for name,info in package['sharedFiles'].items():
            target=contained(root/'ui',file_map[name]);target.parent.mkdir(parents=True,exist_ok=True)
            if not target.exists():target.write_bytes(blobs[info['sha256']])
        atomic_json(root/'ui/manifest.json',local_ui)
        return {'mapId':previous['id'],'name':previous['name'],'duplicate':True,'reusedAssets':reused,'addedAssets':added}
    map_id = catalog['nextMapId']
    relative = 'projects/imported-' + str(map_id).zfill(3) + '-' + package['projectUid'][:8]
    destination = contained(root, relative)
    if destination.exists():
        raise ValueError('目标项目目录已存在，请检查地图库编号')
    presentation = {k:copy.deepcopy(package['presentation'][k]) for k in ['enabled','mapFrame','giftFrame'] if k in package['presentation']}
    for kind in ['map','gift']:
        selected = presentation.get(kind+'Frame', remote_ui['defaultSelection'][kind+'Frame'])
        if selected not in aliases[kind]:
            raise ValueError('选中的地图框或礼物框不存在')
        presentation[kind+'Frame'] = aliases[kind][selected]
    presentation['uiProfile'] = '../../ui/manifest.json'
    # Preserve this project's gift assets/text instead of changing the receiver's defaults.
    project_ui = copy.deepcopy(remote_ui)
    for group in project_ui['frames'].values():
        for f in group: f['file'] = file_map[f['file']]
    for g in project_ui['gifts']: g['file'] = file_map[g['file']]
    project_ui['participation']['file'] = file_map[project_ui['participation']['file']]
    project_ui['frames'] = local_ui['frames']
    original = package['map']
    item = {k: copy.deepcopy(original[k]) for k in ['name','subtitle','description','createdAt','createdAtBasis','dateLabel','cover','terrain','colored','territoryCount','tags','stage3Status'] if k in original}
    item.update(id=map_id, slug='imported-'+str(map_id), directory=relative, projectUid=package['projectUid'], importContentId=package['contentId'], sourceMapId=original['id'],
                package=f'packages/map-{map_id:03}.zip', presentation=relative+'/presentation.json', uiProfile=relative+'/ui-profile.json', workshopUrl='workshop/?map='+str(map_id),
                instruction=f'把游戏地图换成 {map_id} 号「{original["name"]}」，使用地图库登记的动态地块与配套素材。')
    template['mapLibraryId'] = map_id
    template['behaviorEngine'] = {'entry':'../../workshop/pipeline.mjs','version':'1.2.0','acceptance':'../../workshop/quick-check.mjs','demoCount':3}
    for stage in template['stages']:
        if stage.get('number') == 3: stage['file'] = 'index.html'; stage['preview'] = '../../workshop/?map='+str(map_id)
    # All validation precedes writes. Only trusted local wrappers are executable.
    destination.mkdir(parents=True)
    try:
        for name, info in package['projectFiles'].items():
            target = contained(destination, name); target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blobs[info['sha256']])
        for name, info in package['sharedFiles'].items():
            target = contained(root / 'ui', file_map[name]); target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists(): target.write_bytes(blobs[info['sha256']])
        atomic_json(destination / 'template.json', template)
        atomic_json(destination / 'presentation.json', presentation)
        atomic_json(destination / 'ui-profile.json', project_ui)
        if (destination/'quick-acceptance.json').exists():
            os.replace(destination/'quick-acceptance.json',destination/'source-acceptance.json')
        atomic_json(destination/'quick-acceptance.json',{'passed':False,'mapId':map_id,'error':'刚导入的项目需要在本机重新快速验收'})
        (destination / 'index.html').write_text(f'<!doctype html><meta http-equiv="refresh" content="0;url=../../workshop/?map={map_id}">', encoding='utf-8')
        (destination / 'app.mjs').write_text('// Shared engine: ../../workshop/pipeline.mjs\n', encoding='utf-8')
        shutil.copyfile(root / 'templates/six-realms/frontier.mjs', destination / 'frontier.mjs')
        catalog['maps'].append(item); catalog['nextMapId'] = map_id+1
        atomic_json(root / 'ui/manifest.json', local_ui)
        atomic_json(root / 'catalog.json', catalog)
    except Exception:
        if destination.is_relative_to(root / 'projects') and destination.name.startswith('imported-'):
            shutil.rmtree(destination)
        raise
    return {'mapId': map_id, 'name': item['name'], 'duplicate': False, 'sourceMapId': original['id'], 'reusedAssets': reused, 'addedAssets': added}
