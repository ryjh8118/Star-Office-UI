"""Isolated Office Preview: production sources read-only, local UI state separate."""
import argparse,json,os,secrets,sys,tempfile,time
from pathlib import Path
P=argparse.ArgumentParser()
P.add_argument('--port',type=int,default=19109)
P.add_argument('--state-dir',required=True)
P.add_argument('--canonical-root',required=True)
P.add_argument('--producer-root',required=True)
P.add_argument('--native-home')
P.add_argument('--discovery-root',action='append',default=[])
args=P.parse_args()
OFFICE=Path(__file__).resolve().parents[1]
STATE=Path(args.state_dir).resolve()
if not STATE.is_relative_to(OFFICE):raise ValueError('PREVIEW_STATE_MUST_BELONG_TO_ISOLATED_OFFICE')
STATE.mkdir(parents=True,exist_ok=True)
(STATE/'tmp').mkdir(exist_ok=True)
# Multipart uploads may spool after 500 KB; keep those files inside the preview boundary.
tempfile.tempdir=str(STATE/'tmp')
for name,default in [('state.json',{'state':'idle','detail':'隔離 Preview；正式工作依上方戰情顯示','progress':0}),
 ('agents-state.json',[]),('join-keys.json',{'keys':[]}),('asset-positions.json',{}),('asset-defaults.json',{}),('runtime-config.json',{})]:
 p=STATE/name
 if not p.exists():p.write_text(json.dumps(default,ensure_ascii=False),encoding='utf-8')
os.environ.update(RENGUIN_PRODUCER_ROOT=args.producer_root,RENGUIN_CANONICAL_ROOT=args.canonical_root,
 AUTO_ROTATE_HOME_ON_PAGE_OPEN='0',FLASK_SECRET_KEY=secrets.token_urlsafe(32),ASSET_DRAWER_PASS='preview-local-only')
os.environ['RENGUIN_EXECUTOR_LEASE_ROOT']=str(STATE/'executor-leases')
os.environ['RENGUIN_OFFICE_STATE_ROOT']=str(STATE)
os.environ['RENGUIN_PRESENTATION_ROOT']=str(STATE/'user-presentation')
if args.native_home:os.environ['RENGUIN_NATIVE_HOME']=args.native_home
if args.discovery_root:os.environ['RENGUIN_PROJECT_SOURCE_ROOTS']=json.dumps(args.discovery_root)
sys.dont_write_bytecode=True
sys.path.insert(0,str(OFFICE/'backend'))
import preview_identity
# Captured before the audit hook so the payload names the commit this process started from.
REVISION,REVISION_SOURCE=preview_identity.revision(OFFICE)
STARTED_AT=time.time()
def guard(event,values):
 targets=[]
 if event=='open':
  path,mode,flags=values
  if (isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND):targets=[path]
 elif event in {'os.mkdir','os.remove','os.rmdir','os.chmod','os.utime'}:targets=[values[0]]
 elif event=='os.rename':targets=list(values[:2])
 if any(not Path(p).resolve().is_relative_to(STATE) for p in targets):raise PermissionError('PREVIEW_WRITE_BOUNDARY')
 if event in {'subprocess.Popen','socket.connect','os.system'}:raise PermissionError('PREVIEW_EXTERNAL_EXECUTION_DISABLED')
sys.addaudithook(guard)
import app
from flask import jsonify,request
from werkzeug.serving import make_server
for key,file in [('STATE_FILE','state.json'),('AGENTS_STATE_FILE','agents-state.json'),('JOIN_KEYS_FILE','join-keys.json'),
 ('ASSET_POSITIONS_FILE','asset-positions.json'),('ASSET_DEFAULTS_FILE','asset-defaults.json'),('RUNTIME_CONFIG_FILE','runtime-config.json')]:setattr(app,key,str(STATE/file))
app.MEMORY_DIR=str(STATE/'memory');app.IDENTITY_FILE=str(STATE/'IDENTITY.md')
app.HOME_FAVORITES_DIR=str(STATE/'home-favorites');app.HOME_FAVORITES_INDEX_FILE=str(STATE/'home-favorites/index.json');app.BG_HISTORY_DIR=str(STATE/'bg-history')
@app.app.get('/api/renguin/preview-info')
def preview_info():return jsonify({'kind':preview_identity.KIND,'pid':os.getpid(),'office_worktree':str(OFFICE),
 'producer_worktree':args.producer_root,'canonical_root':args.canonical_root,'canonical_read_only':True,
 'state_directory':str(STATE),'acceptance':'NOT_YET_ACCEPTED','production_deployed':False,
 'office_revision':REVISION,'office_revision_source':REVISION_SOURCE,'started_at':STARTED_AT})
@app.app.after_request
def preview_headers(response):
 if request.path=='/' and response.status_code==200 and response.mimetype=='text/html':
  response.set_data(response.get_data(as_text=True).replace('<head>','<head><meta name="renguin-preview" content="isolated">',1))
 response.headers['X-Renguin-Preview']='isolated-read-only-canonical'
 if request.path.startswith('/api/renguin/'):response.headers['Cache-Control']='no-store'
 return response
server=make_server('127.0.0.1',args.port,app.app,threaded=True)
print(json.dumps({'ready':True,'pid':os.getpid(),'url':f'http://127.0.0.1:{args.port}/','canonical_read_only':True}),flush=True)
try:server.serve_forever()
finally:server.server_close()
