"""World Character Registry, Goosebaby Registry and Civilian Registry.

A derived, minimal view over authorities that already exist. It copies no
appearance text and draws no character: every entry points back to its source
(ASSET-01 general canon index, ASSET-08 Member Character Library, the Office
resident manifest) with that source's hash, and the world renders the
authority's own image or, where none may be shown, a neutral token.

Real-member avatars carry private identity. The World layer addresses them by
an opaque id and a profession title; their names never leave the authority.
Member population is aggregated to counts per tier; no member row is copied.
"""
import hashlib
import json
import os
from pathlib import Path

SCHEMA = 'RENGUIN_WORLD_CHARACTER_REGISTRY_V1'
TIER_WORDS = ('Platinum', 'Gold', 'Silver', 'Bronze')
MAPPING = {'已綁定': 'BOUND', '高信心候選': 'CANDIDATE', '待綁定': 'UNBOUND'}


def default_paths(frontend_dir):
    producer = Path(os.environ.get('RENGUIN_PRODUCER_ROOT', r'E:\Renguin_AISystem\Content_OS'))
    bible = Path(os.environ.get('RENGUIN_CHARACTER_BIBLE_ROOT', r'E:\Renguin_AISystem\Character_Bible'))
    world = Path(os.environ.get('RENGUIN_WORLD_DATA_ROOT', r'E:\Renguin_AISystem\Renguin_World\01_Data'))
    return {
        'general_index': Path(os.environ.get('RENGUIN_GENERAL_CANON_INDEX', producer / '10_AI_Editorial_Engine/06_Local_Runner/image_generation/config/GENERAL_CHARACTER_CANON_INDEX.json')),
        'member_library': bible / 'Member_Character_Library',
        'member_registry': world / 'member_registry.json',
        'frontend': Path(frontend_dir),
    }


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def _json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def _report(source_id, path, **extra):
    return {'id': source_id, 'path': str(path), **extra}


def _static_file(frontend, ref):
    if not ref or not ref.startswith('/static/'):
        return None
    path = (Path(frontend) / ref[len('/static/'):]).resolve()
    return path if path.is_file() and path.is_relative_to(Path(frontend).resolve()) else None


def _general(paths, config, reports):
    roles = config['characters']
    path = paths['general_index']
    try:
        index = _json(path)
        assert index.get('schema_version') == 'GENERAL_CHARACTER_CANON_INDEX_V1'
    except (OSError, ValueError, AssertionError) as error:
        reports.append(_report('ASSET-01_GENERAL_CANON_INDEX', path, status='UNAVAILABLE', detail=type(error).__name__, count=0))
        return [], set()
    authority = index.get('authority') or {}
    reports.append(_report('ASSET-01_GENERAL_CANON_INDEX', path, status='OK', count=len(index['characters']),
                           sha256=sha256_file(path), authority_ref=authority.get('authority_ref'),
                           authority_version=authority.get('version'), authority_sha256=authority.get('sha256')))
    residents = roles['office_residents']
    manifest = {}
    try:
        for row in _json(Path(paths['frontend']) / residents['manifest']):
            manifest[row['name']] = residents['asset_root'] + row['file']
    except (OSError, ValueError, KeyError):
        pass
    resident_asset = {cid: manifest[name] for name, cid in residents['aliases'].items() if name in manifest}
    entries, known = [], set()
    for c in index['characters']:
        cid = c['character_id']
        base = roles['defaults'].get(c.get('entity_type'), roles['defaults']['BASE_CHARACTER'])
        role = roles['general'].get(cid, {})
        asset = role.get('asset_ref') or (resident_asset.get(cid) if c.get('entity_type') == 'BASE_CHARACTER' else None)
        asset_file = _static_file(paths['frontend'], asset)
        entries.append({
            'character_id': cid,
            'display_name': c.get('chinese_name') or c.get('canonical_name') or cid,
            'character_type': role.get('character_type', base['character_type']),
            'source_authority': 'ASSET-01',
            'source_ref': {'index_character_id': cid, 'entity_type': c.get('entity_type'),
                           'authority_version': authority.get('version')},
            'asset_ref': asset if asset_file else None,
            'asset_bytes': asset_file.stat().st_size if asset_file else None,
            'default_district': role.get('default_district') or roles['guest_districts'].get(cid) or base['default_district'],
            'public_visibility': role.get('public_visibility', base.get('public_visibility', True)),
            'allowed_states': role.get('allowed_states', base['allowed_states']),
            'allowed_actions': role.get('allowed_actions', base['allowed_actions']),
            'dialogue_pool': role.get('dialogue_pool') or ([cid] if cid in config['gossip']['pools']['CHARACTER_SPECIFIC'] else []),
            'special_flags': sorted(role['special_flags'] if 'special_flags' in role else base.get('special_flags', [])),
        })
        known.add(cid)
    for name, ref in sorted(manifest.items()):
        if name in residents['aliases'] or name in residents['not_characters']:
            continue
        base = roles['defaults']['OFFICE_RESIDENT_ONLY']
        asset_file = _static_file(paths['frontend'], ref)
        entries.append({
            'character_id': 'OFFICE_RESIDENT_' + Path(ref).stem.upper().replace('-', '_'),
            'display_name': name, 'character_type': base['character_type'],
            'source_authority': 'STAR_OFFICE_RESIDENT_MANIFEST',
            'source_ref': {'manifest': residents['manifest'], 'name': name},
            'asset_ref': ref if asset_file else None, 'asset_bytes': asset_file.stat().st_size if asset_file else None,
            'default_district': base['default_district'], 'public_visibility': base['public_visibility'],
            'allowed_states': base['allowed_states'], 'allowed_actions': base['allowed_actions'],
            'dialogue_pool': [], 'special_flags': base['special_flags'],
        })
    return entries, known


def profession_of(text, config):
    for key, spec in config['characters']['professions'].items():
        if any(word in str(text or '') for word in spec['match']):
            return key
    return None


def _members(paths, config, reports):
    roles = config['characters']
    root = paths['member_library']
    try:
        manifest = _json(root / 'MEMBER_CHARACTER_LIBRARY_MANIFEST_V1.json')
        registry_path = root / manifest['registry']
        digest = sha256_file(registry_path)
        if digest != manifest.get('registry_sha256'):
            raise ValueError('REGISTRY_SHA256_MISMATCH')
        registry = _json(registry_path)
    except (OSError, ValueError, KeyError) as error:
        reports.append(_report('ASSET-08_MEMBER_CHARACTER_LIBRARY', root, status='UNAVAILABLE', detail=str(error) if 'MISMATCH' in str(error) else type(error).__name__, count=0))
        return [], []
    reports.append(_report('ASSET-08_MEMBER_CHARACTER_LIBRARY', root, status='OK', count=len(registry['characters']),
                           registry_sha256=digest, authority_version=manifest.get('authority_version')))
    characters, geese = [], []
    for c in registry['characters']:
        if c.get('member_class') == 'MEMBER_WORLD_NPC' and c.get('identity_is_private') is False:
            npc = roles['member_world_npc'].get(c['character_id'], {'world_role': '會員區居民', 'district': 'MEMBER_DISTRICT', 'min_era': 'ERA_01'})
            profile = root / c['profile_path']
            reference = profile.parent / 'reference_01.png'
            asset = '/api/world/character-asset/' + c['character_id'] if reference.is_file() else None
            characters.append({
                'character_id': c['character_id'], 'display_name': c.get('chinese') or c['display_name'],
                'character_type': 'GOOSEBABY', 'source_authority': 'ASSET-08',
                'source_ref': {'member_class': c['member_class'], 'profile_sha256': c.get('profile_sha256')},
                'asset_ref': asset, 'asset_bytes': reference.stat().st_size if asset else None,
                'default_district': npc['district'], 'public_visibility': True, 'min_era': npc['min_era'],
                'allowed_states': ['IDLE', 'WALKING', 'CELEBRATING'], 'allowed_actions': ['wave'],
                'dialogue_pool': [], 'special_flags': ['MEMBER_WORLD_NPC'],
            })
            geese.append({'goosebaby_id': c['character_id'], 'display_name': c.get('chinese') or c['display_name'],
                          'avatar_name': None, 'profession': None, 'world_role': npc['world_role'],
                          'district': npc['district'], 'asset_ref': asset, 'public_visibility': True,
                          'status': c.get('status'), 'member_class': 'MEMBER_WORLD_NPC',
                          'notes': '會員角色庫的鵝寶世界角色（公開設定）'})
        elif c.get('member_class') == 'REAL_MEMBER_AVATAR':
            key = profession_of(c.get('role'), config)
            spec = roles['professions'].get(key) or {'label': '居民', 'district': 'MEMBER_DISTRICT', 'min_era': 'ERA_01'}
            opaque = 'MEMBER_AVATAR_' + str(c.get('profile_sha256') or hashlib.sha256(c['character_id'].encode()).hexdigest())[:12].upper()
            label = spec['label'] + '鵝寶'
            characters.append({
                'character_id': opaque, 'display_name': label, 'character_type': 'GOOSEBABY',
                'source_authority': 'ASSET-08',
                'source_ref': {'member_class': 'REAL_MEMBER_AVATAR', 'identity': 'PRIVATE'},
                'asset_ref': None, 'asset_bytes': None, 'default_district': spec['district'],
                'public_visibility': True, 'min_era': spec['min_era'],
                'allowed_states': ['IDLE', 'WALKING', 'WORKING', 'CELEBRATING'], 'allowed_actions': ['wave', 'work'],
                'dialogue_pool': ['PROFESSION:' + key] if key else [],
                'special_flags': ['REAL_MEMBER_AVATAR', 'IDENTITY_PRIVATE', 'TOKEN_PLACEHOLDER'],
            })
            geese.append({'goosebaby_id': opaque, 'display_name': label, 'avatar_name': None,
                          'profession': key, 'world_role': spec['label'] + '（具名平民鵝寶）',
                          'district': spec['district'], 'asset_ref': None, 'public_visibility': True,
                          'status': 'UNKNOWN', 'member_class': 'REAL_MEMBER_AVATAR',
                          'notes': '真人會員化身：身分保密，世界中只顯示職業'})
    return characters, geese


def _population(paths, config, geese, reports):
    path = paths['member_registry']
    try:
        data = _json(path)
        members = data['members']
    except (OSError, ValueError, KeyError) as error:
        reports.append(_report('RENGUIN_WORLD_MEMBER_REGISTRY', path, status='UNAVAILABLE', detail=type(error).__name__, count=0))
        return None
    tiers = {}
    for member in members:
        label = str(member.get('current_tier') or '')
        word = next((w for w in TIER_WORDS if w.lower() in label.lower()), 'OTHER')
        tiers[word.upper()] = tiers.get(word.upper(), 0) + 1
    status_by_profession = {}
    for avatar in data.get('avatar_registry') or []:
        key = profession_of(avatar.get('occupation'), config)
        if key:
            status_by_profession[key] = MAPPING.get(avatar.get('mapping_status'), 'UNKNOWN')
    for goose in geese:
        if goose['member_class'] == 'REAL_MEMBER_AVATAR' and goose['profession'] in status_by_profession:
            goose['status'] = status_by_profession[goose['profession']]
    reports.append(_report('RENGUIN_WORLD_MEMBER_REGISTRY', path, status='OK', count=len(members),
                           snapshot_at=data.get('snapshot_at'), aggregate_only=True))
    return {'total': len(members), 'by_tier': dict(sorted(tiers.items())), 'snapshot_at': data.get('snapshot_at'),
            'source': 'RENGUIN_WORLD_MEMBER_REGISTRY', 'aggregate_only': True}


def civilians(config, geese):
    roles = config['characters']
    present = {g['profession'] for g in geese if g.get('profession')}
    rows = []
    for key, spec in roles['professions'].items():
        rows.append({'civilian_id': 'CIVILIAN_' + key, 'profession': key, 'label': spec['label'],
                     'district': spec['district'], 'min_era': spec['min_era'], 'density_group': spec['density_group'],
                     'day': spec['day'], 'night': spec['night'], 'activity_states': ['WALKING', 'WORKING', 'IDLE'],
                     'asset_ref': None, 'render_mode': 'TOKEN',
                     'source': 'ASSET-08_PROFESSION' if key in present else 'WORLD_ARCHETYPE'})
    for key, spec in roles['generic_civilians'].items():
        rows.append({'civilian_id': 'CIVILIAN_' + key, 'profession': key, 'label': spec['label'],
                     'district': spec['district'], 'min_era': spec['min_era'], 'density_group': spec['density_group'],
                     'day': spec['day'], 'night': spec['night'], 'activity_states': ['WALKING', 'IDLE'],
                     'asset_ref': None, 'render_mode': 'TOKEN', 'source': 'WORLD_ARCHETYPE'})
    return rows


def build_registry(paths, config):
    reports = []
    general, _ = _general(paths, config, reports)
    members, geese = _members(paths, config, reports)
    population = _population(paths, config, geese, reports)
    return {
        'schema': SCHEMA,
        'authority_role': 'DERIVED_VIEW_NOT_AN_AUTHORITY',
        'sources': reports,
        'characters': general + members,
        'goosebaby': {'schema': 'RENGUIN_WORLD_GOOSEBABY_REGISTRY_V1', 'entries': geese, 'population': population},
        'civilians': civilians(config, geese),
    }


def asset_path(registry, character_id, paths):
    """Resolve a character image to a file on disk, only for entries the registry lists."""
    entry = next((c for c in registry['characters'] if c['character_id'] == character_id), None)
    if not entry or not entry.get('asset_ref') or entry.get('public_visibility') is not True:
        return None
    ref = entry['asset_ref']
    if ref.startswith('/static/'):
        return _static_file(paths['frontend'], ref)
    if ref.startswith('/api/world/character-asset/') and entry['source_authority'] == 'ASSET-08':
        root = paths['member_library']
        profile_path = root / 'avatars' / character_id / 'profile.json'
        try:
            profile = _json(profile_path)
            reference = next(a for a in profile['reference_assets'] if a['filename'] == 'reference_01.png')
            file = profile_path.parent / reference['filename']
            if profile.get('member_class') != 'MEMBER_WORLD_NPC' or profile.get('identity_is_private') is not False:
                return None
            if sha256_file(file) != reference['sha256']:
                return None
            return file
        except (OSError, ValueError, KeyError, StopIteration):
            return None
    return None
