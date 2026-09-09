"""Resolve Office cards against an explicitly selected, read-only source."""
from copy import deepcopy

STATE_FIELDS = ('workflow','workflow_evidence','workflow_user_at','manual_done','disabled_steps')

def resolve(sources, data):
    by_id = {p['project_id']:p for p in sources}
    cards = [*sources, *data.get('local_projects',{}).values()]
    result = []
    for card in cards:
        pid = card['project_id']
        meta = data['projects'].get(pid,{})
        sid = meta.get('source_project_id', pid if pid in by_id else None)
        source = by_id.get(sid)
        value = deepcopy(source or card)
        if source is None and 'source_project_id' in meta:
            value = {k:v for k,v in card.items() if k in ('project_id','project_name','classification','project_type')}
        value.update(project_id=pid, source_project_id=sid,
                     project_name=card.get('project_name',''), source_name=(source or {}).get('project_name',''))
        result.append(value)
    return result

def bind(meta, pid, sid, stamp):
    old = meta.get('source_project_id', None if pid.startswith('OFFICE-') else pid)
    if old == sid:
        return
    snapshots = meta.setdefault('source_states',{})
    snapshots[old or 'unlinked'] = {k:deepcopy(meta[k]) for k in STATE_FIELDS if k in meta}
    shared = lambda e: e.get('type') not in {'WORKFLOW_INFERENCE','WORKFLOW_USER','WORKFLOW_SETTINGS','USER_MANUAL_DONE'}
    snapshots[old or 'unlinked']['source_history'] = [e for e in meta.get('history',[]) if not shared(e)]
    meta['history'] = [e for e in meta.get('history',[]) if shared(e)]
    for k in STATE_FIELDS:
        meta.pop(k,None)
    restored = deepcopy(snapshots.get(sid or 'unlinked',{}))
    meta['history'].extend(restored.pop('source_history',[]))
    meta.update(restored)
    meta['source_project_id'] = sid
    meta.setdefault('history',[]).append({'type':'SOURCE_BINDING','source':'USER','timestamp':stamp,
        'text':'你更換了對應企劃；各企劃的進度已分別保留', 'previous_source_id':old,'source_project_id':sid})
