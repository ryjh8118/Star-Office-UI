"""Manual project URLs: canonical identity, live-validation boundary and atomic uniqueness."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from flask import Flask

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import creator_presentation as cp
import creator_youtube as binding
from renguin_world import engine, service, youtube_adapter as yt

VID = 'abcdefghijk'


def metadata(vid=VID, views='12000'):
    stats = {} if views is None else {'viewCount': views}
    return yt.parse_item({'id': vid, 'snippet': {'title': 'Synthetic public video',
                         'channelId': 'UC_fixture', 'publishedAt': '2026-01-01T00:00:00Z'}, 'statistics': stats})


class ManualBinding(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Path(self.tmp.name) / 'presentation'
        self.app = Flask('youtube-binding', static_folder=str(ROOT / 'frontend'))
        self.app.config['USER_PRESENTATION_ROOT'] = str(self.store)
        self.app.register_blueprint(cp.bp)
        self.client = self.app.test_client()
        projects = [{'project_id': p, 'project_name': p, 'classification': 'REGISTERED'} for p in ('P1', 'P2')]
        self.patches = [patch('renguin_boundary.projects', return_value={'projection': {'projects': projects}}),
                        patch('creator_history.snapshot', return_value=(None, [], {})),
                        patch.object(service, 'registry', return_value={'sources': []}),
                        patch.object(yt, 'validate_video', side_effect=lambda vid: metadata(vid)),
                        patch.object(service, 'live_state', wraps=service.live_state)]
        self.mocks = [p.start() for p in self.patches]
        self.client.get('/api/creator/presentation')

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def state(self):
        with self.app.app_context():
            return cp.read()

    def save(self, url, pid='P1', **extra):
        return self.client.post('/api/creator/project-link', json={
            'project_id': pid, 'url': url, 'revision': self.state()['revision'], **extra})

    def test_watch_url_auto_binds_canonical_identity(self):
        r = self.save('https://www.youtube.com/watch?v=' + VID)
        self.assertEqual(r.status_code, 200)
        b = r.json[binding.FIELD]['P1']
        self.assertEqual((b['canonical_project_id'], b['youtube_video_id'], b['status']), ('P1', VID, 'BOUND'))
        self.assertEqual(b['provenance'], binding.USER)

    def test_short_url_auto_binds(self):
        self.assertEqual(self.save('https://youtu.be/' + VID).json[binding.FIELD]['P1']['youtube_video_id'], VID)

    def test_extra_query_is_not_identity_and_ambiguous_ids_fail(self):
        r = self.save('https://youtube.com/watch?v=' + VID + '&t=12&feature=shared')
        self.assertEqual(r.json[binding.FIELD]['P1']['youtube_video_id'], VID)
        before = self.state()
        self.assertEqual(self.save('https://youtube.com/watch?v=' + VID + '&v=zyxwvutsrqp').status_code, 400)
        self.assertEqual(self.state(), before)

    def test_unresolved_user_url_becomes_confirmed_bound(self):
        with self.app.app_context():
            cp.change(lambda d: d.setdefault(binding.FIELD, {}).update(P1={'status': 'IDENTITY_UNRESOLVED'}))
        b = self.save('youtu.be/' + VID).json[binding.FIELD]['P1']
        self.assertEqual((b['confirmation'], b['status']), ('USER_CONFIRMED', 'BOUND'))

    def test_binding_auto_refreshes_metadata_and_world(self):
        r = self.save('youtu.be/' + VID)
        self.assertEqual(r.json[binding.FIELD]['P1']['metadata']['view_count'], 12000)
        self.assertTrue(self.mocks[-1].call_args.kwargs['refresh'])
        self.assertTrue((self.store.parent / '.world-runtime/cache/world_state.json').exists())

    def test_missing_public_count_stays_null_with_provenance(self):
        self.mocks[-2].side_effect = lambda vid: metadata(vid, None)
        b = self.save('youtu.be/' + VID).json[binding.FIELD]['P1']
        self.assertIsNone(b['metadata']['view_count'])
        self.assertEqual(b['metadata']['view_count_provenance'], yt.UNAVAILABLE)
        self.assertIsNone(engine.view_tier(b['metadata']['view_count'], engine.load_config()))

    def test_duplicate_conflict_is_atomic(self):
        self.save('youtu.be/' + VID)
        before = self.state()
        r = self.save('youtu.be/' + VID, 'P2')
        self.assertEqual((r.status_code, r.json['code']), (409, 'YOUTUBE_BINDING_CONFLICT'))
        self.assertEqual(self.state(), before)

    def test_existing_verified_override_reserves_its_canonical_owner(self):
        runtime = self.store.parent / '.world-runtime'
        runtime.mkdir(exist_ok=True)
        (runtime / service.OVERRIDES_FILE).write_text(json.dumps({'contents': {'P1': {'youtube_video_id': VID}}}))
        yt.sync(runtime, [VID], api_key='fixture', fetch=lambda _: {'items': [{'id': VID, 'snippet': {'publishedAt': '2025-01-01T00:00:00Z'}, 'statistics': {'viewCount': '2'}}]})
        before = self.state()
        r = self.save('youtu.be/' + VID, 'P2')
        self.assertEqual((r.status_code, r.json['conflict_owner']), (409, 'P1'))
        self.assertEqual(self.state(), before)
        self.assertEqual(self.save('youtu.be/' + VID, 'P2', rebind_confirmed=True, conflict_owner='P1').status_code, 200)
        # A later import must not resurrect the old inferred relationship.
        with self.app.app_context():
            cp.change(lambda d: binding.reserve_verified_legacy(d, runtime))
        self.assertIsNone(self.state()[binding.FIELD]['P1']['youtube_video_id'])

    def test_unverified_legacy_mapping_blocks_new_mutation(self):
        runtime = self.store.parent / '.world-runtime'
        runtime.mkdir(exist_ok=True)
        (runtime / service.OVERRIDES_FILE).write_text(json.dumps({'contents': {'P1': {'youtube_video_id': VID}}}))
        before = self.state()
        self.assertEqual(self.save('youtu.be/' + VID, 'P2').status_code, 503)
        self.assertEqual(self.state(), before)

    def test_url_updates_resolution_projection_without_another_sync(self):
        raw = [{'project_id': 'P1', 'title': 'fixture', 'content_type': 'long', 'status': 'PUBLISHED',
                'published_at': '2025-01-01T00:00:00Z'}]
        def collect(_):
            return binding.enrich_contents(copy.deepcopy(raw), self.state()), []
        with patch.object(service.content_adapter, 'collect', side_effect=collect):
            self.assertEqual(self.save('youtu.be/' + VID).status_code, 200)
            path = self.store.parent / '.world-runtime/youtube_resolutions.json'
            rows = json.loads(path.read_text())['contents']
            self.assertEqual(next(iter(rows.values()))['resolution_status'], 'FULLY_VERIFIED')
            self.assertEqual(self.save('').status_code, 200)
            row = next(iter(json.loads(path.read_text())['contents'].values()))
            self.assertEqual(row['resolution_status'], 'IDENTITY_UNRESOLVED')
            self.assertIsNone(row['youtube_video_id'])

    def test_explicit_rebind_preserves_both_projects(self):
        self.save('youtu.be/' + VID)
        r = self.save('youtu.be/' + VID, 'P2', rebind_confirmed=True, conflict_owner='P1')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json[binding.FIELD]['P2']['youtube_video_id'], VID)
        self.assertIsNone(r.json[binding.FIELD]['P1']['youtube_video_id'])
        self.assertIn('P1', r.json['projects'])
        self.assertIsNone(r.json['projects']['P1']['link'])

    def test_invalid_url_or_api_failure_does_not_mutate(self):
        before = self.state()
        for url in ('javascript:bad', 'https://youtu.be/bad', 'https://youtube.com/@channel'):
            self.assertEqual(self.save(url).status_code, 400)
            self.assertEqual(self.state(), before)
        self.mocks[-2].side_effect = yt.VideoValidationError('YOUTUBE_VALIDATION_FAILED')
        self.assertEqual(self.save('youtu.be/' + VID).status_code, 422)
        self.assertEqual(self.state(), before)

    def test_remove_only_youtube_relationship_and_block_inferred_resurrection(self):
        self.save('youtu.be/' + VID)
        before = copy.deepcopy(self.state()['projects'])
        r = self.save('')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json[binding.FIELD]['P1']['status'], 'UNBOUND')
        self.assertEqual(r.json['projects']['P1']['workflow'], before['P1']['workflow'])
        self.assertIn('P2', r.json['projects'])
        rows = binding.enrich_contents([{'project_id': 'P1'}], r.json)
        rows, _ = engine.apply_overrides(rows, {'contents': {'P1': {'youtube_video_id': VID}}})
        self.assertIsNone(rows[0]['youtube_video_id'])

    def test_user_confirmation_beats_bionic_but_not_uniqueness(self):
        d = self.save('youtu.be/' + VID).json
        self.assertFalse(binding.apply(d, 'P1', metadata('zyxwvutsrqp'), source='BIONIC_RECOMMENDATION'))
        self.assertEqual(d[binding.FIELD]['P1']['youtube_video_id'], VID)
        with self.assertRaises(binding.BindingConflict):
            binding.apply(d, 'P2', metadata(), source='BIONIC_RECOMMENDATION')

    def test_alias_uses_selected_canonical_project_not_card_id(self):
        with self.app.app_context():
            cp.change(lambda d: d['projects']['P1'].update(source_project_id='CANONICAL_SOURCE'))
        r = self.save('youtu.be/' + VID)
        self.assertIn('CANONICAL_SOURCE', r.json[binding.FIELD])
        self.assertNotIn('P1', r.json[binding.FIELD])

    def test_revision_change_during_validation_blocks_mutation(self):
        def delayed(vid):
            with self.app.app_context():
                cp.change(lambda d: d['projects']['P2'].update(display_name='Concurrent rename'))
            return metadata(vid)
        self.mocks[-2].side_effect = delayed
        self.assertEqual(self.save('youtu.be/' + VID).status_code, 409)
        self.assertNotIn(binding.FIELD, self.state())


class ValidationBoundary(unittest.TestCase):
    def test_real_parser_requires_matching_unique_video(self):
        row = {'id': VID, 'snippet': {'title': 'Fixture', 'channelId': 'UC_fixture',
                                     'publishedAt': '2026-01-01T00:00:00Z'}, 'statistics': {}}
        result = yt.validate_video(VID, api_key='fixture', fetch=lambda _: {'items': [row]})
        self.assertIsNone(result['view_count'])
        for payload in ({'items': []}, {'items': [row, row]}, {'items': [{**row, 'id': 'zyxwvutsrqp'}]}, {'error': {}}):
            with self.assertRaises(yt.VideoValidationError):
                yt.validate_video(VID, api_key='fixture', fetch=lambda _: payload)


if __name__ == '__main__':
    unittest.main()
