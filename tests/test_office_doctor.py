"""The doctor's verdict. Pure decision logic; nothing is read or written."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import office_doctor as doctor


def report(store=None, status='FRESH', usable=3, stashes=(), folders=()):
    return {'stores': {'production': store},
            'canonical': {'status': status, 'usable': usable, 'projects': usable, 'detail': None,
                          'adapter_found': status != 'SYNC_ERROR', 'adapter_dir': 'X'},
            'stashes': list(stashes), 'other_folders': list(folders)}


FULL = {'projects': 5, 'local_projects': 0, 'covers': 5, 'completed': 1, 'inbox': 1, 'revision': 31}
EMPTY = {'projects': 0, 'local_projects': 0, 'covers': 0, 'completed': 0, 'inbox': 0, 'revision': 0}


class VerdictTests(unittest.TestCase):
    def text(self, **kwargs):
        return '\n'.join(doctor.verdict(report(**kwargs)))

    def test_a_full_store_behind_a_dead_source_blames_the_source(self):
        said = self.text(store=FULL, status='SYNC_ERROR', usable=0)
        self.assertIn('Content OS 接不上', said)
        self.assertIn('即使資料庫是滿的', said)
        self.assertNotIn('資料庫存在但裡面是空的', said)

    def test_a_missing_store_points_at_the_stash_that_holds_it(self):
        said = self.text(store=None, stashes=[{'ref': 'stash@{0}', 'message': 'local-before-sync',
                                               'has_store': True}])
        self.assertIn('資料庫不存在', said)
        self.assertIn('stash@{0}', said)
        self.assertIn('recover_local_settings.ps1', said)

    def test_a_missing_store_points_at_another_office_folder(self):
        said = self.text(store=None, folders=[{'folder': 'E:\\Old_Office', 'store': doctor.STORE,
                                               'summary': {'projects': 7}}])
        self.assertIn('E:\\Old_Office', said)
        self.assertIn('7', said)

    def test_an_empty_store_is_not_confused_with_a_missing_one(self):
        said = self.text(store=EMPTY)
        self.assertIn('裡面是空的', said)
        self.assertNotIn('不存在', said)

    def test_everything_healthy_sends_the_user_to_the_console(self):
        said = self.text(store=FULL, usable=3)
        self.assertIn('Console', said)

    def test_records_the_card_grid_filters_out_are_called_out(self):
        report_with_gap = report(store=FULL, usable=11)
        report_with_gap['canonical']['projects'] = 200
        said = '\n'.join(doctor.verdict(report_with_gap))
        self.assertIn('200', said)
        self.assertIn('11', said)
        self.assertIn('工作紀錄', said)
        self.assertNotIn('Console', said)

    def test_a_stale_but_reachable_source_is_not_blamed(self):
        self.assertNotIn('接不上', self.text(store=FULL, status='STALE', usable=2))


if __name__ == '__main__':
    unittest.main()
