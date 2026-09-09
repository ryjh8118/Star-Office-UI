"""Validate user-owned links without fetching remote content."""
import re
from urllib.parse import urlsplit, parse_qs


def normalize(value):
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError('請輸入有效的網址（最多 4096 字元）。')
    value = value.strip()
    if not value:
        return None
    if re.search(r'[\x00-\x20\x7f\\]', value):
        raise ValueError('網址不能含空白或控制字元。')
    if '://' not in value and not re.match(r'^[a-z][a-z0-9+.-]*:', value, re.I):
        value = 'https://' + value
    try:
        parts = urlsplit(value)
        host = parts.hostname
        port = parts.port
    except ValueError:
        raise ValueError('請輸入有效的網址。') from None
    if parts.scheme not in ('http', 'https') or not host or parts.username is not None or parts.password is not None:
        raise ValueError('請使用 http 或 https 網址。')
    result = {'url': value}
    query = parse_qs(parts.query)
    segments = parts.path.strip('/').split('/')
    video = None
    if port in (None, 80, 443):
        if host in ('youtu.be', 'www.youtu.be') and len(segments) == 1:
            video = segments[0]
        elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'):
            if parts.path == '/watch':
                video = query.get('v', [''])[0]
            elif len(segments) == 2 and segments[0] in ('embed', 'shorts', 'live'):
                video = segments[1]
    if video and re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
        result['youtube_id'] = video
        timestamp = query.get('t', query.get('start', ['0']))[0]
        if timestamp.isdigit():
            seconds = int(timestamp[:9])
        else:
            match = re.fullmatch(r'(?:(\d{1,6})h)?(?:(\d{1,6})m)?(?:(\d{1,6})s)?', timestamp)
            seconds = sum(int(n or 0)*unit for n, unit in zip(match.groups(), [3600, 60, 1])) if match else 0
        result['start'] = min(seconds, 604800)
    return result
