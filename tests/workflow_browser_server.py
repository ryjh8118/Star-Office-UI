"""Local browser acceptance host: production UI/API code, disposable source copy.

Never edits canonical data. It can simulate empty/error/loading input while
keeping test writes in .qa-workflow-state. Not imported by the real server.
"""
import copy
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import time
import urllib.request
from flask import jsonify, request
from werkzeug.serving import make_server

OFFICE = Path(__file__).resolve().parents[1]
STATE = OFFICE / '.qa-workflow-state'
STATE.mkdir(exist_ok=True)
STORE = STATE / 'user-presentation'
STORE.mkdir(exist_ok=True)
os.environ.update(RENGUIN_OFFICE_STATE_ROOT=str(STATE), RENGUIN_PRESENTATION_ROOT=str(STORE),
                  FLASK_SECRET_KEY='isolated-browser-acceptance-only', AUTO_ROTATE_HOME_ON_PAGE_OPEN='0')
sys.dont_write_bytecode = True
sys.path.insert(0, str(OFFICE / 'backend'))
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
fixture = STATE / 'source-fixture.json'
if not fixture.exists():
    with opener.open('http://127.0.0.1:19119/api/renguin/projects') as response:
        payload = json.load(response)
    template = copy.deepcopy(next(p for p in payload['projection']['projects'] if p['classification']=='REGISTERED' and p['project_type']=='YOUTUBE'))
    template.update(project_id='WORKFLOW-QA-DEMO', project_name='驗收專案・可移除',timeline=[],workflow=[],
                    current_stage_id=None,current_status='UNKNOWN',source_ledger_entry_id=None,source_event_id=None,updated_at=None)
    payload['projection']['projects'].insert(0,template)
    fixture.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    original = OFFICE / '.preview-runtime/user-presentation'
    with sqlite3.connect(str(original/'presentation.sqlite')) as src, sqlite3.connect(str(STORE/'presentation.sqlite')) as dst:
        src.backup(dst)
    if (original/'covers').is_dir(): shutil.copytree(original/'covers',STORE/'covers',dirs_exist_ok=True)
    (STATE/'source-material-must-remain.txt').write_text('Simulated video/Premiere source: must remain unchanged.',encoding='utf-8')
payload = json.loads(fixture.read_text(encoding='utf-8'))
import app as office_app
import renguin_boundary
import creator_history
scenario = 'normal'

def projection(_):
    if scenario == 'error': return {'status':'SYNC_ERROR','projection':None}
    if scenario == 'loading': time.sleep(2)
    result = copy.deepcopy(payload)
    if scenario == 'empty': result['projection']['projects'] = []
    return result

renguin_boundary.projects = projection
creator_history.snapshot = lambda:(None, [], {})
office_app.app.view_functions['creator_history.history'] = lambda:jsonify({'events':[]})
office_app.app.view_functions['creator_history.event_statuses'] = lambda:jsonify({'events':{}})
office_app.app.view_functions['renguin_operations'] = lambda:jsonify({'jobs':[],'native_coverage':{'observations':[]},'coverage_complete':False})

@office_app.app.post('/qa/scenario')
def set_scenario():
    global scenario
    value = request.get_json().get('scenario')
    if value not in {'normal','empty','error','loading'}: return '',400
    scenario = value
    return jsonify({'scenario':scenario})

@office_app.app.get('/qa/info')
def info(): return jsonify({'pid':os.getpid(),'state':str(STATE),'office':str(OFFICE),'scenario':scenario,'fixture_only':True})

@office_app.app.after_request
def label(response):
    if request.path == '/' and response.status_code == 200:
        response.set_data(response.get_data(as_text=True).replace('<body>', '<body><aside style="position:fixed;right:12px;top:8px;z-index:9999999;background:#fff2c9;color:#634c2f;padding:6px 10px;border-radius:8px;font:12px system-ui">操作驗收 · 不影響正式專案</aside>',1))
    return response

if __name__ == '__main__':
    print(json.dumps({'port':19149,'pid':os.getpid(),'state':str(STATE)}),flush=True)
    make_server('127.0.0.1',19149,office_app.app,threaded=True).serve_forever()
