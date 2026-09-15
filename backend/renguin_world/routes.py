"""Renguin World routes. Importing this module loads only Flask.

The engine, adapters and image code are imported inside the handlers, so the
Office pays nothing for the world until someone opens /world.
"""
from functools import lru_cache
import hashlib
from pathlib import Path

from flask import Blueprint, abort, current_app, jsonify, make_response, request, send_file

bp = Blueprint('renguin_world', __name__)
ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / 'frontend'
WORLD_DIR = FRONTEND / 'world'
THUMB_SIZES = {96, 160, 256}
PORTRAITS = ROOT / 'backend/renguin_world/art/portraits'
# Derivatives of private-identity member avatars are built locally and never committed.
PRIVATE_PORTRAITS = ROOT / 'backend/renguin_world/art/portraits-private'


@lru_cache(maxsize=128)
def _source_digest(path, mtime_ns, size):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


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


@bp.get('/world/seamless')
def world_seamless_page():
    """Seamless side-view vertical slice. V1 at /world stays the default and the fallback."""
    html = (WORLD_DIR / 'seamless.html').read_text(encoding='utf-8').replace('{{WORLD_VERSION}}', world_version())
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
    mimetype = 'image/jpeg' if path.suffix.lower() in ('.jpg', '.jpeg') else 'image/png'
    return send_file(path, mimetype=mimetype, max_age=0, conditional=True)


@bp.get('/api/world/character-thumb/<character_id>')
def world_character_thumb(character_id):
    """Serve an offline derivative only after the current authority permits the source.

    New or changed public art falls back to its original until the offline build
    runs again. Image processing never runs inside a website request.
    """
    size = _int('s', 160, 1, 512)
    if size not in THUMB_SIZES:
        abort(400)
    path = _character_file(character_id)
    if not path:
        abort(404)
    stat = path.stat()
    digest = _source_digest(str(path), stat.st_mtime_ns, stat.st_size)
    derivative = next((d for d in (PORTRAITS / f'{digest}-{size}.webp', PRIVATE_PORTRAITS / f'{digest}-{size}.webp') if d.is_file()), None)
    if derivative:
        response = send_file(derivative, mimetype='image/webp', conditional=True, max_age=0)
        response.headers['X-World-Art'] = 'offline-derivative'
    else:
        mimetype = 'image/jpeg' if path.suffix.lower() in ('.jpg', '.jpeg') else 'image/png'
        response = send_file(path, mimetype=mimetype, conditional=True, max_age=0)
        response.headers['X-World-Art'] = 'original-needs-offline-build'
    return response
