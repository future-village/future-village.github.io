"""Deterministic Flow chroma-key assets. Requires Pillow and numpy; no deletion.
Usage: python scripts/prepare_route_c_art.py SOURCE_DIR
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image

DEST = Path(__file__).resolve().parents[1] / 'site/assets/art/props'
CHOICES = dict(tree_round=1, tree_pine=1, bush_flowers=2, fence=2, lamp=2, bench=1)

def cutout(image):
    rgb = np.asarray(image.convert('RGB'), dtype=np.float32)
    r, g, b = rgb.transpose(2, 0, 1)
    # Magenta excess identifies both flat background and antialiased spill.
    excess = np.minimum(r, b) - g
    alpha = np.clip((95 - excess) / 55, 0, 1)
    spill = np.maximum(0, excess - 12)
    rgb[:, :, 0] -= spill
    rgb[:, :, 2] -= spill
    rgba = np.dstack((np.clip(rgb, 0, 255), alpha * 255)).astype('uint8')
    out = Image.fromarray(rgba)
    out = out.crop(out.getbbox())
    out.thumbnail((512, 512), Image.Resampling.LANCZOS)
    return out

def seamless(image):
    a = np.asarray(image.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS), dtype=float)
    # Blend opposing boundaries smoothly, with exactly matching outer rows/columns.
    band = 48
    for axis in (0, 1):
        a = np.swapaxes(a, 0, axis)
        for i in range(band):
            weight = .5 * (1 - i / band) ** 2
            left, right = a[i].copy(), a[-1-i].copy()
            a[i] = left * (1-weight) + right * weight
            a[-1-i] = right * (1-weight) + left * weight
        a = np.swapaxes(a, 0, axis)
    return Image.fromarray(np.rint(a).astype('uint8'))

def main(source):
    DEST.mkdir(parents=True, exist_ok=True)
    for name, version in CHOICES.items():
        cutout(Image.open(source / f'prop_{name}_v{version}.png')).quantize(colors=128).save(DEST / f'{name}.png', optimize=True)
    for name in ('tile_grass', 'tile_path_stone'):
        seamless(Image.open(source / f'{name}_v1.png')).quantize(colors=128).save(DEST / f'{name}.png', optimize=True)
    total = sum(p.stat().st_size for p in DEST.glob('*.png'))
    assert total < 1500000, total
    print(f'8 assets: {total} bytes')

if __name__ == '__main__':
    main(Path(sys.argv[1]))
