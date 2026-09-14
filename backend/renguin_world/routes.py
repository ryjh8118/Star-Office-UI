"""Renguin World routes. Importing this module loads only Flask.

The engine, adapters and image code are imported inside the handlers, so the
Office pays nothing for the world until someone opens /world.
"""
from functools import lru_cache
import hashlib
from pathlib import Path
import threading

from flask import Blueprint, abort, current_app, jsonify, make_response, request, send_file

bp = Blueprint('renguin_world', __name__)
ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / 'frontend'
WORLD_DIR = FRONTEND / 'world'
THUMB_SIZES = {96, 160, 256}
_thumbs = {}
_thumb_lock = threading.Lock()


def _presentation_root():
    return current_app.config.get('USER_PRESENTATION_ROOT') or str(ROOT / '.user-presentation')


@lru_cache(maxsize=1)
def _version(signature):
    return hashlib.sha256(signature.encode('utf-8')).hexdigest()[:12]


def world_version():
    parts = sorted(f'{p.name}:{p.stat().st_mtime_ns}:{p.stat().st_size}' for p in WORLD_DIR.iterdir() if p.is_file())
    return _version('|'.join(parts))


def _int(name, default, low, high):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        abort(400)
    if not low <= value <= high:
        abort(400)
    return value


@bp.get('/world')
def world_page():
    # The shell is always fresh; its scripts load from /static/world/ with this
    # content hash, so they cache immutably and still change the moment they do.
    html = (WORLD_DIR / 'index.html').read_text(encoding='utf-8').replace('{{WORLD_VERSION}}', world_version())
    response = make_response(html)
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    return response


@bp.get('/api/world/state')
def world_state():
    from . import engine, service
    state = service.live_state(_presentation_root(), FRONTEND, refresh=request.args.get('refresh') == '1')
    return jsonify(state if request.args.get('audience') == 'local' else engine.public_view(state))


@bp.get('/api/world/simulate')
def world_simulate():
    from . import engine, service
    state = service.simulate(_int('contents', 0, 0, 150), FRONTEND, idle_days=_int('idle', 0, 0, 365),
                             gap_before_last=_int('gap', 0, 0, 120))
    return jsonify(engine.public_view(state))


@bp.get('/api/world/roadmap')
def world_roadmap():
    from . import service
    return jsonify({'milestones': service.roadmap(FRONTEND), 'source': 'MOCK'})


@bp.get('/api/world/characters')
def world_characters():
    from . import service
    registry = service.registry(FRONTEND)
    return jsonify({**registry, 'sources': [{k: v for k, v in s.items() if k != 'path'} for s in registry['sources']]})


def _character_file(character_id):
    from . import characters, service
    registry = service.registry(FRONTEND)
    return characters.asset_path(registry, character_id, characters.default_paths(FRONTEND))


@bp.get('/api/world/character-asset/<character_id>')
def world_character_asset(character_id):
    path = _character_file(character_id)
    if not path:
        abort(404)
    return send_file(path, mimetype='image/png', max_age=0, conditional=True)


@bp.get('/api/world/character-thumb/<character_id>')
def world_character_thumb(character_id):
    """A small trimmed PNG of the authority's own image, so the street never loads megabytes."""
    size = _int('s', 160, 1, 512)
    if size not in THUMB_SIZES:
        abort(400)
    path = _character_file(character_id)
    if not path:
        abort(404)
    stat = path.stat()
    key = (str(path), stat.st_mtime_ns, stat.st_size, size)
    etag = hashlib.sha1(repr(key).encode('utf-8')).hexdigest()
    if request.if_none_match.contains(etag):
        response = make_response('', 304)
        response.set_etag(etag)
        return response
    with _thumb_lock:
        data = _thumbs.get(key)
    if data is None:
        import io
        from PIL import Image
        with Image.open(path) as image:
            image = image.convert('RGBA')
            box = image.getchannel('A').getbbox()
            if box:
                image = image.crop(box)
            image.thumbnail((size, size))
            buffer = io.BytesIO()
            image.save(buffer, 'PNG', optimize=True)
            data = buffer.getvalue()
        with _thumb_lock:
            if len(_thumbs) > 96:
                _thumbs.clear()
            _thumbs[key] = data
    response = make_response(data)
    response.headers['Content-Type'] = 'image/png'
    response.set_etag(etag)
    return response
