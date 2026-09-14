"""Temporary presentation store; production canonical/executor sources are never mutated."""
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from flask import Flask
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import creator_presentation as cp
import renguin_boundary
from creator_activity import enrich

class PresentationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.app=Flask(__name__,static_folder='frontend')
        self.app.config['USER_PRESENTATION_ROOT']=self.temp.name
        self.app.register_blueprint(cp.bp)
        self.client=self.app.test_client()
        self.project={'project_id':'CANONICAL-1','project_name':'Original','classification':'REGISTERED'}
        self.projection={'projection':{'projects':[self.project]}}
        self.mock=patch.object(renguin_boundary,'projects',return_value=self.projection)
        self.mock.start()
    def tearDown(self):
        self.mock.stop()
        self.temp.cleanup()
    def post(self,path,body):
        return self.client.post('/api/creator/'+path,json=body)
    def image(self,color='red',fmt='PNG'):
        data=io.BytesIO();Image.new('RGB',(160,90),color).save(data,fmt);data.seek(0);return data
    def upload(self,data=None,name='test.png',mime='image/png'):
        response=self.client.post('/api/creator/cover',data={'project_id':'CANONICAL-1','cover':(data or self.image(),name,mime)})
        response.request.environ['wsgi.input'].close()
        return response
    def test_cover_upload_replace_remove_restart_rename(self):
        result=self.upload();self.assertEqual(result.status_code,200)
        url=result.json['projects']['CANONICAL-1']['cover']['url']
        with self.client.get(url) as image_response:
            self.assertEqual(image_response.status_code,200)
        self.project['project_name']='Renamed'
        new_app=Flask('restart');new_app.config['USER_PRESENTATION_ROOT']=self.temp.name;new_app.register_blueprint(cp.bp)
        with new_app.test_client() as client:
            self.assertEqual(client.get('/api/creator/presentation').json['projects']['CANONICAL-1']['cover']['url'],url)
        replaced=self.upload(self.image('blue')).json['projects']['CANONICAL-1']['cover']['url']
        self.assertNotEqual(replaced,url)
        self.assertEqual(self.post('cover/remove',{'project_id':'CANONICAL-1'}).json['projects']['CANONICAL-1']['cover'],None)
        with self.client.get(url) as image_response:
            self.assertEqual(image_response.status_code,200) # recoverable old asset
    def test_upload_rejects_mismatch_traversal_fake_and_size(self):
        for data,name,mime in [(self.image(),'bad.svg','image/svg+xml'),(self.image(),'bad.jpg','image/jpeg'),(io.BytesIO(b'not an image'),'bad.png','image/png'),(self.image(),'test.png','text/plain'),(io.BytesIO(b'x'*(cp.LIMIT+1)),'big.png','image/png')]:
            self.assertIn(self.upload(data,name,mime).status_code,[413,415])
        # Original names never select a filesystem path.
        result=self.upload(name='../../outside.png')
        self.assertEqual(result.status_code,200)
        self.assertRegex(result.json['projects']['CANONICAL-1']['cover']['url'],r'/[0-9a-f]{32}\.webp$')
        self.assertEqual(self.client.get('/api/creator/covers/invalid.webp').status_code,404)
    def test_all_supported_formats(self):
        for fmt,ext,mime in [('JPEG','jpg','image/jpeg'),('JPEG','jpeg','image/jpeg'),('PNG','png','image/png'),('WEBP','webp','image/webp')]:
            self.assertEqual(self.upload(self.image(fmt=fmt),'test.'+ext,mime).status_code,200)
    def test_manual_done_undo_history_authority_separation(self):
        baseline=json.dumps(self.projection)
        result=self.post('done',{'project_id':'CANONICAL-1','done':True})
        state=result.json['projects']['CANONICAL-1']['manual_done']
        self.assertEqual(state['type'],'USER_MANUAL_DONE');self.assertTrue(state['timestamp'])
        result=self.post('done',{'project_id':'CANONICAL-1','done':False})
        p=result.json['projects']['CANONICAL-1'];self.assertFalse(p['manual_done']['done']);self.assertEqual(len(p['history']),2)
        self.assertEqual(json.dumps(self.projection),baseline)
        self.assertEqual(self.post('done',{'project_id':'Original','done':True}).status_code,400)
        self.assertEqual(self.post('done',{'project_id':'CANONICAL-1','done':'yes'}).status_code,400)
    def test_user_and_ai_inbox_edit_complete_defer_order_persist(self):
        created=self.post('inbox',{'title':'Today','project_id':'CANONICAL-1','notes':'Note','date':'2026-09-09','priority':'high'}).json
        key=next(iter(created['inbox']))
        self.assertEqual(created['inbox'][key]['provenance'],'你建立')
        ai='ai:CANONICAL-1:GATE:proof'
        self.post('inbox',{'id':ai,'title':'今晚先修前 8 分鐘','project_id':'CANONICAL-1'})
        self.post('inbox',{'id':key,'state':'later'})
        result=self.post('inbox',{'id':ai,'state':'done'}).json
        self.assertIn('completed_at',result['inbox'][ai]);self.assertEqual(result['inbox'][ai]['provenance'],'AI 建議')
        self.post('order',{'order':[ai,key]})
        reload=self.client.get('/api/creator/presentation').json
        self.assertEqual(reload['order'],[ai,key]);self.assertEqual(reload['inbox'][ai]['title'],'今晚先修前 8 分鐘')
        self.assertEqual(reload['inbox'][key]['state'],'later')
    def test_todo_categories_are_chosen_kept_and_validated(self):
        for category in cp.TODO_CATEGORIES:
            created=self.post('inbox',{'title':'寫下 '+category,'category':category})
            self.assertEqual(created.status_code,200)
        items={i['title']:i for i in self.client.get('/api/creator/presentation').json['inbox'].values()}
        self.assertEqual({t:i['category'] for t,i in items.items()},{'寫下 '+c:c for c in cp.TODO_CATEGORIES})
        # Ticking, unticking, renaming and reordering never move a todo to another column.
        key=items['寫下 REPO']['id']
        self.post('inbox',{'id':key,'state':'done'})
        self.post('inbox',{'id':key,'state':'today','title':'改名成辦公室的事'})
        self.assertEqual(self.client.get('/api/creator/presentation').json['inbox'][key]['category'],'REPO')
        moved=self.post('inbox',{'id':key,'category':'OTHER'}).json['inbox'][key]
        self.assertEqual(moved['category'],'OTHER')
        for bad in ['repo','PLANNING','',None,3]:
            self.assertEqual(self.post('inbox',{'title':'x','category':bad}).status_code,400,bad)
        self.assertEqual(len(self.client.get('/api/creator/presentation').json['inbox']),4)
    def test_legacy_todos_are_filed_once_without_loss(self):
        legacy={
            'user:a':{'id':'user:a','title':'新的短影音','state':'today','created_at':'2026-09-12T18:43:54+00:00'},
            'user:b':{'id':'user:b','title':'acceptance test - removable','state':'ignored'},
            'user:c':{'id':'user:c','title':'修 Star Office 的待辦雲','state':'today'},
            'user:d':{'id':'user:d','title':'push the branch to GitHub','state':'done','completed_at':'2026-09-10T00:00:00+00:00'},
            'user:e':{'id':'user:e','title':'買文具','state':'today','notes':'週末'},
            'user:f':{'id':'user:f','title':'看一下','project_id':'CANONICAL-1','state':'later'},
            'ai:CANONICAL-1:GATE:x':{'id':'ai:CANONICAL-1:GATE:x','title':'確認','state':'done'},
        }
        with self.app.app_context():
            with cp.connect() as db:
                data=json.loads(db.execute('SELECT value FROM metadata WHERE id=1').fetchone()[0])
                data['inbox']=json.loads(json.dumps(legacy));data['order']=list(legacy)
                db.execute('UPDATE metadata SET value=? WHERE id=1',(json.dumps(data,ensure_ascii=False),))
        first=self.client.get('/api/creator/presentation').json
        expected={'user:a':'PROJECT','user:b':'OTHER','user:c':'OFFICE','user:d':'REPO','user:e':'OTHER','user:f':'PROJECT','ai:CANONICAL-1:GATE:x':'PROJECT'}
        self.assertEqual({k:v['category'] for k,v in first['inbox'].items()},expected)
        # Everything else about every todo is exactly as it was, and the order holds.
        for key,item in legacy.items():
            self.assertEqual({k:v for k,v in first['inbox'][key].items() if k!='category'},item)
        self.assertEqual(first['order'],list(legacy))
        # Filing happens once: a second read writes nothing.
        second=self.client.get('/api/creator/presentation').json
        self.assertEqual(second['revision'],first['revision'])
        self.assertEqual(second['inbox'],first['inbox'])
    def test_the_filing_rule_matches_the_page(self):
        cases=json.loads((Path(__file__).parent/'fixtures'/'todo-categories.json').read_text(encoding='utf-8'))
        self.assertGreaterEqual(len(cases),12)
        for case in cases:
            self.assertEqual(cp.todo_category(case['item'],case.get('key','')),case['category'],case)
    def test_validation_cross_origin_unknown_fields(self):
        self.assertEqual(self.client.post('/api/creator/done',json={'project_id':'CANONICAL-1','done':True},headers={'Origin':'https://outside.example'}).status_code,403)
        for body in [{'title':''},{'title':'x','date':'bad'},{'title':'x','priority':'urgent'},{'title':'x','state':'EXECUTOR_COMPLETED'},{'title':'x','project_id':'display-name'}]:
            self.assertEqual(self.post('inbox',body).status_code,400)
        value=self.post('inbox',{'title':'test','provenance':'canonical','executor_status':'COMPLETED'}).json
        item=next(iter(value['inbox'].values()));self.assertEqual(item['provenance'],'你建立');self.assertNotIn('executor_status',item)
        self.assertEqual(self.post('order',{'order':['x','x']}).status_code,400)
    def test_concurrent_updates_are_not_lost(self):
        self.client.get('/api/creator/presentation')
        def create(i):
            with self.app.test_client() as c:
                return c.post('/api/creator/inbox',json={'title':str(i)}).status_code
        with ThreadPoolExecutor(max_workers=6) as pool:
            self.assertEqual(list(pool.map(create,range(16))),[200]*16)
        self.assertEqual(len(self.client.get('/api/creator/presentation').json['inbox']),16)
    def test_activity_keeps_real_event_time_and_no_heartbeat(self):
        home=Path(self.temp.name);sessions=home/'.codex/sessions';sessions.mkdir(parents=True)
        path=sessions/'session.jsonl';stamp='2026-09-01T00:00:00Z'
        path.write_text(json.dumps({'type':'response_item','timestamp':stamp,'payload':{'type':'function_call','arguments':'private content not returned'}})+'\n')
        observation={'agent':'ASTRA','source':'CODEX_NATIVE_JOURNAL','provenance':{'path':str(path)},'last_heartbeat':None,'status':'UNKNOWN'}
        board={'native_coverage':{'observations':[observation]},'jobs':[]}
        result=enrich(board,home);self.assertEqual(observation['last_work_event']['timestamp'],stamp)
        self.assertEqual(observation['status'],'UNKNOWN');self.assertIsNone(observation['last_heartbeat']);self.assertNotIn('private content',json.dumps(result))

class PinAndEnvironmentTests(unittest.TestCase):
    """Pins and the environment are presentation only; the projection is never written."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.app=Flask(__name__,static_folder='frontend')
        self.app.config['USER_PRESENTATION_ROOT']=self.temp.name
        self.app.register_blueprint(cp.bp)
        self.client=self.app.test_client()
        self.projects=[{'project_id':f'P{i}','project_name':f'Project {i}','classification':'REGISTERED','project_type':'VIDEO_PROJECT'} for i in range(1,cp.PIN_LIMIT+3)]
        self.projection={'projection':{'projects':self.projects}}
        self.mock=patch.object(renguin_boundary,'projects',side_effect=lambda *_:self.projection)
        self.mock.start()
        self.baseline=json.dumps(self.projection)
    def tearDown(self):
        self.assertEqual(json.dumps(self.projection),self.baseline)
        self.mock.stop()
        self.temp.cleanup()
    def post(self,path,body):
        return self.client.post('/api/creator/'+path,json=body)
    def pins(self,data=None):
        data=data or self.client.get('/api/creator/presentation').json
        return [pid for pid,_ in sorted(((pid,m['pinned_at']) for pid,m in data['projects'].items() if m.get('pinned_at')),key=lambda x:(x[1],x[0]))]
    def pin(self,pid,value=True):
        return self.post('pin',{'project_id':pid,'pinned':value})
    def test_limit_of_ten_refuses_the_eleventh_without_side_effects(self):
        self.assertEqual(cp.PIN_LIMIT,10)
        self.assertEqual(self.pins(),[])
        full=[f'P{i}' for i in range(1,cp.PIN_LIMIT+1)]
        for count,pid in enumerate(full,1):
            self.assertEqual(self.pin(pid).status_code,200)
            self.assertEqual(self.pins(),sorted(full[:count],key=full.index))
        before=self.client.get('/api/creator/presentation').json
        refused=self.pin(f'P{cp.PIN_LIMIT+1}')
        self.assertEqual(refused.status_code,409)
        self.assertEqual(refused.json['error'],'最多可置頂 10 個專案')
        self.assertEqual(refused.json['code'],'PIN_LIMIT')
        self.assertEqual(refused.json['limit'],10)
        after=self.client.get('/api/creator/presentation').json
        self.assertEqual(after['revision'],before['revision'])
        self.assertEqual(self.pins(after),full)
        # Pinning again is idempotent: no duplicate, no new slot, no revision churn.
        self.assertEqual(self.pin('P1').json['revision'],before['revision'])
    def test_unpin_repin_order_is_deterministic(self):
        full=[f'P{i}' for i in range(1,cp.PIN_LIMIT+1)]
        for pid in full:
            self.pin(pid)
        spare=f'P{cp.PIN_LIMIT+1}'
        self.assertEqual(self.pin('P2',False).status_code,200)
        self.assertEqual(self.pins(),[p for p in full if p!='P2'])
        self.assertEqual(self.pin(spare).status_code,200)
        self.assertEqual(self.pin('P2').status_code,409)
        self.assertEqual(self.pins(),[p for p in full if p!='P2']+[spare])
        self.pin('P1',False);self.pin('P1')
        self.assertEqual(self.pins(),[p for p in full if p not in ('P1','P2')]+[spare,'P1'])
        self.assertEqual(self.pin(f'P{cp.PIN_LIMIT+2}',False).status_code,200) # unpinning an unpinned project is harmless
    def test_pins_survive_reload_restart_rename_and_workflow_updates(self):
        for pid in ['P1','P2']:
            self.pin(pid)
        restart=Flask('restart');restart.config['USER_PRESENTATION_ROOT']=self.temp.name;restart.register_blueprint(cp.bp)
        with restart.test_client() as client:
            self.assertEqual(self.pins(client.get('/api/creator/presentation').json),['P1','P2'])
        self.post('project',{'project_id':'P1','display_name':'改名後'})
        revision=self.client.get('/api/creator/presentation').json['revision']
        step=self.post('workflow',{'project_id':'P1','step_id':'CALIBRATION','completed':True,'revision':revision})
        self.assertEqual(step.status_code,200)
        self.assertEqual(self.pins(),['P1','P2'])
        self.assertEqual(self.client.get('/api/creator/presentation').json['projects']['P1']['display_name'],'改名後')
    def test_delete_finish_and_disappearance_release_the_slot(self):
        for pid in ['P1','P2','P3']:
            self.pin(pid)
        self.post('project',{'project_id':'P1','hidden':True,'confirmed':True})
        self.assertNotIn('pinned_at',self.client.get('/api/creator/presentation').json['projects']['P1'])
        self.post('project',{'project_id':'P1','hidden':False})
        self.assertEqual(self.pins(),['P2','P3'])
        self.assertEqual(self.pin('P1',True).status_code,200)
        self.post('done',{'project_id':'P2','done':True})
        self.assertEqual(self.pins(),['P3','P1'])
        self.assertEqual(self.pin('P2').status_code,409) # a finished project is not in 正在製作
        self.post('done',{'project_id':'P2','done':False})
        self.assertEqual(self.pins(),['P3','P1'])
        revision=self.client.get('/api/creator/presentation').json['revision']
        self.post('workflow',{'project_id':'P3','step_id':'SHORT_PUBLISH','completed':True,'revision':revision})
        self.assertEqual(self.pins(),['P1'])
        # A failed read cannot prove anything is gone; a successful one can.
        self.pin('P4')
        stored=self.projects[:]
        self.projection={'projection':None}
        self.assertEqual(self.pins(),['P1','P4'])
        self.projection={'projection':{'projects':[p for p in stored if p['project_id']!='P4']}}
        self.assertEqual(self.pins(),['P1'])
        self.projection={'projection':{'projects':stored}}
    def test_a_short_video_neither_holds_nor_takes_a_pin(self):
        for pid in ['P1','P2']:
            self.pin(pid)
        revision=self.client.get('/api/creator/presentation').json['revision']
        self.assertEqual(self.post('project-format',{'project_id':'P1','format':'SHORT','revision':revision}).status_code,200)
        self.assertEqual(self.pins(),['P2'])
        self.assertEqual(self.pin('P1').status_code,409) # short videos live outside 正在製作
        for pid in ['P3','P4']:
            self.assertEqual(self.pin(pid).status_code,200)
        revision=self.client.get('/api/creator/presentation').json['revision']
        self.post('project-format',{'project_id':'P1','format':'LONG','revision':revision})
        self.assertEqual(self.pins(),['P2','P3','P4'])
    def test_pin_validation(self):
        self.assertEqual(self.post('pin',{'project_id':'P1','pinned':'yes'}).status_code,400)
        self.assertEqual(self.post('pin',{'project_id':'Project 1','pinned':True}).status_code,400)
        self.post('project',{'project_id':'P5','hidden':True,'confirmed':True})
        self.assertEqual(self.pin('P5').status_code,409)
        self.assertEqual(self.client.post('/api/creator/pin',json={'project_id':'P1','pinned':True},headers={'Origin':'https://outside.example'}).status_code,403)
    def test_environment_persists_and_rejects_invalid_combinations(self):
        chosen={'time':'NIGHT','weather':'SNOW','rainbow':False,'atmosphere':['AURORA','STARS']}
        saved=self.post('environment',chosen)
        self.assertEqual(saved.status_code,200)
        revision=saved.json['revision']
        self.assertEqual({k:v for k,v in saved.json['environment'].items() if k!='updated_at'},chosen)
        self.assertEqual(self.post('environment',chosen).json['revision'],revision)
        restart=Flask('restart');restart.config['USER_PRESENTATION_ROOT']=self.temp.name;restart.register_blueprint(cp.bp)
        with restart.test_client() as client:
            self.assertEqual(client.get('/api/creator/presentation').json['environment']['atmosphere'],['AURORA','STARS'])
        for bad in [{**chosen,'time':'NOON'},{**chosen,'weather':'HAIL'},{**chosen,'rainbow':True},
                    {**chosen,'atmosphere':['AURORA','STARS','METEOR']},{**chosen,'atmosphere':['AURORA','AURORA']},
                    {**chosen,'atmosphere':'AURORA'},{**chosen,'atmosphere':['NEON']},{**chosen,'rainbow':'yes'}]:
            self.assertEqual(self.post('environment',bad).status_code,400,bad)
        for weather in ['CLEAR','CLOUDY','RAIN']:
            self.assertEqual(self.post('environment',{'time':'DAY','weather':weather,'rainbow':True,'atmosphere':[]}).status_code,200)
        self.assertEqual(self.post('environment',{'time':'DAY','weather':'THUNDERSTORM','rainbow':True,'atmosphere':[]}).status_code,400)

if __name__=='__main__':
    unittest.main(verbosity=2)
