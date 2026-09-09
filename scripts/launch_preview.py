"""Native Python entry point for the established isolated Preview server."""
import argparse
import json
import msvcrt
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

PRODUCER = Path(r'C:\Users\User\.codex\visualizations\2026\09\08\01a08239-462a-7150-8123-a739ec86aece\content-os-entry-cert')
CANONICAL = Path('E:/Renguin_AISystem/Content_OS')
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def identity(port):
    try:
        with OPENER.open(f'http://127.0.0.1:{port}/api/renguin/preview-info', timeout=.4) as response:
            return json.loads(response.read(16384))
    except (OSError, ValueError):
        return None

def verify(value, office, state):
    if not value or value.get('kind') != 'RENGUIN_ISOLATED_P0_PREVIEW' or value.get('canonical_read_only') is not True:
        raise RuntimeError('PREVIEW_IDENTITY_UNVERIFIED')
    for key, expected in [('office_worktree',office),('producer_worktree',PRODUCER),('canonical_root',CANONICAL),('state_directory',state)]:
        if not value.get(key) or Path(value[key]).resolve() != expected.resolve():
            raise RuntimeError('PREVIEW_IDENTITY_MISMATCH:'+key)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=19109)
    parser.add_argument('--server-only',action='store_true')
    args=parser.parse_args()
    if not 1024<=args.port<=65535 or args.port==19000:raise ValueError('PREVIEW_PORT_REQUIRED')
    office=Path(__file__).resolve().parents[1]
    state=office/'.preview-runtime'
    state.mkdir(exist_ok=True)
    # Kernel-backed lock releases on crash; no stale PID lock to delete.
    with (state/'launcher.lock').open('a+b') as lock:
        lock.seek(0,2)
        if not lock.tell():lock.write(b'0');lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(),msvcrt.LK_LOCK,1)
        try:
            current=identity(args.port)
            if current:
                verify(current,office,state)
            else:
                with socket.socket() as probe:
                    probe.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
                    probe.bind(('127.0.0.1',args.port))
                command=[sys.executable,'-B','-X','utf8',str(office/'scripts/preview_server.py'),
                         '--port',str(args.port),'--state-dir',str(state),'--canonical-root',str(CANONICAL),
                         '--producer-root',str(PRODUCER),'--native-home','C:/Users/User','--discovery-root','E:/']
                with (state/'server.out.log').open('ab') as out,(state/'server.err.log').open('ab') as err:
                    process=subprocess.Popen(command,cwd=office,stdin=subprocess.DEVNULL,stdout=out,stderr=err,
                                             creationflags=subprocess.CREATE_NO_WINDOW,close_fds=True)
                for _ in range(80):
                    if process.poll() is not None:raise RuntimeError('PREVIEW_SERVER_EXITED')
                    current=identity(args.port)
                    if current:break
                    time.sleep(.1)
                verify(current,office,state)
        finally:
            lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1)
    if not args.server_only:
        chrome=Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Google/Chrome/Application/chrome.exe'
        if not chrome.is_file():raise RuntimeError('SUPPORTED_BROWSER_MISSING; use --server-only')
        subprocess.Popen([str(chrome),f'--app=http://127.0.0.1:{args.port}/','--no-first-run',
                          '--no-default-browser-check','--no-proxy-server',f'--user-data-dir={state / "browser"}'],
                         creationflags=subprocess.CREATE_NO_WINDOW,close_fds=True)
    print(json.dumps({'preview_url':f'http://127.0.0.1:{args.port}/','server':current}))

if __name__=='__main__':main()
