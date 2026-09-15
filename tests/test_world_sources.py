"""Renguin World sources: the content adapter, the derived character registries and the routes.

Every fixture is synthetic. No real member name, project or authority file is used or written.
"""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from renguin_world import characters, content_adapter, engine, service

CONFIG = engine.load_config()
DONE = {'status': 'COMPLETED', 'completed_at': '2026-09-10T10:00:00+00:00'}


def store(root, projects, local=None):
    root.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(root / 'presentation.sqlite')
    db.execute('CREATE TABLE metadata (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
    db.execute('INSERT INTO metadata VALUES(1, ?)', (json.dumps({'kind': 'USER_PRESENTATION_METADATA', 'revision': 3,
                                                                   'projects': projects, 'inbox': {}, 'order': [],
                                                                   'local_projects': local or {}}),))
    db.commit()
    db.close()


def chain(upto, **extra):
    from creator_workflow import IDS
    workflow = {s: ({**DONE} if IDS.index(s) <= IDS.index(upto) else {'status': 'NOT_STARTED'}) for s in IDS}
    return {'workflow': workflow, **extra}


class ContentAdapter(unittest.TestCase):
    def test_office_marks_become_contents_and_nothing_else_does(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'user-presentation'
            store(root, {
                'WORKSPACE-1150605_上映長片-aaaaaaaaaaaa': chain('SHORT_PUBLISH', source_name='1150605_上映長片'),
                'WORKSPACE-20260801_只標完成-bbbbbbbbbbbb': chain('AI_POST', source_name='20260801_只標完成',
                                                             manual_done={'type': 'USER_MANUAL_DONE', 'done': True, 'timestamp': '2026-09-01T00:00:00+00:00'}),
                'WORKSPACE-還在剪-cccccccccccc': chain('AI_ROUGH_CUT', source_name='還在剪'),
                'WORKSPACE-被移除-dddddddddddd': chain('SHORT_PUBLISH', source_name='被移除', hidden=True, deleted_at='x'),
                'WORKSPACE-WORKFLOW-QA-DEMO-eeeeeeeeeeee': chain('SHORT_PUBLISH', source_name='WORKFLOW-QA-DEMO'),
                'WORKSPACE-UX驗證-ffffffffffff': chain('SHORT_PUBLISH', source_name='UX 驗證'),
                'OFFICE-short': {'format': 'SHORT', 'source_name': '短影音一支', 'workflow': {'INDEX': DONE, 'AI_POST': DONE, 'PUBLISH': DONE}},
                'OFFICE-short-unmarked': {'format': 'SHORT', 'source_name': '短影音未完成', 'workflow': {'INDEX': DONE}},
            }, local={'OFFICE-short': {'project_name': '短影音一支'}})
            before = (root / 'presentation.sqlite').read_bytes()
            items, report = content_adapter.office_contents(root)
            self.assertEqual((root / 'presentation.sqlite').read_bytes(), before, 'the user store is only read')
        by_title = {i['title']: i for i in items}
        self.assertEqual(set(by_title), {'上映長片', '只標完成', '短影音一支'})
        self.assertEqual(by_title['上映長片']['status'], 'PUBLISHED')
        self.assertEqual(by_title['上映長片']['content_type'], 'long')
        self.assertEqual(by_title['上映長片']['production_date_hint'], '2026-06-04T16:00:00Z')
        self.assertEqual(sorted(by_title['上映長片']['world_flags']), ['MEMBER_CUT_MARKED', 'SHORTS_MARKED'])
        self.assertEqual(by_title['只標完成']['status'], 'COMPLETED')
        self.assertIsNone(by_title['只標完成']['published_at'])
        self.assertEqual(by_title['短影音一支']['content_type'], 'short')
        self.assertEqual(report['excluded'], {'hidden': 1, 'qa_artifact': 2})
        self.assertTrue(all(i['evidence'] == 'OFFICE_USER_MARK' for i in items))
        s = engine.build_state(items, now='2026-09-15T00:00:00Z')
        self.assertEqual(s['world_score'], 4 + 4 + 1, 'member and shorts steps of a long chain are flags, not extra videos')

    def test_missing_store_is_never_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            items, report = content_adapter.office_contents(Path(tmp) / 'nothing')
            self.assertEqual((items, report['status']), ([], 'EMPTY'))
            self.assertFalse((Path(tmp) / 'nothing').exists())

    def test_canonical_failure_contributes_nothing_and_says_so(self):
        with patch('creator_history.snapshot', side_effect=RuntimeError('PRODUCER_UNAVAILABLE')):
            items, report = content_adapter.canonical_contents()
        self.assertEqual((items, report['status']), ([], 'SYNC_ERROR'))

    def test_only_a_latest_verified_publish_counts_and_duplicates_fold(self):
        wf = content_adapter.WORKFLOW_ID
        entries = [
            {'project_id': 'P1', 'project_name': '1150101_正式發布', 'stage_id': 'PUBLISH', 'workflow_id': wf, 'capability_id': wf, 'new_status': 'VERIFIED', 'timestamp': '2026-09-01T00:00:00+08:00'},
            {'project_id': 'P2', 'project_name': '撤回', 'stage_id': 'PUBLISH', 'workflow_id': wf, 'capability_id': wf, 'new_status': 'VERIFIED', 'timestamp': '2026-09-01T00:00:00+08:00'},
            {'project_id': 'P2', 'stage_id': 'PUBLISH', 'workflow_id': wf, 'capability_id': wf, 'new_status': 'INVALIDATED', 'timestamp': '2026-09-02T00:00:00+08:00'},
            {'project_id': 'P3', 'project_name': '別的流程', 'stage_id': 'PUBLISH', 'workflow_id': 'OTHER', 'capability_id': 'OTHER', 'new_status': 'VERIFIED', 'timestamp': '2026-09-01T00:00:00+08:00'},
        ]
        with patch('creator_history.snapshot', return_value=(None, entries, {})):
            canonical, report = content_adapter.canonical_contents()
        self.assertEqual([c['project_id'] for c in canonical], ['P1'])
        self.assertEqual(canonical[0]['title'], '正式發布')
        office = [
            {'project_id': 'OFFICE-x', 'source_project_id': 'P1', 'title': '正式發布', 'content_type': 'long', 'status': 'PUBLISHED', 'world_flags': ['SHORTS_MARKED'], 'completed_at': None, 'evidence': 'OFFICE_USER_MARK'},
            {'project_id': 'WORKSPACE-同一資料夾-111111111111', 'title': '同一資料夾', 'content_type': 'long', 'status': 'COMPLETED', 'world_flags': [], 'evidence': 'OFFICE_USER_MARK'},
            {'project_id': 'WORKSPACE-同一資料夾-222222222222', 'title': '同一資料夾', 'content_type': 'long', 'status': 'PUBLISHED', 'world_flags': [], 'evidence': 'OFFICE_USER_MARK'},
        ]
        merged, duplicates = content_adapter.merge(canonical, office)
        self.assertEqual(duplicates, 1)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]['evidence'], 'CONTENT_OS_LEDGER+OFFICE_USER_MARK')
        folded = next(m for m in merged if m['title'] == '同一資料夾')
        self.assertEqual(folded['status'], 'PUBLISHED')
        self.assertEqual(folded['folded_ids'], ['WORKSPACE-同一資料夾-111111111111'])


def authorities(tmp, *, tamper=False):
    tmp = Path(tmp)
    general = tmp / 'GENERAL_CHARACTER_CANON_INDEX.json'
    general.write_text(json.dumps({
        'schema_version': 'GENERAL_CHARACTER_CANON_INDEX_V1', 'purpose': 'Derived lookup/cache index only; never a character authority.',
        'authority': {'authority_ref': 'ASSET-01', 'version': '9.99', 'sha256': 'f' * 64},
        'characters': [
            {'character_id': 'RENGUIN', 'canonical_name': 'Renguin', 'chinese_name': '企鵝', 'entity_type': 'BASE_CHARACTER', 'references': [{'reference_sha256': 'a' * 64}]},
            {'character_id': 'DOLA', 'canonical_name': 'Dola', 'chinese_name': '哆啦', 'entity_type': 'BASE_CHARACTER'},
            {'character_id': 'RICKY', 'canonical_name': 'Ricky', 'chinese_name': 'Ricky', 'entity_type': 'BASE_CHARACTER'},
            {'character_id': 'VAMPIRE_RENGUIN', 'canonical_name': 'Vampire Renguin', 'chinese_name': '吸血鬼企鵝', 'entity_type': 'TRANSFORMATION_FORM', 'source_character': 'Renguin（企鵝）'},
        ]}, ensure_ascii=False), encoding='utf-8')
    library = tmp / 'Character_Bible' / 'Member_Character_Library'
    png = b'\x89PNG\r\n\x1a\nfake'
    rows = []
    for cid, member_class, private, role in (('GOOSE_EGG', 'MEMBER_WORLD_NPC', False, '會員角色'),
                                             ('TESTMEMBERNAME_NURSE', 'REAL_MEMBER_AVATAR', True, '真人會員化身系列／具名平民鵝寶角色／護理師公企鵝')):
        folder = library / 'avatars' / cid
        folder.mkdir(parents=True)
        (folder / 'reference_01.png').write_bytes(png)
        profile = {'schema': 'MEMBER_CHARACTER_PROFILE_V1', 'character_id': cid, 'display_name': cid.title(),
                   'chinese': 'TESTMEMBERNAME（護理師）' if private else '鵝蛋', 'role': role, 'member_class': member_class,
                   'identity_is_private': private, 'immutable_traits': ['official_embedded_asset_is_the_visual_identity_authority'],
                   'source_fields': {'Official Appearance Lock': 'APPEARANCE-TEXT-MUST-NOT-LEAK'},
                   'reference_assets': [{'filename': 'reference_01.png', 'sha256': hashlib.sha256(b'other' if tamper else png).hexdigest()}]}
        (folder / 'profile.json').write_text(json.dumps(profile, ensure_ascii=False), encoding='utf-8')
        rows.append({'character_id': cid, 'display_name': profile['display_name'], 'chinese': profile['chinese'], 'role': role,
                     'member_class': member_class, 'identity_is_private': private, 'status': 'CANONICAL_MEMBER_CHARACTER',
                     'profile_path': f'avatars/{cid}/profile.json', 'profile_sha256': hashlib.sha256(cid.encode()).hexdigest()})
    registry = library / 'MEMBER_CHARACTER_REGISTRY_V1.json'
    registry.write_text(json.dumps({'schema': 'MEMBER_CHARACTER_REGISTRY_V1', 'characters': rows}, ensure_ascii=False), encoding='utf-8')
    (library / 'MEMBER_CHARACTER_LIBRARY_MANIFEST_V1.json').write_text(json.dumps({
        'registry': registry.name, 'authority_version': '1.0',
        'registry_sha256': hashlib.sha256(registry.read_bytes()).hexdigest()}), encoding='utf-8')
    members = tmp / 'member_registry.json'
    members.write_text(json.dumps({'snapshot_at': '2026-08-20T16:16:00+08:00', 'members': [
        {'member_id': 'm1', 'youtube_display_name': 'TESTMEMBERNAME', 'profile_url': 'https://example.test/m1', 'current_tier': '鵝寶寶Bronze'},
        {'member_id': 'm2', 'youtube_display_name': 'SECONDMEMBER', 'profile_url': 'https://example.test/m2', 'current_tier': '鵝的真誠心意Gold'},
    ], 'avatar_registry': [{'avatar_name': 'TESTMEMBERNAME', 'occupation': '護理師', 'mapping_status': '已綁定'}]}, ensure_ascii=False), encoding='utf-8')
    return {'general_index': general, 'member_library': library, 'member_registry': members, 'frontend': ROOT / 'frontend'}


class CharacterRegistry(unittest.TestCase):
    def test_registry_references_authorities_and_copies_no_canon(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = authorities(tmp)
            general_before = paths['general_index'].read_bytes()
            registry = characters.build_registry(paths, CONFIG)
            self.assertEqual(paths['general_index'].read_bytes(), general_before)
        text = json.dumps(registry, ensure_ascii=False)
        for leak in ('APPEARANCE-TEXT-MUST-NOT-LEAK', 'immutable_traits', 'source_fields', 'reference_sha256', 'TESTMEMBERNAME', 'SECONDMEMBER', 'example.test'):
            self.assertNotIn(leak, text)
        self.assertEqual(registry['authority_role'], 'DERIVED_VIEW_NOT_AN_AUTHORITY')
        by_id = {c['character_id']: c for c in registry['characters']}
        required = {'character_id', 'display_name', 'character_type', 'source_authority', 'asset_ref', 'default_district',
                    'public_visibility', 'allowed_states', 'allowed_actions', 'dialogue_pool', 'special_flags'}
        for entry in registry['characters']:
            self.assertTrue(required <= set(entry), entry['character_id'])
            self.assertIn(entry['character_type'], {'MAIN_CHARACTER', 'SUPPORTING_CHARACTER', 'GOOSEBABY', 'CIVILIAN', 'SPECIAL_GUEST'})
        self.assertEqual(by_id['RENGUIN']['character_type'], 'MAIN_CHARACTER')
        self.assertEqual(by_id['RENGUIN']['asset_ref'], '/static/renguin-characters/director/renguin.png')
        self.assertEqual(by_id['DOLA']['character_type'], 'SUPPORTING_CHARACTER')
        self.assertEqual(by_id['RICKY']['asset_ref'], '/static/renguin-characters/residents/resident-11.png', 'the Office resident image is reused, not redrawn')
        self.assertFalse(by_id['VAMPIRE_RENGUIN']['public_visibility'])
        self.assertIn('SHARES_SINGLE_INSTANCE_WITH_SOURCE', by_id['VAMPIRE_RENGUIN']['special_flags'])
        self.assertTrue(all(s['status'] == 'OK' for s in registry['sources']))

    def test_goosebaby_registry_keeps_member_identity_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry = characters.build_registry(authorities(tmp), CONFIG)
        geese = {g['member_class']: g for g in registry['goosebaby']['entries']}
        required = {'goosebaby_id', 'display_name', 'avatar_name', 'profession', 'world_role', 'district', 'asset_ref', 'public_visibility', 'status', 'notes'}
        for g in geese.values():
            self.assertTrue(required <= set(g))
        avatar = geese['REAL_MEMBER_AVATAR']
        self.assertTrue(avatar['goosebaby_id'].startswith('MEMBER_AVATAR_'))
        self.assertIsNone(avatar['avatar_name'])
        self.assertEqual(avatar['asset_ref'], '/api/world/character-asset/' + avatar['goosebaby_id'],
                         'the official profession art is addressed by the opaque id, never by the member folder')
        self.assertEqual((avatar['display_name'], avatar['profession'], avatar['status']), ('護理師鵝寶', 'NURSE', 'BOUND'))
        entry = next(c for c in registry['characters'] if c['character_id'] == avatar['goosebaby_id'])
        self.assertEqual((entry['resolution'], entry['world_role']), ('PROFESSION_CHARACTER', '護理師居民'))
        self.assertIn('IDENTITY_PRIVATE', entry['special_flags'])
        self.assertEqual(geese['MEMBER_WORLD_NPC']['asset_ref'], '/api/world/character-asset/GOOSE_EGG')
        self.assertEqual(registry['goosebaby']['population'], {'total': 2, 'by_tier': {'BRONZE': 1, 'GOLD': 1},
                                                               'snapshot_at': '2026-08-20T16:16:00+08:00',
                                                               'source': 'RENGUIN_WORLD_MEMBER_REGISTRY', 'aggregate_only': True})

    def test_civilians_follow_existing_professions(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry = characters.build_registry(authorities(tmp), CONFIG)
        rows = {c['civilian_id']: c for c in registry['civilians']}
        for key in ('NURSE', 'FACTORY_WORKER', 'DELIVERY_COURIER', 'CONSTRUCTION_ASSISTANT', 'BAKERY_STAFF', 'CALL_CENTER', 'HOTEL_STAFF'):
            row = rows['CIVILIAN_' + key]
            self.assertTrue({'profession', 'district', 'density_group', 'day', 'night', 'asset_ref', 'activity_states'} <= set(row))
        self.assertEqual(rows['CIVILIAN_NURSE']['source'], 'ASSET-08_PROFESSION')
        nurse = next(g for g in registry['goosebaby']['entries'] if g['profession'] == 'NURSE')
        self.assertEqual((rows['CIVILIAN_NURSE']['resolution'], rows['CIVILIAN_NURSE']['character_ref']),
                         ('PROFESSION_CHARACTER', nurse['goosebaby_id']), 'a profession points at its existing character')
        self.assertEqual((rows['CIVILIAN_FACTORY_WORKER']['resolution'], rows['CIVILIAN_FACTORY_WORKER']['character_ref']),
                         ('NEUTRAL_PLACEHOLDER', None), 'no character exists for this profession in the fixture')
        self.assertEqual(rows['CIVILIAN_VILLAGER']['resolution'], 'NEUTRAL_PLACEHOLDER')
        report = characters.resolution_report(registry)
        self.assertEqual(report['counts']['GENERIC_WRONG_CHARACTER'], 0)
        self.assertEqual(report['counts']['TOTAL_RESIDENTS'], sum(report['counts'][k] for k in
                         ('CANONICAL_CHARACTER', 'PROFESSION_CHARACTER', 'NEUTRAL_PLACEHOLDER', 'UNRESOLVED')))
        self.assertFalse(any(r['id'] == 'VAMPIRE_RENGUIN' for r in report['rows']), 'event skins are not residents')
        broken = json.loads(json.dumps(registry))
        next(c for c in broken['civilians'] if c['civilian_id'] == 'CIVILIAN_NURSE')['resolution'] = 'NEUTRAL_PLACEHOLDER'
        self.assertEqual(characters.resolution_report(broken)['counts']['GENERIC_WRONG_CHARACTER'], 1,
                         'a placeholder where the profession character exists is counted as wrong')
        items = [{'project_id': f'c{i}', 'title': f'c{i}', 'content_type': 'long', 'status': 'PUBLISHED',
                  'published_at': f'2026-09-{10 + i:02d}T00:00:00Z'} for i in range(4)]
        state = engine.build_state(items, now='2026-09-15T00:00:00Z', registry=registry)
        self.assertTrue(state['residents']['archetypes'])
        self.assertEqual(state['residents']['crowd_density'], state['activity']['crowd_density'])

    def test_private_avatar_image_resolves_only_through_its_opaque_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = authorities(tmp)
            registry = characters.build_registry(paths, CONFIG)
            opaque = next(g for g in registry['goosebaby']['entries'] if g['member_class'] == 'REAL_MEMBER_AVATAR')['goosebaby_id']
            file = characters.asset_path(registry, opaque, paths)
            self.assertEqual(file.name, 'reference_01.png')
            self.assertIsNone(characters.asset_path(registry, 'TESTMEMBERNAME_NURSE', paths), 'the member folder id is not an address')
            hidden = json.loads(json.dumps(registry))
            next(c for c in hidden['characters'] if c['character_id'] == opaque)['public_visibility'] = False
            self.assertIsNone(characters.asset_path(hidden, opaque, paths))

    def test_tampered_authorities_are_refused_not_repaired(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = authorities(tmp, tamper=True)
            registry = characters.build_registry(paths, CONFIG)
            self.assertIsNone(characters.asset_path(registry, 'GOOSE_EGG', paths), 'image hash mismatch')
            self.assertIsNone(characters.asset_path(registry, registry['goosebaby']['entries'][1]['goosebaby_id'], paths))
            (paths['member_library'] / 'MEMBER_CHARACTER_REGISTRY_V1.json').write_text('{"characters": []}', encoding='utf-8')
            broken = characters.build_registry(paths, CONFIG)
        self.assertEqual(next(s for s in broken['sources'] if s['id'] == 'ASSET-08_MEMBER_CHARACTER_LIBRARY')['status'], 'UNAVAILABLE')
        self.assertFalse(any(c['source_authority'] == 'ASSET-08' for c in broken['characters']))


class Routes(unittest.TestCase):
    def test_offline_portrait_requires_current_authority_and_matching_source(self):
        from renguin_world import routes
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source = folder / 'source.png'
            source.write_bytes(b'original-authority-bytes')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            derivative = folder / f'{digest}-96.webp'
            derivative.write_bytes(b'offline-derivative-bytes')
            client = self.app(tmp)
            with patch.object(routes, 'PORTRAITS', folder), patch.object(routes, '_character_file', return_value=source):
                response = client.get('/api/world/character-thumb/TEST?s=96')
                self.assertEqual(response.data, b'offline-derivative-bytes')
                self.assertEqual(response.mimetype, 'image/webp')
                self.assertEqual(response.headers['X-World-Art'], 'offline-derivative')
                response.close()
                source.write_bytes(b'changed-source-with-no-derivative')
                response = client.get('/api/world/character-thumb/TEST?s=96')
                self.assertEqual(response.data, source.read_bytes())
                self.assertEqual(response.headers['X-World-Art'], 'original-needs-offline-build')
                response.close()
            with patch.object(routes, 'PORTRAITS', folder), patch.object(routes, '_character_file', return_value=None):
                self.assertEqual(client.get('/api/world/character-thumb/TEST?s=96').status_code, 404)

    def app(self, tmp):
        import creator_history
        app = Flask('world-test')
        app.config['USER_PRESENTATION_ROOT'] = str(Path(tmp) / 'user-presentation')
        app.register_blueprint(creator_history.bp)
        return app.test_client()

    def test_importing_the_office_blueprint_loads_no_world_code(self):
        import subprocess
        code = ('import sys; sys.path.insert(0, "backend"); import creator_history; '
                'print(sorted(m for m in sys.modules if m.startswith("renguin_world")))')
        out = subprocess.run([sys.executable, '-c', code], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        self.assertEqual(out.strip(), "['renguin_world', 'renguin_world.routes']")

    def test_page_simulation_characters_and_state(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ', {'RENGUIN_WORLD_RUNTIME_ROOT': str(Path(tmp) / 'rt')}):
            paths = authorities(tmp)
            client = self.app(tmp)
            page = client.get('/world')
            self.assertEqual(page.status_code, 200)
            self.assertNotIn('{{WORLD_VERSION}}', page.get_data(as_text=True))
            self.assertIn('no-cache', client.get('/world').headers.get('Cache-Control', 'no-cache'))
            slice_page = client.get('/world/seamless')
            self.assertEqual(slice_page.status_code, 200)
            body = slice_page.get_data(as_text=True)
            self.assertNotIn('{{WORLD_VERSION}}', body)
            self.assertIn('/static/world/seamless-app.js?v=', body)
            with patch('renguin_world.characters.default_paths', return_value=paths):
                service._registry.update(value=None)
                sim = client.get('/api/world/simulate?contents=50&idle=20').get_json()
                self.assertEqual((sim['source'], sim['audience'], sim['activity']['state']), ('MOCK', 'public', 'DORMANT'))
                self.assertNotIn('MOCK-0', json.dumps(sim))
                self.assertEqual(client.get('/api/world/simulate?contents=999').status_code, 400)
                self.assertEqual(client.get('/api/world/simulate?contents=abc').status_code, 400)
                roster = client.get('/api/world/characters').get_json()
                self.assertFalse(any('path' in s for s in roster['sources']))
                self.assertEqual(client.get('/api/world/character-thumb/NOPE').status_code, 404)
                private = roster['goosebaby']['entries'][1]['goosebaby_id']
                self.assertNotIn('TESTMEMBERNAME', json.dumps(roster, ensure_ascii=False))
                response = client.get(f'/api/world/character-asset/{private}')
                self.assertEqual((response.status_code, response.mimetype), (200, 'image/png'))
                response.close()
                self.assertEqual(client.get('/api/world/character-asset/TESTMEMBERNAME_NURSE').status_code, 404)
                with patch('creator_history.snapshot', side_effect=RuntimeError('PRODUCER_UNAVAILABLE')):
                    live = client.get('/api/world/state').get_json()
                    cached = client.get('/api/world/state').get_json()
            service._registry.update(value=None)
            self.assertFalse((Path(tmp) / 'user-presentation').exists(), 'the world never creates the user store')
            self.assertTrue((Path(tmp) / 'rt' / 'cache' / 'world_state.json').is_file())
        self.assertEqual(live['activity']['state'], 'EMPTY_WORLD', 'no store and no ledger: an empty world, not invented data')
        self.assertEqual({s['id']: s['status'] for s in live['sources']}['CONTENT_OS_LEDGER'], 'SYNC_ERROR')
        self.assertFalse(live['cache']['hit'])
        self.assertTrue(cached['cache']['hit'], 'the precomputed state is reused inside its TTL')


class OfflineDerivatives(unittest.TestCase):
    def test_only_the_border_connected_canvas_is_keyed(self):
        sys.path.insert(0, str(ROOT / 'scripts'))
        import build_world_thumbnails as build
        from PIL import Image, ImageDraw
        for kind, canvas_colour in (('white', (254, 254, 254, 255)), ('green', (10, 245, 20, 255))):
            image = Image.new('RGBA', (60, 60), canvas_colour)
            draw = ImageDraw.Draw(image)
            draw.ellipse((10, 10, 50, 50), fill=(255, 255, 255, 255), outline=(20, 20, 30, 255), width=3)
            self.assertEqual(build.canvas(image), kind)
            keyed = build.key_canvas(image, kind)
            self.assertEqual(keyed.getpixel((1, 1))[3], 0, 'canvas at the border becomes transparent')
            self.assertEqual(keyed.getpixel((30, 30)), (255, 255, 255, 255), 'white inside the outline is the character: untouched')
            self.assertEqual(keyed.getpixel((30, 11)), image.getpixel((30, 11)), 'outline pixels keep their colour')
        self.assertIsNone(build.canvas(Image.new('RGBA', (20, 20), (0, 0, 0, 0))), 'transparent art is never keyed')

    def test_member_icon_files_map_only_with_artwork_and_profile_evidence(self):
        sys.path.insert(0, str(ROOT / 'scripts'))
        import build_world_thumbnails as build
        from PIL import Image, ImageDraw

        def art(shape, colour):
            image = Image.new('RGBA', (80, 100), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            if shape == 'round':
                draw.ellipse((10, 10, 70, 95), fill=colour, outline=(20, 20, 30, 255), width=3)
            else:
                draw.rectangle((5, 40, 75, 95), fill=colour, outline=(20, 20, 30, 255), width=3)
                draw.polygon([(5, 40), (40, 2), (75, 40)], fill=(30, 30, 40, 255))
            return build.signature(build.prepared(image))

        nurse = {'character_id': 'MEMBER_AVATAR_NURSE', 'signature': art('round', (140, 220, 190, 255)), 'evidence': '甲甲（護理師） 會員化身／護理師公企鵝'}
        baker = {'character_id': 'MEMBER_AVATAR_BAKER', 'signature': art('house', (120, 80, 50, 255)), 'evidence': '乙乙（烘焙門市） 會員化身／烘焙門市公企鵝'}
        icons = [
            {'stem': '甲甲(護理師)', 'sha256': 'a' * 64, 'signature': art('round', (140, 220, 190, 255))},
            {'stem': '丙丙(護理師)', 'sha256': 'b' * 64, 'signature': art('house', (240, 60, 60, 255))},
            {'stem': '無關檔名', 'sha256': 'c' * 64, 'signature': art('house', (120, 80, 50, 255))},
            {'stem': '甲甲(護理師)', 'sha256': 'd' * 64, 'signature': art('square', (10, 10, 200, 255))},
        ]
        rows = {r['icon_sha256'][0]: r for r in build.match_member_icons(icons, [nurse, baker], CONFIG)}
        self.assertEqual((rows['a']['status'], rows['a']['character_id']), ('MATCHED', 'MEMBER_AVATAR_NURSE'))
        self.assertEqual(rows['b']['status'], 'UNRESOLVED', 'same profession, different artwork: never guessed')
        self.assertEqual((rows['c']['status'], rows['c']['reason']), ('UNRESOLVED', 'ARTWORK_MATCH_WITHOUT_PROFILE_EVIDENCE'),
                         'matching artwork with no profile evidence in the name stays unresolved')
        self.assertEqual(rows['d']['status'], 'UNRESOLVED', 'a file name alone maps nothing')
        text = json.dumps(list(rows.values()), ensure_ascii=False)
        self.assertNotIn('甲甲', text)
        twice = build.match_member_icons([icons[0], {**icons[0], 'sha256': 'e' * 64}], [nurse, baker], CONFIG)
        self.assertTrue(all(r['status'] == 'UNRESOLVED' and r['reason'] == 'SEVERAL_FILES_CLAIM_ONE_CHARACTER' for r in twice))

    def test_registry_reports_icon_mapping_without_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = authorities(tmp)
            registry = characters.build_registry(paths, CONFIG)
            opaque = next(g for g in registry['goosebaby']['entries'] if g['member_class'] == 'REAL_MEMBER_AVATAR')['goosebaby_id']
            mapping = Path(tmp) / 'member-icons.json'
            mapping.write_text(json.dumps({'status': 'OK', 'files': [
                {'icon_sha256': '1' * 64, 'status': 'MATCHED', 'character_id': opaque},
                {'icon_sha256': '2' * 64, 'status': 'UNRESOLVED', 'character_id': None, 'reason': 'ARTWORK_MATCHES_NO_AUTHORITY_CHARACTER'}]}), encoding='utf-8')
            registry = characters.build_registry({**paths, 'member_icon_map': mapping, 'member_icons': Path(tmp)}, CONFIG)
        source = next(s for s in registry['sources'] if s['id'] == 'MEMBER_ICON_FOLDER')
        self.assertEqual((source['count'], source['matched'], source['unresolved']), (2, 1, 1))
        self.assertEqual(next(c for c in registry['characters'] if c['character_id'] == opaque)['render_source'], 'MEMBER_ICON_FOLDER')
        report = characters.resolution_report(registry)
        self.assertIn('MEMBER_ICON_222222222222', [r['id'] for r in report['rows'] if r['resolution'] == 'UNRESOLVED'])


class YouTubePopularity(unittest.TestCase):
    def test_without_a_key_the_layer_is_gated_and_the_world_still_builds(self):
        from renguin_world import youtube_adapter
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ', {}, clear=False):
            import os
            os.environ.pop('YOUTUBE_API_KEY', None)
            self.assertEqual(youtube_adapter.load(tmp)['status'], 'GATED')
            self.assertEqual(youtube_adapter.sync(tmp, ['abcdefghijk'], fetch=lambda url: self.fail('no network without a key'))['status'], 'GATED')
            self.assertFalse(any(Path(tmp).iterdir()))

    def test_sync_saves_counts_and_never_keeps_the_key(self):
        from renguin_world import youtube_adapter
        calls = []

        def fake(url):
            calls.append(url)
            return {'items': [{'id': 'abcdefghijk', 'statistics': {'viewCount': '123456'}, 'snippet': {'publishedAt': '2026-09-01T00:00:00Z'}},
                              {'id': 'not-requested', 'statistics': {'viewCount': '9'}}]}
        with tempfile.TemporaryDirectory() as tmp:
            result = youtube_adapter.sync(tmp, ['abcdefghijk', 'bad id', None], api_key='SECRET-KEY', fetch=fake)
            saved = (Path(tmp) / youtube_adapter.FILE).read_text(encoding='utf-8')
            loaded = youtube_adapter.load(tmp)
        self.assertEqual((result['status'], result['synced']), ('OK', 1))
        self.assertEqual(len(calls), 1)
        self.assertNotIn('SECRET-KEY', saved)
        self.assertEqual(loaded['videos']['abcdefghijk']['view_count'], 123456)
        self.assertNotIn('not-requested', loaded['videos'])


if __name__ == '__main__':
    unittest.main()
