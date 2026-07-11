#!/usr/bin/env python3
"""Genera un icono 'Scout' 1024x1024 (lupa + SCOUT) para el .app del Escritorio."""
from PIL import Image, ImageDraw, ImageFont
import os

SZ = 1024
img = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# ── Fondo: rectángulo redondeado con degradado vertical azul ───────────────
grad = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
top = (46, 111, 196)     # #2E6FC4
bot = (16, 58, 110)      # #103A6E
for y in range(SZ):
    t = y / (SZ - 1)
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    gd.line([(0, y), (SZ, y)], fill=(r, g, b, 255))

# máscara redondeada (estilo icono macOS)
mask = Image.new("L", (SZ, SZ), 0)
md = ImageDraw.Draw(mask)
radius = int(SZ * 0.225)
margin = int(SZ * 0.06)
md.rounded_rectangle([margin, margin, SZ - margin, SZ - margin], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)

# ── Lupa ───────────────────────────────────────────────────────────────────
white = (255, 255, 255, 255)
accent = (120, 200, 255, 255)  # brillo interior
# lente
cx, cy, rad = int(SZ * 0.44), int(SZ * 0.42), int(SZ * 0.20)
ring = int(SZ * 0.055)
# aro exterior
d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=white, width=ring)
# cristal interior sutil
d.ellipse([cx - rad + ring, cy - rad + ring, cx + rad - ring, cy + rad - ring],
          fill=(255, 255, 255, 40))
# puntito de "zona" dentro (pin) para sugerir búsqueda por provincia
pin = int(SZ * 0.045)
d.ellipse([cx - pin, cy - pin, cx + pin, cy + pin], fill=accent)

# mango
import math
ang = math.radians(45)
hx1 = cx + int((rad + ring * 0.2) * math.cos(ang))
hy1 = cy + int((rad + ring * 0.2) * math.sin(ang))
hx2 = cx + int((rad + SZ * 0.16) * math.cos(ang))
hy2 = cy + int((rad + SZ * 0.16) * math.sin(ang))
d.line([(hx1, hy1), (hx2, hy2)], fill=white, width=int(SZ * 0.072))
# punta redondeada del mango
cap = int(SZ * 0.036)
d.ellipse([hx2 - cap, hy2 - cap, hx2 + cap, hy2 + cap], fill=white)

# ── Texto SCOUT ──────────────────────────────────────────────────────────────
font = None
for fp in [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/SFNSRounded.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, int(SZ * 0.135))
            break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()

txt = "SCOUT"
bbox = d.textbbox((0, 0), txt, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx = (SZ - tw) / 2 - bbox[0]
ty = int(SZ * 0.72)
# sombra suave
d.text((tx + 4, ty + 4), txt, font=font, fill=(0, 0, 0, 90))
d.text((tx, ty), txt, font=font, fill=white)

out = os.path.join(os.path.dirname(__file__), "scout_1024.png")
img.save(out)
print("icono ->", out)
