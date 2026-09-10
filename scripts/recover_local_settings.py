#!/usr/bin/env python3
"""Selective recovery of local Office settings from a stash.

Moves the user's data into the current checkout. It never pops, applies, drops
or resets anything: every stash entry is read as a blob, written to a quarantine
directory, classified, and only user data is merged back. Implementation files
in the stash are reported and left alone, so a sync cannot be undone by mistake.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Runtime state and user data, from .gitignore plus the Office storage layout.
USER_DATA = {
    'state.json', 'agents-state.json', 'runtime-config.json', 'join-keys.json',
    'frontend/codex_activity.json', 'frontend/bionic_activity.json',
    'frontend/renguin-projects.json', 'frontend/renguin-projects-v2.json',
    'frontend/renguin-achievements.json', 'frontend/office_bg.png',
}
USER_DATA_TREES = ('frontend/renguin-achievements/', 'assets/bg-history/',
                   'assets/home-favorites/', 'memory/')
# Same shape in both versions, so the two maps are unioned entry by entry.
FLAT_MAPS = {'asset-positions.json', 'asset-defaults.json'}
RESIDENT_MANIFEST = 'frontend/creator-residents.json'
PRESENTATION = '.user-presentation/'
# Portraits are the user's cast; the house frame is Living Lodge chrome.
CHARACTER_TREES = ('frontend/renguin-characters/residents/', 'frontend/renguin-characters/astra/',
                   'frontend/renguin-characters/editor/', 'frontend/renguin-characters/director/',
                   'frontend/renguin-characters/scanner/', 'frontend/renguin-characters/system/')
KEEP_NEW_ART = ('frontend/renguin-characters/project-house.png',
                'frontend/renguin-characters/project-house-wide.png')
CODE_SUFFIXES = {'.py', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.css', '.html', '.htm',
                 '.ps1', '.cmd', '.bat', '.sh', '.rs', '.toml', '.lock', '.md', '.yml', '.yaml'}
CODE_TREES = ('backend/', 'scripts/', 'tests/', 'docs/', 'electron-shell/', 'desktop-pet/',
              'browser-bridge/', 'dist/', 'frontend/vendor/', 'frontend/fonts/')
AUDIT_SUFFIXES = {'.log', '.out', '.pid', '.bak', '.original', '.pyc'}
AUDIT_TREES = ('.preview-runtime/', '.qa-runtime/', '.qa-workflow-state/', '.local-browser/',
               '__pycache__/', '.venv/', 'node_modules/')

RESTORE, MERGE, KEEP_NEW, AUDIT, UNCERTAIN = (
    'RESTORE_USER_DATA', 'MERGE_DATA', 'KEEP_NEW_CODE', 'AUDIT_ONLY', 'UNCERTAIN')


def git(repo: Path, *args, binary=False):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True)
    if result.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ': ' +
                           result.stderr.decode('utf-8', 'replace').strip())
    return result.stdout if binary else result.stdout.decode('utf-8', 'replace')


def find_stash(repo: Path, name: str):
    """Locate the stash by message without touching it."""
    for line in git(repo, 'stash', 'list').splitlines():
        ref, _, message = line.partition(':')
        if name in message:
            return ref.strip(), message.strip()
    return None, None


def entries(repo: Path, ref: str):
    """Every path the stash carries: tracked edits, plus untracked and ignored if present."""
    found = []
    for path in git(repo, 'diff', '--name-only', ref + '^1', ref).splitlines():
        if path.strip():
            found.append({'path': path.strip(), 'origin': 'tracked', 'source': ref})
    try:
        git(repo, 'rev-parse', '--verify', ref + '^3')
    except RuntimeError:
        return found
    known = {item['path'] for item in found}
    for path in git(repo, 'ls-tree', '-r', '--name-only', ref + '^3').splitlines():
        path = path.strip()
        if path and path not in known:
            found.append({'path': path, 'origin': 'untracked-or-ignored', 'source': ref + '^3'})
    return found


def classify(path: str):
    """Decide what a stashed path is, by location and kind rather than by guesswork."""
    lowered = path.lower()
    if path in KEEP_NEW_ART:
        return KEEP_NEW, 'Living Lodge house frame art ships with the checkout'
    if any(lowered.startswith(tree) for tree in AUDIT_TREES) or Path(lowered).suffix in AUDIT_SUFFIXES:
        return AUDIT, 'transient evidence or local runtime scratch'
    if '.backup' in lowered or 'audit' in lowered or lowered.endswith('.original'):
        return AUDIT, 'backup or audit artefact'
    if path == RESIDENT_MANIFEST:
        return MERGE, 'resident manifest is referenced by name from the presentation store'
    if path in FLAT_MAPS:
        return MERGE, 'asset map merges entry by entry'
    if path.startswith(PRESENTATION):
        return MERGE, 'presentation store holds projects, covers, inbox and cast'
    if path in USER_DATA or any(path.startswith(tree) for tree in USER_DATA_TREES):
        return RESTORE, 'local runtime state the sync never tracked'
    if any(path.startswith(tree) for tree in CHARACTER_TREES):
        return RESTORE, 'character portrait supplied by the user'
    if any(path.startswith(tree) for tree in CODE_TREES) or Path(lowered).suffix in CODE_SUFFIXES:
        return KEEP_NEW, 'implementation file; the checkout is authoritative'
    return UNCERTAIN, 'no rule matched; quarantined for review'


def newer(left, right):
    """Compare two updated_at stamps; missing or unparsable sorts oldest."""
    def stamp(value):
        try:
            return datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
        except (TypeError, ValueError):
            return float('-inf')
    return stamp(left) >= stamp(right)


def merge_flat_map(old: dict, current: dict):
    """Union of both maps; the entry with the newer stamp wins a shared key."""
    merged = dict(current)
    added, kept = [], []
    for key, value in (old or {}).items():
        if key not in merged:
            merged[key] = value
            added.append(key)
        elif newer(value.get('updated_at'), merged[key].get('updated_at')):
            merged[key] = value
            kept.append(key)
    return merged, {'added_from_stash': added, 'stash_entry_was_newer': kept}


def merge_residents(old: list, current: list, repo: Path):
    """Keep the checkout's cast and re-add any name the user's data may still point at."""
    by_name = {item['name']: item for item in current if isinstance(item, dict) and 'name' in item}
    merged, restored, dropped = list(current), [], []
    for item in (old or []):
        if not isinstance(item, dict) or 'name' not in item:
            continue
        if item['name'] in by_name:
            continue
        art = repo / 'frontend/renguin-characters/residents' / str(item.get('file', ''))
        if art.is_file():
            merged.append(item)
            restored.append(item['name'])
        else:
            dropped.append({'name': item['name'], 'missing_art': str(item.get('file'))})
    return merged, {'restored_names': restored, 'skipped_missing_art': dropped}


def read_store(path: Path):
    if not path.is_file():
        return None
    db = sqlite3.connect(path, timeout=10)
    try:
        row = db.execute('SELECT value FROM metadata WHERE id=1').fetchone()
        return json.loads(row[0]) if row else None
    except (sqlite3.DatabaseError, ValueError, TypeError):
        return None
    finally:
        db.close()


def merge_presentation(old: dict, current: dict):
    """Old values fill the gaps the current store has; nothing set since the sync is lost."""
    merged = json.loads(json.dumps(current))
    report = {'projects_recovered': [], 'fields_recovered': {}, 'inbox_recovered': []}
    for section, key in (('projects', 'projects_recovered'), ('inbox', 'inbox_recovered')):
        target = merged.setdefault(section, {})
        for item_id, old_item in (old.get(section) or {}).items():
            if item_id not in target:
                target[item_id] = old_item
                report[key].append(item_id)
            elif isinstance(old_item, dict) and isinstance(target[item_id], dict):
                filled = []
                for field, value in old_item.items():
                    if target[item_id].get(field) in (None, '', {}, [], False) and value not in (None, '', {}, []):
                        target[item_id][field] = value
                        filled.append(field)
                if filled:
                    report['fields_recovered'].setdefault(section, {})[item_id] = filled
    for order_key in ('order', 'project_order'):
        current_order = list(merged.get(order_key) or [])
        for item_id in (old.get(order_key) or []):
            if item_id not in current_order:
                current_order.append(item_id)
        if current_order:
            merged[order_key] = current_order
    merged['revision'] = max(int(old.get('revision') or 0), int(merged.get('revision') or 0)) + 1
    return merged, report


def write_store(path: Path, value: dict):
    db = sqlite3.connect(path, timeout=10)
    try:
        db.execute('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
        db.execute('INSERT OR REPLACE INTO metadata VALUES(1, ?)', (json.dumps(value, ensure_ascii=False),))
        db.commit()
    finally:
        db.close()


def load_json(raw: bytes, fallback):
    try:
        return json.loads(raw.decode('utf-8-sig'))
    except (ValueError, UnicodeDecodeError):
        return fallback


def recover(repo: Path, stash_name: str, apply: bool, workspace: Path):
    repo = repo.resolve()
    ref, message = find_stash(repo, stash_name)
    result = {'repo': str(repo), 'stash_requested': stash_name, 'stash_ref': ref,
              'stash_message': message, 'applied': False, 'head': git(repo, 'rev-parse', 'HEAD').strip(),
              'workspace': str(workspace), 'items': [], 'actions': [], 'notes': []}
    if not ref:
        result['error'] = 'STASH_NOT_FOUND'
        return result

    quarantine = workspace / 'stash-contents'
    backups = workspace / 'backups'
    quarantine.mkdir(parents=True, exist_ok=True)
    backups.mkdir(parents=True, exist_ok=True)

    found = entries(repo, ref)
    blobs = {}
    for item in found:
        category, reason = classify(item['path'])
        raw = git(repo, 'show', f"{item['source']}:{item['path']}", binary=True)
        blobs[item['path']] = raw
        copy = quarantine / item['path']
        copy.parent.mkdir(parents=True, exist_ok=True)
        copy.write_bytes(raw)
        item.update({'category': category, 'reason': reason, 'bytes': len(raw),
                     'quarantined_at': str(copy)})
        result['items'].append(item)

    def backup(target: Path):
        if not target.exists():
            return None
        keep = backups / target.relative_to(repo)
        keep.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, keep)
        return str(keep)

    def record(path, action, detail=None, **extra):
        entry = {'path': path, 'action': action, 'detail': detail}
        entry.update(extra)
        result['actions'].append(entry)

    # Data lands before the manifests that reference it, so a merge sees the real files.
    order = {RESTORE: 0, MERGE: 1, KEEP_NEW: 2, AUDIT: 3, UNCERTAIN: 4}
    for item in sorted(result['items'], key=lambda i: order[i['category']]):
        path, category = item['path'], item['category']
        target = repo / path
        raw = blobs[path]
        if category in (KEEP_NEW, AUDIT, UNCERTAIN):
            record(path, 'SKIPPED', item['reason'], category=category)
            continue

        if category == RESTORE:
            if target.exists() and target.read_bytes() == raw:
                record(path, 'ALREADY_PRESENT', 'on disk and identical to the stash')
                continue
            # A tracked path inside the stash is a file the user edited before the sync,
            # so their version is the data; untracked runtime state on disk stays live.
            edited = item['origin'] == 'tracked'
            if target.exists() and not edited:
                record(path, 'KEPT_ON_DISK',
                       'live runtime state has changed since the sync; the stash copy is quarantined',
                       quarantined_at=item['quarantined_at'])
                continue
            saved = backup(target) if target.exists() else None
            if apply:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
            record(path, 'RESTORED' if apply else 'WOULD_RESTORE',
                   'the user edited this file before the sync' if edited else 'missing from the checkout',
                   backup=saved)
            continue

        # MERGE
        if path in FLAT_MAPS:
            old = load_json(raw, {})
            current = load_json(target.read_bytes(), {}) if target.exists() else {}
            merged, detail = merge_flat_map(old, current)
            if merged == current:
                record(path, 'NO_CHANGE', 'the checkout already holds every stashed entry')
                continue
            saved = backup(target)
            if apply:
                target.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            record(path, 'MERGED' if apply else 'WOULD_MERGE', detail, backup=saved)
            continue

        if path == RESIDENT_MANIFEST:
            old = load_json(raw, [])
            current = load_json(target.read_bytes(), []) if target.exists() else []
            merged, detail = merge_residents(old, current, repo)
            if merged == current:
                record(path, 'NO_CHANGE', 'the checkout cast already covers the stashed names')
                continue
            saved = backup(target)
            if apply:
                target.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            record(path, 'MERGED' if apply else 'WOULD_MERGE', detail, backup=saved)
            continue

        if path.startswith(PRESENTATION):
            if not path.endswith('presentation.sqlite'):
                if target.exists():
                    record(path, 'KEPT_ON_DISK', 'cover asset already present')
                else:
                    if apply:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(raw)
                    record(path, 'RESTORED' if apply else 'WOULD_RESTORE', 'cover asset missing')
                continue
            staged = quarantine / (path + '.stash.sqlite')
            staged.parent.mkdir(parents=True, exist_ok=True)
            staged.write_bytes(raw)
            old = read_store(staged)
            current = read_store(target)
            if old is None:
                record(path, 'SKIPPED', 'the stashed store could not be read')
                continue
            if current is None:
                saved = backup(target)
                if apply:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(staged, target)
                record(path, 'RESTORED' if apply else 'WOULD_RESTORE',
                       'no readable store in the checkout', backup=saved)
                continue
            merged, detail = merge_presentation(old, current)
            saved = backup(target)
            if apply:
                write_store(target, merged)
            record(path, 'MERGED' if apply else 'WOULD_MERGE', detail, backup=saved)

    result['applied'] = apply
    result['summary'] = {category: sum(1 for i in result['items'] if i['category'] == category)
                         for category in (RESTORE, MERGE, KEEP_NEW, AUDIT, UNCERTAIN)}
    return result


def survey(repo: Path):
    """What the user's data looks like right now, stash aside."""
    repo = repo.resolve()
    store = read_store(repo / '.user-presentation/presentation.sqlite')
    preview_store = read_store(repo / '.preview-runtime/user-presentation/presentation.sqlite')
    manifest = load_json((repo / RESIDENT_MANIFEST).read_bytes(), []) if (repo / RESIDENT_MANIFEST).is_file() else []
    names = {item.get('name') for item in manifest if isinstance(item, dict)}
    out = {'resident_manifest_count': len(manifest), 'dangling_resident_references': []}
    for label, value in (('production', store), ('preview', preview_store)):
        if value is None:
            out[label] = None
            continue
        projects = value.get('projects') or {}
        out[label] = {
            'revision': value.get('revision'),
            'projects': len(projects),
            'named_projects': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('display_name')),
            'covers': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('cover')),
            'with_workflow': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('workflow')),
            'cast_assigned': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('resident_character')),
            'manually_completed': sum(1 for p in projects.values() if isinstance(p, dict) and (p.get('manual_done') or {}).get('done')),
            'inbox': len(value.get('inbox') or {}),
        }
        for pid, meta in projects.items():
            cast = isinstance(meta, dict) and meta.get('resident_character')
            if cast and cast not in names:
                out['dangling_resident_references'].append({'store': label, 'project': pid, 'name': cast})
    for name in ('state.json', 'agents-state.json', 'runtime-config.json', 'join-keys.json',
                 'frontend/renguin-projects.json', 'frontend/renguin-projects-v2.json',
                 'frontend/renguin-achievements.json', 'frontend/codex_activity.json',
                 'frontend/bionic_activity.json', 'asset-positions.json', 'asset-defaults.json'):
        target = repo / name
        out.setdefault('local_files', {})[name] = target.stat().st_size if target.is_file() else None
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='.')
    parser.add_argument('--stash', default='local-before-sync-20260910')
    parser.add_argument('--workspace', default=None)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--survey-only', action='store_true')
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    workspace = Path(args.workspace) if args.workspace else repo / (
        '.recovery-' + time.strftime('%Y%m%d-%H%M%S'))
    workspace.mkdir(parents=True, exist_ok=True)

    report = {'generated_at': datetime.now(timezone.utc).isoformat(),
              'before': survey(repo)}
    if not args.survey_only:
        report['recovery'] = recover(repo, args.stash, args.apply, workspace)
        report['after'] = survey(repo)
    (workspace / 'recovery-report.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    recovery = report.get('recovery') or {}
    return 2 if recovery.get('error') else 0


if __name__ == '__main__':
    sys.exit(main())
