"""Synthetic sync regression: no live credentials, videos or network calls."""
from contextlib import redirect_stdout
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from renguin_world import engine, service, youtube_adapter
from renguin_world.__main__ import main


def item(i, **extra):
    return {'project_id': f'test-{i}', 'title': 'Synthetic fixture', 'content_type': 'long',
            'status': 'PUBLISHED', 'published_at': '2025-01-01T00:00:00Z',
            'youtube_video_id': f'v{i:010d}', **extra}


def response(ids):
    return {'items': [{'id': v, 'statistics': {'viewCount': '100000'},
                       'snippet': {'publishedAt': '2025-01-01T00:00:00Z'}} for v in ids]}


class SafeSync(unittest.TestCase):
    def test_empty_ids_preserve_snapshot_and_do_not_call_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = Path(tmp) / youtube_adapter.FILE
            saved.write_text('previous-snapshot')
            result = youtube_adapter.sync(tmp, [None, 'bad', 'abcdefghijk\n'], api_key='fixture',
                                          fetch=lambda _: self.fail('empty mapping must not call API'))
            self.assertEqual(result['status'], 'GATED')
            self.assertEqual(saved.read_text(), 'previous-snapshot')

    def test_failed_second_batch_does_not_leak_url_or_replace_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = Path(tmp) / youtube_adapter.FILE
            saved.write_text('previous-snapshot')
            calls = []
            def fetch(url):
                from urllib.parse import parse_qs, urlsplit
                calls.append(True)
                if len(calls) == 2:
                    raise RuntimeError(url)
                return response(parse_qs(urlsplit(url).query)['id'][0].split(','))
            output = io.StringIO()
            with redirect_stdout(output):
                result = youtube_adapter.sync(tmp, [f'v{i:010d}' for i in range(51)],
                                              api_key='DO-NOT-EXPOSE-FIXTURE', fetch=fetch)
            self.assertEqual(result['status'], 'ERROR')
            self.assertNotIn('DO-NOT-EXPOSE-FIXTURE', output.getvalue() + json.dumps(result))
            self.assertEqual(saved.read_text(), 'previous-snapshot')

    def test_missing_video_or_invalid_date_never_reports_complete(self):
        for payload, status in [(response([]), 'PARTIAL'),
                                ({'error': {'message': 'fixture'}}, 'ERROR'),
                                ({'items': [{'id': 'v0000000001', 'statistics': {'viewCount': '4'},
                                             'snippet': {'publishedAt': 'not-a-date'}}]}, 'ERROR')]:
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                result = youtube_adapter.sync(tmp, ['v0000000001'], api_key='fixture', fetch=lambda _: payload)
                self.assertEqual(result['status'], status)
                self.assertFalse((Path(tmp) / youtube_adapter.FILE).exists())

    def test_all_contents_not_only_featured_and_cache_invalidated(self):
        raw = [item(i) for i in range(20)] + [item(99, youtube_video_id=None)]
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ', {'RENGUIN_WORLD_RUNTIME_ROOT': tmp}):
            cache = Path(tmp) / 'cache' / 'world_state.json'
            cache.parent.mkdir()
            cache.write_text('stale')
            overrides = {'contents': {'test-0': {'exclude': True}, 'test-99': {'youtube_video_id': 'v0000000099'}}}
            with patch.object(service.content_adapter, 'collect', return_value=(raw, [])), \
                 patch.object(service, 'load_overrides', return_value=(overrides, {'status': 'OK'})), \
                 patch.object(youtube_adapter, 'sync', return_value={'status': 'OK', 'synced': 20}) as sync:
                result = service.sync_youtube('fixture')
            ids = sync.call_args.args[1]
            self.assertEqual(len(ids), 20)
            self.assertIn('v0000000099', ids)
            self.assertNotIn('v0000000000', ids)
            self.assertEqual(result['unmapped_contents'], 0)
            self.assertFalse(cache.exists())

    def test_failed_sync_leaves_cache_and_inputs_untouched(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ', {'RENGUIN_WORLD_RUNTIME_ROOT': tmp}):
            cache = Path(tmp) / 'cache' / 'world_state.json'
            cache.parent.mkdir()
            cache.write_text('original')
            raw = [item(0, youtube_video_id=None)]
            before = json.dumps(raw)
            with patch.object(service.content_adapter, 'collect', return_value=(raw, [])), \
                 patch.object(service, 'load_overrides', return_value=({}, {'status': 'NONE'})), \
                 patch.object(youtube_adapter, 'sync', return_value={'status': 'GATED', 'synced': 0}):
                result = service.sync_youtube('fixture')
            self.assertEqual(result['unmapped_contents'], 1)
            self.assertEqual(cache.read_text(), 'original')
            self.assertEqual(json.dumps(raw), before)

    def test_successful_mapped_subset_does_not_claim_full_coverage(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ', {'RENGUIN_WORLD_RUNTIME_ROOT': tmp}), \
             patch.object(service.content_adapter, 'collect', return_value=([item(0), item(1, youtube_video_id=None)], [])), \
             patch.object(service, 'load_overrides', return_value=({}, {'status': 'NONE'})), \
             patch.object(youtube_adapter, 'sync', return_value={'status': 'OK', 'synced': 1}):
            result = service.sync_youtube('fixture')
            self.assertEqual((result['status'], result['unmapped_contents'], result['snapshot_saved']), ('PARTIAL', 1, True))

    def test_cli_uses_environment_root_and_nonzero_exit_on_gate(self):
        with patch.dict('os.environ', {'RENGUIN_PRESENTATION_ROOT': 'isolated-fixture'}), \
             patch.object(service, 'sync_youtube', return_value={'status': 'GATED'}) as sync, \
             redirect_stdout(io.StringIO()):
            self.assertEqual(main(['youtube-sync']), 1)
            sync.assert_called_once_with('isolated-fixture')

    def test_actual_bucket_boundaries_keep_growth_and_era_identical(self):
        raw = [item(i) for i in range(20)]
        now = datetime(2025, 1, 2, tzinfo=timezone.utc)
        baseline = engine.build_state(raw, now=now)
        for views, bucket in [(0, 0), (999, 0), (1000, 1), (9999, 1), (10000, 2),
                              (49999, 2), (50000, 3), (99999, 3), (100000, 4), (500000, 5)]:
            with self.subTest(views=views):
                popularity = {'status': 'OK', 'videos': {c['youtube_video_id']: {'view_count': views} for c in raw}}
                state = engine.build_state(raw, now=now, popularity=popularity)
                for field in ('world_score', 'world_level', 'current_era', 'content', 'recent_growth'):
                    self.assertEqual(state[field], baseline[field])
                self.assertEqual(state['popularity']['recent_top_tier'], f'VIEW_TIER_{bucket}')


if __name__ == '__main__':
    unittest.main()
