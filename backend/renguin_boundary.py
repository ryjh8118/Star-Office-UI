"""Office read-only delivery adapter; trust roots come from server configuration."""
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
import threading
import time


class Memo:
    """One expensive read of Content OS, shared by everyone who asks inside a short window.

    A poll cycle asks for the same ledger three or four times in a row (projects,
    event statuses, presentation, the world), and each ask re-reads, re-validates and
    re-projects it. This keeps one answer for a couple of seconds so those asks share it.

    Bounded: one entry, and it expires. Invalidatable: the key carries whatever can be
    stat'ed cheaply, and ``clear()`` drops it. Observable: ``stats()``. Deterministic:
    the same key inside the window is the same value. Single flight: while one caller
    computes, the others wait for that answer instead of computing their own. A failed
    read is never kept, so an error is answered honestly on the very next ask.

    Values are shared, not copied: every consumer must treat them as read-only.
    """

    def __init__(self, seconds=None):
        self._lock = threading.Lock()
        self._entry = None
        self._seconds = seconds
        self.hits = 0
        self.misses = 0

    @property
    def seconds(self):
        if self._seconds is not None:
            return self._seconds
        try:
            return max(0.0, float(os.environ.get('RENGUIN_MEMO_SECONDS', '2')))
        except ValueError:
            return 2.0

    def get(self, key, compute):
        """Return (value, hit, age_ms). ``compute`` runs only when there is no live entry for ``key``."""
        with self._lock:
            entry = self._entry
            now = time.monotonic()
            if entry is not None and entry['key'] == key and now - entry['at'] < self.seconds:
                self.hits += 1
                return entry['value'], True, (now - entry['at']) * 1000
            value = compute()
            self._entry = {'key': key, 'value': value, 'at': time.monotonic()}
            self.misses += 1
            return value, False, 0.0

    def clear(self):
        with self._lock:
            self._entry = None

    def stats(self):
        return {'hits': self.hits, 'misses': self.misses, 'seconds': self.seconds}


PROJECTION = Memo()
SNAPSHOT = Memo()


def producer():
    root = Path(os.environ.get('RENGUIN_PRODUCER_ROOT', r'E:\Renguin_AISystem\Content_OS')).resolve()
    adapter = root / '10_AI_Editorial_Engine/04_Adapters/Star_Office'
    if not adapter.is_dir():
        raise RuntimeError('PRODUCER_UNAVAILABLE')
    if str(adapter) not in sys.path:
        sys.path.insert(0,str(adapter))
    module = importlib.import_module('canonical_projection')
    if Path(module.__file__).resolve().parent != adapter.resolve():
        raise RuntimeError('PRODUCER_IDENTITY_MISMATCH')
    return module


def ledger_stamp(authority, root):
    """Identity of the central ledger file, so a new entry is seen at once instead of when the memo expires."""
    try:
        info = (Path(root) / authority.LEDGER_REL).stat()
        return (info.st_mtime_ns, info.st_size)
    except (OSError, AttributeError, TypeError):
        return None


def stable_digest(payload):
    """What identifies a projection's content. The producer stamps ``generated_at`` into the payload
    and hashes it into ``projection_digest``, so that digest changes on every build and says nothing
    about whether a project did."""
    body = {key: value for key, value in payload.items() if key not in ('generated_at', 'projection_digest')}
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()


def projects(frontend, known=None):
    """The verified projection, plus how old it is. Pass the ``projection_stable_digest`` of the copy you
    already hold as ``known`` and, when it is still current, the (large) projection is left out and
    ``projection_unchanged`` says so: freshness is recomputed on every call either way."""
    try:
        root = Path(os.environ.get('RENGUIN_CANONICAL_ROOT', r'E:\Renguin_AISystem\Content_OS')).resolve()
        # Authority-owned build validates the exact ledger snapshot and profile.
        # No Office snapshot file, second registry, writer, or unverified fallback.
        authority = producer()

        def build():
            start = time.perf_counter()
            built = authority.build(Path(frontend), root)
            return {'payload': built, 'digest': stable_digest(built), 'ms': (time.perf_counter() - start) * 1000}

        key = (str(frontend), str(root), os.environ.get('RENGUIN_PROJECT_SOURCE_ROOTS', ''), ledger_stamp(authority, root))
        built, hit, memo_age_ms = PROJECTION.get(key, build)
        payload = built['payload']
        now = time.time()
        high_water = payload['source']['high_water_timestamp']
        age = now - authority.timestamp(high_water) if high_water else None
        ages = {p['project_id']: now-authority.timestamp(p['updated_at']) for p in payload['projects']}
        stale = age is None or not 0 <= age <= payload['freshness_threshold_seconds']
        # Fresh canonical evidence is not an executor heartbeat.
        result = {'status':'STALE' if stale else 'FRESH',
                  'message':'狀態可能已過期' if stale else '正式資料已驗證；Agent 狀態另依工作租約確認',
                  'projection':payload, 'checked_at':now, 'error':None,
                  'transport_age_seconds':now-authority.timestamp(payload['generated_at']),
                  'canonical_age_seconds':age, 'project_ages_seconds':ages,
                  'projection_stable_digest':built['digest'],
                  'profiling':{'canonical_projection_ms':built['ms'], 'memo':'HIT' if hit else 'MISS', 'memo_age_ms':memo_age_ms}}
        if known and known == built['digest']:
            # The reader already holds exactly this projection. What it needs to keep judging freshness
            # honestly (when it was generated) travels with the answer.
            result['projection'] = None
            result['projection_unchanged'] = True
            result['projection_meta'] = {'generated_at': payload['generated_at'], 'projection_digest': payload['projection_digest']}
        return result
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        return {'status':'SYNC_ERROR','message':'目前無法確認，等待同步','projection':None,
                'error':{'code':'DELIVERY_UNAVAILABLE','detail':str(error)}}
