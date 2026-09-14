"""Offline display derivatives only; never redraw or publish private member images.

Run with the same RENGUIN_* authority paths as the server. Outputs stay outside
Flask's static tree; the existing authority permission check gates every request.
"""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from renguin_world import characters, engine

def build():
    paths = characters.default_paths(ROOT / 'frontend')
    registry = characters.build_registry(paths, engine.load_config())
    output = ROOT / 'backend/renguin_world/art/portraits'
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for entry in registry['characters']:
        source = characters.asset_path(registry, entry['character_id'], paths)
        if not source:
            continue
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        with Image.open(source) as original:
            image = original.convert('RGBA')
            box = image.getchannel('A').getbbox()
            if box:
                image = image.crop(box)
            for size in (96, 160, 256):
                derivative = image.copy()
                derivative.thumbnail((size, size), Image.Resampling.LANCZOS)
                name = f'{digest}-{size}.webp'
                derivative.save(output / name, 'WEBP', lossless=True, method=6)
                manifest.append({'character_id': entry['character_id'], 'source_authority': entry['source_authority'],
                                 'source_sha256': digest, 'output': name, 'size': list(derivative.size),
                                 'visibility': 'REQUEST_AUTHORITY_GATED', 'version': 1,
                                 'foot_anchor': [0.5, 1], 'layer': 'independent-character',
                                 'operation': 'alpha trim, proportional downscale, lossless WebP; no generation',
                                 'sha256': hashlib.sha256((output / name).read_bytes()).hexdigest()})
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'public_characters': len(manifest)//3, 'derivatives': len(manifest),
                      'bytes': sum(p.stat().st_size for p in output.glob('*.webp'))}))

if __name__ == '__main__':
    build()
