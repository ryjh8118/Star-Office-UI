"""Office read-only delivery adapter; trust roots come from server configuration."""
import importlib
import os
from pathlib import Path
import sys
import time


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


def projects(frontend):
    try:
        root = Path(os.environ.get('RENGUIN_CANONICAL_ROOT', r'E:\Renguin_AISystem\Content_OS')).resolve()
        # Authority-owned build validates the exact ledger snapshot and profile.
        # No Office snapshot file, second registry, writer, or unverified fallback.
        authority = producer()
        start = time.perf_counter()
        payload = authority.build(Path(frontend), root)
        now = time.time()
        high_water = payload['source']['high_water_timestamp']
        age = now - authority.timestamp(high_water) if high_water else None
        ages = {p['project_id']: now-authority.timestamp(p['updated_at']) for p in payload['projects']}
        stale = age is None or not 0 <= age <= payload['freshness_threshold_seconds']
        # Fresh canonical evidence is not an executor heartbeat.
        return {'status':'STALE' if stale else 'FRESH',
                'message':'狀態可能已過期' if stale else '正式資料已驗證；Agent 狀態另依工作租約確認',
                'projection':payload, 'checked_at':now, 'error':None,
                'transport_age_seconds':now-authority.timestamp(payload['generated_at']),
                'canonical_age_seconds':age, 'project_ages_seconds':ages,
                'profiling':{'canonical_projection_ms':(time.perf_counter()-start)*1000}}
    except (OSError, ValueError, ImportError, RuntimeError) as error:
        return {'status':'SYNC_ERROR','message':'目前無法確認，等待同步','projection':None,
                'error':{'code':'DELIVERY_UNAVAILABLE','detail':str(error)}}
