"""Builds app/assets/icon.png and splash-icon.png from logo-midnight.png (the in-app marks,
logo-midnight.png and logo-daybreak.png, are used as they are). Run from the repo root:
python3 -I tools/build_brand_assets.py. The icon is the Midnight mark on the Midnight ground
(iOS app icons cannot be transparent); the splash is the same mark on transparent, because the
splash screen paints its own #0B0E13 background."""
from PIL import Image

MIDNIGHT_BG = (11, 14, 19, 255)
mark = Image.open('app/assets/logo-midnight.png').convert('RGBA')


def render(width_frac, size, out, bg=None):
    w = round(size * width_frac)
    h = round(mark.height * w / mark.width)
    logo = mark.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    canvas.alpha_composite(logo, ((size - w) // 2, (size - h) // 2))
    (canvas.convert('RGB') if bg else canvas).save(out)


render(0.86, 1024, 'app/assets/icon.png', MIDNIGHT_BG)
render(0.62, 1024, 'app/assets/splash-icon.png')
