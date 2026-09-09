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
        fn(data)
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

def project_id(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 240:
        abort(400)
    # Exact registered canonical identity; names and discovered SOURCE IDs are not accepted.
    from renguin_boundary import projects
    payload = projects(current_app.static_folder).get('projection')
    if payload is None:
        abort(503)
    if not any(p['project_id'] == value and p.get('classification') == 'REGISTERED' for p in payload['projects']):
        abort(400)
    return value

@bp.get('/api/creator/presentation')
def presentation():
    return jsonify(read())

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
