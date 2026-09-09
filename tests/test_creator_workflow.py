"""Workflow contract: closure, replay, optimistic writes and source safety."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import creator_presentation as cp
import creator_workflow as cw
import renguin_boundary

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.project = {'project_id':'TEST-1','project_name':'Original','classification':'REGISTERED', 'timeline':[]}
        self.app = Flask('workflow-test')
        self.app.config['USER_PRESENTATION_ROOT'] = self.temp.name
        self.app.register_blueprint(cp.bp)
        self.client = self.app.test_client()
        self.mock = patch.object(renguin_boundary, 'projects', return_value={'projection':{'projects':[self.project]}})
        self.history = patch('creator_history.snapshot', return_value=(None, [], {}))
        self.mock.start(); self.history_mock = self.history.start()
    def tearDown(self):
        self.mock.stop(); self.history.stop(); self.temp.cleanup()
    def get(self):
        return self.client.get('/api/creator/presentation').json
    def test_project_order_persists_separately_from_inbox_and_rejects_bad_identity(self):
        self.get()
        result = self.client.post('/api/creator/project-order',json={'order':['TEST-1']})
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.app.test_client().get('/api/creator/presentation').json['project_order'],['TEST-1'])
        self.assertEqual(self.get()['order'],[])
        for invalid in [['Original'], ['TEST-1','TEST-1'], [None], 'TEST-1']:
            self.assertEqual(self.client.post('/api/creator/project-order',json={'order':invalid}).status_code,400)
        self.assertEqual(self.get()['project_order'],['TEST-1'])
    def test_optional_steps_closure_restore_and_replay(self):
        self.source('ROUGH_CUT_LEARNING')
        def configure(disabled):
            return self.client.post('/api/creator/workflow-settings',json={'project_id':'TEST-1','revision':self.get()['revision'],'disabled_steps':disabled})
        meta = configure(['INDEX','CALIBRATION','MEMBER_PUBLISH']).json['projects']['TEST-1']
        self.assertEqual(cw.completed_count(meta),8)
        self.assertEqual(meta['workflow']['INDEX']['status'],'NOT_REQUIRED')
        self.assertEqual(self.toggle('INDEX',True).status_code,400)
        self.assertEqual(cw.completed_count(configure([]).json['projects']['TEST-1']),10)
        self.assertEqual(configure(cw.IDS).status_code,400)
        self.assertEqual(self.toggle('LONGFORM_DIRECTOR',False,cascade_confirmed=True).status_code,200)
        self.assertEqual(cw.completed_count(self.get()['projects']['TEST-1']),2)
        self.assertTrue(any(e['type']=='WORKFLOW_SETTINGS' for e in self.get()['projects']['TEST-1']['history']))

    def test_local_project_binding_keeps_source_and_card_states_separate(self):
        self.project['project_type']='VIDEO_PROJECT'
        self.source('ROUGH_CUT_LEARNING')
        original = copy.deepcopy(self.project)
        data = self.client.post('/api/creator/projects',json={'display_name':'新專案'}).json
        pid = next(iter(data['local_projects']))
        self.assertEqual(cw.completed_count(data['projects'][pid]),0)
        self.assertEqual(self.client.post('/api/creator/project-order',json={'order':[pid,'TEST-1']}).status_code,200)
        self.client.post('/api/creator/workflow',json={'project_id':pid,'step_id':'GATE','completed':True,'revision':self.get()['revision']})
        def bind(sid):
            return self.client.post('/api/creator/project-source',json={'project_id':pid,'source_project_id':sid,'revision':self.get()['revision']})
        self.assertEqual(bind('Original').status_code,400)
        self.assertEqual(bind('TEST-1').status_code,200)
        self.assertEqual(cw.completed_count(self.get()['projects'][pid]),10)
        self.assertEqual(bind(None).status_code,200)
        restored = self.get()['projects'][pid]
        self.assertEqual(cw.completed_count(restored),5)
        self.assertEqual(restored['display_name'],'新專案')
        self.assertEqual(self.project,original)
        self.assertEqual(bind('TEST-1').status_code,200)
        self.assertEqual(cw.completed_count(self.get()['projects'][pid]),10)

    def test_residents_unique_reserved_and_stable(self):
        from creator_residents import assign, RESERVED
        cards=[{'project_id':str(i),'classification':'REGISTERED','project_type':'VIDEO_PROJECT'} for i in range(30)]
        preferences={}
        assign(cards,preferences)
        names=[v['resident_character'] for v in preferences.values() if 'resident_character' in v]
        self.assertEqual(len(names),len(set(names)))
        self.assertFalse(set(names)&RESERVED)
        before=copy.deepcopy(preferences)
        assign(list(reversed(cards)),preferences)
        self.assertEqual(before,preferences)

    def toggle(self, stage, completed, **extra):
        return self.client.post('/api/creator/workflow', json={'project_id':'TEST-1','step_id':stage,'completed':completed,'revision':self.get()['revision'],**extra})
    def source(self, stage, stamp='2026-09-07T10:00:00Z', key='e1'):
        self.project['timeline'].append({'id':stage,'status':'DONE','updated_at':stamp,'ledger_entry_id':key})
    def test_thirteen_stages_and_closure_each_target(self):
        self.assertEqual(len(cw.IDS),13)
        for count, step in enumerate(cw.IDS,1):
            meta = self.toggle(step,True).json['projects']['TEST-1']
            self.assertEqual(cw.completed_count(meta),count)
            self.assertEqual([s for s in cw.IDS if meta['workflow'][s]['status']=='COMPLETED'],cw.IDS[:count])
    def test_legacy_learning_completes_first_ten_idempotently(self):
        self.source('ROUGH_CUT_LEARNING')
        data = self.get(); meta = data['projects']['TEST-1']
        self.assertEqual(cw.completed_count(meta),10)
        self.assertIn('依剪輯學習完成，自動補齊素材 → 後製學習',meta['history'][0]['text'])
        self.assertEqual(self.get(),data)
    def test_historical_completion_retained_even_if_current_row_changed(self):
        self.history_mock.return_value=(None,[{'project_id':'TEST-1','stage_id':'ROUGH_CUT_LEARNING','new_status':'COMPLETED','timestamp':'2026-09-07T10:00:00Z','ledger_entry_id':'old'}],{})
        self.assertEqual(cw.completed_count(self.get()['projects']['TEST-1']),10)
    def test_cascade_requires_confirmation_and_cannot_resurrect(self):
        self.source('ROUGH_CUT_LEARNING')
        self.assertEqual(self.toggle('LONGFORM_DIRECTOR',False).status_code,409)
        meta = self.toggle('LONGFORM_DIRECTOR',False,cascade_confirmed=True).json['projects']['TEST-1']
        self.assertEqual(cw.completed_count(meta),2)
        self.source('POST_LEARNING','2026-09-08T10:00:00Z','late-discovered-old')
        self.assertEqual(cw.completed_count(self.get()['projects']['TEST-1']),2)
    def test_concurrent_stale_revision_rejected(self):
        revision = self.get()['revision']
        self.toggle('HUMAN_FINAL_CUT',True)
        r = self.client.post('/api/creator/workflow',json={'project_id':'TEST-1','step_id':'INDEX','completed':False,'cascade_confirmed':True,'revision':revision})
        self.assertEqual(r.status_code,409)
        self.assertEqual(cw.completed_count(self.get()['projects']['TEST-1']),7)
    def test_rename_hide_restore_preserves_identity_cover_and_source(self):
        source = copy.deepcopy(self.project)
        with self.app.app_context(): cp.change(lambda d:d['projects'].update({'TEST-1':{'cover':{'url':'/keep.webp'}}}))
        self.toggle('HUMAN_FINAL_CUT',True)
        history = self.get()['projects']['TEST-1']['history']
        def edit(**kw): return self.client.post('/api/creator/project',json={'project_id':'TEST-1',**kw})
        self.assertEqual(edit(display_name='新名字').status_code,200)
        self.assertEqual(edit(hidden=True).status_code,400)
        self.assertEqual(edit(hidden=True,confirmed=True).status_code,200)
        result = self.get()['projects']['TEST-1']
        self.assertTrue(result['hidden']); self.assertEqual(result['display_name'],'新名字')
        self.assertEqual(result['cover'],{'url':'/keep.webp'}); self.assertEqual(result['history'][:len(history)],history)
        self.assertEqual(self.project,source)
        self.assertEqual(edit(hidden=False).status_code,200)
        self.assertFalse(self.get()['projects']['TEST-1']['hidden'])
    def test_restart_persists_state_and_tombstone(self):
        self.toggle('HUMAN_FINAL_CUT',True)
        self.client.post('/api/creator/project',json={'project_id':'TEST-1','hidden':True,'confirmed':True,'display_name':'Saved'})
        expected = self.get()
        new_app = Flask('restart'); new_app.config['USER_PRESENTATION_ROOT']=self.temp.name; new_app.register_blueprint(cp.bp)
        self.assertEqual(new_app.test_client().get('/api/creator/presentation').json,expected)
    def test_invalid_input_and_untrusted_evidence_rejected(self):
        self.project['timeline']=[{'id':'PUBLISH','status':'DONE','updated_at':'2026-09-07T10:00:00Z'}]
        self.assertEqual(cw.completed_count(self.get()['projects']['TEST-1']),0)
        self.assertEqual(self.toggle('MADE_UP',True).status_code,400)
        self.assertEqual(self.toggle('INDEX','true').status_code,400)
        self.assertEqual(self.client.post('/api/creator/project',json={'project_id':'Original','display_name':'x'}).status_code,400)
        self.assertEqual(self.client.post('/api/creator/project',json={'project_id':'TEST-1','display_name':' '*3}).status_code,400)
    def test_existing_completion_dates_not_overwritten_by_later_closure(self):
        self.source('AI_ROUGH_CUT')
        first = self.get()['projects']['TEST-1']['workflow']['INDEX']['completed_at']
        self.source('POST_LEARNING','2026-09-08T10:00:00Z','e2')
        self.assertEqual(self.get()['projects']['TEST-1']['workflow']['INDEX']['completed_at'],first)

if __name__=='__main__': unittest.main(verbosity=2)
