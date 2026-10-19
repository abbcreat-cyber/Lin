"""Portable map catalog validator and Cocos map-layer package exporter. No game writes."""
from pathlib import Path
import argparse, array, base64, hashlib, io, json, subprocess, sys, zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parent

def catalog():
    data = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8'))
    ids = [m['id'] for m in data['maps']]
    if len(ids) != len(set(ids)) or data['nextMapId'] <= max(ids):
        raise ValueError('Catalog IDs must be unique and permanent')
    return data

def path_in_root(path):
    result = (ROOT / path).resolve()
    if not result.is_relative_to(ROOT):
        raise ValueError('Catalog path escapes workflow')
    return result

def verify(m):
    folder = path_in_root(m['directory'])
    manifest = json.loads((folder / 'template.json').read_text(encoding='utf-8'))
    if manifest['mapLibraryId'] != m['id']:
        raise ValueError('Map ID mismatch')
    for f in [m['terrain'],m['colored'],'index.html','app.mjs','frontier.mjs','territories.json','territories.u16','material.png','borders.png','borders.u8']:
        if not (folder / f).is_file(): raise ValueError(f'Missing map {m["id"]}: {f}')
    atlas = json.loads((folder / 'territories.json').read_text(encoding='utf-8'))
    size = (atlas['width'],atlas['height'])
    for f in [m['terrain'],m['colored'],'material.png','borders.png']:
        with Image.open(folder / f) as img:
            if img.size != size: raise ValueError(f'Dimensions differ: {f}')
    ids = array.array('H'); ids.frombytes((folder / 'territories.u16').read_bytes())
    if sys.byteorder != 'little': ids.byteswap()
    if len(ids) != size[0]*size[1] or len((folder/'borders.u8').read_bytes()) != len(ids):
        raise ValueError('ID/mask byte length mismatch')
    rows=atlas['territories']
    if max(ids)>len(rows) or len(rows)!=m['territoryCount']: raise ValueError('Region count mismatch')
    for i,t in enumerate(rows,1):
        if t['id']!=i or ids[t['center'][1]*size[0]+t['center'][0]]!=i: raise ValueError('Invalid anchor/ID')
        for n in t['neighbors']:
            if not 1<=n<=len(rows) or i not in rows[n-1]['neighbors']: raise ValueError('Invalid adjacency')
    return folder,atlas,ids

def export(m):
    folder,atlas,ids = verify(m)
    playable=json.loads(subprocess.run(['node',str(ROOT/'export-playable.mjs'),str(folder)],check=True,capture_output=True,text=True,encoding='utf-8').stdout)
    atlas=playable['atlas'];id_bytes=base64.b64decode(playable['idsBase64'])
    ids=array.array('H');ids.frombytes(id_bytes)
    if sys.byteorder!='little': ids.byteswap()
    compact={**{k:atlas[k] for k in ['width','height','playableArea']},'territories':[{k:t[k] for k in ['id','color','area','center','neighbors','active']} for t in atlas['territories']]}
    compact_text=json.dumps(compact,ensure_ascii=False,separators=(',',':'))
    blobs={}
    for f in ['material.png','borders.png','borders.u8','territories.u16']:
        blobs['preview/phone-map/'+f]=(folder/f).read_bytes()
    blobs['preview/phone-map/territories.u16']=id_bytes
    border_mask=bytearray(blobs['preview/phone-map/borders.u8'])
    border_image=Image.open(folder/'borders.png').convert('RGBA');border_pixels=bytearray(border_image.tobytes())
    for p,id in enumerate(ids):
        if not id: border_mask[p]=0;border_pixels[p*4+3]=0
    buf=io.BytesIO();Image.frombytes('RGBA',border_image.size,bytes(border_pixels)).save(buf,format='PNG')
    blobs['preview/phone-map/borders.png']=buf.getvalue()
    blobs['preview/phone-map/borders.u8']=bytes(border_mask)
    blobs['preview/phone-map/base.png']=(folder/m['terrain']).read_bytes()
    blobs['preview/phone-map/reference.png']=(folder/m['colored']).read_bytes()
    blobs['preview/phone-map/runtime-atlas.json']=compact_text.encode('utf-8')
    encoded=bytearray(len(ids)*4)
    for p,v in enumerate(ids): encoded[p*4:p*4+4]=bytes((v%256,v//256,0,255))
    image=Image.frombytes('RGBA',(atlas['width'],atlas['height']),bytes(encoded));buf=io.BytesIO();image.save(buf,format='PNG')
    blobs['preview/phone-map/territories-id.png']=buf.getvalue()
    blobs['assets/scripts/phone-map-data.ts']=('// Generated from map library ID '+str(m['id'])+'.\nexport const PHONE_ATLAS = '+compact_text+';\n').encode('utf-8')
    # UI assets are independent of territory artwork, but travel with the package.
    ui_root=ROOT/'ui'
    if (ui_root/'manifest.json').is_file():
        for file in [ui_root/'manifest.json',ui_root/'renderer.mjs',ui_root/'README.md',*sorted((ui_root/'assets').rglob('*'))]:
            if file.is_file(): blobs['ui/'+file.relative_to(ui_root).as_posix()]=file.read_bytes()
        if m.get('uiProfile'): blobs['ui/manifest.json']=path_in_root(m['uiProfile']).read_bytes()
        selected=folder/'presentation.json'
        if selected.is_file():
            presentation=json.loads(selected.read_text(encoding='utf-8'))
            presentation['uiProfile']='ui/manifest.json'
            blobs['presentation.json']=json.dumps(presentation,ensure_ascii=False,indent=2).encode('utf-8')
    # Include the reusable movement/acceptance module, without modifying the game checkout.
    for relative in ['workshop/pipeline.mjs','workshop/territory-paint.mjs','workshop/combat.mjs','workshop/combat-check.mjs','workshop/playable-area.mjs','workshop/troop-rules.mjs','workshop/quick-check.mjs','workshop/ENGINE.md','workshop/troop-rule-provenance.json','templates/six-realms/frontier.mjs']:
        file=ROOT/relative
        if file.is_file(): blobs[relative]=file.read_bytes()
    if (folder/'demo-pairs.json').is_file(): blobs['preview/phone-map/demo-pairs.json']=(folder/'demo-pairs.json').read_bytes()
    if (folder/'quick-acceptance.json').is_file(): blobs['quick-acceptance.json']=(folder/'quick-acceptance.json').read_bytes()
    package={'schemaVersion':1,'mapId':m['id'],'name':m['name'],'createdAt':m['createdAt'],'dimensions':[atlas['width'],atlas['height']],'territoryCount':len(atlas['territories']),'adapter':'PhoneMapSurface/PhoneMapCore data; TroopPipeline 1.2 behavior module included','scope':'map-layer-only','requiresBuild':True,'layoutNotes':['Use centered proportional cover; inspect actual audience crop before release.','Old city-wall/gate coordinates are map-specific: hide or remap them.','Keep gift UI and capture guides; hero/combat integration is separate.'],'files':{k:hashlib.sha256(v).hexdigest() for k,v in blobs.items()}}
    package['playableArea']=atlas['playableArea']
    package['activeTerritoryCount']=atlas['playableArea']['activeTerritories']
    package['uiNotes']='UI skins retain locked slots. If presentation.json exists it is a preview binding; use structural railRect anchors and render all nine patches including inward ornaments; never blank the center.'
    blobs['manifest.json']=json.dumps(package,ensure_ascii=False,indent=2).encode('utf-8')
    blobs['接入说明.md']=(ROOT/'INTEGRATION.md').read_bytes()
    destination=path_in_root(m['package']);destination.parent.mkdir(exist_ok=True)
    temporary=destination.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as z:
        for name,blob in blobs.items(): z.writestr(name,blob)
    temporary.replace(destination)
    return {'mapId':m['id'],'file':str(destination),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['list','verify','export'])
    parser.add_argument('id',nargs='?',type=int,help='Stable map number; omit for all')
    args=parser.parse_args();data=catalog();maps=[m for m in data['maps'] if args.id is None or m['id']==args.id]
    if not maps: parser.error('Unknown map ID')
    for m in maps:
        if args.command=='list': result={'mapId':m['id'],'name':m['name'],'directory':m['directory']}
        elif args.command=='verify': verify(m);result={'mapId':m['id'],'verified':True}
        else: result=export(m)
        print(json.dumps(result,ensure_ascii=True))
