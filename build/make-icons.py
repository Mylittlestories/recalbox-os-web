#!/usr/bin/env python3
"""Regenerates every icon asset from build/icon-master.png (1024×1024, the hand-tuned master).

    python3 build/make-icons.py

Outputs
  build/icon.png        512×512   electron-builder source (Linux AppImage; win/mac converted below)
  build/icon.ico        16…256    Windows (multi-size, PNG-compressed 256)
  (macOS .icns is derived from icon.png by electron-builder at build time — 512×512 RGBA is enough)
  build/icons/<N>x<N>.png          Linux desktop sizes 16/24/32/48/64/128/256/512
  www/img/icon-256.png             window icon (Linux taskbar) + README badge
  www/img/logo.svg                 vector mark used by the app header/boot screen & README banner
Only Pillow is needed. Rounded-corner mask is applied here so the master can stay a square bitmap.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, 'build', 'icon-master.png')
if not os.path.exists(MASTER):
    sys.exit('missing ' + MASTER)

src = Image.open(MASTER).convert('RGBA')
if src.size != (1024, 1024):
    src = src.resize((1024, 1024), Image.LANCZOS)

def squircle(size, radius_pct=0.2235):     # Apple-style corner ratio; everything outside is transparent
    im = src.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size * 4, size * 4), 0)
    r = int(size * 4 * radius_pct)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=r, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out

os.makedirs(os.path.join(ROOT, 'build', 'icons'), exist_ok=True)
for n in (16, 24, 32, 48, 64, 128, 256, 512):
    squircle(n).save(os.path.join(ROOT, 'build', 'icons', f'{n}x{n}.png'), optimize=True)
squircle(512).save(os.path.join(ROOT, 'build', 'icon.png'), optimize=True)
squircle(256).save(os.path.join(ROOT, 'www', 'img', 'icon-256.png'), optimize=True)

# Windows .ico — Pillow emits one PNG-compressed image per size
squircle(256).save(os.path.join(ROOT, 'build', 'icon.ico'),
                   sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icons written:', sorted(os.listdir(os.path.join(ROOT, 'build'))))
