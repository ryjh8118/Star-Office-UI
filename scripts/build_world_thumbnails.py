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


def prepared(image):
    image = image.convert('RGBA')
    kind = canvas(image)
    if kind:
        image = key_canvas(image, kind)
    box = image.getchannel('A').getbbox()
    return image.crop(box) if box else image


def signature(image):
    """Structure (24x24 grey on white) and colour (64-bin histogram of inked pixels) of prepared art."""
    white = Image.new('RGBA', image.size, (255, 255, 255, 255))
    white.alpha_composite(image)
    grey = list(white.convert('L').resize((24, 24), Image.Resampling.LANCZOS).getdata())
    bins, inked = [0] * 64, 0
    for r, g, b, a in image.resize((64, 64)).getdata():
        if a < 128 or min(r, g, b) > 235:
            continue
        bins[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)] += 1
        inked += 1
    return grey, [v / max(1, inked) for v in bins]


MATCH_STRUCTURE = 0.18


def match_member_icons(icons, references, config):
    """Map files from the member icon folder onto existing ASSET-08 characters.

    A file is MATCHED only when two independent kinds of evidence agree: its
    artwork is the closest reference by structure and by colour (structure
    under MATCH_STRUCTURE), and its file name agrees with that reference's
    authority profile on profession or name. The file name alone never maps
    anything; every other file is UNRESOLVED and is not shown. Names are
    compared in memory and never written.
    """
    rows = []
    for icon in icons:
        grey, colour = icon['signature']
        scored = []
        for ref in references:
            distance = sum(abs(a - b) for a, b in zip(grey, ref['signature'][0])) / len(grey) / 255
            overlap = sum(min(a, b) for a, b in zip(colour, ref['signature'][1]))
            scored.append((distance, overlap, ref))
        row = {'icon_sha256': icon['sha256'], 'status': 'UNRESOLVED', 'character_id': None}
        if not scored:
            rows.append({**row, 'reason': 'NO_AUTHORITY_REFERENCES'})
            continue
        nearest = min(scored, key=lambda s: s[0])
        closest_colour = max(scored, key=lambda s: s[1])
        distance, overlap, ref = nearest
        stem = icon['stem']
        label = stem.split('(')[0].split('（')[0].strip()
        wanted = characters.profession_of(stem, config)
        profession_agrees = bool(wanted) and wanted == characters.profession_of(ref['evidence'], config)
        name_agrees = len(label) >= 2 and label in ref['evidence']
        evidence = {'structure_distance': round(distance, 3), 'colour_overlap': round(overlap, 3),
                    'profession_agrees': profession_agrees, 'name_agrees': name_agrees}
        if distance >= MATCH_STRUCTURE or closest_colour[2] is not ref:
            rows.append({**row, 'evidence': evidence, 'reason': 'ARTWORK_MATCHES_NO_AUTHORITY_CHARACTER'})
        elif not (profession_agrees or name_agrees):
            rows.append({**row, 'evidence': evidence, 'reason': 'ARTWORK_MATCH_WITHOUT_PROFILE_EVIDENCE'})
        else:
            rows.append({**row, 'status': 'MATCHED', 'character_id': ref['character_id'], 'evidence': evidence})
    # Two files may not both claim one character; neither is trusted then.
    claims = {}
    for r in rows:
        if r['status'] == 'MATCHED':
            claims.setdefault(r['character_id'], []).append(r)
    for claimed in claims.values():
        if len(claimed) > 1:
            for r in claimed:
                r.update(status='UNRESOLVED', character_id=None, reason='SEVERAL_FILES_CLAIM_ONE_CHARACTER')
    return rows


def member_icon_sources(paths, registry, config):
    """READ-ONLY: official member cut-outs by character id, plus the name-free mapping report."""
    root = paths.get('member_icons')
    if not root or not Path(root).is_dir():
        return {}, {'schema': 'RENGUIN_WORLD_MEMBER_ICON_MAP_V1', 'status': 'UNAVAILABLE', 'files': []}
    references = []
    for entry in registry['characters']:
        if entry['source_authority'] != 'ASSET-08' or not entry.get('asset_ref'):
            continue
        source = characters.asset_path(registry, entry['character_id'], paths)
        if not source:
            continue
        with Image.open(source) as original:
            art = prepared(original)
        references.append({'character_id': entry['character_id'], 'signature': signature(art),
                           'evidence': characters.member_profile_text(paths, entry['character_id'], registry)})
    icons = []
    for file in sorted(Path(root).iterdir()):
        if file.suffix.lower() not in ('.png', '.webp', '.jpg', '.jpeg') or not file.is_file():
            continue
        with Image.open(file) as original:
            art = prepared(original)
        icons.append({'file': file, 'stem': file.stem, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'signature': signature(art)})
    rows = match_member_icons(icons, references, config)
    by_sha = {i['sha256']: i['file'] for i in icons}
    chosen = {r['character_id']: by_sha[r['icon_sha256']] for r in rows if r['status'] == 'MATCHED'}
    return chosen, {'schema': 'RENGUIN_WORLD_MEMBER_ICON_MAP_V1', 'status': 'OK', 'source': 'MEMBER_ICON_FOLDER',
                    'authority_role': 'REFERENCE_MAPPING_NOT_AN_AUTHORITY', 'files': rows}


def build():
    paths = characters.default_paths(ROOT / 'frontend')
    config = engine.load_config()
    registry = characters.build_registry(paths, config)
    public = ROOT / 'backend/renguin_world/art/portraits'
    private = ROOT / 'backend/renguin_world/art/portraits-private'
    manifests = {public: [], private: []}
    icon_files, icon_map = member_icon_sources(paths, registry, config)
    private.mkdir(parents=True, exist_ok=True)
    (private / characters.MEMBER_ICON_MAP).write_text(json.dumps(icon_map, ensure_ascii=False, indent=2), encoding='utf-8')
    for entry in registry['characters']:
        source = characters.asset_path(registry, entry['character_id'], paths)
        if not source:
            continue
        is_private = 'IDENTITY_PRIVATE' in (entry.get('special_flags') or [])
        output = private if is_private else public
        output.mkdir(parents=True, exist_ok=True)
        # The derivative stays addressed by the authority reference, so the authority keeps gating it.
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        render_source = icon_files.get(entry['character_id'], source)
        with Image.open(render_source) as original:
            image = original.convert('RGBA')
            kind = canvas(image)
            operation = 'alpha trim, proportional downscale, lossless WebP; no generation'
            if render_source != source:
                operation = 'official cut-out from the member icon folder (matched by artwork and profile evidence), ' + operation
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
                      'member_icons': {s: sum(r['status'] == s for r in icon_map['files']) for s in ('MATCHED', 'UNRESOLVED')},
                      'member_icon_unresolved_reasons': sorted(r.get('reason') for r in icon_map['files'] if r['status'] == 'UNRESOLVED'),
                      'from_member_icons': sorted({r['character_id'] for rows in manifests.values() for r in rows if 'member icon folder' in r['operation']}),
                      'keyed': sorted({r['character_id'] for rows in manifests.values() for r in rows if 'keyed' in r['operation']}),
                      'resolution_limited': sorted({r['character_id'] for rows in manifests.values() for r in rows if r.get('flags')}),
                      'bytes': sum(p.stat().st_size for o in manifests for p in o.glob('*.webp'))}, ensure_ascii=False))


if __name__ == '__main__':
    build()
