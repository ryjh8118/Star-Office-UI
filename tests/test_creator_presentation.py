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

if __name__=='__main__':
    unittest.main(verbosity=2)
