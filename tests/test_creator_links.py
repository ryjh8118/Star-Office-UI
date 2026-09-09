"""URL security, YouTube forms, and Office-only persistent link writes."""
import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import creator_presentation as cp
from creator_links import normalize


class LinkTests(unittest.TestCase):
    def test_youtube_forms_and_start(self):
        for url in ('https://www.youtube.com/watch?v=M7lc1UVf-VE', 'youtu.be/M7lc1UVf-VE', 'https://m.youtube.com/shorts/M7lc1UVf-VE', 'https://youtube.com/live/M7lc1UVf-VE', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE'):
            self.assertEqual(normalize(url)['youtube_id'], 'M7lc1UVf-VE')
        self.assertEqual(normalize('https://youtu.be/M7lc1UVf-VE?t=1h2m3s')['start'], 3723)
        self.assertEqual(normalize('https://youtube.com/watch?v=M7lc1UVf-VE&start=90')['start'], 90)

    def test_plain_links_and_removal(self):
        self.assertEqual(normalize(' example.com/project?one=2#notes '), {'url':'https://example.com/project?one=2#notes'})
        self.assertIsNone(normalize(' '))
        for url in ('https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://youtu.be/invalid', 'https://youtube.com/@channel', 'https://youtube.com:8443/watch?v=M7lc1UVf-VE'):
            self.assertNotIn('youtube_id', normalize(url))

    def test_unsafe_urls_rejected(self):
        for value in (None, {}, 'javascript:alert(1)', 'data:text/html,hi', 'file:///C:/secret', 'https://user:password@example.com', 'https://example.com\\@evil.test', 'https://exa mple.com', 'https://example.com\n/secret', 'https://[broken', 'https://example.com:bad', 'x'*4097):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize(value)

    def test_persistence_revision_removal_and_source_safety(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Flask('links-test')
            app.config['USER_PRESENTATION_ROOT'] = tmp
            app.register_blueprint(cp.bp)
            client = app.test_client()
            source = {'project_id':'P1','project_name':'Source','classification':'REGISTERED','timeline':[]}
            original = copy.deepcopy(source)
            with patch('renguin_boundary.projects', return_value={'projection':{'projects':[source]}}), patch('creator_history.snapshot', return_value=(None,[],{})):
                data = client.get('/api/creator/presentation').json
                revision = data['revision']
                def save(url, revision):
                    return client.post('/api/creator/project-link', json={'project_id':'P1','url':url,'revision':revision})
                result = save('youtu.be/M7lc1UVf-VE', revision)
                self.assertEqual(result.status_code, 200)
                saved = result.json
                self.assertEqual(saved['projects']['P1']['link']['youtube_id'], 'M7lc1UVf-VE')
                self.assertEqual(app.test_client().get('/api/creator/presentation').json['projects']['P1']['link'], saved['projects']['P1']['link'])
                self.assertEqual(save('https://example.com', revision).status_code, 409)
                self.assertEqual(save('javascript:alert(1)', saved['revision']).status_code, 400)
                cleared = save('', saved['revision'])
                self.assertEqual(cleared.status_code, 200)
                self.assertIsNone(cleared.json['projects']['P1']['link'])
                self.assertEqual(source, original)
                self.assertEqual(cleared.json['projects']['P1']['workflow'], saved['projects']['P1']['workflow'])
                self.assertEqual(client.post('/api/creator/project-link', json={'project_id':'Source','url':'https://example.com','revision':cleared.json['revision']}).status_code,400)
                self.assertEqual(client.post('/api/creator/project-link', json={'project_id':'P1','url':'https://example.com'}, headers={'Origin':'https://evil.test'}).status_code,403)


if __name__ == '__main__':
    unittest.main()
