import sys
from pathlib import Path
import unittest
from unittest.mock import patch, Mock
from flask import Flask
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import creator_history as history

class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.app=Flask(__name__);self.app.register_blueprint(history.bp);self.client=self.app.test_client()
        self.rows=[{'project_id':'P','stage_id':'GATE','ledger_entry_id':'old','event_id':'one','timestamp':100,'new_status':'RUNNING'},
                   {'project_id':'P','stage_id':'GATE','ledger_entry_id':'new','event_id':'two','timestamp':200,'new_status':'FAILED'},
                   {'project_id':'OTHER','stage_id':'GATE','ledger_entry_id':'other','timestamp':300,'new_status':'VERIFIED'}]
    def test_all_history_retains_dates_and_original_state(self):
        with patch.object(history,'snapshot',return_value=(Mock(timestamp=lambda t:t),self.rows,{'sha256':'proof'})):
            data=self.client.get('/api/creator/history?project_id=P').json
            self.assertEqual([e['ledger_entry_id'] for e in data['events']],['new','old'])
            self.assertEqual(data['events'][0]['timestamp'],200)
            self.assertEqual(data['events'][0]['new_status'],'FAILED')
            statuses=self.client.get('/api/creator/event-statuses').json['events']
            self.assertEqual(statuses['new'],{'project_id':'P','timestamp':200,'status':'FAILED'})
            self.assertEqual(self.client.get('/api/creator/history?project_id=MISSING').json['events'],[])
    def test_invalid_authority_returns_error_without_fabricated_rows(self):
        with patch.object(history,'snapshot',side_effect=ValueError('invalid canonical')):
            for url in ['/api/creator/history?project_id=P','/api/creator/event-statuses']:
                response=self.client.get(url);self.assertEqual(response.status_code,503);self.assertFalse(response.json['events'])

if __name__=='__main__':unittest.main(verbosity=2)
