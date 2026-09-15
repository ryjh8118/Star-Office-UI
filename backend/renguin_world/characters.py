"""World Character Registry, Goosebaby Registry and Civilian Registry.

A derived, minimal view over authorities that already exist. It copies no
appearance text and draws no character: every entry points back to its source
(ASSET-01 general canon index, ASSET-08 Member Character Library, the Office
resident manifest) with that source's hash, and the world renders the
authority's own image or, where none may be shown, a neutral token.

Real-member avatars carry private identity. The World layer addresses them by
an opaque id and a profession title; their names never leave the authority.
Their official art is the profession resident's look (ASSET-08's own cameo
rule asks for them to be clearly recognisable), so it is served by that opaque
id after the profile hash is re-verified. Member population is aggregated to
counts per tier; no member row is copied.

Every resident carries a `resolution`, the World's display policy in one word:
CANONICAL_CHARACTER (the authority's own character image), PROFESSION_CHARACTER
(an existing 鵝寶居民 profession character), NEUTRAL_PLACEHOLDER (no authority
character exists for this role), UNRESOLVED (an image exists but no authority
confirms who it is: hidden, never guessed) or EVENT_SKIN (a transformation
form that shares its source's single instance, not a resident).
"""
import hashlib
import json
import os
from pathlib import Path

SCHEMA = 'RENGUIN_WORLD_CHARACTER_REGISTRY_V1'
TIER_WORDS = ('Platinum', 'Gold', 'Silver', 'Bronze')
MAPPING = {'已綁定': 'BOUND', '高信心候選': 'CANDIDATE', '待綁定': 'UNBOUND'}
RESOLUTIONS = ('CANONICAL_CHARACTER', 'PROFESSION_CHARACTER', 'NEUTRAL_PLACEHOLDER', 'UNRESOLVED', 'EVENT_SKIN')
# Name-free reference mapping written by scripts/build_world_thumbnails.py from the member icon folder.
MEMBER_ICON_MAP = 'member-icons.json'
PRIVATE_ART = Path(__file__).resolve().parent / 'art' / 'portraits-private'


def default_paths(frontend_dir):
    producer = Path(os.environ.get('RENGUIN_PRODUCER_ROOT', r'E:\Renguin_AISystem\Content_OS'))
    bible = Path(os.environ.get('RENGUIN_CHARACTER_BIBLE_ROOT', r'E:\Renguin_AISystem\Character_Bible'))
    world = Path(os.environ.get('RENGUIN_WORLD_DATA_ROOT', r'E:\Renguin_AISystem\Renguin_World\01_Data'))
    return {
        'general_index': Path(os.environ.get('RENGUIN_GENERAL_CANON_INDEX', producer / '10_AI_Editorial_Engine/06_Local_Runner/image_generation/config/GENERAL_CHARACTER_CANON_INDEX.json')),
        'member_library': bible / 'Member_Character_Library',
        'member_registry': world / 'member_registry.json',
        # READ-ONLY official 鵝寶會員 cut-outs; only the offline builder opens it.
        'member_icons': Path(os.environ.get('RENGUIN_MEMBER_ICON_ROOT', r'E:\素材\icon\鵝寶會員')),
        'member_icon_map': PRIVATE_ART / MEMBER_ICON_MAP,
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
        form = c.get('entity_type') == 'TRANSFORMATION_FORM'
        entries.append({
            'resolution': 'EVENT_SKIN' if form else 'CANONICAL_CHARACTER' if asset_file else 'NEUTRAL_PLACEHOLDER',
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
            'resolution': 'UNRESOLVED',
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


def _library(root):
    """The member registry, only while its manifest still vouches for it."""
    manifest = _json(root / 'MEMBER_CHARACTER_LIBRARY_MANIFEST_V1.json')
    registry_path = root / manifest['registry']
    digest = sha256_file(registry_path)
    if digest != manifest.get('registry_sha256'):
        raise ValueError('REGISTRY_SHA256_MISMATCH')
    return manifest, _json(registry_path), digest


def opaque_member_id(row):
    return 'MEMBER_AVATAR_' + str(row.get('profile_sha256') or hashlib.sha256(row['character_id'].encode()).hexdigest())[:12].upper()


def _reference(profile_path):
    """The authority's first reference image and its recorded hash; nothing else is read from the profile."""
    try:
        profile = _json(profile_path)
        reference = profile['reference_assets'][0]
        file = profile_path.parent / Path(reference['filename']).name
        return profile, file if file.is_file() else None, reference.get('sha256')
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return None, None, None


def _members(paths, config, reports):
    roles = config['characters']
    root = paths['member_library']
    try:
        manifest, registry, digest = _library(root)
    except (OSError, ValueError, KeyError) as error:
        reports.append(_report('ASSET-08_MEMBER_CHARACTER_LIBRARY', root, status='UNAVAILABLE', detail=str(error) if 'MISMATCH' in str(error) else type(error).__name__, count=0))
        return [], []
    reports.append(_report('ASSET-08_MEMBER_CHARACTER_LIBRARY', root, status='OK', count=len(registry['characters']),
                           registry_sha256=digest, authority_version=manifest.get('authority_version')))
    characters, geese = [], []
    for c in registry['characters']:
        if c.get('member_class') == 'MEMBER_WORLD_NPC' and c.get('identity_is_private') is False:
            npc = roles['member_world_npc'].get(c['character_id'], {'world_role': '會員區居民', 'district': 'MEMBER_DISTRICT', 'min_era': 'ERA_01'})
            _, reference, _ = _reference(root / c['profile_path'])
            asset = '/api/world/character-asset/' + c['character_id'] if reference else None
            characters.append({
                'resolution': 'CANONICAL_CHARACTER' if asset else 'NEUTRAL_PLACEHOLDER',
                'world_role': npc['world_role'],
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
            opaque = opaque_member_id(c)
            label = spec['label'] + '鵝寶'
            _, reference, _ = _reference(root / c['profile_path'])
            # A profession resident without a profession match cannot claim one: shown only as a placeholder.
            asset = '/api/world/character-asset/' + opaque if reference and key else None
            resolution = 'PROFESSION_CHARACTER' if asset else 'UNRESOLVED' if not key else 'NEUTRAL_PLACEHOLDER'
            characters.append({
                'resolution': resolution, 'profession': key, 'world_role': spec['label'] + '居民',
                'character_id': opaque, 'display_name': label, 'character_type': 'GOOSEBABY',
                'source_authority': 'ASSET-08',
                'source_ref': {'member_class': 'REAL_MEMBER_AVATAR', 'identity': 'PRIVATE'},
                'asset_ref': asset, 'asset_bytes': reference.stat().st_size if asset else None,
                'default_district': spec['district'],
                'public_visibility': bool(key), 'min_era': spec['min_era'],
                'allowed_states': ['IDLE', 'WALKING', 'WORKING', 'CELEBRATING'], 'allowed_actions': ['wave', 'work'],
                'dialogue_pool': ['PROFESSION:' + key] if key else [],
                'special_flags': ['REAL_MEMBER_AVATAR', 'IDENTITY_PRIVATE', 'PROFESSION_RESIDENT'],
            })
            geese.append({'goosebaby_id': opaque, 'display_name': label, 'avatar_name': None,
                          'profession': key, 'world_role': spec['label'] + '（具名平民鵝寶）',
                          'district': spec['district'], 'asset_ref': asset, 'public_visibility': bool(key),
                          'status': 'UNKNOWN', 'member_class': 'REAL_MEMBER_AVATAR',
                          'notes': '真人會員化身：身分保密，世界中只顯示職業與正式職業造型'})
    return characters, geese


def member_profile_text(paths, character_id, registry):
    """Profile name and role of an ASSET-08 character, for in-memory evidence only; never stored."""
    entry = next((c for c in registry['characters'] if c['character_id'] == character_id), None)
    if not entry or entry.get('source_authority') != 'ASSET-08':
        return ''
    root = paths['member_library']
    try:
        if (entry.get('source_ref') or {}).get('member_class') == 'REAL_MEMBER_AVATAR':
            _, library, _ = _library(root)
            row = next(r for r in library['characters'] if r.get('member_class') == 'REAL_MEMBER_AVATAR' and opaque_member_id(r) == character_id)
            profile_path = root / row['profile_path']
        else:
            profile_path = root / 'avatars' / character_id / 'profile.json'
        profile = _json(profile_path)
    except (OSError, ValueError, KeyError, StopIteration):
        return ''
    return ' '.join(str(profile.get(k) or '') for k in ('chinese', 'display_name', 'role'))


def _member_icons(paths, entries, reports):
    """Attach the offline icon mapping: which characters render from the official cut-outs, which files stay unresolved."""
    if 'member_icon_map' not in paths:
        return []
    path = paths['member_icon_map']
    if not path or not Path(path).is_file():
        reports.append(_report('MEMBER_ICON_FOLDER', paths.get('member_icons') or '', status='NONE', count=0))
        return []
    try:
        mapping = _json(path)
        files = mapping['files']
    except (OSError, ValueError, KeyError, TypeError):
        reports.append(_report('MEMBER_ICON_FOLDER', paths.get('member_icons') or '', status='ERROR', count=0))
        return []
    known = {e['character_id']: e for e in entries}
    matched = [f for f in files if f.get('status') == 'MATCHED' and f.get('character_id') in known]
    for f in matched:
        known[f['character_id']]['render_source'] = 'MEMBER_ICON_FOLDER'
    unresolved = [{'asset_id': 'MEMBER_ICON_' + str(f.get('icon_sha256', ''))[:12].upper(), 'resolution': 'UNRESOLVED',
                   'reason': f.get('reason') or 'UNRESOLVED'} for f in files if f not in matched]
    reports.append(_report('MEMBER_ICON_FOLDER', paths.get('member_icons') or '', status=mapping.get('status', 'OK'),
                           count=len(files), matched=len(matched), unresolved=len(unresolved)))
    return unresolved


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
    """Crowd roles. A profession role points at its one profession character; it never copies it.

    ASSET-08 forbids duplicating a character, so the crowd on the street stays
    anonymous: a profession is represented by its single resident, and a role
    with no authority character is a neutral placeholder.
    """
    roles = config['characters']
    present = {g['profession']: g for g in geese if g.get('profession') and g.get('asset_ref')}
    rows = []
    for key, spec in roles['professions'].items():
        ref = present.get(key)
        rows.append({'civilian_id': 'CIVILIAN_' + key, 'profession': key, 'label': spec['label'],
                     'district': spec['district'], 'min_era': spec['min_era'], 'density_group': spec['density_group'],
                     'day': spec['day'], 'night': spec['night'], 'activity_states': ['WALKING', 'WORKING', 'IDLE'],
                     'asset_ref': None, 'render_mode': 'CHARACTER_REF' if ref else 'TOKEN',
                     'character_ref': ref['goosebaby_id'] if ref else None,
                     'resolution': 'PROFESSION_CHARACTER' if ref else 'NEUTRAL_PLACEHOLDER',
                     'source': 'ASSET-08_PROFESSION' if key in {g['profession'] for g in geese} else 'WORLD_ARCHETYPE'})
    for key, spec in roles['generic_civilians'].items():
        rows.append({'civilian_id': 'CIVILIAN_' + key, 'profession': key, 'label': spec['label'],
                     'district': spec['district'], 'min_era': spec['min_era'], 'density_group': spec['density_group'],
                     'day': spec['day'], 'night': spec['night'], 'activity_states': ['WALKING', 'IDLE'],
                     'asset_ref': None, 'render_mode': 'TOKEN', 'character_ref': None,
                     'resolution': 'NEUTRAL_PLACEHOLDER', 'source': 'WORLD_ARCHETYPE'})
    return rows


def resolution_report(registry):
    """Counts for the character acceptance report. GENERIC_WRONG_CHARACTER is any
    visible resident drawn as a placeholder while its authority has an image."""
    counts = {k: 0 for k in ('TOTAL_RESIDENTS', 'CANONICAL_CHARACTER', 'PROFESSION_CHARACTER', 'NEUTRAL_PLACEHOLDER',
                             'UNRESOLVED', 'GENERIC_WRONG_CHARACTER')}
    imaged = {c.get('profession') for c in registry.get('characters') or [] if c.get('profession') and c.get('asset_ref')}
    rows = []
    for c in registry.get('characters') or []:
        if c.get('resolution') == 'EVENT_SKIN':
            continue
        # Evidence is independent of the resolution: an image the authority serves, or a reference file on disk.
        wrong = c['resolution'] in ('NEUTRAL_PLACEHOLDER',) and bool(c.get('asset_ref') or c.get('asset_bytes'))
        rows.append({'id': c['character_id'], 'resolution': c['resolution'], 'label': c.get('display_name'), 'wrong': wrong})
    for c in registry.get('civilians') or []:
        wrong = c['resolution'] == 'NEUTRAL_PLACEHOLDER' and c['profession'] in imaged
        rows.append({'id': c['civilian_id'], 'resolution': c['resolution'], 'label': c.get('label'), 'wrong': wrong})
    for a in registry.get('unresolved_assets') or []:
        rows.append({'id': a['asset_id'], 'resolution': 'UNRESOLVED', 'label': a['reason'], 'wrong': False})
    for row in rows:
        counts['TOTAL_RESIDENTS'] += 1
        counts[row['resolution']] += 1
        counts['GENERIC_WRONG_CHARACTER'] += row['wrong']
    return {'counts': counts, 'rows': rows}


def build_registry(paths, config):
    reports = []
    general, _ = _general(paths, config, reports)
    members, geese = _members(paths, config, reports)
    unresolved_assets = _member_icons(paths, members, reports)
    population = _population(paths, config, geese, reports)
    return {
        'schema': SCHEMA,
        'authority_role': 'DERIVED_VIEW_NOT_AN_AUTHORITY',
        'sources': reports,
        'characters': general + members,
        'unresolved_assets': unresolved_assets,
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
        member_class = (entry.get('source_ref') or {}).get('member_class')
        try:
            if member_class == 'REAL_MEMBER_AVATAR':
                # The opaque id is re-derived from the vouched registry; the folder name never leaves this function.
                _, library, _ = _library(root)
                row = next(r for r in library['characters']
                           if r.get('member_class') == 'REAL_MEMBER_AVATAR' and opaque_member_id(r) == character_id)
                profile_path = root / row['profile_path']
            else:
                profile_path = root / 'avatars' / character_id / 'profile.json'
            profile, file, expected = _reference(profile_path)
            if not profile or not file or profile.get('member_class') != member_class:
                return None
            if member_class == 'MEMBER_WORLD_NPC' and profile.get('identity_is_private') is not False:
                return None
            if member_class == 'REAL_MEMBER_AVATAR' and profile.get('character_id') != row['character_id']:
                return None
            if sha256_file(file) != expected:
                return None
            return file
        except (OSError, ValueError, KeyError, StopIteration):
            return None
    return None
