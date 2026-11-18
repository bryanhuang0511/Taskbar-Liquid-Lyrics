"""
Taskbar Liquid Lyrics icon generator (dev tool, not bundled).
  python make_icon.py            -> writes app.ico (16..256, PNG-compressed, true alpha),
                                    app_256.png, app_preview.png
Design: translucent liquid-glass circle + white beamed eighth notes.
Pure Pillow/numpy, so the icon can be regenerated or tweaked at any time.
"""
import io, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 1024
CX = CY = S / 2
R = 468


def radial(cx, cy, r, stops, size=S):
    """stops: [(t, (r,g,b,a)), ...] t in 0..1 -> RGBA float array."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.clip(np.hypot(x - cx, y - cy) / r, 0, 1)
    out = np.zeros((size, size, 4), np.float32)
    ts = [s[0] for s in stops]
    for c in range(4):
        out[..., c] = np.interp(d, ts, [s[1][c] for s in stops])
    return out


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def circle_mask(r, cx=CX, cy=CY, feather=0):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return m


def paste_with_mask(base, layer, mask):
    layer = layer.copy()
    a = ImageChops.multiply(layer.getchannel("A"), mask)
    layer.putalpha(a)
    return Image.alpha_composite(base, layer)


def build(small=False):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    disc = circle_mask(R)

    # 1) glass body: tinted, translucent. Darker core keeps white notes legible
    #    on both light and dark wallpapers, bright edge sells the "liquid" feel.
    body = radial(CX - 60, CY - 90, R * 1.25, [
        (0.00, (40, 70, 150, 96)),
        (0.55, (24, 44, 118, 112)),
        (1.00, (90, 150, 235, 92)),
    ])
    img = paste_with_mask(img, to_img(body), disc)

    # 2) bottom caustic glow (light collected at the lower rim)
    glow = radial(CX + 40, CY + R * 0.95, R * 0.95, [
        (0.0, (140, 220, 255, 150)), (0.6, (110, 170, 255, 40)), (1.0, (110, 170, 255, 0))])
    img = paste_with_mask(img, to_img(glow), disc)

    # 3) top specular dome
    spec = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(spec)
    sd.ellipse([CX - R * 0.78, CY - R * 0.96, CX + R * 0.78, CY - R * 0.12], fill=(255, 255, 255, 120))
    spec = spec.filter(ImageFilter.GaussianBlur(26))
    # fade the dome toward the bottom so it reads as a reflection, not a disc
    y = np.linspace(0, 1, S, dtype=np.float32)[:, None]
    fade = np.clip(1.0 - (y - 0.06) / 0.42, 0, 1) ** 1.4
    sa = np.asarray(spec.getchannel("A"), np.float32) * fade
    spec.putalpha(Image.fromarray(sa.astype(np.uint8)))
    img = paste_with_mask(img, spec, circle_mask(R - 10))

    # 4) rim: bright top-left -> faint bottom-right, plus a thin inner ring
    rim_w = 22 if small else 15
    ring = Image.new("L", (S, S), 0)
    rd = ImageDraw.Draw(ring)
    rd.ellipse([CX - R, CY - R, CX + R, CY + R], outline=255, width=rim_w)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    ang = (-(xx - CX) - (yy - CY)) / (R * 1.414)          # +1 top-left, -1 bottom-right
    rim_a = np.clip(0.30 + 0.70 * np.clip(ang * 0.5 + 0.5, 0, 1) ** 1.3, 0, 1) * 255
    rim = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    rim.putalpha(Image.fromarray((rim_a * (np.asarray(ring, np.float32) / 255)).astype(np.uint8)))
    img = Image.alpha_composite(img, rim)
    if not small:
        ring2 = Image.new("L", (S, S), 0)
        ImageDraw.Draw(ring2).ellipse([CX - R + 26, CY - R + 26, CX + R - 26, CY + R - 26], outline=255, width=4)
        r2a = np.asarray(ring2, np.float32) * (0.10 + 0.30 * np.clip(ang * 0.5 + 0.5, 0, 1)) 
        r2 = Image.new("RGBA", (S, S), (200, 230, 255, 0))
        r2.putalpha(Image.fromarray(r2a.astype(np.uint8)))
        img = Image.alpha_composite(img, r2)

    # 5) beamed eighth notes (two heads, two stems, one beam)
    notes = Image.new("L", (S, S), 0)
    nd = ImageDraw.Draw(notes)
    sw = 40 if small else 34                      # stem width
    bh = 84 if small else 72                      # beam thickness
    ox, oy = -6, 38                               # optical centering
    def head(cx, cy):
        h = Image.new("L", (S, S), 0)
        ImageDraw.Draw(h).ellipse([cx - 104, cy - 74, cx + 104, cy + 74], fill=255)
        h = h.rotate(20, center=(cx, cy), resample=Image.BICUBIC)
        return h
    h1c = (396 + ox, 698 + oy); h2c = (652 + ox, 640 + oy)
    s1x = h1c[0] + 84; s2x = h2c[0] + 84
    t1 = 322 + oy; t2 = 262 + oy
    notes = ImageChops.lighter(notes, head(*h1c))
    notes = ImageChops.lighter(notes, head(*h2c))
    nd = ImageDraw.Draw(notes)
    nd.rectangle([s1x - sw / 2, t1, s1x + sw / 2, h1c[1]], fill=255)
    nd.rectangle([s2x - sw / 2, t2, s2x + sw / 2, h2c[1]], fill=255)
    nd.polygon([(s1x - sw / 2, t1 - 6), (s2x + sw / 2, t2 - 6),
                (s2x + sw / 2, t2 - 6 + bh), (s1x - sw / 2, t1 - 6 + bh)], fill=255)
    notes = notes.filter(ImageFilter.GaussianBlur(1.2))          # soften aliasing before downsample

    # soft drop shadow
    sh = notes.filter(ImageFilter.GaussianBlur(16))
    sh = ImageChops.offset(sh, 0, 14)
    shadow = Image.new("RGBA", (S, S), (6, 14, 50, 0))
    shadow.putalpha(sh.point(lambda v: int(v * 0.55)))
    img = Image.alpha_composite(img, shadow)

    # white fill with a gentle vertical tint (top pure white, bottom a touch of ice-blue)
    g = np.linspace(0, 1, S, dtype=np.float32)[:, None, None]
    col = np.concatenate([
        255 - 22 * g * np.ones((S, S, 1)), 255 - 8 * g * np.ones((S, S, 1)), 255 * np.ones((S, S, 1)),
        255 * np.ones((S, S, 1))], axis=2)
    white = to_img(col)
    img = paste_with_mask(img, white, notes)
    return img


def make_ico(path, frames):
    """frames: {size: PIL RGBA}. Writes a PNG-compressed multi-size ICO."""
    blobs = []
    for sz, im in sorted(frames.items()):
        b = io.BytesIO(); im.save(b, "PNG", optimize=True); blobs.append((sz, b.getvalue()))
    out = bytearray(struct.pack("<HHH", 0, 1, len(blobs)))
    off = 6 + 16 * len(blobs)
    for sz, data in blobs:
        out += struct.pack("<BBBBHHII", sz % 256, sz % 256, 0, 0, 1, 32, len(data), off)
        off += len(data)
    for _, data in blobs:
        out += data
    with open(path, "wb") as f:
        f.write(out)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    big = build(False)
    small = build(True)
    sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    frames = {}
    for sz in sizes:
        src = small if sz <= 32 else big
        frames[sz] = src.resize((sz, sz), Image.LANCZOS)
    make_ico(os.path.join(here, "app.ico"), frames)
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(here, "app_256.png"))
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(here, "app_512.png"))
    # preview on light + dark + photo-ish backgrounds
    pv = Image.new("RGBA", (900, 330), (255, 255, 255, 255))
    d = ImageDraw.Draw(pv)
    d.rectangle([300, 0, 600, 330], fill=(24, 26, 34, 255))
    for x in range(600, 900):
        t = (x - 600) / 300
        d.line([(x, 0), (x, 330)], fill=(int(40 + 160 * t), int(120 + 60 * t), int(200 - 80 * t), 255))
    for i, x0 in enumerate((0, 300, 600)):
        ic = big.resize((200, 200), Image.LANCZOS)
        pv.alpha_composite(ic, (x0 + 50, 20))
        for k, sz in enumerate((16, 24, 32, 48)):
            pv.alpha_composite(frames[sz], (x0 + 30 + k * 62, 250))
    pv.save(os.path.join(here, "app_preview.png"))
    print("ok", {s: len(frames) for s in [len(frames)]})


if __name__ == "__main__":
    main()
