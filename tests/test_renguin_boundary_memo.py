"""The desk's poll asks for the same ledger from several endpoints; one read answers them all for a moment.

What must never happen: a stale answer that outlives its window, a projection reported unchanged when a
project changed, freshness that stops moving because an answer was reused, or a failure that is remembered.
"""
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import renguin_boundary as rb
import creator_history as history
from creator_projects import resolve


def stamp(seconds):
    return datetime.fromtimestamp(seconds).astimezone().isoformat()


class FakeAuthority:
    """Stands in for Content OS's canonical_projection: it stamps generated_at into the payload, as the real one does."""
    LEDGER_REL = 'ledger.jsonl'

    def __init__(self, delay=0.0):
        self.builds = 0
        self.snapshots = 0
        self.delay = delay
        self.base = time.time()  # the ledger's own times: they do not move between builds
        self.status = 'RUNNING'
        self.fail = False
        self.lock = threading.Lock()

    def build(self, frontend, root):
        with self.lock:
            self.builds += 1
            n = self.builds
        time.sleep(self.delay)
        if self.fail:
            raise ValueError('LEDGER_UNREADABLE')
        return {
            'generated_at': stamp(1_000_000 + n),
            'projection_digest': 'producer-digest-%d' % n,
            'freshness_threshold_seconds': 600,
            'source': {'high_water_timestamp': stamp(self.base - 30)},
            'projects': [{'project_id': 'P1', 'updated_at': stamp(self.base - 60), 'current_status': self.status,
                          'workflow': [{'id': 'RAW', 'stages': [{'id': 'INDEX'}]}]}],
        }

    def snapshot(self, root):
        with self.lock:
            self.snapshots += 1
        return [{'ledger_entry_id': 'e1', 'project_id': 'P1'}], {'sha256': 'proof'}

    def timestamp(self, value):
        return datetime.fromisoformat(value).timestamp()

    strict_json = staticmethod(lambda raw: {})
    read_bytes = staticmethod(lambda path, limit=0: b'{}')
    SCHEMAS = Path('.')


class BoundaryMemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'ledger.jsonl').write_text('{"a":1}\n', encoding='utf-8')
        self.authority = FakeAuthority()
        self.patches = [
            patch.object(rb, 'producer', return_value=self.authority),
            patch.dict('os.environ', {'RENGUIN_CANONICAL_ROOT': str(self.root), 'RENGUIN_MEMO_SECONDS': '5'}),
        ]
        for p in self.patches:
            p.start()
        rb.PROJECTION.clear()
        rb.SNAPSHOT.clear()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        rb.PROJECTION.clear()
        rb.SNAPSHOT.clear()
        self.temp.cleanup()

    # ---- the window
    def test_asks_inside_the_window_share_one_build(self):
        first = rb.projects('frontend')
        second = rb.projects('frontend')
        self.assertEqual(self.authority.builds, 1)
        self.assertEqual((first['profiling']['memo'], second['profiling']['memo']), ('MISS', 'HIT'))
        self.assertIs(first['projection'], second['projection'])

    def test_the_window_expires(self):
        with patch.dict('os.environ', {'RENGUIN_MEMO_SECONDS': '0.05'}):
            rb.projects('frontend')
            time.sleep(0.08)
            rb.projects('frontend')
        self.assertEqual(self.authority.builds, 2)

    def test_zero_seconds_turns_it_off(self):
        with patch.dict('os.environ', {'RENGUIN_MEMO_SECONDS': '0'}):
            rb.projects('frontend')
            rb.projects('frontend')
        self.assertEqual(self.authority.builds, 2)

    def test_a_new_ledger_entry_is_seen_at_once_not_when_the_window_ends(self):
        rb.projects('frontend')
        (self.root / 'ledger.jsonl').write_text('{"a":1}\n{"a":2}\n', encoding='utf-8')
        rb.projects('frontend')
        self.assertEqual(self.authority.builds, 2)

    def test_another_frontend_is_another_answer(self):
        rb.projects('one')
        rb.projects('two')
        self.assertEqual(self.authority.builds, 2)

    def test_a_failure_is_answered_honestly_and_not_remembered(self):
        self.authority.fail = True
        failed = rb.projects('frontend')
        self.assertEqual((failed['status'], failed['projection']), ('SYNC_ERROR', None))
        self.authority.fail = False
        ok = rb.projects('frontend')
        self.assertIn(ok['status'], ('FRESH', 'STALE'))
        self.assertIsNotNone(ok['projection'])

    def test_askers_at_the_same_moment_share_one_build(self):
        self.authority.delay = 0.25
        results = []
        threads = [threading.Thread(target=lambda: results.append(rb.projects('frontend'))) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(results), 8)
        self.assertEqual(self.authority.builds, 1)

    # ---- what says "unchanged"
    def test_the_digest_ignores_the_timestamp_the_producer_stamps_but_not_a_project(self):
        a = rb.projects('frontend')
        rb.PROJECTION.clear()
        b = rb.projects('frontend')
        self.assertNotEqual(a['projection']['generated_at'], b['projection']['generated_at'])
        self.assertEqual(a['projection_stable_digest'], b['projection_stable_digest'])
        self.authority.status = 'DONE'
        rb.PROJECTION.clear()
        c = rb.projects('frontend')
        self.assertNotEqual(a['projection_stable_digest'], c['projection_stable_digest'])

    def test_a_reader_holding_the_current_projection_is_not_sent_it_again(self):
        first = rb.projects('frontend')
        light = rb.projects('frontend', known=first['projection_stable_digest'])
        self.assertIsNone(light['projection'])
        self.assertTrue(light['projection_unchanged'])
        self.assertEqual(light['projection_meta']['generated_at'], first['projection']['generated_at'])
        self.assertEqual(light['projection_stable_digest'], first['projection_stable_digest'])
        # freshness is judged from these, and they are recomputed on every ask
        for key in ('status', 'checked_at', 'canonical_age_seconds', 'transport_age_seconds', 'project_ages_seconds'):
            self.assertIn(key, light)
        self.assertGreaterEqual(light['checked_at'], first['checked_at'])

    def test_a_reader_holding_an_old_projection_is_sent_the_new_one(self):
        first = rb.projects('frontend')
        self.authority.status = 'DONE'
        rb.PROJECTION.clear()
        fresh = rb.projects('frontend', known=first['projection_stable_digest'])
        self.assertIsNotNone(fresh['projection'])
        self.assertNotIn('projection_unchanged', fresh)
        self.assertEqual(fresh['projection']['projects'][0]['current_status'], 'DONE')

    def test_a_reader_that_holds_nothing_is_sent_everything(self):
        self.assertIsNotNone(rb.projects('frontend', known=None)['projection'])
        self.assertIsNotNone(rb.projects('frontend', known='')['projection'])

    def test_freshness_keeps_moving_while_the_answer_is_reused(self):
        first = rb.projects('frontend')
        time.sleep(0.05)
        second = rb.projects('frontend')
        self.assertGreater(second['checked_at'], first['checked_at'])
        self.assertGreater(second['canonical_age_seconds'], first['canonical_age_seconds'])

    # ---- the ledger snapshot the other endpoints read
    def test_history_reads_share_one_snapshot(self):
        history.snapshot()
        history.snapshot()
        self.assertEqual(self.authority.snapshots, 1)

    def test_history_snapshot_failure_is_not_remembered(self):
        with patch.object(self.authority, 'snapshot', side_effect=[ValueError('BAD'), ([], {})]):
            with self.assertRaises(ValueError):
                history.snapshot()
            history.snapshot()


class ResolveTests(unittest.TestCase):
    def test_cards_share_the_source_projection_and_only_their_own_fields_differ(self):
        source = {'project_id': 'S', 'project_name': 'Source', 'workflow': [{'id': 'RAW'}], 'timeline': []}
        data = {'projects': {'S': {}}, 'local_projects': {}}
        cards = resolve([source], data)
        self.assertEqual(cards[0]['project_name'], 'Source')
        # nothing was deep-copied: the (large) nested parts are the source's own
        self.assertIs(cards[0]['workflow'], source['workflow'])
        # and setting the card's own fields never reaches back into the source
        cards[0]['project_name'] = 'Renamed'
        cards[0]['source_project_id'] = 'X'
        self.assertEqual(source['project_name'], 'Source')
        self.assertNotIn('source_project_id', source)

    def test_a_local_project_bound_to_a_source_reads_that_source(self):
        source = {'project_id': 'S', 'project_name': 'Source', 'classification': 'REGISTERED', 'workflow': [1]}
        data = {'projects': {'OFFICE-1': {'source_project_id': 'S'}}, 'local_projects': {'OFFICE-1': {'project_id': 'OFFICE-1', 'project_name': 'Mine'}}}
        cards = {c['project_id']: c for c in resolve([source], data)}
        self.assertEqual(cards['OFFICE-1']['source_name'], 'Source')
        self.assertEqual(cards['OFFICE-1']['project_name'], 'Mine')
        self.assertEqual(cards['OFFICE-1']['workflow'], [1])


if __name__ == '__main__':
    unittest.main(verbosity=2)
