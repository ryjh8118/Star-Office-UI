"""Bounded visual work signals from real native events; never executor leases."""
import json
from pathlib import Path
from datetime import datetime, timezone

LIMIT = 1024*1024

def repo_context(workspace):
    # A real Git marker identifies repository work. Never infer a project
    # from an agent name, similarly named folder, or another task's lease.
    workspace = str(workspace or '').removeprefix('\\\\?\\')
    if not workspace:
        return None
    try:
        for candidate in [Path(workspace), *Path(workspace).parents]:
            marker = candidate / '.git'
            if marker.is_file():
                # A linked worktree is still its repository's work; the marker
                # names that repository as <repo>/.git/worktrees/<name>.
                first = marker.read_text(encoding='utf-8', errors='replace').partition('\n')[0]
                gitdir = candidate / first.removeprefix('gitdir:').strip()
                if gitdir.parent.name == 'worktrees' and gitdir.parent.parent.name == '.git':
                    candidate = gitdir.parent.parent.parent
            elif not marker.exists():
                continue
            return {'id':str(candidate).replace('\\','/').lower(), 'name':candidate.name}
    except OSError:
        pass
    return None

# Codex writes most tool work as custom_tool_call and most thinking as a
# reasoning item; a thread that only did those once read as idle while working.
CODEX_TOOLS = {'function_call','function_call_output','custom_tool_call','custom_tool_call_output',
               'local_shell_call','local_shell_call_output','web_search_call'}

def codex_event(row):
    payload = row.get('payload') or {}
    kind = payload.get('type')
    work = (row.get('type') == 'response_item' and (kind in CODEX_TOOLS or kind == 'reasoning' or kind == 'message' and payload.get('role') == 'assistant')) or (row.get('type') == 'event_msg' and kind in {'task_started','task_complete','task_failed','turn_aborted','agent_message','agent_reasoning'})
    if not work:
        return None
    terminal = kind in {'task_complete','task_failed','turn_aborted'} or (kind == 'message' and payload.get('channel') == 'final')
    return ('工作已完成' if terminal else '正在使用工具' if kind in CODEX_TOOLS else '正在整理回覆' if kind in {'message','agent_message'} else '正在思考'), terminal

def claude_event(row):
    message = row.get('message') or {}
    content = message.get('content')
    parts = [c for c in content if isinstance(c, dict)] if isinstance(content, list) else []
    kinds = {c.get('type') for c in parts}
    if row.get('type') == 'assistant':
        if message.get('stop_reason') == 'end_turn' and 'tool_use' not in kinds:
            return '工作已完成', True
        return ('正在使用工具' if 'tool_use' in kinds else '正在思考' if 'thinking' in kinds else '正在整理回覆'), False
    if row.get('type') == 'user' and not row.get('isMeta'):
        # The only user text consulted is Claude Code's own interruption marker.
        text = content if isinstance(content, str) else ''.join(str(c.get('text', '')) for c in parts if c.get('type') == 'text')
        if text.startswith('[Request interrupted'):
            return '工作已中斷', True
        return ('正在使用工具' if 'tool_result' in kinds else '正在思考'), False
    return None

# Each native source is read only from its own store under the native home.
SOURCES = {'CODEX_NATIVE_JOURNAL':('.codex/sessions', codex_event),
           'CLAUDE_NATIVE_SESSION':('.claude/projects', claude_event)}

def tail(path):
    with path.open('rb') as f:
        offset = max(0, path.stat().st_size - LIMIT)
        f.seek(offset)
        if offset:
            f.readline()
        return f.read(LIMIT).splitlines()

def enrich(board, home, office_root=Path(__file__).resolve().parents[1]):
    # The Office's own repository is its own layer. Identity comes from the Git
    # marker of the checkout serving this request, never from a folder name.
    office = repo_context(office_root)
    for item in (board.get('native_coverage') or {}).get('observations', []):
        source = SOURCES.get(item.get('source'))
        if not source:
            continue
        store, classify = source
        context = repo_context(item.get('worktree'))
        if context:
            if office and context['id'] == office['id']:
                context['layer'] = 'STAR_OFFICE'
            item['repo_context'] = context
        provenance = item.get('provenance') or {}
        # Windows native databases may return extended-length paths.
        raw_path = str((provenance.get('journal') or provenance).get('path') or '').removeprefix('\\\\?\\')
        if not raw_path:
            continue
        path = Path(raw_path).resolve()
        if not path.is_relative_to((Path(home) / store).resolve()):
            continue
        try:
            rows = tail(path)
        except OSError:
            continue
        now = datetime.now(timezone.utc)
        latest = None
        for line in rows:
            try:
                row = json.loads(line)
                event = classify(row)
                if not event:
                    continue
                stamp = row.get('timestamp')
                parsed = datetime.fromisoformat(stamp.replace('Z','+00:00'))
                if parsed.tzinfo and parsed <= now:
                    latest = {'timestamp':stamp,'type':'RECENT_WORK_EVENT','action':event[0],'terminal':event[1]}
            except (ValueError,TypeError,AttributeError):
                continue
        if latest:
            item['last_work_event'] = latest
            elapsed = (now-datetime.fromisoformat(latest['timestamp'].replace('Z','+00:00'))).total_seconds()
            item['visual_activity'] = {'state':'WORKING' if not latest['terminal'] and 0 <= elapsed < 90 else 'RECENT',
                'timestamp':latest['timestamp'],'expires_after_seconds':90,'action':latest['action'],
                'source':'NATIVE_WORK_EVENT','executor_claim':False}
    return board
