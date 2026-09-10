#!/usr/bin/env python3
"""Answer one question: why is the Office showing nothing?

Read-only. Checks the three things that can empty the page independently —
the user's presentation store, the canonical project source, and whether the
store is sitting in a stash or in a different Office folder — then says which
one it is.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

STORE = '.user-presentation/presentation.sqlite'
PREVIEW_STORE = '.preview-runtime/user-presentation/presentation.sqlite'


def read_store(path: Path):
    """Summarise a presentation store without changing it."""
    if not path.is_file():
        return None
    try:
        db = sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=5)
    except sqlite3.Error:
        return {'unreadable': True}
    try:
        row = db.execute('SELECT value FROM metadata WHERE id=1').fetchone()
        value = json.loads(row[0]) if row else {}
    except (sqlite3.DatabaseError, ValueError, TypeError):
        return {'unreadable': True}
    finally:
        db.close()
    projects = value.get('projects') or {}
    local = value.get('local_projects') or {}
    return {
        'revision': value.get('revision'),
        'projects': len(projects),
        'local_projects': len(local),
        'named': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('display_name')),
        'covers': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('cover')),
        'workflow': sum(1 for p in projects.values() if isinstance(p, dict) and p.get('workflow')),
        'completed': sum(1 for p in projects.values()
                         if isinstance(p, dict) and (p.get('manual_done') or {}).get('done')),
        'inbox': len(value.get('inbox') or {}),
    }


def canonical(repo: Path):
    """Ask the same adapter the Office asks, through the same boundary module."""
    producer = os.environ.get('RENGUIN_PRODUCER_ROOT', r'E:\Renguin_AISystem\Content_OS')
    adapter = Path(producer) / '10_AI_Editorial_Engine/04_Adapters/Star_Office'
    out = {'producer_root': producer,
           'canonical_root': os.environ.get('RENGUIN_CANONICAL_ROOT', producer),
           'adapter_dir': str(adapter), 'adapter_found': adapter.is_dir()}
    sys.path.insert(0, str(repo / 'backend'))
    try:
        import renguin_boundary
        result = renguin_boundary.projects(str(repo / 'frontend'))
    except Exception as error:                        # the boundary itself failed to load
        out.update(status='IMPORT_FAILED', detail=f'{type(error).__name__}: {error}')
        return out
    payload = result.get('projection') or {}
    sources = payload.get('projects') or []
    out.update(status=result.get('status'),
               detail=(result.get('error') or {}).get('detail'),
               projects=len(sources),
               usable=sum(1 for p in sources if p.get('classification') == 'REGISTERED'
                          and p.get('project_type') in {'YOUTUBE', 'VIDEO_PROJECT'}))
    return out


def stashes(repo: Path):
    """Which stashes carry a presentation store, without touching any of them."""
    found = []
    try:
        listing = subprocess.run(['git', '-C', str(repo), 'stash', 'list'],
                                 capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return found
    for line in listing.stdout.splitlines():
        ref = line.split(':', 1)[0].strip()
        if not ref:
            continue
        carried = []
        for tree in (ref, ref + '^3'):
            listed = subprocess.run(['git', '-C', str(repo), 'ls-tree', '-r', '--name-only', tree],
                                    capture_output=True, text=True, timeout=20)
            if listed.returncode:
                continue
            carried += [p for p in listed.stdout.splitlines() if p.startswith('.user-presentation/')]
        found.append({'ref': ref, 'message': line.split(':', 1)[-1].strip(),
                      'presentation_files': len(carried),
                      'has_store': any(p.endswith('presentation.sqlite') for p in carried)})
    return found


def siblings(repo: Path, depth=2):
    """Other Office folders on this machine that hold their own store."""
    found = []
    roots = {repo.parent, repo.parent.parent}
    seen = set()
    for root in roots:
        try:
            entries = [p for p in root.iterdir() if p.is_dir()]
        except OSError:
            continue
        for folder in entries:
            if folder.resolve() in seen:
                continue
            seen.add(folder.resolve())
            for relative in (STORE, PREVIEW_STORE):
                store = folder / relative
                if store.is_file() and folder.resolve() != repo.resolve():
                    found.append({'folder': str(folder), 'store': relative,
                                  'summary': read_store(store)})
    return found


def verdict(report):
    """Say which of the independent causes is actually emptying the page."""
    live = report['stores']['production']
    source = report['canonical']
    lines = []
    has_data = bool(live and not live.get('unreadable') and
                    (live.get('projects') or live.get('local_projects')))
    reachable = source.get('status') in {'FRESH', 'STALE'} and source.get('usable', 0) > 0

    if not live:
        lines.append('你的正式資料庫不存在：.user-presentation\\presentation.sqlite 找不到。')
        carrier = [s for s in report['stashes'] if s['has_store']]
        if carrier:
            lines.append(f"資料在 stash {carrier[0]['ref']}（{carrier[0]['message']}）裡。"
                         '跑 scripts\\recover_local_settings.ps1 把它搬回來。')
        elif report['other_folders']:
            best = max(report['other_folders'],
                       key=lambda f: (f['summary'] or {}).get('projects', 0))
            lines.append(f"但另一個資料夾有：{best['folder']}\\{best['store']}"
                         f"（{(best['summary'] or {}).get('projects', 0)} 個專案）。"
                         '你以前的 Office 是在那裡跑的。')
        else:
            lines.append('也沒有在 stash 或其他資料夾找到。這個 checkout 從未存過資料。')
    elif live.get('unreadable'):
        lines.append('資料庫存在但讀不出來（檔案可能損壞）。先備份再處理。')
    elif not has_data:
        lines.append('資料庫存在但裡面是空的（0 個專案）。')
        if report['other_folders']:
            best = max(report['other_folders'],
                       key=lambda f: (f['summary'] or {}).get('projects', 0))
            if (best['summary'] or {}).get('projects', 0):
                lines.append(f"你的資料可能在 {best['folder']}\\{best['store']}"
                             f"（{best['summary']['projects']} 個專案）。")

    if not reachable:
        lines.append('Content OS 接不上：'
                     f"status={source.get('status')} detail={source.get('detail')}。")
        lines.append('卡片是由 Content OS 的企劃清單長出來的，接不上就一張卡片都沒有——'
                     '封面和「最近完成」也會跟著看不到，即使資料庫是滿的。')
        if not source.get('adapter_found'):
            lines.append(f"缺的是 adapter：{source['adapter_dir']}")
        lines.append('先修這個，或先用「＋ 新增專案」建本地卡片頂著。')

    if has_data and reachable:
        lines.append('資料庫有資料，Content OS 也接得上。畫面空的原因不在這兩者，'
                     '請把瀏覽器 Console 的錯誤訊息給我。')
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    repo = Path(args.repo).resolve()

    report = {
        'repo': str(repo),
        'stores': {'production': read_store(repo / STORE),
                   'preview': read_store(repo / PREVIEW_STORE)},
        'canonical': canonical(repo),
        'stashes': stashes(repo),
        'other_folders': siblings(repo),
    }
    report['verdict'] = verdict(report)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    def show(title):
        print('\n' + title)
        print('-' * len(title))

    print('STAR OFFICE DOCTOR')
    print('==================')
    print('資料夾:', repo)

    show('1. 你的資料庫')
    for label, relative, key in (('正式辦公室 (19000)', STORE, 'production'),
                                 ('Preview   (19119)', PREVIEW_STORE, 'preview')):
        value = report['stores'][key]
        if value is None:
            print(f'  {label}  找不到          {relative}')
        elif value.get('unreadable'):
            print(f'  {label}  讀不出來        {relative}')
        else:
            print(f'  {label}  專案 {value["projects"]} · 本地卡片 {value["local_projects"]} · '
                  f'封面 {value["covers"]} · 已完成 {value["completed"]} · 待辦 {value["inbox"]} '
                  f'(revision {value["revision"]})')

    show('2. Content OS 來源')
    source = report['canonical']
    print('  PRODUCER_ROOT :', source['producer_root'])
    print('  adapter       :', 'FOUND' if source['adapter_found'] else 'MISSING', '->', source['adapter_dir'])
    print('  projection    :', source.get('status'), source.get('detail') or '')
    if 'projects' in source:
        print(f"  可用企劃      : {source['usable']} / {source['projects']}")

    show('3. Stash 裡有沒有你的資料')
    if not report['stashes']:
        print('  (沒有任何 stash)')
    for entry in report['stashes']:
        mark = '有 presentation.sqlite' if entry['has_store'] else '沒有'
        print(f"  {entry['ref']:<12} {mark:<22} {entry['message']}")

    show('4. 其他 Office 資料夾')
    if not report['other_folders']:
        print('  (附近沒有找到別的 Office 資料庫)')
    for entry in report['other_folders']:
        summary = entry['summary'] or {}
        print(f"  {entry['folder']}\\{entry['store']}  專案 {summary.get('projects', '?')} · "
              f"封面 {summary.get('covers', '?')}")

    show('結論')
    for line in report['verdict']:
        print('  *', line)
    return 0


if __name__ == '__main__':
    sys.exit(main())
