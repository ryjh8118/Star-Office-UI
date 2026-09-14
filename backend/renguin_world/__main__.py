"""Renguin World CLI. Run from backend/:  python -m renguin_world <command>

  build        precompute world_state (writes only the world runtime cache)
  roadmap      milestone table from the 100-content mock simulation
  simulate N   world_state for the first N mock contents
  characters   the derived character / goosebaby / civilian registry
  youtube-sync fetch view counts (GATED without YOUTUBE_API_KEY)
"""
import argparse
import json
from pathlib import Path
import sys

from . import content_adapter, engine, service

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / 'frontend'


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m renguin_world')
    parser.add_argument('command', choices=['build', 'roadmap', 'simulate', 'characters', 'youtube-sync'])
    parser.add_argument('count', nargs='?', type=int, default=100)
    parser.add_argument('--presentation-root', default=content_adapter.presentation_root_from_env(str(ROOT / '.user-presentation')))
    parser.add_argument('--audience', choices=['public', 'local'], default='public')
    parser.add_argument('--idle', type=int, default=0)
    parser.add_argument('--gap', type=int, default=0)
    parser.add_argument('--markdown', action='store_true')
    args = parser.parse_args(argv)
    if args.command == 'build':
        state = service.live_state(args.presentation_root, FRONTEND, refresh=True)
        output = state if args.audience == 'local' else engine.public_view(state)
    elif args.command == 'roadmap':
        rows = service.roadmap(FRONTEND)
        if args.markdown:
            print('| 內容數 | 成長值 | Lv | 時代 | 階段 | 城市半徑 | 建築 | 地標 | 開放街區 | 居民容量 | 星港之門 |')
            print('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
            for r in rows:
                print(f"| {r['contents']} | {r['world_score']} | {r['world_level']} | {r['era']} {r['era_name']} | {r['stage']} | "
                      f"{r['city_radius']} | {r['buildings']} | {r['landmarks']} | {len(r['districts'])} | {r['resident_capacity']} | {r['future_gate']} |")
            return 0
        output = rows
    elif args.command == 'simulate':
        output = service.simulate(args.count, FRONTEND, idle_days=args.idle, gap_before_last=args.gap)
    elif args.command == 'characters':
        registry = service.registry(FRONTEND)
        output = {**registry, 'sources': [{k: v for k, v in s.items() if k != 'path'} for s in registry['sources']]}
    else:
        output = service.sync_youtube(args.presentation_root)
    json.dump(output, sys.stdout, ensure_ascii=False, indent=1)
    print()
    return 0 if args.command != 'youtube-sync' or output['status'] == 'OK' else 1


if __name__ == '__main__':
    raise SystemExit(main())
