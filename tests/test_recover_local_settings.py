"""Selective recovery rules. Pure functions; no stash, checkout or store is touched."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import recover_local_settings as recovery


class ClassifyTests(unittest.TestCase):
    def assertCategory(self, expected, paths):
        for path in paths:
            self.assertEqual(recovery.classify(path)[0], expected, path)

    def test_implementation_is_never_restored(self):
        self.assertCategory(recovery.KEEP_NEW, [
            'backend/app.py', 'frontend/creator-office.js', 'frontend/creator-office.css',
            'frontend/creator-lodge.css', 'frontend/creator-ambience.js', 'frontend/index.html',
            'scripts/launch_preview.py', 'tests/test_creator_workflow.py',
            'docs/creator-office-ux-v2.md', 'START_STAR_OFFICE_PREVIEW.cmd', 'uv.lock',
            'frontend/vendor/phaser-3.80.1.min.js',
        ])

    def test_the_lodge_house_frame_is_chrome_not_cast(self):
        self.assertCategory(recovery.KEEP_NEW, [
            'frontend/renguin-characters/project-house.png',
            'frontend/renguin-characters/project-house-wide.png',
        ])

    def test_local_runtime_state_and_portraits_are_user_data(self):
        self.assertCategory(recovery.RESTORE, [
            'state.json', 'agents-state.json', 'runtime-config.json', 'join-keys.json',
            'frontend/renguin-projects.json', 'frontend/renguin-projects-v2.json',
            'frontend/renguin-achievements.json', 'frontend/codex_activity.json',
            'frontend/bionic_activity.json', 'frontend/office_bg.png',
            'assets/home-favorites/a.webp', 'assets/bg-history/b.webp', 'memory/notes.md',
            'frontend/renguin-characters/residents/resident-05.png',
            'frontend/renguin-characters/astra/eric.png',
        ])

    def test_shared_shapes_are_merged_not_overwritten(self):
        self.assertCategory(recovery.MERGE, [
            'asset-positions.json', 'asset-defaults.json',
            'frontend/creator-residents.json',
            '.user-presentation/presentation.sqlite', '.user-presentation/covers/x.webp',
        ])

    def test_transient_evidence_never_reaches_the_checkout(self):
        self.assertCategory(recovery.AUDIT, [
            '.preview-runtime/server.out.log', '.qa-runtime/state.json',
            'backend.log', 'cloudflared.pid', 'frontend/creator-office.css.backup1',
            'AUDIT_REPORT_20260909.md', 'backend/__pycache__/app.cpython-311.pyc',
        ])

    def test_an_unknown_path_is_quarantined_rather_than_guessed(self):
        self.assertEqual(recovery.classify('some/new/thing.dat')[0], recovery.UNCERTAIN)


class FlatMapTests(unittest.TestCase):
    def test_union_keeps_both_sides_and_the_newer_entry_wins(self):
        old = {'a': {'x': 1, 'updated_at': '2026-09-09T11:00:00'},
               'b': {'x': 2, 'updated_at': '2026-01-01T00:00:00'}}
        current = {'a': {'x': 9, 'updated_at': '2026-03-02T15:58:27'}}
        merged, detail = recovery.merge_flat_map(old, current)
        self.assertEqual(merged['a']['x'], 1, 'the newer stashed entry wins')
        self.assertEqual(merged['b']['x'], 2, 'an entry only the user had is kept')
        self.assertEqual(detail['added_from_stash'], ['b'])
        self.assertEqual(detail['stash_entry_was_newer'], ['a'])

    def test_a_stale_entry_never_overwrites_the_checkout(self):
        old = {'a': {'x': 1, 'updated_at': '2020-01-01T00:00:00'}}
        current = {'a': {'x': 9, 'updated_at': '2026-03-02T15:58:27'}}
        merged, _ = recovery.merge_flat_map(old, current)
        self.assertEqual(merged['a']['x'], 9)

    def test_missing_stamps_do_not_crash_or_win(self):
        merged, _ = recovery.merge_flat_map({'a': {'x': 1}}, {'a': {'x': 9, 'updated_at': '2026-01-01T00:00:00'}})
        self.assertEqual(merged['a']['x'], 9)


class ResidentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        self.art = self.repo / 'frontend/renguin-characters/residents'
        self.art.mkdir(parents=True)
        self.addCleanup(self.temp.cleanup)

    def test_the_checkout_cast_wins_and_user_names_are_re_added(self):
        (self.art / 'resident-27.png').write_bytes(b'png')
        current = [{'name': 'ares', 'file': 'resident-01.png', 'bounds': [0, 0, 1, 1]}]
        old = [{'name': 'ares', 'file': 'resident-01.png', 'bounds': [9, 9, 9, 9]},
               {'name': '我的新角色', 'file': 'resident-27.png', 'bounds': [0, 0, 4, 4]}]
        merged, detail = recovery.merge_residents(old, current, self.repo)
        self.assertEqual(merged[0]['bounds'], [0, 0, 1, 1], 'the checkout definition is authoritative')
        self.assertEqual(detail['restored_names'], ['我的新角色'])
        self.assertEqual([m['name'] for m in merged], ['ares', '我的新角色'])

    def test_a_name_whose_art_is_gone_is_reported_not_added(self):
        old = [{'name': '幽靈', 'file': 'resident-99.png'}]
        merged, detail = recovery.merge_residents(old, [], self.repo)
        self.assertEqual(merged, [])
        self.assertEqual(detail['skipped_missing_art'][0]['name'], '幽靈')


class PresentationTests(unittest.TestCase):
    def test_old_values_fill_gaps_without_losing_anything_set_since_the_sync(self):
        old = {'revision': 42,
               'projects': {'A': {'display_name': '舊名字', 'resident_character': '雪寶',
                                  'workflow': {'INDEX': {'status': 'COMPLETED'}}},
                            'B': {'display_name': '舊 B', 'manual_done': {'done': True}},
                            'C': {'display_name': '只有舊版有的企劃'}},
               'inbox': {'i1': {'title': '舊待辦', 'state': 'today'}},
               'order': ['i1'], 'project_order': ['B', 'A', 'C']}
        current = {'revision': 3,
                   'projects': {'A': {}, 'B': {'display_name': '同步後改的名字'}, 'D': {'display_name': '新的'}},
                   'inbox': {'i2': {'title': '新待辦', 'state': 'done'}},
                   'order': ['i2'], 'project_order': ['D']}
        merged, detail = recovery.merge_presentation(old, current)
        self.assertEqual(merged['projects']['A']['display_name'], '舊名字')
        self.assertEqual(merged['projects']['A']['resident_character'], '雪寶')
        self.assertEqual(merged['projects']['B']['display_name'], '同步後改的名字',
                         'a value set after the sync is never overwritten')
        self.assertTrue(merged['projects']['B']['manual_done']['done'])
        self.assertIn('C', merged['projects'])
        self.assertEqual(merged['projects']['D']['display_name'], '新的')
        self.assertEqual(merged['inbox']['i2']['state'], 'done')
        self.assertEqual(merged['inbox']['i1']['title'], '舊待辦')
        self.assertEqual(merged['project_order'], ['D', 'B', 'A', 'C'])
        self.assertEqual(merged['order'], ['i2', 'i1'])
        self.assertEqual(merged['revision'], 43, 'clients must see the store change')
        self.assertEqual(detail['projects_recovered'], ['C'])
        self.assertEqual(detail['inbox_recovered'], ['i1'])
        self.assertIn('resident_character', detail['fields_recovered']['projects']['A'])

    def test_merging_an_empty_store_is_a_plain_recovery(self):
        old = {'revision': 5, 'projects': {'A': {'display_name': 'x'}}, 'inbox': {}, 'order': []}
        merged, _ = recovery.merge_presentation(old, {'revision': 0, 'projects': {}, 'inbox': {}, 'order': []})
        self.assertEqual(merged['projects']['A']['display_name'], 'x')
        self.assertEqual(merged['revision'], 6)


if __name__ == '__main__':
    unittest.main()
