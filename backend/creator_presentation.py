"""Office-owned presentation data. Never writes canonical or executor state."""
import io
import json
import os
from pathlib import Path
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import urlsplit
from flask import Blueprint, current_app, jsonify, request, send_file, abort
from PIL import Image, UnidentifiedImageError

bp = Blueprint('creator', __name__)
LIMIT = 5 * 1024 * 1024

def now():
    return datetime.now(timezone.utc).isoformat()

def root():
    path = Path(current_app.config['USER_PRESENTATION_ROOT'])
    path.mkdir(parents=True, exist_ok=True)
    return path

@contextmanager
def connect():
    db = sqlite3.connect(root() / 'presentation.sqlite', timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
    db.execute('INSERT OR IGNORE INTO metadata VALUES(1, ?)', (json.dumps({'kind':'USER_PRESENTATION_METADATA','revision':0,'projects':{},'inbox':{},'order':[]}),))
    db.commit()
    try:
        with db:
            yield db
    finally:
        db.close()

def read():
    with connect() as db:
        return json.loads(db.execute('SELECT value FROM metadata WHERE id=1').fetchone()[0])

def change(fn):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        data = json.loads(db.execute('SELECT value FROM metadata WHERE id=1').fetchone()[0])
        before = json.dumps(data, sort_keys=True)
        fn(data)
        if json.dumps(data, sort_keys=True) != before:
            data['revision'] += 1
            db.execute('UPDATE metadata SET value=? WHERE id=1', (json.dumps(data, ensure_ascii=False),))
    return jsonify(data)

@bp.before_request
def same_origin():
    if request.method != 'GET':
        origin = request.headers.get('Origin')
        if origin and urlsplit(origin).netloc != request.host:
            abort(403)
        if request.headers.get('Sec-Fetch-Site') == 'cross-site':
            abort(403)
        if request.content_length and request.content_length > LIMIT + 65536:
            abort(413)

def body():
    value = request.get_json()
    if not isinstance(value, dict):
        abort(400)
    return value

def project_id(value, registered_only=True):
    if not isinstance(value, str) or not 1 <= len(value) <= 240:
        abort(400)
    if value in read().get('local_projects',{}):
        return value
    # Exact registered canonical identity; names and discovered SOURCE IDs are not accepted.
    from renguin_boundary import projects
    payload = projects(current_app.static_folder).get('projection')
    if payload is None:
        abort(503)
    if not any(p['project_id'] == value and (not registered_only or p.get('classification') == 'REGISTERED') for p in payload['projects']):
        abort(400)
    return value

@bp.get('/api/creator/presentation')
def presentation():
    from renguin_boundary import projects
    from creator_workflow import normalize
    payload = projects(current_app.static_folder).get('projection')
    if payload is None:
        return jsonify(read())
    try:
        from creator_history import snapshot
        _, entries, _ = snapshot()
    except (OSError, ValueError, ImportError, RuntimeError):
        entries = []
    by_project = {}
    for entry in entries:
        by_project.setdefault(entry['project_id'], []).append(entry)
    def update(data):
        from creator_projects import resolve
        cards = resolve(payload['projects'], data)
        for p in cards:
            if p.get('classification') == 'REGISTERED':
                normalize(p, data['projects'].setdefault(p['project_id'], {}), by_project.get(p.get('source_project_id'), []))
        from creator_residents import assign
        assign(cards, data['projects'])
    return change(update)

@bp.post('/api/creator/workflow')
def workflow():
    from creator_workflow import IDS, LABELS, completed_count, set_chain, enabled_ids
    value = body()
    pid = project_id(value.get('project_id'))
    step = value.get('step_id')
    if step not in IDS or type(value.get('completed')) is not bool:
        abort(400)
    def update(data):
        meta = data['projects'].setdefault(pid, {})
        if value.get('revision') != data['revision']:
            abort(409)
        if meta.get('hidden'):
            abort(409)
        previous = completed_count(meta)
        enabled = enabled_ids(meta)
        if step not in enabled:
            abort(400)
        index = enabled.index(step)
        count = max(previous, index+1) if value['completed'] else min(previous, index)
        if count == previous:
            return
        if not value['completed'] and previous > index+1 and value.get('cascade_confirmed') is not True:
            abort(409)
        stamp = now()
        set_chain(meta, count, stamp, 'USER', 'USER')
        meta['workflow_user_at'] = stamp
        if (meta.get('manual_done') or {}).get('done'):
            meta['manual_done'] = {'type':'USER_MANUAL_DONE','done':False,'timestamp':stamp}
        text = f'你將「{LABELS[step]}」標記完成' if value['completed'] else f'你取消「{LABELS[step]}」'
        if value['completed'] and count-previous > 1:
            text += f'，並自動補齊{LABELS[enabled[previous]]} → {LABELS[enabled[count-2]]}'
        if not value['completed'] and previous > index+1:
            text += f'及後續階段（至{LABELS[enabled[previous-1]]}）'
        meta.setdefault('history', []).append({'type':'WORKFLOW_USER','timestamp':stamp,'source':'USER','text':text,'step_id':step})
    return change(update)

@bp.post('/api/creator/project')
def edit_project():
    value = body()
    pid = project_id(value.get('project_id'), registered_only=False)
    if 'display_name' in value and (not isinstance(value['display_name'],str) or not 1 <= len(value['display_name'].strip()) <= 120):
        abort(400)
    if 'hidden' in value and type(value['hidden']) is not bool:
        abort(400)
    if value.get('hidden') is True and value.get('confirmed') is not True:
        abort(400)
    def update(data):
        meta = data['projects'].setdefault(pid, {})
        stamp = now()
        if 'display_name' in value:
            name = value['display_name'].strip()
            if meta.get('display_name') != name:
                meta['display_name'] = name
                meta.setdefault('history', []).append({'type':'RENAME','timestamp':stamp,'source':'USER','text':f'你將專案改名為「{name}」'})
        if 'hidden' in value and meta.get('hidden',False) != value['hidden']:
            meta.update(hidden=value['hidden'], deleted_at=stamp if value['hidden'] else None)
            meta.setdefault('history', []).append({'type':'VISIBILITY','timestamp':stamp,'source':'USER','text':'你移除了專案' if value['hidden'] else '你恢復了專案'})
    return change(update)

@bp.post('/api/creator/done')
def done():
    value = body()
    pid = project_id(value.get('project_id'))
    if type(value.get('done')) is not bool:
        abort(400)
    def update(data):
        p = data['projects'].setdefault(pid, {})
        state = {'type':'USER_MANUAL_DONE','done':value['done'],'timestamp':now()}
        p['manual_done'] = state
        p.setdefault('history', []).append(state)
    return change(update)

@bp.post('/api/creator/cover')
def cover():
    pid = project_id(request.form.get('project_id'))
    upload = request.files.get('cover')
    if not upload:
        abort(400)
    suffix = Path(upload.filename or '').suffix.lower()
    formats = {'.jpg':('JPEG','image/jpeg'),'.jpeg':('JPEG','image/jpeg'),'.png':('PNG','image/png'),'.webp':('WEBP','image/webp')}
    if suffix not in formats or upload.mimetype != formats[suffix][1]:
        abort(415)
    raw = upload.read(LIMIT + 1)
    if len(raw) > LIMIT:
        abort(413)
    try:
        with Image.open(io.BytesIO(raw)) as im:
            if im.format != formats[suffix][0] or im.width * im.height > 24000000:
                abort(415)
            im.verify()
        with Image.open(io.BytesIO(raw)) as im:
            im.load()
            output = io.BytesIO()
            im.convert('RGB').save(output, format='WEBP', quality=90)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        abort(415)
    name = uuid4().hex + '.webp'
    covers = root() / 'covers'
    covers.mkdir(exist_ok=True)
    (covers / name).write_bytes(output.getvalue())
    def update(data):
        p = data['projects'].setdefault(pid, {})
        p['cover'] = {'url':'/api/creator/covers/'+name,'timestamp':now()}
    return change(update)

@bp.post('/api/creator/cover/remove')
def remove_cover():
    pid = project_id(body().get('project_id'))
    # Remove the presentation reference; retain old assets for recovery.
    return change(lambda data: data['projects'].setdefault(pid, {}).update(cover=None))

@bp.get('/api/creator/covers/<name>')
def image(name):
    if not re.fullmatch(r'[0-9a-f]{32}\.webp', name):
        abort(404)
    file = root() / 'covers' / name
    if not file.is_file():
        abort(404)
    response = send_file(file, mimetype='image/webp')
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

@bp.post('/api/creator/inbox')
def inbox():
    value = body()
    key = value.get('id') or 'user:' + uuid4().hex
    if not isinstance(key, str) or len(key) > 600 or not key.startswith(('user:', 'ai:')):
        abort(400)
    allowed = {'title','project_id','notes','date','priority','state'}
    patch = {k:v for k,v in value.items() if k in allowed}
    for k, v in patch.items():
        if not isinstance(v, str) or len(v) > (4000 if k == 'notes' else 240):
            abort(400)
    if 'title' in patch and not patch['title'].strip():
        abort(400)
    if patch.get('project_id'):
        project_id(patch['project_id'])
    if patch.get('state','today') not in {'today','later','done','ignored'}:
        abort(400)
    if patch.get('priority','') not in {'','normal','high','low'}:
        abort(400)
    if patch.get('date'):
        try:
            datetime.strptime(patch['date'], '%Y-%m-%d')
        except ValueError:
            abort(400)
    def update(data):
        item = data['inbox'].get(key)
        if item is None:
            if not patch.get('title'):
                abort(400)
            item = {'id':key,'provenance':'AI 建議' if key.startswith('ai:') else '你建立','created_at':now(),'state':'today'}
            data['inbox'][key] = item
            data['order'].append(key)
        item.update(patch, updated_at=now())
        if patch.get('state') == 'done':
            item['completed_at'] = now()
    return change(update)

@bp.post('/api/creator/order')
def order():
    keys = body().get('order')
    if not isinstance(keys, list) or len(keys)>2000 or any(not isinstance(k,str) or len(k)>600 for k in keys) or len(keys)!=len(set(keys)):
        abort(400)
    return change(lambda data: data.update(order=keys))

@bp.post('/api/creator/project-order')
def project_order():
    keys = body().get('order')
    if not isinstance(keys, list) or len(keys) > 2000 or any(not isinstance(k,str) for k in keys) or len(keys) != len(set(keys)):
        abort(400)
    from renguin_boundary import projects
    payload = projects(current_app.static_folder).get('projection')
    if payload is None:
        abort(503)
    registered = {p['project_id'] for p in payload['projects'] if p.get('classification') == 'REGISTERED'}
    registered.update(read().get('local_projects',{}))
    if not set(keys) <= registered:
        abort(400)
    return change(lambda data: data.update(project_order=keys))


def source_id(value):
    if value is None:
        return None
    from renguin_boundary import projects
    payload = projects(current_app.static_folder).get('projection')
    if payload is None:
        abort(503)
    if not any(p['project_id'] == value and p.get('classification') == 'REGISTERED'
               and p.get('project_type') in {'YOUTUBE','VIDEO_PROJECT'} for p in payload['projects']):
        abort(400)
    return value

@bp.post('/api/creator/projects')
def create_project():
    from creator_workflow import normalize
    value = body()
    name = value.get('display_name')
    if not isinstance(name,str) or not 1 <= len(name.strip()) <= 120:
        abort(400)
    sid = source_id(value.get('source_project_id'))
    pid = 'OFFICE-' + uuid4().hex
    def update(data):
        card = {'project_id':pid,'project_name':name.strip(),'classification':'REGISTERED','project_type':'VIDEO_PROJECT'}
        data.setdefault('local_projects',{})[pid] = card
        meta = {'display_name':name.strip(),'source_project_id':sid,'history':[{'type':'PROJECT_CREATED','timestamp':now(),'source':'USER','text':'你建立了專案'}]}
        data['projects'][pid] = meta
        normalize(card,meta)
        from creator_residents import assign
        from creator_projects import resolve
        from renguin_boundary import projects
        assign(resolve((projects(current_app.static_folder).get('projection') or {}).get('projects',[]),data),data['projects'])
        data['project_order'] = [pid,*data.get('project_order',[])]
    return change(update)

@bp.post('/api/creator/project-source')
def project_source():
    from creator_projects import bind
    value = body()
    pid = project_id(value.get('project_id'))
    sid = source_id(value.get('source_project_id'))
    def update(data):
        if value.get('revision') != data['revision']:
            abort(409)
        meta = data['projects'].setdefault(pid,{})
        meta.setdefault('source_project_id',None if pid in data.get('local_projects',{}) else pid)
        bind(meta,pid,sid,now())
    return change(update)

@bp.post('/api/creator/workflow-settings')
def workflow_settings():
    from creator_workflow import IDS, LABELS, enabled_ids, set_chain
    value = body()
    pid = project_id(value.get('project_id'))
    disabled = value.get('disabled_steps')
    if not isinstance(disabled,list) or any(s not in IDS for s in disabled) or len(set(disabled)) != len(disabled) or len(disabled) >= len(IDS):
        abort(400)
    def update(data):
        if value.get('revision') != data['revision']:
            abort(409)
        meta = data['projects'].setdefault(pid,{})
        old = set(meta.get('disabled_steps',[]))
        if old == set(disabled):
            return
        completed = [s for s in IDS if meta.get('workflow',{}).get(s,{}).get('status') == 'COMPLETED']
        meta['disabled_steps'] = disabled
        enabled = enabled_ids(meta)
        last = max((IDS.index(s) for s in completed if s in enabled),default=-1)
        count = sum(IDS.index(s) <= last for s in enabled)
        stamp = now()
        set_chain(meta,count,stamp,'USER','USER')
        meta['workflow_user_at'] = stamp
        removed = [LABELS[s] for s in IDS if s in set(disabled)-old]
        restored = [LABELS[s] for s in IDS if s in old-set(disabled)]
        text = '你調整了製作階段'
        if removed: text += '；移除：' + '、'.join(removed)
        if restored: text += '；加回：' + '、'.join(restored) + '（已完成階段之前的步驟依順序補齊）'
        meta.setdefault('history',[]).append({'type':'WORKFLOW_SETTINGS','timestamp':stamp,'source':'USER','text':text})
    return change(update)
