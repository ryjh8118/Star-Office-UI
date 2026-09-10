"""Preview identity authority. Reads local git files only; no canonical source is touched."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import preview_identity as identity

OFFICE = Path(__file__).resolve().parents[1]
SHA = 'a' * 40
OTHER = 'b' * 40


def payload(**overrides):
    base = {'kind': identity.KIND, 'canonical_read_only': True, 'pid': 4321,
            'office_worktree': '/office', 'producer_worktree': '/producer',
            'canonical_root': '/canonical', 'state_directory': '/office/.preview-runtime',
            'office_revision': SHA}
    base.update(overrides)
    return base


def expected(office='/office'):
    return {'office_worktree': office, 'producer_worktree': '/producer',
            'canonical_root': '/canonical', 'state_directory': '/office/.preview-runtime'}


class RevisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def git_dir(self):
        git = self.root / '.git'
        (git / 'refs/heads').mkdir(parents=True)
        return git

    def test_reads_the_commit_of_this_checkout(self):
        commit, source = identity.revision(OFFICE)
        self.assertRegex(commit, r'^[0-9a-f]{40}$')
        self.assertTrue(source)

    def test_loose_ref_packed_ref_and_detached_head(self):
        git = self.git_dir()
        (git / 'HEAD').write_text('ref: refs/heads/master\n')
        (git / 'refs/heads/master').write_text(SHA + '\n')
        self.assertEqual(identity.revision(self.root), (SHA, 'refs/heads/master'))
        (git / 'refs/heads/master').unlink()
        (git / 'packed-refs').write_text(f'# pack-refs with: peeled\n{SHA} refs/heads/master\n')
        self.assertEqual(identity.revision(self.root), (SHA, 'refs/heads/master'))
        (git / 'HEAD').write_text(SHA + '\n')
        self.assertEqual(identity.revision(self.root), (SHA, 'DETACHED_HEAD'))

    def test_linked_worktree_resolves_through_its_common_directory(self):
        git = self.git_dir()
        (git / 'refs/heads/master').write_text(SHA + '\n')
        linked = git / 'worktrees/preview'
        linked.mkdir(parents=True)
        (linked / 'HEAD').write_text('ref: refs/heads/master\n')
        (linked / 'commondir').write_text('../..\n')
        checkout = self.root / 'preview'
        checkout.mkdir()
        (checkout / '.git').write_text(f'gitdir: {linked}\n')
        self.assertEqual(identity.revision(checkout), (SHA, 'refs/heads/master'))

    def test_unreadable_layouts_never_raise(self):
        self.assertEqual(identity.revision(self.root), (None, 'NO_GIT_DIRECTORY'))
        git = self.git_dir()
        (git / 'HEAD').write_text('ref: refs/heads/missing\n')
        self.assertEqual(identity.revision(self.root), (None, 'UNRESOLVED_REF:refs/heads/missing'))
        (git / 'HEAD').write_text('not a head\n')
        self.assertEqual(identity.revision(self.root), (None, 'UNREADABLE_HEAD'))


class VerifyTests(unittest.TestCase):
    def test_matching_identity_passes(self):
        identity.verify(payload(), expected())

    def test_a_non_preview_or_writable_canonical_is_never_accepted(self):
        for broken in [None, {}, payload(kind='SOMETHING_ELSE'),
                       payload(canonical_read_only=False), payload(canonical_read_only='true')]:
            with self.assertRaises(RuntimeError) as raised:
                identity.verify(broken, expected())
            self.assertTrue(str(raised.exception).startswith('PREVIEW_IDENTITY_UNVERIFIED'))

    def test_every_pinned_path_is_still_gated_and_names_its_evidence(self):
        for key in identity.PINNED:
            with self.assertRaises(RuntimeError) as raised:
                identity.verify(payload(**{key: '/somewhere/else'}), expected())
            message = str(raised.exception)
            self.assertTrue(message.startswith('PREVIEW_IDENTITY_MISMATCH:' + key))
            self.assertIn('/somewhere/else', message)
            self.assertIn('pid=4321', message)
            with self.assertRaises(RuntimeError):
                identity.verify(payload(**{key: None}), expected())


class ClassifyTests(unittest.TestCase):
    def test_free_port_starts_and_matching_preview_attaches(self):
        self.assertEqual(identity.classify(None, expected(), SHA)['action'], 'START')
        self.assertEqual(identity.classify(payload(), expected(), SHA)['action'], 'ATTACH')

    def test_another_checkout_is_reclaimed_not_treated_as_corruption(self):
        plan = identity.classify(payload(office_worktree='/other'), expected(), SHA)
        self.assertEqual(plan['action'], 'RECLAIM')
        self.assertEqual(plan['reason'], 'PORT_HELD_BY_OTHER_WORKTREE')
        self.assertEqual(plan['holder'], '/other')
        self.assertEqual(plan['pid'], 4321)

    def test_a_preview_older_than_the_checkout_is_restarted(self):
        plan = identity.classify(payload(office_revision=OTHER), expected(), SHA)
        self.assertEqual(plan['action'], 'RESTART')
        self.assertEqual(plan['serving'], OTHER)
        self.assertEqual(plan['wanted'], SHA)
        # A server predating this fix reports no commit at all, so it is stale by definition.
        without = payload()
        del without['office_revision']
        self.assertEqual(identity.classify(without, expected(), SHA)['action'], 'RESTART')

    def test_an_unknown_service_on_the_port_is_never_stopped(self):
        for stranger in [{'kind': 'SOMETHING_ELSE'}, payload(canonical_read_only=False)]:
            self.assertEqual(identity.classify(stranger, expected(), SHA)['action'], 'REFUSE')

    def test_an_unreadable_checkout_commit_does_not_force_a_restart(self):
        self.assertEqual(identity.classify(payload(), expected(), None)['action'], 'ATTACH')


if __name__ == '__main__':
    unittest.main()
