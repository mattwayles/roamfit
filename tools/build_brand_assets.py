"""Builds app/assets/icon.png and splash-icon.png from logo-source.png. Run from the repo root:
python3 -I tools/build_brand_assets.py. The source is a 430x542 flat render on a dark ground, so the
logo is converted to an alpha mask (teal on transparent) and re-upscaled; replace the source with a
vector or a larger export when one exists."""
from PIL import Image, ImageFilter
import numpy as np, sys
src = Image.open('app/assets/logo-source.png').convert('RGB')
a = np.asarray(src).astype(float)
bg = np.median(np.concatenate([a[:6].reshape(-1,3), a[-6:].reshape(-1,3)]), axis=0)
lum = a[...,1]
solid = a[lum > np.percentile(lum, 97)]
teal = np.median(solid, axis=0)
print('bg', bg, 'teal', teal)
alpha = np.clip((a[...,1]-bg[1])/(teal[1]-bg[1]), 0, 1)
# Tight box around the mark (glow excluded), so the fractions below are of the mark itself.
ys, xs = np.where(alpha > 0.35)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
pad = 40  # source px kept around the mark so the glow is not clipped
x0, y0 = max(x0 - pad, 0), max(y0 - pad, 0)
x1, y1 = min(x1 + pad, alpha.shape[1]), min(y1 + pad, alpha.shape[0])
alpha = alpha[y0:y1, x0:x1].copy()
# Fade the glow to nothing at the crop edge so it cannot show as a rectangle.
def ramp(n, f=24):
    r = np.ones(n); t = np.linspace(0, 1, f)
    r[:f] = np.minimum(r[:f], t); r[-f:] = np.minimum(r[-f:], t[::-1]); return r
alpha *= ramp(alpha.shape[0])[:, None] * ramp(alpha.shape[1])[None, :]
mark_h = (ys.max() + 1 - ys.min())  # unpadded mark height, source px

def render(mark_frac, size, out, opaque_bg=None):
    # scale so the mark (not the padded crop) is `mark_frac` of the canvas height
    k = size * mark_frac / mark_h
    h = int(alpha.shape[0] * k); w = int(alpha.shape[1] * k)
    al = Image.fromarray((alpha*255).astype('uint8')).resize((w,h), Image.LANCZOS)
    arr = np.asarray(al).astype(float)/255
    arr = np.clip((arr-0.04)/0.96,0,1)
    rgba = np.zeros((h,w,4),'uint8'); rgba[...,:3]=teal.astype('uint8'); rgba[...,3]=(arr*255).astype('uint8')
    logo = Image.fromarray(rgba,'RGBA')
    canvas = Image.new('RGBA',(size,size),opaque_bg or (0,0,0,0))
    canvas.alpha_composite(logo, ((size-w)//2,(size-h)//2))
    if opaque_bg: canvas = canvas.convert('RGB')
    canvas.save(out)
render(0.78, 1024, 'app/assets/icon.png', (11,14,19,255))
render(0.50, 1024, 'app/assets/splash-icon.png')
