"""Draws the TapClay app icon set: a white clay NFC tag, violet waves and a pen nib on lavender.

usage: make_icons.py <font.ttf> <out_dir>
"""
import math
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FONT, OUT = sys.argv[1], sys.argv[2]
S = 1024
K = 2  # supersampling
W = S * K


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(size, stops, angle_deg):
    """CSS-style linear gradient: angle clockwise from 'to top'."""
    w, h = size
    small = 256
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)
    half = (abs(dx) + abs(dy)) / 2
    img = Image.new('RGB', (small, small))
    px = img.load()
    cols = [(p, hexrgb(c)) for p, c in stops]
    for y in range(small):
        for x in range(small):
            u, v = x / (small - 1) - 0.5, y / (small - 1) - 0.5
            t = min(1, max(0, (u * dx + v * dy) / (2 * half) + 0.5))
            for (p0, c0), (p1, c1) in zip(cols, cols[1:]):
                if t <= p1:
                    f = (t - p0) / (p1 - p0) if p1 > p0 else 0
                    px[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * f) for i in range(3))
                    break
            else:
                px[x, y] = cols[-1][1]
    return img.resize((w, h), Image.BICUBIC)


def blur(img, r):
    return img.filter(ImageFilter.GaussianBlur(r * K))


def shifted(mask, dx, dy):
    return ImageChops.offset(mask, round(dx * K), round(dy * K))


def paint(base, mask, fill, opacity=1.0):
    """Composite a colour or an RGB image through a mask onto an RGBA base."""
    layer = fill.convert('RGBA') if isinstance(fill, Image.Image) else Image.new('RGBA', base.size, hexrgb(fill) + (255,))
    m = mask if opacity == 1 else mask.point(lambda v: round(v * opacity))
    layer.putalpha(m)
    base.alpha_composite(layer)


def P(v):
    return round(v * K)


# ---- shapes (coordinates on the 1024 grid) -------------------------------

ARC_C = (530, 545)
ARC_R = (118, 214, 310)
ARC_W = 52
ARC_FROM, ARC_TO = 252, 357  # degrees, clockwise from 3 o'clock

TAG_C = (384, 676)
TAG_W, TAG_H, TAG_R = 408, 362, 100
TAG_ROT = 15  # counter-clockwise
TAG_DEPTH = 30


def arcs_mask():
    m = Image.new('L', (W, W), 0)
    d = ImageDraw.Draw(m)
    cx, cy = ARC_C
    for r in ARC_R:
        box = [P(cx - r - ARC_W / 2), P(cy - r - ARC_W / 2), P(cx + r + ARC_W / 2), P(cy + r + ARC_W / 2)]
        d.arc(box, ARC_FROM, ARC_TO, fill=255, width=P(ARC_W))
        for ang in (ARC_FROM, ARC_TO):
            x, y = cx + r * math.cos(math.radians(ang)), cy + r * math.sin(math.radians(ang))
            d.ellipse([P(x - ARC_W / 2), P(y - ARC_W / 2), P(x + ARC_W / 2), P(y + ARC_W / 2)], fill=255)
    return m


def nib_masks():
    """Pen nib pointing down-left, hanging under the end of the outer wave."""
    size = 220
    body = Image.new('L', (P(size), P(size)), 0)
    cut = Image.new('L', (P(size), P(size)), 0)
    d = ImageDraw.Draw(body)
    # Drawn pointing straight down, then rotated.
    pts = [(110, 208), (52, 96), (70, 30), (150, 30), (168, 96)]
    d.polygon([(P(x), P(y)) for x, y in pts], fill=255)
    body = body.filter(ImageFilter.GaussianBlur(K * 2.2)).point(lambda v: 255 if v > 120 else 0).filter(ImageFilter.GaussianBlur(K * 0.6))
    c = ImageDraw.Draw(cut)
    c.ellipse([P(110 - 17), P(100 - 17), P(110 + 17), P(100 + 17)], fill=255)
    c.line([(P(110), P(100)), (P(110), P(210))], fill=255, width=P(9))
    rot = 42  # clockwise on screen → tip swings to the lower left
    body, cut = body.rotate(-rot, Image.BICUBIC), cut.rotate(-rot, Image.BICUBIC)
    full_b, full_c = Image.new('L', (W, W), 0), Image.new('L', (W, W), 0)
    pos = (P(806 - size / 2), P(640 - size / 2))
    full_b.paste(body, pos)
    full_c.paste(cut, pos)
    return full_b, full_c


def tag_masks():
    face = Image.new('L', (W, W), 0)
    d = ImageDraw.Draw(face)
    x0, y0 = TAG_C[0] - TAG_W / 2, TAG_C[1] - TAG_H / 2
    d.rounded_rectangle([P(x0), P(y0), P(x0 + TAG_W), P(y0 + TAG_H)], radius=P(TAG_R), fill=255)
    text = Image.new('L', (W, W), 0)
    font = ImageFont.truetype(FONT, P(130))
    ImageDraw.Draw(text).text((P(TAG_C[0]), P(TAG_C[1] - 4)), 'NFC', font=font, fill=255, anchor='mm')
    centre = (P(TAG_C[0]), P(TAG_C[1]))
    return face.rotate(TAG_ROT, Image.BICUBIC, center=centre), text.rotate(TAG_ROT, Image.BICUBIC, center=centre)


VIOLET = gradient((W, W), [(0, '#a47bf7'), (0.4, '#7c5cf0'), (1, '#5440e0')], 150)


def artwork():
    """The mark on a transparent canvas, plus its flat silhouette."""
    art = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    arcs = arcs_mask()
    nib, nib_cut = nib_masks()
    face, text = tag_masks()

    # Waves and nib: violet clay with a soft drop and a light top rim.
    marks = ImageChops.lighter(arcs, ImageChops.subtract(nib, nib_cut))
    paint(art, blur(shifted(marks, 0, 16), 14), '#5b45e6', 0.38)
    paint(art, marks, VIOLET)
    rim = ImageChops.subtract(marks, shifted(marks, 0, 7))
    paint(art, ImageChops.multiply(blur(rim, 3), marks), '#ffffff', 0.5)
    shade = ImageChops.subtract(marks, shifted(marks, 0, -7))
    paint(art, ImageChops.multiply(blur(shade, 3), marks), '#28148c', 0.35)

    # Tag: ground shadow, the slab's edge, then the top face.
    slab = shifted(face, 0, TAG_DEPTH)
    paint(art, blur(shifted(slab, 0, 34), 30), '#5046b4', 0.42)
    paint(art, slab, gradient((W, W), [(0, '#d9d0fb'), (1, '#b3a6ef')], 180))
    paint(art, face, gradient((W, W), [(0, '#ffffff'), (1, '#ebe6fe')], 160))
    top = ImageChops.subtract(face, shifted(face, 0, 12))
    paint(art, ImageChops.multiply(blur(top, 5), face), '#ffffff', 0.95)
    low = ImageChops.subtract(face, shifted(face, 0, -14))
    paint(art, ImageChops.multiply(blur(low, 7), face), '#6e60dc', 0.2)
    paint(art, text, gradient((W, W), [(0, '#6650ee'), (1, '#4c35ea')], 180))

    silhouette = ImageChops.subtract(ImageChops.lighter(marks, ImageChops.lighter(face, slab)), text)
    return art, silhouette


def background():
    bg = gradient((W, W), [(0, '#f6f4ff'), (0.45, '#e6e1fd'), (1, '#cdc5f9')], 150).convert('RGBA')
    halo = Image.new('L', (W, W), 0)
    d = ImageDraw.Draw(halo)
    d.ellipse([P(120), P(360), P(930), P(880)], fill=255)
    d.ellipse([P(250), P(250), P(820), P(700)], fill=255)
    paint(bg, blur(halo, 46), '#f7f5ff', 0.6)
    return bg


def scaled(img, factor):
    """Scale about the artwork's own centre so it sits in the middle of the canvas."""
    box = img.getbbox()
    crop = img.crop(box)
    w, h = round(crop.width * factor), round(crop.height * factor)
    crop = crop.resize((w, h), Image.LANCZOS)
    out = Image.new(img.mode, img.size, 0)
    out.paste(crop, ((img.width - w) // 2, (img.height - h) // 2))
    return out


def down(img, size=S):
    return img.resize((size, size), Image.LANCZOS)


art, silhouette = artwork()
bg = background()

# iOS / store icon: full bleed, no alpha.
icon = bg.copy()
icon.alpha_composite(scaled(art, 0.93))
down(icon).convert('RGB').save(f'{OUT}/icon.png')

# Android adaptive icon: the mark inside the 66% safe zone.
down(bg).convert('RGB').save(f'{OUT}/android-icon-background.png')
down(scaled(art, 0.7)).save(f'{OUT}/android-icon-foreground.png')
mono = Image.new('RGBA', (W, W), (255, 255, 255, 0))
mono.putalpha(scaled(silhouette, 0.72))
down(mono).save(f'{OUT}/android-icon-monochrome.png')

# Splash: the mark alone, on the app's lavender background (set in app.json).
down(scaled(art, 0.98)).save(f'{OUT}/splash-icon.png')

# Favicon: the icon as a rounded tile.
tile_mask = Image.new('L', (W, W), 0)
ImageDraw.Draw(tile_mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=P(230), fill=255)
tile = icon.copy()
tile.putalpha(tile_mask)
down(tile, 48).save(f'{OUT}/favicon.png')
