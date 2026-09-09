"""Read all validated historical events using the existing producer validators."""
import json
import os
from pathlib import Path
from flask import Blueprint, jsonify, request

bp = Blueprint('creator_history', __name__)

def snapshot():
    from renguin_boundary import producer
    authority = producer()
    root = Path(os.environ.get('RENGUIN_CANONICAL_ROOT', r'E:\Renguin_AISystem\Content_OS'))
    entries, source = authority.snapshot(root)
    if os.environ.get('RENGUIN_PROJECT_SOURCE_ROOTS'):
        from workspace_ledgers import extend
        entries, _ = extend(entries, json.loads(os.environ['RENGUIN_PROJECT_SOURCE_ROOTS']),
                            authority.strict_json(authority.read_bytes(authority.SCHEMAS / 'OS_PROGRESS_LEDGER_ENTRY.schema.json')))
    return authority, entries, source

@bp.get('/api/creator/event-statuses')
def event_statuses():
    try:
        _, entries, _ = snapshot()
        return jsonify({'events':{e['ledger_entry_id']:{'project_id':e['project_id'],'timestamp':e['timestamp'],'status':e['new_status']} for e in entries}})
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        return jsonify({'events':{}, 'error':type(error).__name__}), 503

@bp.get('/api/creator/history')
def history():
    try:
        authority, entries, source = snapshot()
        pid = request.args.get('project_id')
        rows = [e for e in entries if e['project_id'] == pid]
        rows.sort(key=lambda e: (authority.timestamp(e['timestamp']), e['ledger_entry_id']), reverse=True)
        # Keep timestamps, states and provenance intact. This response is never a workflow writer.
        return jsonify({'events':rows,'source':source,'historical':True})
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        return jsonify({'events':[], 'error':type(error).__name__}), 503
