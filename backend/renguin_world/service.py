"""World service: gather read-only inputs, build world_state, keep one precomputed copy.

Nothing here runs unless the world page, its API or the CLI asks. There is no
thread, timer or poll: a request gets the saved state while it is younger than
TTL_SECONDS, otherwise one build runs under a lock and every waiting request
receives that same result.

Runtime files live beside the user store but outside it (Production:
`.world-runtime/`, Preview: `.preview-runtime/.world-runtime/`), so Preview and
Production never share a world, and the user store is never written.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
import time

from . import characters, content_adapter, engine, mock, youtube_adapter

TTL_SECONDS = 600
MIN_REFRESH_SECONDS = 30
OVERRIDES_FILE = 'world-overrides.json'
_build_lock = threading.Lock()
_registry = {'at': 0.0, 'key': None, 'value': None}


def runtime_root(presentation_root):
    configured = os.environ.get('RENGUIN_WORLD_RUNTIME_ROOT')
    return Path(configured) if configured else Path(presentation_root).resolve().parent / '.world-runtime'


def load_overrides(runtime):
    path = Path(runtime) / OVERRIDES_FILE
    if not path.is_file():
        return {}, {'id': 'WORLD_OVERRIDES', 'status': 'NONE', 'count': 0}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            raise ValueError('OVERRIDES_NOT_OBJECT')
    except (OSError, ValueError) as error:
        return {}, {'id': 'WORLD_OVERRIDES', 'status': 'ERROR', 'count': 0, 'detail': type(error).__name__}
    count = len(data.get('contents') or {}) + len(data.get('extra_contents') or []) + len(data.get('characters') or {})
    return data, {'id': 'WORLD_OVERRIDES', 'status': 'OK', 'count': count}


def registry(frontend_dir, config=None):
    """The character registry is derived from authority files; rebuild at most once a minute."""
    key = str(frontend_dir)
    if _registry['value'] is not None and _registry['key'] == key and time.time() - _registry['at'] < 60:
        return _registry['value']
    value = characters.build_registry(characters.default_paths(frontend_dir), config or engine.load_config())
    _registry.update(at=time.time(), key=key, value=value)
    return value


def build_live(presentation_root, frontend_dir, *, now=None):
    config = engine.load_config()
    runtime = runtime_root(presentation_root)
    contents, sources = content_adapter.collect(presentation_root)
    overrides, override_report = load_overrides(runtime)
    popularity = youtube_adapter.load(runtime)
    reg = registry(frontend_dir, config)
    sources = sources + [override_report,
                         {'id': 'YOUTUBE_POPULARITY', 'status': popularity['status'], 'count': len(popularity['videos']),
                          'detail': popularity.get('reason')}] + [
                         {k: v for k, v in s.items() if k != 'path'} for s in reg['sources']]
    return engine.build_state(contents, now=now or datetime.now(timezone.utc),
                              config=config, registry=reg, overrides=overrides, popularity=popularity,
                              sources=sources, source='LIVE')


def sync_youtube(presentation_root):
    """Sync all eligible mapped contents, independently of featured-card limits.

    No cached world is built on failure. No publish dates, classifications or
    growth inputs are rewritten by this statistics operation.
    """
    runtime = runtime_root(presentation_root)

    def finish(result):
        youtube_adapter.record_attempt(runtime, result)
        # Invalidate the disposable state after any attempt: an older cached
        # OK result must not mask a newly detected incomplete or failed sync.
        (runtime / 'cache' / 'world_state.json').unlink(missing_ok=True)
        return result

    raw, sources = content_adapter.collect(presentation_root)
    overrides, report = load_overrides(runtime)
    if report['status'] == 'ERROR' or any(s['status'] in ('ERROR', 'SYNC_ERROR') for s in sources):
        return finish({'status': 'GATED', 'reason': 'CONTENT_SOURCE_OR_OVERRIDES_INVALID', 'synced': 0})
    merged, _ = engine.apply_overrides(raw, overrides)
    config = engine.load_config()
    now = datetime.now(timezone.utc)
    eligible = []
    for item in merged:
        content = engine.normalize_content(item, config)
        if content is None or content['status'] not in config['rules']['growth']['counted_statuses']:
            continue
        stamp = engine.content_date(content)
        if stamp and stamp > now:
            continue
        eligible.append(content)
    ids = [c['youtube_video_id'] for c in eligible]
    unmapped = sum(not isinstance(v, str) or not youtube_adapter.VIDEO_ID.fullmatch(v) for v in ids)
    result = youtube_adapter.sync(runtime, ids)
    if result['status'] == 'OK' and unmapped:
        result = {**result, 'status': 'PARTIAL', 'reason': 'UNMAPPED_CONTENTS', 'snapshot_saved': True}
    return finish({**result, 'eligible_contents': len(eligible), 'unmapped_contents': unmapped})


def live_state(presentation_root, frontend_dir, *, refresh=False):
    runtime = runtime_root(presentation_root)
    cache = runtime / 'cache' / 'world_state.json'

    def saved():
        try:
            data = json.loads(cache.read_text(encoding='utf-8'))
            return data, time.time() - data['cache']['saved_at']
        except (OSError, ValueError, KeyError, TypeError):
            return None, None

    state, age = saved()
    if state and age is not None and 0 <= age < (MIN_REFRESH_SECONDS if refresh else TTL_SECONDS):
        state['cache']['age_seconds'] = round(age, 1)
        state['cache']['hit'] = True
        return state
    with _build_lock:
        state, age = saved()
        if state and age is not None and 0 <= age < MIN_REFRESH_SECONDS:
            state['cache']['age_seconds'] = round(age, 1)
            state['cache']['hit'] = True
            return state
        started = time.perf_counter()
        state = build_live(presentation_root, frontend_dir)
        state['cache'] = {'saved_at': time.time(), 'ttl_seconds': TTL_SECONDS, 'hit': False, 'age_seconds': 0,
                          'build_ms': round((time.perf_counter() - started) * 1000, 1)}
        cache.parent.mkdir(parents=True, exist_ok=True)
        temp = cache.with_suffix('.tmp')
        temp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        temp.replace(cache)
        return state


def simulate(count, frontend_dir, *, idle_days=0, gap_before_last=0, with_registry=True):
    config = engine.load_config()
    items, now, overrides = mock.scenario(count, idle_days=idle_days, gap_before_last=gap_before_last)
    reg = registry(frontend_dir, config) if with_registry else None
    state = engine.build_state(items, now=now, config=config, registry=reg, overrides=overrides,
                               popularity={'status': 'MOCK'}, source='MOCK',
                               sources=[{'id': 'MOCK_CONTENTS', 'status': 'MOCK', 'count': len(items)}])
    state['simulation'] = {'contents': count, 'idle_days': idle_days, 'gap_before_last': gap_before_last}
    return state


def roadmap(frontend_dir=None):
    rows = []
    for count in mock.MILESTONES:
        s = simulate(count, frontend_dir, with_registry=False)
        rows.append({
            'contents': count, 'world_score': s['world_score'], 'world_level': s['world_level'],
            'era': s['current_era'], 'era_name': s['current_era_name'], 'stage': s['current_stage'],
            'era_progress': s['era_progress'], 'city_radius': s['visual']['city_radius'],
            'buildings': s['visual']['buildings'], 'landmarks': s['visual']['landmark_count'],
            'districts': [d['id'] for d in s['districts'] if d['unlocked']],
            'future_gate': s['visual']['future_gate'],
            'resident_capacity': s['residents']['capacity'], 'residents_visible': s['residents']['visible'],
            'activity': s['activity']['state'], 'crowd': s['activity']['crowd_density'],
        })
    return rows
