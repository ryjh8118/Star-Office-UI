import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import creator_browser_activity as bridge

class BrowserBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.app=Flask('bridge')
        self.app.config['USER_PRESENTATION_ROOT']=self.temp.name
        self.app.register_blueprint(bridge.bp)
        self.client=self.app.test_client()
        self.token=self.client.post('/api/creator/browser-bridge/pair').json['token']
        self.auth={'Authorization':'Bearer '+self.token,'Origin':'chrome-extension://'+'a'*32}
    def tearDown(self): self.temp.cleanup()
    def payload(self,state='WORKING'):
        return {'client_id':'chatgpt-tab-42','title':'影片企劃','state':state,'observed_at':time.time()}
    def send(self,payload=None,headers=None):
        return self.client.post('/api/creator/browser-bridge/observe',json=payload or self.payload(),headers=headers or self.auth)
    def status(self): return self.client.get('/api/creator/browser-bridge/status').json
    def test_browser_state_and_title_without_executor_claim(self):
        self.assertEqual(self.send().status_code,200)
        value=self.status()['observations'][0]
        self.assertEqual(value['browser_context']['name'],'影片企劃')
        self.assertFalse(value['visual_activity']['executor_claim'])
        self.assertNotIn('last_heartbeat',value)
        self.send(self.payload('IDLE'))
        self.assertEqual(self.status()['observations'][0]['visual_activity']['state'],'IDLE')
    def test_stale_signal_and_disconnect_stop_highlighting(self):
        self.send()
        with patch.object(bridge.time,'time',return_value=time.time()+46):
            self.assertFalse(self.status()['connected'])
        self.client.post('/api/creator/browser-bridge/disconnect')
        self.assertFalse(self.status()['connected'])
        self.assertEqual(self.send().status_code,403)
    def test_auth_origin_and_message_content_boundary(self):
        self.assertEqual(self.send(headers={'Authorization':'Bearer bad'}).status_code,403)
        self.assertEqual(self.send(headers={**self.auth,'Origin':'https://example.com'}).status_code,403)
        self.assertEqual(self.send({**self.payload(),'conversation':'must never be accepted'}).status_code,400)
        self.assertEqual(self.send({**self.payload(),'observed_at':time.time()+10}).status_code,400)
        self.assertEqual(self.client.post('/api/creator/browser-bridge/pair',headers={'Origin':'https://example.com'}).status_code,403)
    def test_pair_rotation_and_persistence(self):
        self.send()
        self.assertTrue(self.app.test_client().get('/api/creator/browser-bridge/status').json['connected'])
        self.client.post('/api/creator/browser-bridge/pair')
        self.assertEqual(self.send().status_code,403)
        self.assertFalse(self.status()['connected'])

if __name__=='__main__': unittest.main()
