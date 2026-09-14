"""Content Adapter: existing records -> the World content contract. Read-only.

Two sources exist today, and each record says which one it came from:

* CONTENT_OS_LEDGER — a project whose latest canonical PUBLISH stage is
  VERIFIED. This is the only machine-verified publish evidence. It is read
  through the same producer validators the Office uses; on failure the source
  reports SYNC_ERROR and contributes nothing (no fallback, no snapshot).
* OFFICE_USER_MARK — the creator's own completion marks in the Office
  presentation store: 上映 marked done (PUBLISHED) or the card finished
  (COMPLETED). The store is opened read-only and never created.

One Office card is one content. The 會員影片 / 短影音 steps of a long-form chain
are recorded as flags only: marking a later step fills the earlier ones, so
they are not reliable proof that a separate member cut or short exists.
"""
from pathlib import Path
import json
import os
import re
import sqlite3

from .engine import iso, parse_time

WORKFLOW_ID = 'YOUTUBE_CANONICAL_WORKFLOW_V2'
QA_NAMES = re.compile(r'WORKFLOW-QA-DEMO|驗收|可移除|UX\s*驗證', re.I)
FOLDER = re.compile(r'^WORKSPACE-(.+)-[0-9a-f]{12}$')
DATE_TOKEN = re.compile(r'^(\d{8}|\d{7})[_\s-]+')
STATUS_RANK = {'PUBLISHED': 2, 'COMPLETED': 1}


def folder_date(name):
    """Production date hint from a folder token: 20260820_ or ROC 1150605_."""
    match = DATE_TOKEN.match(str(name or ''))
    if not match:
        return None
    token = match.group(1)
    year, rest = (int(token[:4]), token[4:]) if len(token) == 8 else (int(token[:3]) + 1911, token[3:])
    try:
        return parse_time(f'{year:04d}-{int(rest[:2]):02d}-{int(rest[2:]):02d}T00:00:00+08:00')
    except ValueError:
        return None


def clean_title(name):
    return DATE_TOKEN.sub('', str(name or '')).strip() or str(name or '')


def dedupe_key(project_id, title, content_type):
    match = FOLDER.match(project_id)
    base = match.group(1) if match else clean_title(title)
    return content_type + ':' + re.sub(r'[\W_]+', '', clean_title(base)).lower()


def _read_store(presentation_root):
    path = Path(presentation_root) / 'presentation.sqlite'
    if not path.is_file():
        return None
    uri = 'file:' + path.resolve().as_posix() + '?mode=ro'
    db = sqlite3.connect(uri, uri=True, timeout=5)
    try:
        row = db.execute('SELECT value FROM metadata WHERE id=1').fetchone()
    finally:
        db.close()
    return json.loads(row[0]) if row else None


def office_contents(presentation_root):
    from creator_workflow import completed_count, enabled_ids, is_short
    report = {'id': 'OFFICE_USER_MARKS', 'status': 'OK', 'count': 0,
              'excluded': {'hidden': 0, 'qa_artifact': 0}}
    try:
        data = _read_store(presentation_root)
    except (OSError, sqlite3.Error, ValueError) as error:
        return [], {**report, 'status': 'ERROR', 'detail': type(error).__name__}
    if data is None:
        return [], {**report, 'status': 'EMPTY'}
    local = data.get('local_projects') or {}
    items = []
    for pid, meta in (data.get('projects') or {}).items():
        workflow = meta.get('workflow') or {}
        publish = workflow.get('PUBLISH') or {}
        manual = meta.get('manual_done') or {}
        finished = manual.get('done') is True or completed_count(meta) == len(enabled_ids(meta))
        published = publish.get('status') == 'COMPLETED' and 'PUBLISH' in enabled_ids(meta)
        if not (finished or published):
            continue
        name = meta.get('display_name') or meta.get('source_name') or (local.get(pid) or {}).get('project_name') or pid
        if meta.get('hidden') or meta.get('deleted_at'):
            report['excluded']['hidden'] += 1
            continue
        if QA_NAMES.search(f'{pid} {name}'):
            report['excluded']['qa_artifact'] += 1
            continue
        stamps = [parse_time(s.get('completed_at')) for s in workflow.values() if isinstance(s, dict)]
        latest_step = max((s for s in stamps if s), default=None)
        flags = []
        if not is_short(meta):
            for step, flag in (('MEMBER_PUBLISH', 'MEMBER_CUT_MARKED'), ('SHORT_PUBLISH', 'SHORTS_MARKED')):
                if (workflow.get(step) or {}).get('status') == 'COMPLETED' and step in enabled_ids(meta):
                    flags.append(flag)
        items.append({
            'project_id': pid,
            'title': clean_title(name),
            'content_type': 'short' if is_short(meta) else 'long',
            'status': 'PUBLISHED' if published else 'COMPLETED',
            'published_at': iso(parse_time(publish.get('completed_at'))) if published else None,
            'completed_at': iso(parse_time(manual.get('timestamp')) if manual.get('done') else latest_step)
                            or iso(latest_step),
            'production_date_hint': iso(folder_date(meta.get('source_name') or name)),
            'source_project_id': meta.get('source_project_id'),
            'world_flags': flags,
            'evidence': 'OFFICE_USER_MARK',
        })
    report['count'] = len(items)
    return items, report


def canonical_contents():
    report = {'id': 'CONTENT_OS_LEDGER', 'status': 'OK', 'count': 0}
    try:
        from creator_history import snapshot
        _, entries, _ = snapshot()
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        return [], {**report, 'status': 'SYNC_ERROR', 'detail': type(error).__name__}
    latest, names = {}, {}
    for entry in entries:
        pid = entry.get('project_id')
        if not pid or pid == 'NEEDS_CLASSIFICATION':
            continue
        if entry.get('project_name'):
            names[pid] = entry['project_name']
        if (entry.get('stage_id') == 'PUBLISH' and entry.get('workflow_id') == WORKFLOW_ID
                and entry.get('capability_id') == WORKFLOW_ID):
            previous = latest.get(pid)
            if previous is None or parse_time(entry['timestamp']) >= parse_time(previous['timestamp']):
                latest[pid] = entry
    items = [{
        'project_id': pid,
        'title': clean_title(names.get(pid, pid)),
        'content_type': 'long',
        'status': 'PUBLISHED',
        'published_at': iso(parse_time(entry.get('timestamp'))),
        'completed_at': None,
        'world_flags': [],
        'evidence': 'CONTENT_OS_LEDGER',
    } for pid, entry in sorted(latest.items()) if entry.get('new_status') == 'VERIFIED']
    report['count'] = len(items)
    return items, report


def merge(canonical, office):
    """Fold duplicates: canonical wins; an Office mark supplies format and title."""
    by_source = {}
    for item in office:
        by_source.setdefault(item.get('source_project_id') or item['project_id'], []).append(item)
    folded = []
    for item in canonical:
        marks = by_source.pop(item['project_id'], [])
        short = next((m for m in marks if m['content_type'] == 'short'), None)
        longs = [m for m in marks if m['content_type'] != 'short']
        if longs:
            item = {**item, 'title': longs[0]['title'], 'world_flags': longs[0]['world_flags'],
                    'completed_at': longs[0]['completed_at'], 'evidence': 'CONTENT_OS_LEDGER+OFFICE_USER_MARK'}
        folded.append(item)
        if short:
            folded.append(short)
    folded.extend(m for marks in by_source.values() for m in marks)
    result, index, duplicates = [], {}, 0
    for item in folded:
        key = dedupe_key(item['project_id'], item['title'], item['content_type'])
        if key in index:
            duplicates += 1
            kept = result[index[key]]
            if STATUS_RANK[item['status']] > STATUS_RANK[kept['status']]:
                result[index[key]] = {**item, 'folded_ids': kept.get('folded_ids', []) + [kept['project_id']]}
            else:
                kept.setdefault('folded_ids', []).append(item['project_id'])
            continue
        index[key] = len(result)
        result.append(item)
    return result, duplicates


def collect(presentation_root, *, include_canonical=True):
    canonical, canonical_report = canonical_contents() if include_canonical else ([], {'id': 'CONTENT_OS_LEDGER', 'status': 'SKIPPED', 'count': 0})
    office, office_report = office_contents(presentation_root)
    items, duplicates = merge(canonical, office)
    office_report['excluded']['duplicate'] = duplicates
    return items, [canonical_report, office_report]


def presentation_root_from_env(default):
    return os.environ.get('RENGUIN_PRESENTATION_ROOT', default)
