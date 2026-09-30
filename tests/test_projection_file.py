"""The generated projection is rewritten every few seconds with two fields changed; say so instead of resending 12 MB."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import projection_file as pf


def render(generated_at, project_status='ACTIVE', digest=None, nested_generated_at='nested-1'):
    """Written the way the producer writes it: indent=2, keys in this order, digest last."""
    body = {
        'schema_version': '2.0.0',
        'generated_at': generated_at,
        'source': {'high_water_timestamp': '2026-09-30T00:00:00+00:00'},
        'projects': [{'project_id': 'P1', 'current_status': project_status, 'generated_at': nested_generated_at,
                      'projection_digest': 'a project-level field that is not the projection\'s own'}],
        'projection_digest': digest or 'digest-of-' + generated_at,
    }
    return json.dumps(body, ensure_ascii=False, indent=2) + '\n'


class ProjectionFileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'renguin-projects-v2.json'
        self.write(render('2026-09-30T09:00:00+00:00'))
        pf._memo.clear()
        app = Flask(__name__)

        @app.get('/static/renguin-projects-v2.json')
        def file():
            return pf.serve(self.path)

        self.client = app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def write(self, text):
        self.path.write_text(text, encoding='utf-8', newline='\n')

    def get(self, **headers):
        response = self.client.get('/static/renguin-projects-v2.json', headers=headers)
        response.get_data()  # a file response is a stream: read it and close it so nothing is left open
        response.close()
        return response

    def test_a_reader_with_nothing_gets_the_file_untouched_and_a_validator(self):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.path.read_bytes())
        self.assertEqual(response.mimetype, 'application/json')
        self.assertRegex(response.headers['ETag'], r'^"sem-[0-9a-f]{32}"$')

    def test_a_reader_with_the_current_content_is_answered_304_without_the_body(self):
        tag = self.get().headers['ETag']
        again = self.get(**{'If-None-Match': tag})
        self.assertEqual(again.status_code, 304)
        self.assertEqual(again.data, b'')
        self.assertEqual(again.headers['ETag'], tag)

    def test_a_rewrite_that_only_moves_the_two_volatile_fields_is_the_same_content(self):
        tag = self.get().headers['ETag']
        self.write(render('2026-09-30T09:00:06+00:00'))  # new generated_at, new projection_digest
        self.assertEqual(self.get(**{'If-None-Match': tag}).status_code, 304)
        self.assertEqual(self.get().headers['ETag'], tag)

    def test_a_changed_project_is_new_content(self):
        tag = self.get().headers['ETag']
        self.write(render('2026-09-30T09:00:06+00:00', project_status='DONE'))
        response = self.get(**{'If-None-Match': tag})
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.headers['ETag'], tag)
        self.assertEqual(json.loads(response.data)['projects'][0]['current_status'], 'DONE')

    def test_only_the_top_level_fields_are_ignored(self):
        tag = self.get().headers['ETag']
        self.write(render('2026-09-30T09:00:00+00:00', nested_generated_at='nested-2'))
        self.assertEqual(self.get(**{'If-None-Match': tag}).status_code, 200)

    def test_weak_and_listed_validators_are_understood(self):
        tag = self.get().headers['ETag']
        self.assertEqual(self.get(**{'If-None-Match': 'W/' + tag}).status_code, 304)
        self.assertEqual(self.get(**{'If-None-Match': '"other", ' + tag}).status_code, 304)
        self.assertEqual(self.get(**{'If-None-Match': '"other"'}).status_code, 200)

    def test_the_content_is_hashed_once_per_version_of_the_file(self):
        tag = self.get().headers['ETag']
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('read again')):
            for _ in range(5):
                self.assertEqual(self.get(**{'If-None-Match': tag}).status_code, 304)

    def test_a_missing_file_is_a_404_not_an_error(self):
        self.path.unlink()
        self.assertEqual(self.get().status_code, 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
