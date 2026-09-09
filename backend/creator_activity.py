"""Display-only recent work observations; no observer heartbeat or running claims."""
import json
from pathlib import Path
from datetime import datetime, timezone

def enrich(board, home):
    sessions = (Path(home) / '.codex/sessions').resolve()
    for item in (board.get('native_coverage') or {}).get('observations', []):
        if item.get('source') != 'CODEX_NATIVE_JOURNAL':
            continue
        path = Path((item.get('provenance') or {}).get('path', '')).resolve()
        if not path.is_relative_to(sessions):
            continue
        try:
            with path.open('rb') as f:
                offset = max(0, path.stat().st_size - 1024*1024)
                f.seek(offset)
                if offset:
                    f.readline()
                raw = f.read(1024*1024)
            latest = None
            for line in raw.splitlines():
                try:
                    row = json.loads(line)
                    payload = row.get('payload') or {}
                    work = (row.get('type') == 'response_item' and (payload.get('type') in {'function_call','function_call_output'} or payload.get('type') == 'message' and payload.get('role') == 'assistant')) or (row.get('type') == 'event_msg' and payload.get('type') in {'task_started','task_complete','task_failed','agent_message','agent_reasoning'})
                    if not work:
                        continue
                    stamp = row.get('timestamp')
                    parsed = datetime.fromisoformat(stamp.replace('Z','+00:00'))
                    if parsed.tzinfo and parsed <= datetime.now(timezone.utc):
                        latest = {'timestamp':stamp,'type':'RECENT_WORK_EVENT'}
                except (ValueError,TypeError,AttributeError):
                    continue
            if latest:
                item['last_work_event'] = latest
        except OSError:
            continue
    return board
