#!/usr/bin/env python3
"""pack_atlas.py — turn a folder of rendered poses into a sprite atlas plus the
manifest entry that describes it.

    python3 tools/pack_atlas.py art/warriors/_build/achilles --name Achilles

Every number in the manifest is derived: frame rectangles come from where the
packer put each cell, and the anchor comes from the render's own camera maths in
render_meta.json. Nothing is measured by eye, which matters because a wrong
anchor is what makes a figure hover — the exact bug this pipeline exists to
avoid.

Cells are trimmed to their non-transparent content and the anchor is moved by
the same amount, so an atlas costs only the pixels that actually carry paint.
Merging into an existing manifest is the default, so adding a second character
does not disturb the first.
"""

import argparse, json, os, sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is required:  python3 -m pip install --user Pillow')

POSES = ['ready', 'attack', 'cast', 'hurt', 'win', 'fallen']
PAD = 2          # transparent gutter, so neighbouring cells cannot bleed in


def load_meta(src):
    path = os.path.join(src, 'render_meta.json')
    if not os.path.exists(path):
        sys.exit(f'no render_meta.json in {src} — run the render script first')
    with open(path) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', help='folder of rendered pose PNGs')
    ap.add_argument('--name', help='character name (defaults to render_meta)')
    ap.add_argument('--out', default='art/warriors', help='output folder')
    ap.add_argument('--lighting', default='baked', choices=['baked', 'engine'])
    ap.add_argument('--replace', action='store_true',
                    help='start a fresh manifest instead of merging')
    args = ap.parse_args()

    meta = load_meta(args.src)
    name = args.name or meta['character']
    scale = meta['scale']
    ax, ay = meta['anchor']

    cells = []
    for pose in POSES:
        p = os.path.join(args.src, f'{pose}.png')
        if not os.path.exists(p):
            sys.exit(f'missing pose: {p}\n'
                     f'a character needs all six or the engine ignores it')
        im = Image.open(p).convert('RGBA')
        bbox = im.getbbox()          # tight box around non-transparent pixels
        if bbox is None:
            sys.exit(f'{pose}.png is entirely transparent')
        cells.append((pose, im.crop(bbox), bbox))

    # One row, left to right, in the engine's pose order.
    W = sum(c[1].width for c in cells) + PAD * (len(cells) - 1)
    H = max(c[1].height for c in cells)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    frames, x = {}, 0
    for pose, im, bbox in cells:
        atlas.paste(im, (x, 0))
        # The trim moved the origin; move the anchor with it by the same amount.
        frames[pose] = {
            'x': x, 'y': 0, 'w': im.width, 'h': im.height,
            'anchor': [ax - bbox[0], ay - bbox[1]],
        }
        x += im.width + PAD

    os.makedirs(args.out, exist_ok=True)
    slug = name.lower().replace(' ', '-')
    sheet = f'{slug}.png'
    atlas.save(os.path.join(args.out, sheet), optimize=True)

    mpath = os.path.join(args.out, 'manifest.json')
    manifest = {'version': 1, 'characters': {}}
    if os.path.exists(mpath) and not args.replace:
        with open(mpath) as f:
            manifest = json.load(f)
        manifest.setdefault('characters', {})
    manifest['characters'][name] = {
        'sheet': sheet, 'scale': scale,
        'lighting': args.lighting, 'frames': frames,
    }
    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=2)

    kb = os.path.getsize(os.path.join(args.out, sheet)) / 1024
    print(f'{sheet}  {W}x{H}  {kb:.0f} KB')
    for pose in POSES:
        fr = frames[pose]
        print(f'  {pose:<7} {fr["w"]:>4}x{fr["h"]:<4} anchor {fr["anchor"]}')
    print(f'manifest: {mpath}  ({len(manifest["characters"])} character(s))')


if __name__ == '__main__':
    main()
