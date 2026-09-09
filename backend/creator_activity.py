"""Bounded visual work signals from real native events; never executor leases."""
import json
from pathlib import Path
from datetime import datetime, timezone

def enrich(board, home):
    sessions = (Path(home) / '.codex/sessions').resolve()
    for item in (board.get('native_coverage') or {}).get('observations', []):
        if item.get('source') != 'CODEX_NATIVE_JOURNAL':
            continue
        # A real Git marker identifies repository work. Never infer a project
        # from an agent name, similarly named folder, or another task's lease.
        workspace = str(item.get('worktree') or '').removeprefix('\\\\?\\')
        if workspace:
            root = Path(workspace)
            try:
                for candidate in [root, *root.parents]:
                    if (candidate / '.git').exists():
                        item['repo_context'] = {'id':str(candidate).replace('\\','/').lower(), 'name':candidate.name}
                        break
            except OSError:
                pass
        raw_path = (item.get('provenance') or {}).get('path', '')
        # Windows native databases may return extended-length paths.
        if raw_path.startswith('\\\\?\\'):
            raw_path = raw_path[4:]
        path = Path(raw_path).resolve()
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
                    work = (row.get('type') == 'response_item' and (payload.get('type') in {'function_call','function_call_output'} or payload.get('type') == 'message' and payload.get('role') == 'assistant')) or (row.get('type') == 'event_msg' and payload.get('type') in {'task_started','task_complete','task_failed','turn_aborted','agent_message','agent_reasoning'})
                    if not work:
                        continue
                    stamp = row.get('timestamp')
                    parsed = datetime.fromisoformat(stamp.replace('Z','+00:00'))
                    if parsed.tzinfo and parsed <= datetime.now(timezone.utc):
                        event_type = payload.get('type')
                        terminal = event_type in {'task_complete','task_failed','turn_aborted'} or (event_type == 'message' and payload.get('channel') == 'final')
                        label = '工作已完成' if terminal else '正在使用工具' if event_type in {'function_call','function_call_output'} else '正在整理回覆' if event_type in {'message','agent_message'} else '正在思考'
                        latest = {'timestamp':stamp,'type':'RECENT_WORK_EVENT','action':label,'terminal':terminal}
                except (ValueError,TypeError,AttributeError):
                    continue
            if latest:
                item['last_work_event'] = latest
                elapsed = (datetime.now(timezone.utc)-datetime.fromisoformat(latest['timestamp'].replace('Z','+00:00'))).total_seconds()
                item['visual_activity'] = {'state':'WORKING' if not latest['terminal'] and 0 <= elapsed < 90 else 'RECENT',
                    'timestamp':latest['timestamp'],'expires_after_seconds':90,'action':latest['action'],
                    'source':'NATIVE_WORK_EVENT','executor_claim':False}
        except OSError:
            continue
    return board
