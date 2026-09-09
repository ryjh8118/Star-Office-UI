"""Stable, unique decorative residents. Map members are reserved, never cloned."""
import json
from pathlib import Path

RESERVED = {'LOGO', 'eric', '哆啦', '雪寶'}

def assign(projects, preferences):
    manifest = json.loads((Path(__file__).resolve().parents[1] / 'frontend/creator-residents.json').read_text(encoding='utf-8'))
    available = [item['name'] for item in manifest if item['name'] not in RESERVED]
    visible = sorted((p for p in projects if p.get('classification') == 'REGISTERED'
                      and p.get('project_type') in {'YOUTUBE','VIDEO_PROJECT'}
                      and not preferences.get(p['project_id'],{}).get('hidden')), key=lambda p:p['project_id'])
    used = set()
    pending = []
    for project in visible:
        meta = preferences.setdefault(project['project_id'],{})
        name = meta.get('resident_character')
        if name in available and name not in used:
            used.add(name)
        else:
            meta.pop('resident_character',None)
            pending.append(meta)
    free = [name for name in available if name not in used]
    for meta,name in zip(pending,free):
        meta['resident_character'] = name
    # If the pool is exhausted, leave extra houses empty instead of cloning.
