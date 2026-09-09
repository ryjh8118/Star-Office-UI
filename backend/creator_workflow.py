"""Office workflow preferences, derived only from validated evidence.

This module never writes source ledgers. A user's saved revision supersedes
older evidence; new evidence can advance the chain without replaying history.
"""
from datetime import datetime, timezone
import hashlib

STEPS = list(zip(
    ['INDEX','CALIBRATION','LONGFORM_DIRECTOR','WORKORDER','GATE','AI_ROUGH_CUT',
     'HUMAN_FINAL_CUT','FINAL_CUT_LEARNING','AI_POST','POST_LEARNING','PUBLISH',
     'MEMBER_PUBLISH','SHORT_PUBLISH'],
    ['素材','校正','導演','工單','確認','粗剪','定剪','定剪學習','後製','後製學習','上映','會員影片','短影音']))
IDS = [s[0] for s in STEPS]
LABELS = dict(STEPS)
ALIASES = {'RAW':'INDEX','ROUGH_CUT_LEARNING':'POST_LEARNING',
           'PRODUCTION_LEARNING':'POST_LEARNING','HUMAN_POST_QC':'AI_POST',
           'FINAL_QC':'AI_POST'}
COMPLETE = {'DONE','COMPLETED','VERIFIED'}

def seconds(value):
    try:
        return datetime.fromisoformat(str(value).replace('Z','+00:00')).timestamp()
    except (ValueError, TypeError, OverflowError):
        return 0

def rows(project):
    result = list(project.get('timeline') or [])
    for macro in project.get('workflow') or []:
        if isinstance(macro, dict):
            result.extend(macro.get('stages') or [])
    return result

def evidence(project, history=()):
    result = {}
    for row in [*rows(project), *history]:
        stamp = row.get('timestamp') or row.get('updated_at')
        key = row.get('ledger_entry_id') or row.get('event_id')
        proof = row.get('evidence_provenance') or {}
        if not key and not (proof.get('verified') is True and proof.get('canonical_project_id') == project.get('source_project_id', project['project_id'])):
            continue
        if not 0 < seconds(stamp) <= datetime.now(timezone.utc).timestamp():
            continue
        stage = row.get('stage_id') or row.get('id')
        if row.get('new_status', row.get('status')) not in COMPLETE:
            continue
        target = ALIASES.get(stage, stage)
        if target not in IDS:
            continue
        identity = str(key or stage + '|' + stamp)
        result[identity] = {'key':identity,'stage':stage,'target':target,'timestamp':stamp}
    return sorted(result.values(), key=lambda e:(seconds(e['timestamp']), e['key']))

def enabled_ids(meta):
    return [s for s in IDS if s not in meta.get('disabled_steps',[])]

def set_chain(meta, count, stamp, source, actor):
    saved = meta.setdefault('workflow', {})
    enabled = enabled_ids(meta)
    for step in IDS:
        i = enabled.index(step) if step in enabled else len(IDS)
        status = 'NOT_REQUIRED' if step not in enabled else 'COMPLETED' if i < count else 'NOT_STARTED'
        if saved.get(step, {}).get('status') == status:
            continue
        saved[step] = {'step_id':step,'status':status,
                      'updated_at':stamp,'completed_at':stamp if i < count else None,
                      'updated_by':actor,'update_source':source}

def completed_count(meta):
    return sum(meta.get('workflow',{}).get(s,{}).get('status') == 'COMPLETED' for s in enabled_ids(meta))

def normalize(project, meta, history=()):
    """Deterministic, idempotent closure. Old evidence cannot undo user choices."""
    meta.setdefault('source_name', project.get('project_name',''))
    meta.setdefault('project_id', project['project_id'])
    meta.setdefault('workflow', {step:{'step_id':step,'status':'NOT_STARTED',
        'updated_at':None,'completed_at':None,'updated_by':'SYSTEM','update_source':'SYSTEM'} for step in IDS})
    seen = set(meta.get('workflow_evidence', []))
    for event in evidence(project, history):
        if event['key'] in seen:
            continue
        seen.add(event['key'])
        if seconds(event['timestamp']) <= seconds(meta.get('workflow_user_at')):
            continue
        count = sum(IDS.index(s) <= IDS.index(event['target']) for s in enabled_ids(meta))
        previous = completed_count(meta)
        if count <= previous:
            continue
        set_chain(meta, count, event['timestamp'], 'INFERENCE', 'SYSTEM')
        if count == previous + 1:
            continue
        reason = '剪輯學習完成' if event['stage'] in {'ROUGH_CUT_LEARNING','PRODUCTION_LEARNING'} else LABELS[event['target']] + '完成'
        meta.setdefault('history', []).append({
            'type':'WORKFLOW_INFERENCE','event_id':'inferred:'+hashlib.sha256(event['key'].encode()).hexdigest()[:20],
            'timestamp':event['timestamp'],'source':'INFERENCE',
            'text':f'依{reason}，自動補齊素材 → {LABELS[event["target"]]}',
            'evidence_id':event['key']})
    meta['workflow_evidence'] = sorted(seen)
    return meta
