"""Renguin World engine: normalized contents + rules -> world_state.

Pure by construction. Nothing here reads a file other than its own rule
registries, touches the network, or looks at the clock: callers pass `now`.
The same contents therefore always build the same world, and time without new
content can only change the activity layer. Score, era, level and buildings are
functions of the contents alone, so a quiet month never takes anything away.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path

SCHEMA = 'RENGUIN_WORLD_STATE_V1'
CONFIG_ROOT = Path(__file__).resolve().parent / 'config'
CONFIG_NAMES = ('rules', 'eras', 'districts', 'tags', 'gossip', 'characters')
CONTENT_FIELDS = ('project_id', 'title', 'content_type', 'status', 'completed_at', 'published_at',
                  'runtime_seconds', 'youtube_video_id', 'series_slug', 'tags', 'world_flags')
# Fields a manual override may set on a content. Anything else is ignored, so an
# override can correct classification but can never smuggle in new structure.
OVERRIDE_FIELDS = {'title', 'content_type', 'status', 'completed_at', 'published_at', 'runtime_seconds',
                   'youtube_video_id', 'series_slug', 'tags', 'world_flags', 'flagship', 'featured',
                   'district', 'exclude', 'view_count'}
DAY = 86400


@lru_cache(maxsize=4)
def _load(root):
    return {name: json.loads((Path(root) / f'{name}.json').read_text(encoding='utf-8')) for name in CONFIG_NAMES}


def load_config(root=CONFIG_ROOT):
    return deepcopy(_load(str(root)))


def parse_time(value):
    if value in (None, ''):
        return None
    if isinstance(value, datetime):
        stamp = value
    else:
        text = str(value).strip().replace('Z', '+00:00')
        try:
            stamp = datetime.fromisoformat(text)
        except ValueError:
            return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc)


def iso(stamp):
    return stamp.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z') if stamp else None


def _digest(*parts):
    return hashlib.sha256('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()


def infer_tags(title, config):
    text = str(title or '').lower()
    return sorted(tag for tag, words in config['tags']['rules'].items() if any(w.lower() in text for w in words))


def normalize_content(raw, config):
    """Map one adapter record onto the content contract; None when it cannot count."""
    rules = config['rules']
    content_type = str(raw.get('content_type') or '').lower()
    status = str(raw.get('status') or '').upper()
    if content_type not in rules['content_types'] or not raw.get('project_id'):
        return None
    tags = [str(t).lower() for t in raw.get('tags') or [] if str(t).strip()]
    tag_source = raw.get('tag_source') or ('SOURCE' if tags else 'INFERRED')
    if not tags:
        tags = infer_tags(raw.get('title'), config)
    flags = sorted({str(f).upper() for f in raw.get('world_flags') or []})
    if raw.get('flagship'):
        flags = sorted(set(flags) | {'FLAGSHIP'})
    runtime = raw.get('runtime_seconds')
    return {
        'content_id': str(raw.get('content_id') or raw['project_id']),
        'project_id': str(raw['project_id']),
        'title': str(raw.get('title') or raw['project_id']),
        'content_type': content_type,
        'status': status,
        'completed_at': iso(parse_time(raw.get('completed_at'))),
        'published_at': iso(parse_time(raw.get('published_at'))),
        'runtime_seconds': int(runtime) if isinstance(runtime, (int, float)) and runtime > 0 else None,
        'youtube_video_id': raw.get('youtube_video_id') or None,
        'series_slug': raw.get('series_slug') or None,
        'tags': sorted(set(tags)),
        'tag_source': tag_source,
        'world_flags': flags,
        'featured': bool(raw.get('featured')),
        'district': raw.get('district') or None,
        'view_count': raw.get('view_count') if isinstance(raw.get('view_count'), int) else None,
        'evidence': raw.get('evidence') or 'UNKNOWN',
    }


def apply_overrides(raw_contents, overrides):
    """Manual corrections as data: classify, exclude, flag, feature or add a content."""
    overrides = overrides or {}
    patches = overrides.get('contents') or {}
    applied = []
    result = []
    for raw in raw_contents:
        item = dict(raw)
        key = str(item.get('content_id') or item.get('project_id'))
        patch = patches.get(key)
        if isinstance(patch, dict):
            fields = {k: v for k, v in patch.items() if k in OVERRIDE_FIELDS}
            if raw.get('youtube_binding_provenance') == 'USER_CONFIRMED_BINDING':
                # Explicit user decisions (including unlink) outrank inferred
                # URL/date/count overrides. Growth/classification rules stay intact.
                fields = {k: v for k, v in fields.items() if k not in {'youtube_video_id', 'published_at', 'view_count'}}
            if fields.get('exclude') is True:
                applied.append({'content_id': key, 'fields': ['exclude']})
                continue
            if 'tags' in fields:
                item['tag_source'] = 'OVERRIDE'
            item.update(fields)
            applied.append({'content_id': key, 'fields': sorted(fields)})
        result.append(item)
    for extra in overrides.get('extra_contents') or []:
        if isinstance(extra, dict) and extra.get('project_id'):
            result.append({**{k: v for k, v in extra.items() if k in OVERRIDE_FIELDS | {'project_id', 'content_id'}},
                           'evidence': 'MANUAL_OVERRIDE'})
            applied.append({'content_id': str(extra.get('content_id') or extra['project_id']), 'fields': ['extra_content']})
    for key in overrides.get('featured') or []:
        for item in result:
            if str(item.get('content_id') or item.get('project_id')) == str(key):
                item['featured'] = True
    return result, applied


def content_date(content):
    return parse_time(content.get('published_at')) or parse_time(content.get('completed_at'))


def view_tier(views, config):
    if not isinstance(views, int) or views < 0:
        return None
    tiers = config['rules']['popularity']['tiers']
    return next(t['id'] for t in reversed(tiers) if views >= t['min_views'])


def _tier_index(tier):
    return int(tier.rsplit('_', 1)[1]) if tier else -1


def score(contents, config, series=None):
    growth = config['rules']['growth']
    contributions = []
    for c in contents:
        points = growth['points'][c['content_type']]
        reasons = [c['content_type'].upper()]
        if 'FLAGSHIP' in c['world_flags'] or 'SPECIAL' in c['world_flags']:
            if growth['flagship_points'] > points:
                points = growth['flagship_points']
                reasons = ['FLAGSHIP']
        bonus = growth['runtime_bonus']
        if c['runtime_seconds'] and c['runtime_seconds'] >= bonus['min_seconds'] and c['content_type'] in bonus['types']:
            points += bonus['points']
            reasons.append('RUNTIME_20MIN')
        contributions.append({'kind': 'CONTENT', 'content_id': c['content_id'], 'title': c['title'],
                              'content_type': c['content_type'], 'points': points, 'reasons': reasons,
                              'at': iso(content_date(c)), 'status': c['status']})
    for slug, info in sorted((series or {}).items()):
        members = [c for c in contents if c['series_slug'] == slug]
        if not (isinstance(info, dict) and info.get('complete') is True and members):
            continue
        dates = [content_date(c) for c in members if content_date(c)]
        contributions.append({'kind': 'SERIES_COMPLETE', 'content_id': 'series:' + slug,
                              'title': info.get('title') or slug, 'content_type': 'series',
                              'points': growth['series_complete_bonus'], 'reasons': ['SERIES_COMPLETE'],
                              'at': iso(max(dates)) if dates else None, 'status': 'COMPLETE'})
    return sum(c['points'] for c in contributions), contributions


def era_for(total, config, force=None, minimum=None):
    registry = config['eras']
    eras = registry['eras']
    levels = registry['levels_per_era']
    index = max(i for i, era in enumerate(eras) if total >= era['min_score'])
    ids = [e['id'] for e in eras]
    hotfix = None
    if minimum in ids and ids.index(minimum) > index:
        index, hotfix = ids.index(minimum), 'MIN_ERA'
    if force in ids:
        index, hotfix = ids.index(force), 'FORCE_ERA'
    era = eras[index]
    following = eras[index + 1] if index + 1 < len(eras) else None
    if following:
        span = following['min_score'] - era['min_score']
    else:
        span = era.get('span', 60)
    progress = 1.0 if hotfix and total < era['min_score'] else max(0.0, min(1.0, (total - era['min_score']) / span))
    sublevel = min(levels - 1, int(progress * levels))
    return {'index': index, 'era': era, 'next': following, 'progress': round(progress, 4),
            'sublevel': sublevel, 'level': index * levels + sublevel + 1, 'hotfix': hotfix}


def era_unlocked_at(contributions, era):
    if era['min_score'] <= 0:
        return None
    running = 0
    dated = sorted(contributions, key=lambda c: (c['at'] is not None, c['at'] or '', c['content_id']))
    for c in dated:
        running += c['points']
        if running >= era['min_score']:
            return parse_time(c['at'])
    return None


def activity(contents, now, config, unlocked_at=None, recent_tier=None):
    rules = config['rules']['activity']
    popularity = config['rules']['popularity']
    crowd_order = config['rules']['crowd']['order']
    dates = sorted(d for d in (content_date(c) for c in contents) if d and d <= now)
    flags = []
    if not contents:
        state = base = 'EMPTY_WORLD'
        days = None
        last = None
    elif not dates:
        state = base = 'NORMAL'
        days = None
        last = None
        flags.append('NO_DATED_CONTENT')
    else:
        last = dates[-1]
        days = int((now - last).total_seconds() // DAY)
        base = next(t['state'] for t in rules['thresholds'] if t['max_days'] is None or days <= t['max_days'])
        state = base
        revival = rules['revival']
        window = timedelta(days=revival['window_days'])
        for i in range(len(dates) - 1, 0, -1):
            if now - dates[i] > window:
                break
            if dates[i] - dates[i - 1] >= timedelta(days=revival['gap_days_min']):
                state = 'REVIVAL'
                flags.append('REVIVAL_AFTER_%dD' % (dates[i] - dates[i - 1]).days)
                break
        festival = rules['festival']
        burst = sum(1 for d in dates if now - d <= timedelta(days=festival['burst_window_days']))
        reasons = []
        if burst >= festival['burst_contents']:
            reasons.append('CONTENT_BURST')
        if unlocked_at and timedelta(0) <= now - unlocked_at <= timedelta(days=festival['era_unlock_window_days']):
            reasons.append('ERA_UNLOCKED')
        hype_window = timedelta(days=popularity['hype_window_days'])
        hype = max((_tier_index(c.get('view_tier')) for c in contents
                    if content_date(c) and timedelta(0) <= now - content_date(c) <= hype_window), default=-1)
        if hype >= popularity['hype_from_tier']:
            reasons.append('VIEW_HYPE')
        # A comeback outranks a festival: the city wakes first, the party joins in as flags.
        if reasons:
            flags.extend(reasons)
            if state != 'REVIVAL':
                state = 'FESTIVAL'
            else:
                flags.extend(rules['effects']['FESTIVAL']['events'])
    effect = rules['effects'][state]
    crowd = effect['crowd']
    lights = effect['lights']
    # Popularity livens a city that is awake; it never fakes a crowd in a quiet one.
    if state in ('ACTIVE', 'NORMAL', 'REVIVAL') and recent_tier:
        if _tier_index(recent_tier) >= popularity['crowd_bump_from_tier'] and crowd != 'FESTIVAL':
            crowd = crowd_order[min(crowd_order.index(crowd) + 1, crowd_order.index('BUSY'))]
            flags.append('POPULAR_CROWD')
        lights = min(100, lights + max(0, _tier_index(recent_tier)) * popularity['lights_bonus_per_tier'])
    return {
        'state': state, 'base_state': base, 'days_since_publish': days, 'last_publish_at': iso(last),
        'crowd_density': crowd, 'lights_level': lights, 'shops_open': effect['shops_open'],
        'construction': effect['construction'], 'grass_level': effect['grass'],
        'event_flags': sorted(set(effect['events'] + flags)),
        'description': rules['descriptions'][state],
    }


def _matches(content, tags):
    return content['content_type'] in tags or any(t in tags for t in content['tags'])


def districts(contents, now, config, era_info, world_crowd):
    registry = config['districts']['districts']
    ids = [e['id'] for e in config['eras']['eras']]
    rules = config['rules']['districts']
    order = config['rules']['crowd']['order']
    recent = [c for c in contents if content_date(c) and timedelta(0) <= now - content_date(c) <= timedelta(days=rules['recent_days'])]
    result = []
    for d in registry:
        unlock = d['unlock']
        reached = era_info['index'] >= ids.index(unlock['min_era'])
        by_tag = any(sum(tag in c['tags'] for c in contents) >= n for tag, n in (unlock.get('or_tag_count') or {}).items())
        by_type = any(sum(c['content_type'] == kind for c in contents) >= n for kind, n in (unlock.get('or_type_count') or {}).items())
        unlocked = reached or by_tag or by_type
        preview = False
        if not unlocked and d.get('preview'):
            p = d['preview']
            at = ids.index(p['min_era'])
            preview = era_info['index'] > at or (era_info['index'] == at and era_info['progress'] >= p.get('min_progress', 0))
        assigned = [c for c in contents if c['district'] == d['id'] or (not c['district'] and _matches(c, d['tags']))]
        fresh = [c for c in recent if c['district'] == d['id'] or (not c['district'] and _matches(c, d['tags']))]
        if not unlocked:
            crowd = 'EMPTY'
        elif world_crowd in ('EMPTY', 'FESTIVAL'):
            crowd = world_crowd
        elif len(fresh) >= rules['busy_from_recent']:
            crowd = order[min(order.index(world_crowd) + 1, order.index('BUSY'))]
        elif not fresh and order.index(world_crowd) > order.index('QUIET'):
            crowd = order[order.index(world_crowd) - 1]
        else:
            crowd = world_crowd
        hotspots = sorted(name for name, tags in d.get('hotspots', {}).items() if any(_matches(c, tags) for c in fresh))
        result.append({
            'id': d['id'], 'name': d['name'], 'unlocked': unlocked,
            'status': 'UNLOCKED' if unlocked else 'PREVIEW' if preview else 'LOCKED',
            'unlock_hint': None if unlocked else _unlock_hint(unlock, config),
            'unlocked_by': ('ERA' if reached else 'CONTENT') if unlocked else None,
            'crowd_density': crowd, 'content_count': len(assigned), 'recent_count': len(fresh),
            'active_hotspots': hotspots if unlocked else [], 'summary': d['summary'],
        })
    return result


def _unlock_hint(unlock, config):
    era = next(e for e in config['eras']['eras'] if e['id'] == unlock['min_era'])
    hint = '進入「%s」解鎖' % era['name']
    extra = [('%d 支%s相關內容' % (n, tag)) for tag, n in (unlock.get('or_tag_count') or {}).items()]
    extra += [('%d 支%s內容' % (n, {'member': '會員'}.get(kind, kind))) for kind, n in (unlock.get('or_type_count') or {}).items()]
    return hint + ('，或累積 ' + '、'.join(extra) if extra else '')


def _rotate(items, seed, limit):
    return sorted(items, key=lambda x: _digest(seed, x))[:limit]


def characters(registry, config, era_info, unlocked, activity_state, seed):
    """Pick who is on the street today. Registry entries are references, never re-drawn."""
    if not registry:
        return []
    era_ids = [e['id'] for e in config['eras']['eras']]
    limit = config['rules']['characters']['guest_limit']
    celebrating = activity_state in ('REVIVAL', 'FESTIVAL')
    napping = activity_state in ('DORMANT', 'DEEP_DORMANT', 'EMPTY_WORLD')

    def place(entry):
        district = entry.get('default_district') or 'MAIN_CITY'
        return district if district in unlocked else 'MAIN_CITY'

    def pose(entry):
        states = entry.get('allowed_states') or ['IDLE']
        if celebrating and 'CELEBRATING' in states:
            return 'CELEBRATING'
        if napping and 'NAPPING' in states:
            return 'NAPPING'
        return 'WALKING' if 'WALKING' in states else states[0]

    def view(entry, district):
        return {'character_id': entry['character_id'], 'display_name': entry['display_name'],
                'character_type': entry['character_type'], 'district': district,
                'has_image': bool(entry.get('asset_ref')), 'render_mode': 'IMAGE' if entry.get('asset_ref') else 'TOKEN',
                'state': pose(entry), 'source_authority': entry.get('source_authority')}

    def available(entry):
        need = entry.get('min_era')
        return entry.get('public_visibility') is True and (need not in era_ids or era_info['index'] >= era_ids.index(need))

    if activity_state == 'EMPTY_WORLD':
        # An empty lot has one penguin and a camera, nobody else yet.
        return [view(e, place(e)) for e in registry if available(e) and e['character_type'] == 'MAIN_CHARACTER'
                and 'ALWAYS_VISIBLE' in (e.get('special_flags') or [])]
    chosen = []
    for entry in registry:
        if available(entry) and 'ALWAYS_VISIBLE' in (entry.get('special_flags') or []):
            chosen.append(view(entry, place(entry)))
    # Visitors grow with the city: one guest in the camp, up to the limit later.
    guests = [e for e in registry if e['character_type'] == 'SPECIAL_GUEST' and available(e) and e.get('asset_ref')]
    picked = set(_rotate([e['character_id'] for e in guests], seed + ':guest', min(limit, era_info['index'] + 1)))
    chosen += [view(e, place(e)) for e in guests if e['character_id'] in picked]
    geese = [e for e in registry if e['character_type'] == 'GOOSEBABY' and available(e)
             and (e.get('default_district') in unlocked)]
    picked = set(_rotate([e['character_id'] for e in geese], seed + ':goose', min(limit, era_info['index'] + 1)))
    chosen += [view(e, e['default_district']) for e in geese if e['character_id'] in picked]
    return chosen


def residents(config, era_info, crowd, civilians, unlocked, population=None):
    factor = config['rules']['crowd']['resident_factor'][crowd]
    era = era_info['era']
    member_bonus = 0
    if population and 'MEMBER_DISTRICT' in unlocked:
        member_bonus = min(12, math.ceil(population.get('total', 0) / 12))
    capacity = era['population_capacity'] + member_bonus
    era_ids = [e['id'] for e in config['eras']['eras']]
    groups = {'EMPTY': set(), 'QUIET': {'CORE'}, 'NORMAL': {'CORE', 'COMMUTER'},
              'BUSY': {'CORE', 'COMMUTER', 'NIGHTLIFE'}, 'FESTIVAL': {'CORE', 'COMMUTER', 'NIGHTLIFE', 'FESTIVAL'}}[crowd]
    archetypes = [c for c in civilians or []
                  if c['density_group'] in groups and era_info['index'] >= era_ids.index(c['min_era'])
                  and (c['district'] in unlocked or c['district'] == 'MAIN_CITY')]
    return {'crowd_density': crowd, 'capacity': capacity, 'visible': round(capacity * factor),
            'render_cap': config['rules']['crowd']['render_cap'], 'member_district_bonus': member_bonus,
            'archetypes': [{'civilian_id': c['civilian_id'], 'label': c['label'], 'profession': c['profession'],
                            'district': c['district'] if c['district'] in unlocked else 'MAIN_CITY',
                            'density_group': c['density_group'], 'day': c['day'], 'night': c['night']}
                           for c in archetypes]}


def gossip(config, seed, state, era_id, contents, cast, archetypes):
    pools = config['gossip']['pools']
    limit = config['rules']['gossip']['limit']
    lines = []

    def take(category, texts, count, speaker, key=''):
        for text in _rotate(list(texts), f'{seed}:{category}:{key}', count):
            lines.append({'id': 'g_' + _digest(category, key, text)[:10], 'category': category,
                          'text': text, 'speaker': speaker})

    civilian = lambda i: (archetypes[i % len(archetypes)] if archetypes else None)
    speaker = lambda i: ({'type': 'CIVILIAN', 'id': civilian(i)['civilian_id'], 'label': civilian(i)['label']}
                         if civilian(i) else {'type': 'RESIDENT', 'id': None, 'label': '居民'})
    if state == 'EMPTY_WORLD':
        take('EMPTY_WORLD', pools['EMPTY_WORLD'], 3, {'type': 'NARRATOR', 'id': None, 'label': '風'})
    else:
        take('GENERIC', pools['GENERIC'], 3, speaker(0))
        if state in ('QUIET', 'DORMANT', 'DEEP_DORMANT'):
            take('INACTIVITY', pools[state], 3, speaker(1), state)
        elif state in ('REVIVAL', 'FESTIVAL'):
            take(state, pools[state], 3, speaker(1))
        else:
            take('ACTIVITY', pools['ACTIVE'], 2, speaker(1))
        titles = [c['title'] for c in contents if c.get('title_public', True)][:3]
        for i, title in enumerate(titles[:2]):
            template = _rotate(pools['PROJECT'], f'{seed}:project:{i}', 1)[0]
            lines.append({'id': 'g_' + _digest('PROJECT', title, template)[:10], 'category': 'PROJECT',
                          'text': template.replace('{title}', title), 'speaker': speaker(2 + i),
                          'content_ref': True})
        take('ERA', pools['ERA'].get(era_id, []), 1, speaker(4), era_id)
    for i, archetype in enumerate(_rotate([a['profession'] for a in archetypes], seed + ':prof', 2)):
        match = next(a for a in archetypes if a['profession'] == archetype)
        take('PROFESSION', pools['PROFESSION'].get(archetype, []), 1,
             {'type': 'CIVILIAN', 'id': match['civilian_id'], 'label': match['label']}, archetype)
    for member in cast:
        texts = pools['CHARACTER_SPECIFIC'].get(member['character_id'])
        if texts:
            take('CHARACTER_SPECIFIC', texts, 1, {'type': member['character_type'], 'id': member['character_id'],
                                                   'label': member['display_name']}, member['character_id'])
    return lines[:limit]


def build_state(raw_contents, *, now, config=None, registry=None, overrides=None, popularity=None,
                sources=None, source='LIVE'):
    config = config or load_config()
    now = parse_time(now)
    overrides = overrides or {}
    registry = registry or {}
    merged, applied = apply_overrides(raw_contents, overrides)
    views = (popularity or {}).get('videos') or {}
    counted, skipped = [], []
    seen = set()
    for raw in merged:
        content = normalize_content(raw, config)
        if content is None:
            skipped.append({'content_id': str(raw.get('content_id') or raw.get('project_id')), 'reason': 'UNSUPPORTED_TYPE'})
            continue
        if content['status'] not in config['rules']['growth']['counted_statuses']:
            skipped.append({'content_id': content['content_id'], 'reason': 'STATUS_' + (content['status'] or 'NONE')})
            continue
        video = views.get(content['youtube_video_id']) or {}
        use_video = raw.get('youtube_binding_provenance') != 'USER_CONFIRMED_BINDING' or (
            parse_time((popularity or {}).get('synced_at')) is not None and
            parse_time((popularity or {})['synced_at']) >= (parse_time(raw.get('youtube_metadata_verified_at')) or now))
        if use_video and video.get('published_at'):
            content['published_at'] = iso(parse_time(video['published_at']))
            content['view_count'] = video.get('view_count')
        stamp = content_date(content)
        if stamp and stamp > now:
            skipped.append({'content_id': content['content_id'], 'reason': 'FUTURE_DATED'})
            continue
        if content['content_id'] in seen:
            skipped.append({'content_id': content['content_id'], 'reason': 'DUPLICATE_ID'})
            continue
        seen.add(content['content_id'])
        if use_video and content['view_count'] is None and content['youtube_video_id'] in views:
            content['view_count'] = views[content['youtube_video_id']].get('view_count')
        content['view_tier'] = view_tier(content['view_count'], config)
        content['title_public'] = content['status'] == 'PUBLISHED'
        counted.append(content)
    counted.sort(key=lambda c: (content_date(c) or datetime.min.replace(tzinfo=timezone.utc), c['content_id']), reverse=True)

    total, contributions = score(counted, config, overrides.get('series'))
    era_hotfix = overrides.get('era') or {}
    info = era_for(total, config, era_hotfix.get('force_era'), era_hotfix.get('min_era'))
    era = info['era']
    unlocked_at = era_unlocked_at(contributions, era)
    recent_window = timedelta(days=config['rules']['popularity']['recent_days'])
    recent_tiers = [c['view_tier'] for c in counted if c['view_tier'] and content_date(c) and now - content_date(c) <= recent_window]
    recent_tier = max(recent_tiers, key=_tier_index) if recent_tiers else None
    act = activity(counted, now, config, unlocked_at, recent_tier)
    district_rows = districts(counted, now, config, info, act['crowd_density'])
    unlocked = {d['id'] for d in district_rows if d['unlocked']}
    seed = f"{now.date().isoformat()}:{total}:{act['state']}"

    entries = deepcopy(registry.get('characters') or [])
    for entry in entries:
        patch = (overrides.get('characters') or {}).get(entry['character_id'])
        if isinstance(patch, dict):
            for key in ('public_visibility', 'default_district'):
                if key in patch:
                    entry[key] = patch[key]
    cast = characters(entries, config, info, unlocked, act['state'], seed)
    crowd = residents(config, info, act['crowd_density'], registry.get('civilians'), unlocked,
                      (registry.get('goosebaby') or {}).get('population'))

    featured_ids = [str(k) for k in overrides.get('featured') or []]
    by_id = {c['content_id']: c for c in counted}
    featured = [by_id[k] for k in featured_ids if k in by_id]
    rest = sorted((c for c in counted if c not in featured),
                  key=lambda c: (c['featured'], c['title_public'], _tier_index(c['view_tier']) if content_date(c) and now - content_date(c) <= recent_window else -1,
                                 content_date(c) or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)
    featured = (featured + rest)[:config['rules']['featured']['limit']]
    fresh_poster = timedelta(days=7)
    counts = {kind: sum(c['content_type'] == kind for c in counted) for kind in config['rules']['content_types']}
    landmarks = [lm for e in config['eras']['eras'][:info['index'] + 1] for lm in e['landmarks']]
    city = era['city']
    following = info['next']
    buildings = city['buildings_min'] + round(info['progress'] * (city['buildings_max'] - city['buildings_min']))
    gate = next((d['status'] for d in district_rows if d['id'] == 'FUTURE_GATE'), 'LOCKED')
    return {
        'schema': SCHEMA,
        'source': source,
        'generated_at': iso(now),
        'world_score': total,
        'world_level': info['level'],
        'current_era': era['id'],
        'current_era_name': era['name'],
        'current_stage': era['stages'][info['sublevel']],
        'next_era': following['id'] if following else None,
        'next_era_name': following['name'] if following else None,
        'era_progress': info['progress'],
        'score_to_next_era': max(0, following['min_score'] - total) if following else None,
        'era': {'id': era['id'], 'name': era['name'], 'name_en': era['name_en'], 'variant': era['variant'],
                'min_score': era['min_score'], 'tagline': era['tagline'], 'features': era['features'],
                'unlocked_at': iso(unlocked_at), 'hotfix': info['hotfix']},
        'eras': [{'id': e['id'], 'name': e['name'], 'min_score': e['min_score'],
                  'reached': i <= info['index']} for i, e in enumerate(config['eras']['eras'])],
        'content': {'total': len(counted), **counts,
                    'published': sum(c['status'] == 'PUBLISHED' for c in counted),
                    'completed_unpublished': sum(c['status'] == 'COMPLETED' for c in counted)},
        'activity': act,
        'districts': district_rows,
        'featured_contents': [{
            'content_id': c['content_id'], 'title': c['title'], 'title_public': c['title_public'],
            'content_type': c['content_type'], 'status': c['status'], 'date': iso(content_date(c)),
            'date_basis': 'PUBLISHED_AT' if c['published_at'] else 'COMPLETED_AT' if c['completed_at'] else None,
            'view_tier': c['view_tier'], 'youtube_video_id': c['youtube_video_id'], 'tags': c['tags'],
            'is_new': bool(content_date(c) and now - content_date(c) <= fresh_poster),
            'evidence': c['evidence']} for c in featured],
        'recent_growth': sorted(contributions, key=lambda c: (c['at'] or '', c['content_id']), reverse=True)[:config['rules']['recent_growth']['limit']],
        'characters': cast,
        'residents': crowd,
        'goosebaby': {'population': (registry.get('goosebaby') or {}).get('population'),
                      'named_avatars': len((registry.get('goosebaby') or {}).get('entries') or []),
                      'district_unlocked': 'MEMBER_DISTRICT' in unlocked},
        'gossip': gossip(config, seed, act['state'], era['id'], counted, cast, crowd['archetypes']),
        'popularity': {'status': (popularity or {}).get('status', 'GATED'), 'recent_top_tier': recent_tier,
                       'tracked_videos': sum(1 for c in counted if c['view_tier'])},
        'visual': {
            'city_variant': f"{era['variant']}-s{info['sublevel'] + 1}",
            'art_theme_version': config['eras']['art_theme_version'],
            'era_variant': era['variant'],
            'city_radius': city['radius'], 'buildings': buildings, 'building_height': city['height'],
            'roads': city['roads'], 'landmarks': landmarks, 'landmark_count': len(landmarks),
            'construction': act['construction'] if following or info['progress'] < 1 else 'COMPLETE',
            'grass_level': act['grass_level'], 'lights_level': act['lights_level'],
            'shops_open': act['shops_open'], 'future_gate': gate,
        },
        'sources': sources or [],
        'overrides_applied': applied,
        'skipped': skipped,
    }


def public_view(state):
    """What a stranger may see: no project ids, no unpublished titles, no local paths."""
    view = deepcopy(state)
    opaque = lambda key: 'c_' + _digest('renguin-world', key)[:12]
    for item in view['featured_contents']:
        item['content_id'] = opaque(item['content_id'])
        if not item.pop('title_public', False):
            item['title'] = '即將公開的作品'
        item.pop('evidence', None)
    for item in view['recent_growth']:
        item['content_id'] = opaque(item['content_id'])
        if item['kind'] == 'CONTENT' and item.get('status') != 'PUBLISHED':
            item['title'] = '即將公開的作品'
    view['sources'] = [{'id': s.get('id'), 'status': s.get('status'), 'count': s.get('count')} for s in view['sources']]
    view['overrides_applied'] = len(view['overrides_applied'])
    view['skipped'] = len(view['skipped'])
    view['audience'] = 'public'
    return view
