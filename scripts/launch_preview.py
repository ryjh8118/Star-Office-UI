"""Native Python entry point for the established isolated Preview server."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

import preview_identity

PRODUCER = Path(r'C:\Users\User\.codex\visualizations\2026\09\08\01a08239-462a-7150-8123-a739ec86aece\content-os-entry-cert')
CANONICAL = Path('E:/Renguin_AISystem/Content_OS')
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
WINDOWS = os.name == 'nt'

def identity(port):
    try:
        with OPENER.open(f'http://127.0.0.1:{port}/api/renguin/preview-info', timeout=.4) as response:
            return json.loads(response.read(16384))
    except (OSError, ValueError):
        return None

def verify(value, office, state):
    preview_identity.verify(value, {'office_worktree': office, 'producer_worktree': PRODUCER,
                                    'canonical_root': CANONICAL, 'state_directory': state})

class Lock:
    """Kernel-backed launcher lock; releases on crash, so no stale PID file to delete."""
    def __init__(self, path):
        self.path = path
    def __enter__(self):
        self.handle = self.path.open('a+b')
        self.handle.seek(0, 2)
        if not self.handle.tell():
            self.handle.write(b'0')
            self.handle.flush()
        self.handle.seek(0)
        if WINDOWS:
            import msvcrt
            msvcrt.locking(self.handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX)
        return self
    def __exit__(self, *_):
        try:
            if WINDOWS:
                import msvcrt
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        finally:
            self.handle.close()

def claim(port):
    """Prove the port is ours before spawning anything on it.

    The probe matches how the Preview server itself binds, so a port left in
    TIME_WAIT by an earlier Preview is not mistaken for a live occupant.
    """
    try:
        with socket.socket() as probe:
            if WINDOWS:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            else:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(('127.0.0.1', port))
    except OSError as error:
        raise RuntimeError(
            f'PREVIEW_PORT_IN_USE port={port} ({error.strerror or error}); '
            'it is held by something that does not answer as a Preview, '
            'so it is not stopped. Close it or choose another --port'
        ) from error

def owns_preview(pid):
    """Confirm with the operating system that the pid really is a Preview server."""
    if not isinstance(pid, int) or pid <= 0 or pid == os.getpid():
        return False
    if WINDOWS:
        try:
            listing = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV', '/NH'],
                                     capture_output=True, text=True, timeout=10).stdout.lower()
        except (OSError, subprocess.SubprocessError):
            return False
        return 'python' in listing and str(pid) in listing
    try:
        line = Path(f'/proc/{pid}/cmdline').read_bytes().decode('utf-8', 'replace')
    except OSError:
        return False
    return 'preview_server.py' in line

def stop(pid, port):
    """Stop one identified Preview server and wait for the port to come back."""
    if WINDOWS:
        subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'],
                       capture_output=True, text=True, timeout=20)
    else:
        import signal
        os.kill(pid, signal.SIGTERM)
    for _ in range(60):
        if identity(port) is None:
            return True
        time.sleep(.25)
    return False

def start(office, state, port):
    command = [sys.executable, '-B', '-X', 'utf8', str(office / 'scripts/preview_server.py'),
               '--port', str(port), '--state-dir', str(state), '--canonical-root', str(CANONICAL),
               '--producer-root', str(PRODUCER), '--native-home', 'C:/Users/User', '--discovery-root', 'E:/']
    options = {'creationflags': subprocess.CREATE_NO_WINDOW} if WINDOWS else {'start_new_session': True}
    with (state / 'server.out.log').open('ab') as out, (state / 'server.err.log').open('ab') as err:
        process = subprocess.Popen(command, cwd=office, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                   close_fds=True, **options)
    for _ in range(80):
        if process.poll() is not None:
            raise RuntimeError('PREVIEW_SERVER_EXITED; see ' + str(state / 'server.err.log'))
        current = identity(port)
        if current:
            return current
        time.sleep(.1)
    raise RuntimeError('PREVIEW_SERVER_UNRESPONSIVE; see ' + str(state / 'server.err.log'))

def resolve(args, office, state, wanted):
    """Bring the requested port to this checkout's Preview, then gate it as before."""
    steps = []
    for attempt in range(2):
        current = identity(args.port)
        plan = preview_identity.classify(current, {'office_worktree': office}, wanted)
        steps.append(plan)
        if plan['action'] == 'ATTACH':
            return current, steps
        if plan['action'] == 'REFUSE':
            raise RuntimeError('PREVIEW_PORT_UNAVAILABLE:' + plan['reason'] +
                               f" port={args.port} pid={plan.get('pid')}; choose another --port")
        if plan['action'] in ('RECLAIM', 'RESTART'):
            if plan['action'] == 'RECLAIM' and args.keep_foreign:
                raise RuntimeError('PREVIEW_PORT_UNAVAILABLE:' + plan['reason'] +
                                   f" port={args.port} holder={plan.get('holder')} pid={plan.get('pid')}"
                                   '; drop --keep-foreign to reclaim it, or choose another --port')
            pid = plan.get('pid')
            if not owns_preview(pid):
                raise RuntimeError('PREVIEW_PORT_UNVERIFIED_HOLDER:' + plan['reason'] +
                                   f" port={args.port} pid={pid}; not a Preview process, refusing to stop it")
            if attempt or not stop(pid, args.port):
                raise RuntimeError('PREVIEW_PORT_NOT_RELEASED' + f" port={args.port} pid={pid}")
            steps.append({'action': 'STOPPED', 'pid': pid, 'reason': plan['reason']})
            continue
        claim(args.port)
        return start(office, state, args.port), steps
    raise RuntimeError('PREVIEW_PORT_UNSETTLED' + f" port={args.port}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=19109)
    parser.add_argument('--server-only', action='store_true')
    parser.add_argument('--keep-foreign', action='store_true',
                        help='refuse the port instead of reclaiming it from another checkout')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or args.port == 19000:
        raise ValueError('PREVIEW_PORT_REQUIRED')
    office = Path(__file__).resolve().parents[1]
    state = office / '.preview-runtime'
    state.mkdir(parents=True, exist_ok=True)
    wanted, wanted_source = preview_identity.revision(office)
    with Lock(state / 'launcher.lock'):
        current, steps = resolve(args, office, state, wanted)
        verify(current, office, state)
    if not args.server_only:
        chrome = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
        if not chrome.is_file():
            raise RuntimeError('SUPPORTED_BROWSER_MISSING; use --server-only')
        subprocess.Popen([str(chrome), f'--app=http://127.0.0.1:{args.port}/', '--no-first-run',
                          '--no-default-browser-check', '--no-proxy-server', f'--user-data-dir={state / "browser"}'],
                         creationflags=subprocess.CREATE_NO_WINDOW, close_fds=True)
    print(json.dumps({'preview_url': f'http://127.0.0.1:{args.port}/',
                      'office_worktree': str(office), 'checkout_revision': wanted,
                      'checkout_revision_source': wanted_source,
                      'loaded_version': current.get('office_revision'),
                      'revision_match': current.get('office_revision') == wanted,
                      'identity_verified': True, 'steps': steps, 'server': current}, ensure_ascii=False))

if __name__ == '__main__':
    main()
