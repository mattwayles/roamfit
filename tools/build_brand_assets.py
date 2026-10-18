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
# upscale alpha smoothly
def render(scale_h, size, out, opaque_bg=None):
    h = int(size*scale_h); w = int(h*src.width/src.height)
    al = Image.fromarray((alpha*255).astype('uint8')).resize((w,h), Image.LANCZOS)
    # tighten the soft edge a little after upscale, keep glow
    arr = np.asarray(al).astype(float)/255
    arr = np.clip((arr-0.04)/0.96,0,1)
    rgba = np.zeros((h,w,4),'uint8'); rgba[...,:3]=teal.astype('uint8'); rgba[...,3]=(arr*255).astype('uint8')
    logo = Image.fromarray(rgba,'RGBA')
    if opaque_bg:
        canvas = Image.new('RGBA',(size,size),opaque_bg)
    else:
        canvas = Image.new('RGBA',(size,size),(0,0,0,0))
    canvas.alpha_composite(logo, ((size-w)//2,(size-h)//2))
    if opaque_bg: canvas = canvas.convert('RGB')
    canvas.save(out)
render(0.74, 1024, 'app/assets/icon.png', (11,14,19,255))
render(0.62, 1024, 'app/assets/splash-icon.png')
