"""Auth-only adapter for the EXISTING Desktop Sync client, with Windows DPAPI.

No member sync, credential JSON output, callback logging or replacement client.
Run with the existing 02_Sync virtual environment. Consent is performed by the
user in their browser. The subsequent capability probe is a separate explicit
step after consent. The existing plaintext token file is never rewritten.
"""
import argparse
import ctypes
from ctypes import wintypes
import importlib.util
import json
import logging
import os
from pathlib import Path


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def protect(payload, *, decrypt=False):
    if os.name != 'nt':
        raise RuntimeError('WINDOWS_SECURE_STORAGE_REQUIRED')
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    buf = ctypes.create_string_buffer(payload)
    source = Blob(len(payload), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    if decrypt:
        fn = crypt.CryptUnprotectData
        second = None
    else:
        fn = crypt.CryptProtectData
        second = 'Renguin World Desktop Sync'
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p if decrypt else wintypes.LPCWSTR,
                   ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD,
                   ctypes.POINTER(Blob)]
    fn.restype = wintypes.BOOL
    if not fn(ctypes.byref(source), second, None, None, None, 1, ctypes.byref(target)):
        raise RuntimeError('SECURE_STORAGE_FAILED')
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        kernel.LocalFree(target.data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--existing-root', required=True, type=Path)
    parser.add_argument('--status-file', required=True, type=Path)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)

    def status(value):
        args.status_file.parent.mkdir(parents=True, exist_ok=True)
        args.status_file.write_text(json.dumps({'status': value, 'pid': os.getpid(),
                                               'member_data_written': False}), encoding='utf-8')
    try:
        spec = importlib.util.spec_from_file_location('existing_youtube_sync', args.existing_root / 'sync_youtube_members.py')
        existing = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(existing)
        client_path = existing.find_client_secret()
        config = json.loads(client_path.read_text(encoding='utf-8-sig'))['installed']
        if config.get('auth_uri') != 'https://accounts.google.com/o/oauth2/auth' or config.get('token_uri') != 'https://oauth2.googleapis.com/token':
            raise ValueError('INVALID_OFFICIAL_ENDPOINT')
        secure = Path(os.environ['LOCALAPPDATA']) / 'RenguinWorld' / 'oauth'
        secure.mkdir(parents=True, exist_ok=True)
        # Verify user-bound encryption before asking the user to consent.
        assert protect(protect(b'non-secret-storage-check'), decrypt=True) == b'non-secret-storage-check'
        scopes = ['https://www.googleapis.com/auth/youtube.channel-memberships.creator',
                  'https://www.googleapis.com/auth/youtube.readonly']
        flow = existing.InstalledAppFlow.from_client_secrets_file(str(client_path), scopes,
                                                                  autogenerate_code_verifier=True)
        flow.oauth2session.trust_env = False
        status('WAITING_FOR_OAUTH')
        credentials = flow.run_local_server(host='127.0.0.1', port=0, open_browser=True,
                                            authorization_prompt_message=None,
                                            success_message='Google authorization received. You may return to Codex.',
                                            timeout_seconds=3600, prompt='consent')
        if not credentials.valid or not credentials.has_scopes(scopes):
            status('OAUTH_SCOPE_GATE')
            return 1
        target = secure / 'desktop-sync.token.dpapi'
        temp = target.with_suffix('.tmp')
        temp.write_bytes(protect(credentials.to_json().encode('utf-8')))
        temp.replace(target)
        status('OAUTH_READY_FOR_READ_ONLY_PROBE')
        return 0
    except Exception:
        # Exceptions from OAuth can embed tokens, codes and callback URLs.
        status('OAUTH_NOT_COMPLETED')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
