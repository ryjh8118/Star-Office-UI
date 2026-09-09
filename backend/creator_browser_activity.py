"""Opt-in local browser status. Never an executor lease or canonical progress."""
import hashlib
import hmac
import io
import json
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlsplit
import zipfile
from flask import Blueprint, abort, jsonify, request, send_file
from creator_presentation import connect

bp = Blueprint('creator_browser_activity', __name__)
EXTENSION = Path(__file__).resolve().parents[1] / 'browser-bridge'
EXTENSION_ORIGIN = re.compile(r'^chrome-extension://[a-p]{32}$')

def tables(db):
    db.execute('CREATE TABLE IF NOT EXISTS browser_bridge (id INTEGER PRIMARY KEY CHECK(id=1), token_hash TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS browser_activity (client_id TEXT PRIMARY KEY, value TEXT NOT NULL, received REAL NOT NULL)')

@bp.before_request
def local_boundary():
    if request.host.split(':')[0] not in {'127.0.0.1', 'localhost'}:
        abort(403)
    origin = request.headers.get('Origin', '')
    if request.path.endswith('/observe'):
        if origin and not EXTENSION_ORIGIN.fullmatch(origin):
            abort(403)
    elif request.method != 'GET':
        if origin and origin != request.host_url.rstrip('/'):
            abort(403)
        if request.headers.get('Sec-Fetch-Site') == 'cross-site':
            abort(403)
    if request.content_length and request.content_length > 4096:
        abort(413)

@bp.after_request
def headers(response):
    origin = request.headers.get('Origin', '')
    if request.path.endswith('/observe') and EXTENSION_ORIGIN.fullmatch(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Vary'] = 'Origin'
    response.headers['Cache-Control'] = 'no-store'
    return response

@bp.post('/api/creator/browser-bridge/pair')
def pair():
    token = secrets.token_urlsafe(32)
    with connect() as db:
        tables(db)
        db.execute('INSERT OR REPLACE INTO browser_bridge VALUES(1,?)', (hashlib.sha256(token.encode()).hexdigest(),))
        db.execute('DELETE FROM browser_activity')
    return jsonify({'token':token, 'office_url':request.host_url.rstrip('/')})

@bp.post('/api/creator/browser-bridge/disconnect')
def disconnect():
    with connect() as db:
        tables(db)
        db.execute('DELETE FROM browser_bridge')
        db.execute('DELETE FROM browser_activity')
    return jsonify({'disconnected':True})

@bp.route('/api/creator/browser-bridge/observe', methods=['POST', 'OPTIONS'])
def observe():
    if request.method == 'OPTIONS':
        return '',204
    token = request.headers.get('Authorization', '').removeprefix('Bearer ')
    value = request.get_json(silent=True)
    if not isinstance(value,dict) or set(value) != {'client_id','state','title','observed_at'}:
        abort(400)
    if not isinstance(value['client_id'],str) or not re.fullmatch(r'[a-z0-9-]{1,80}',value['client_id']):
        abort(400)
    if value['state'] not in {'WORKING','IDLE','UNKNOWN'} or not isinstance(value['title'],str) or len(value['title']) > 120:
        abort(400)
    stamp = value['observed_at']
    if type(stamp) not in {float,int} or not -5 <= time.time()-stamp < 45:
        abort(400)
    with connect() as db:
        tables(db)
        row = db.execute('SELECT token_hash FROM browser_bridge WHERE id=1').fetchone()
        if not row or not hmac.compare_digest(row[0],hashlib.sha256(token.encode()).hexdigest()):
            abort(403)
        db.execute('DELETE FROM browser_activity WHERE received < ?', (time.time()-86400,))
        db.execute('INSERT OR REPLACE INTO browser_activity VALUES(?,?,?)', (value['client_id'],json.dumps(value),time.time()))
    return jsonify({'accepted':True,'executor_claim':False})

@bp.get('/api/creator/browser-bridge/status')
def status():
    with connect() as db:
        tables(db)
        paired = bool(db.execute('SELECT 1 FROM browser_bridge WHERE id=1').fetchone())
        rows = db.execute('SELECT value,received FROM browser_activity ORDER BY received DESC LIMIT 100').fetchall()
    observations=[]
    for raw, received in rows:
        value=json.loads(raw)
        age=time.time()-value['observed_at']
        if not 0 <= age < 45:
            continue
        action={'WORKING':'正在回覆','IDLE':'回覆已停止','UNKNOWN':'尚無可辨識的回覆狀態'}[value['state']]
        observations.append({'agent':'CHATGPT_WORK','native_id':value['client_id'], 'source':'CHATGPT_BROWSER_UI',
            'browser_context':{'id':value['client_id'],'name':value['title'] or 'ChatGPT 企劃'},
            'last_work_event':{'timestamp':value['observed_at'],'action':action,'terminal':value['state']!='WORKING'},
            'visual_activity':{'state':value['state'],'timestamp':value['observed_at'],'expires_after_seconds':45,
                               'action':action,'source':'CHATGPT_BROWSER_UI','executor_claim':False}})
    return jsonify({'paired':paired,'connected':bool(observations),'observations':observations})

@bp.get('/api/creator/browser-bridge/download')
def download():
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
        for filename in ['manifest.json','background.js','chatgpt.js','office.js','README.txt']:
            archive.write(EXTENSION/filename,arcname='renguin-chatgpt-bridge/'+filename)
    buffer.seek(0)
    return send_file(buffer,mimetype='application/zip',as_attachment=True,download_name='renguin-chatgpt-bridge.zip')
