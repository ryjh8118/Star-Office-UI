"""Offline display derivatives only; never redraw a character.

Run with the same RENGUIN_* authority paths as the server. Outputs stay outside
Flask's static tree; the existing authority permission check gates every request.

Operations are mechanical and recorded per file: alpha trim, proportional
downscale, lossless WebP. A source painted on an opaque canvas (the profession
avatars: a white page, or a chroma-green JPEG) has only the canvas that touches
the image border keyed to transparency, so the character, its outline and any
white sticker frame keep their original pixels. Private-identity member avatars
go to a git-ignored folder: their derivatives are built on each machine, never
committed.
"""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from renguin_world import characters, engine

SIZES = (96, 160, 256)
SENTINEL = (255, 0, 254)


def canvas(image):
    """'white', 'green' or None: which opaque canvas surrounds the character, judged from the border."""
    if image.getchannel('A').getextrema()[0] < 250:
        return None
    rgb = image.convert('RGB')
    w, h = rgb.size
    border = [rgb.getpixel((x, y)) for x in range(0, w, 7) for y in (0, h - 1)] + \
             [rgb.getpixel((x, y)) for y in range(0, h, 7) for x in (0, w - 1)]
    white = sum(min(p) >= 236 for p in border) / len(border)
    green = sum(p[1] > 170 and p[1] - max(p[0], p[2]) > 90 for p in border) / len(border)
    return 'white' if white > 0.9 else 'green' if green > 0.9 else None


def key_canvas(image, kind):
    """Flood the canvas from the border only; enclosed pixels are never touched."""
    rgb = image.convert('RGB')
    w, h = rgb.size
    near = (lambda p: min(p) >= 236) if kind == 'white' else (lambda p: p[1] > 150 and p[1] - max(p[0], p[2]) > 60)
    thresh = 45 if kind == 'white' else 190
    for x, y in [(x, y) for x in range(0, w, 3) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 3) for x in (0, w - 1)]:
        p = rgb.getpixel((x, y))
        if p != SENTINEL and near(p):
            ImageDraw.floodfill(rgb, (x, y), SENTINEL, thresh=thresh)
    src = image.load()
    mask = rgb.load()
    out = image.copy()
    px = out.load()
    for y in range(h):
        for x in range(w):
            if mask[x, y] == SENTINEL:
                px[x, y] = (0, 0, 0, 0)
    # One-pixel fringe: anti-aliased canvas colour left beside the keyed area becomes partly transparent.
    for y in range(h):
        for x in range(w):
            if mask[x, y] == SENTINEL:
                continue
            if not any(0 <= x + dx < w and 0 <= y + dy < h and mask[x + dx, y + dy] == SENTINEL
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            r, g, b, a = src[x, y]
            if kind == 'white':
                alpha = max(0, min(255, round((255 - min(r, g, b)) * 255 / 60)))
                px[x, y] = (r, g, b, min(a, alpha))
            else:
                spill = g - max(r, b)
                if spill > 0:
                    px[x, y] = (r, max(r, b), b, max(0, min(a, 255 - spill * 2)))
    return out


def build():
    paths = characters.default_paths(ROOT / 'frontend')
    registry = characters.build_registry(paths, engine.load_config())
    public = ROOT / 'backend/renguin_world/art/portraits'
    private = ROOT / 'backend/renguin_world/art/portraits-private'
    manifests = {public: [], private: []}
    for entry in registry['characters']:
        source = characters.asset_path(registry, entry['character_id'], paths)
        if not source:
            continue
        is_private = 'IDENTITY_PRIVATE' in (entry.get('special_flags') or [])
        output = private if is_private else public
        output.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        with Image.open(source) as original:
            image = original.convert('RGBA')
            kind = canvas(image)
            operation = 'alpha trim, proportional downscale, lossless WebP; no generation'
            if kind:
                image = key_canvas(image, kind)
                operation = f'border-connected {kind} canvas keyed to alpha (character pixels unchanged), ' + operation
            box = image.getchannel('A').getbbox()
            if box:
                image = image.crop(box)
            for size in SIZES:
                derivative = image.copy()
                derivative.thumbnail((size, size), Image.Resampling.LANCZOS)
                name = f'{digest}-{size}.webp'
                derivative.save(output / name, 'WEBP', lossless=True, method=6)
                row = {'source_authority': entry['source_authority'], 'resolution': entry.get('resolution'),
                       'source_sha256': digest, 'output': name, 'size': list(derivative.size),
                       'visibility': 'REQUEST_AUTHORITY_GATED', 'version': 2,
                       'foot_anchor': [0.5, 1], 'layer': 'independent-character', 'operation': operation,
                       'sha256': hashlib.sha256((output / name).read_bytes()).hexdigest()}
                if max(image.size) < size:
                    row['flags'] = ['ASSET_RESOLUTION_LIMIT']
                # A private avatar's derivative is addressed by its opaque id only.
                row['character_id'] = entry['character_id']
                manifests[output].append(row)
    for output, rows in manifests.items():
        if rows:
            (output / 'manifest.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'public_characters': len(manifests[public]) // len(SIZES),
                      'private_characters': len(manifests[private]) // len(SIZES),
                      'keyed': sorted({r['character_id'] for rows in manifests.values() for r in rows if 'keyed' in r['operation']}),
                      'resolution_limited': sorted({r['character_id'] for rows in manifests.values() for r in rows if r.get('flags')}),
                      'bytes': sum(p.stat().st_size for o in manifests for p in o.glob('*.webp'))}, ensure_ascii=False))


if __name__ == '__main__':
    build()
