"""YouTube popularity adapter — its own layer, never on the Office request path.

Views only move the crowd, the lights, the featured posters and festival
flags; they never touch the growth score or the era. Live sync needs a YouTube
Data API key (videos.list, statistics), so without YOUTUBE_API_KEY the layer
reports GATED and the world builds normally without popularity.

The key is read from the environment at sync time only; it is never stored,
logged or returned. The world page reads the saved popularity file, never the
YouTube API.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

FILE = 'youtube_popularity.json'
ATTEMPT_FILE = 'youtube_sync_attempt.json'
STALE_SECONDS = 7 * 86400
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos'
DECLARED = 'OK_WITH_DECLARED_UNAVAILABLE_DATA'
UNAVAILABLE = 'YouTube API did not provide public viewCount'


class VideoValidationError(ValueError):
    """Only fixed, non-secret reason codes cross the API boundary."""


def parse_item(item):
    snippet = item.get('snippet') or {}
    published = datetime.fromisoformat(str(snippet.get('publishedAt')).replace('Z', '+00:00'))
    if published.tzinfo is None:
        raise ValueError('PUBLISH_DATE_WITHOUT_TIMEZONE')
    stats = item.get('statistics', {})
    if not isinstance(stats, dict):
        raise ValueError('INVALID_STATISTICS')
    count = stats.get('viewCount')
    if 'viewCount' in stats and (not isinstance(count, str) or not count.isascii() or not count.isdigit()):
        raise ValueError('INVALID_VIEW_COUNT')
    return {'youtube_video_id': item['id'], 'title': snippet.get('title'),
            'channel_id': snippet.get('channelId'),
            'view_count': int(count) if count is not None else None,
            'published_at': published.astimezone(timezone.utc).isoformat(),
            'resolution_status': 'FULLY_VERIFIED' if count is not None else 'IDENTITY_VERIFIED',
            'view_count_status': 'AVAILABLE' if count is not None else 'PUBLIC_VIEWCOUNT_UNAVAILABLE',
            'view_count_provenance': 'YouTube Data API statistics.viewCount' if count is not None else UNAVAILABLE}


def validate_video(video_id, *, api_key=None, fetch=None):
    if not isinstance(video_id, str) or not VIDEO_ID.fullmatch(video_id):
        raise VideoValidationError('INVALID_VIDEO_ID')
    key = api_key or os.environ.get('YOUTUBE_API_KEY')
    if not key:
        raise VideoValidationError('YOUTUBE_API_KEY_NOT_CONFIGURED')
    try:
        query = urllib.parse.urlencode({'part': 'snippet,statistics', 'id': video_id, 'key': key})
        data = (fetch or _fetch)(ENDPOINT + '?' + query)
        if not isinstance(data, dict) or 'error' in data or not isinstance(data.get('items'), list):
            raise ValueError('INVALID_RESPONSE')
        if len(data['items']) != 1 or data['items'][0].get('id') != video_id:
            raise VideoValidationError('VIDEO_NOT_UNIQUELY_FOUND')
        result = parse_item(data['items'][0])
        if not result['title'] or not result['channel_id']:
            raise ValueError('CANONICAL_METADATA_MISSING')
        return result
    except VideoValidationError:
        raise
    except Exception:
        raise VideoValidationError('YOUTUBE_VALIDATION_FAILED') from None


def load(runtime_root, *, now=None):
    path = Path(runtime_root) / FILE
    has_key = bool(os.environ.get('YOUTUBE_API_KEY'))
    if not path.is_file():
        result = {'status': 'READY_TO_SYNC' if has_key else 'GATED', 'videos': {}, 'synced_at': None,
                  'reason': None if has_key else 'YOUTUBE_API_KEY_NOT_CONFIGURED'}
        attempt_path = Path(runtime_root) / ATTEMPT_FILE
        if attempt_path.exists():
            try:
                status = json.loads(attempt_path.read_text(encoding='utf-8'))['status']
                if status not in ('GATED', 'PARTIAL', 'ERROR'):
                    raise ValueError('NO_SNAPSHOT_FOR_SUCCESS')
                result.update(status=status, reason='LATEST_SYNC_NOT_COMPLETE')
            except (OSError, ValueError, KeyError, TypeError):
                result.update(status='ERROR', reason='SYNC_ATTEMPT_INVALID')
        return result
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        videos = data.get('videos') or {}
        for k, v in videos.items():
            if not VIDEO_ID.fullmatch(k) or not isinstance(v, dict):
                raise ValueError('INVALID_VIDEO_RECORD')
            count = v.get('view_count')
            if not (type(count) is int and count >= 0) and not (
                    count is None and v.get('view_count_status') == 'PUBLIC_VIEWCOUNT_UNAVAILABLE'
                    and v.get('view_count_provenance') == UNAVAILABLE):
                raise ValueError('UNDECLARED_MISSING_COUNT')
        synced = datetime.fromisoformat(str(data['synced_at']).replace('Z', '+00:00'))
    except (OSError, ValueError, KeyError, AttributeError, TypeError):
        return {'status': 'ERROR', 'videos': {}, 'synced_at': None, 'reason': 'POPULARITY_FILE_INVALID'}
    now = now or datetime.now(timezone.utc)
    stale = (now - synced).total_seconds() > STALE_SECONDS
    status, reason = ('STALE' if stale else data.get('status', 'OK')), None
    attempt_path = Path(runtime_root) / ATTEMPT_FILE
    if attempt_path.exists():
        try:
            attempt = json.loads(attempt_path.read_text(encoding='utf-8'))
            attempted_at = datetime.fromisoformat(attempt['attempted_at'])
            if attempted_at >= synced and attempt['status'] != 'OK':
                status = 'STALE' if stale else attempt['status']
                if status not in ('GATED', 'PARTIAL', 'ERROR', 'STALE', DECLARED):
                    raise ValueError('UNKNOWN_SYNC_STATUS')
                reason = 'DECLARED_UNAVAILABLE_DATA' if status == DECLARED else 'LATEST_SYNC_NOT_COMPLETE'
        except (OSError, ValueError, KeyError, TypeError):
            status, reason = 'ERROR', 'SYNC_ATTEMPT_INVALID'
    return {'status': status, 'videos': videos, 'synced_at': data['synced_at'], 'reason': reason}


def record_attempt(runtime_root, result):
    """A failed/partial CLI run must not leave the World claiming full live sync.

    Retain the last good snapshot separately. This record contains only enum
    status, timestamp and counts, never request URLs, IDs, exception text or keys.
    """
    status = result.get('status')
    if status not in ('OK', 'GATED', 'PARTIAL', 'ERROR', DECLARED):
        status = 'ERROR'
    data = {'status': status, 'attempted_at': datetime.now(timezone.utc).isoformat()}
    for field in ('synced', 'received', 'requested', 'eligible_contents', 'unmapped_contents'):
        value = result.get(field)
        if type(value) is int and value >= 0:
            data[field] = value
    path = Path(runtime_root)
    path.mkdir(parents=True, exist_ok=True)
    temp = path / (ATTEMPT_FILE + '.tmp')
    temp.write_text(json.dumps(data, indent=1), encoding='utf-8')
    temp.replace(path / ATTEMPT_FILE)


def _fetch(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=15) as response:
        return json.loads(response.read(4 * 1024 * 1024))


def sync(runtime_root, video_ids, *, api_key=None, fetch=_fetch, now=None):
    """Fetch view counts for known video ids and save them. Explicit, never scheduled."""
    api_key = api_key or os.environ.get('YOUTUBE_API_KEY')
    if not api_key:
        return {'status': 'GATED', 'reason': 'YOUTUBE_API_KEY_NOT_CONFIGURED', 'synced': 0}
    ids = sorted({v for v in video_ids if isinstance(v, str) and VIDEO_ID.fullmatch(v)})
    if not ids:
        return {'status': 'GATED', 'reason': 'NO_VERIFIED_VIDEO_IDS', 'synced': 0, 'requested': 0}
    videos = {}
    for start in range(0, len(ids), 50):
        batch = ids[start:start + 50]
        query = urllib.parse.urlencode({'part': 'statistics,snippet', 'id': ','.join(batch), 'key': api_key})
        try:
            data = fetch(ENDPOINT + '?' + query)
            if not isinstance(data, dict) or 'error' in data or not isinstance(data.get('items'), list):
                raise ValueError('INVALID_YOUTUBE_RESPONSE')
            for item in data['items']:
                if item.get('id') not in batch:
                    continue
                if item['id'] in videos:
                    raise ValueError('DUPLICATE_RESPONSE_ID')
                videos[item['id']] = parse_item(item)
        except Exception:
            # urllib / injected clients may put the complete credential-bearing
            # URL in exception messages. Never log or propagate those messages.
            # Keep the previous snapshot intact if any batch fails.
            return {'status': 'ERROR', 'reason': 'YOUTUBE_REQUEST_OR_RESPONSE_FAILED',
                    'synced': 0, 'requested': len(ids)}
    if len(videos) != len(ids):
        return {'status': 'PARTIAL', 'reason': 'VIDEOS_MISSING_OR_WITHOUT_STATISTICS',
                'synced': 0, 'received': len(videos), 'requested': len(ids)}
    stamp = (now or datetime.now(timezone.utc)).isoformat()
    path = Path(runtime_root)
    path.mkdir(parents=True, exist_ok=True)
    temp = path / (FILE + '.tmp')
    unavailable = sum(v['view_count'] is None for v in videos.values())
    status = DECLARED if unavailable else 'OK'
    temp.write_text(json.dumps({'synced_at': stamp, 'status': status, 'videos': videos}, ensure_ascii=False, indent=1), encoding='utf-8')
    temp.replace(path / FILE)
    return {'status': status, 'synced': len(videos), 'requested': len(ids),
            'fully_verified': len(videos) - unavailable, 'public_viewcount_unavailable': unavailable}
