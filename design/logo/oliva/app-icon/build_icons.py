# Oliva app icon options as Icon Composer-ready layers (1024 px, square, unmasked)
# plus a comparison sheet. Run: python build_icons.py
import os

DISC = "M128 32A96 96 0 1 1 127.99 32Z"
LEAF = "M78 178A100 100 0 0 1 178 78A100 100 0 0 1 78 178Z"

def L(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def cr(a, b):
    a, b = sorted([L(a), L(b)], reverse=True)
    return (a + 0.05) / (b + 0.05)

def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{body}</svg>\n'

def sym(path, s, cx=512, cy=512, fill="#000", opacity=1, evenodd=False):
    t = f"translate({cx - 128 * s} {cy - 128 * s}) scale({s})"
    fr = ' fill-rule="evenodd"' if evenodd else ""
    op = f' opacity="{opacity}"' if opacity < 1 else ""
    return f'<path transform="{t}" d="{path}" fill="{fill}"{fr}{op}/>'

def vesica(x1, y1, x2, y2, r, fill, opacity=1):
    op = f' opacity="{opacity}"' if opacity < 1 else ""
    return f'<path d="M{x1} {y1}A{r} {r} 0 0 1 {x2} {y2}A{r} {r} 0 0 1 {x1} {y1}Z" fill="{fill}"{op}/>'

# Palettes per appearance. Tinted = grayscale layers; the system applies the person's tint.
P = {
    "light":  dict(bg="#F5F2E6", ink="#3A5A2C", leaf="#A9BD7A"),
    "dark":   dict(bg="#18210F", ink="#527440", leaf="#DCE7BC"),
    "tinted": dict(bg="#000000", ink="#8A8A8A", leaf="#F2F2F2"),
}

# Each option: list of layers (name, builder(palette) -> svg body). First layer = background.
OPTIONS = {
    "a-capas": {
        "title": "A · La O en capas",
        "layers": [
            ("background", lambda p: f'<rect width="1024" height="1024" fill="{p["bg"]}"/>'),
            ("disc", lambda p: sym(DISC + LEAF, 3.4, fill=p["ink"], evenodd=True)),
            ("leaf", lambda p: sym(LEAF, 3.4, fill=p["leaf"])),
        ],
    },
    "b-hoja": {
        "title": "B · Hoja sobre olivo",
        "layers": [
            ("background", lambda p: f'<rect width="1024" height="1024" fill="{p["ink"] if p is P["light"] else p["bg"]}"/>'),
            ("leaf", lambda p: sym(LEAF, 5.2, fill=p["bg"] if p is P["light"] else p["leaf"])),
        ],
    },
    "c-brote": {
        "title": "C · La hoja que brota",
        "layers": [
            # Light needs its own three tones: the leaf sits on both the disc and the background.
            ("background", lambda p: f'<rect width="1024" height="1024" fill="{"#FBFAF5" if p is P["light"] else p["bg"]}"/>'),
            ("disc", lambda p: f'<circle cx="468" cy="556" r="270" fill="{"#2B4421" if p is P["light"] else p["ink"]}"/>'),
            ("leaf", lambda p: vesica(352, 672, 822, 202, 538, "#7A9858" if p is P["light"] else p["leaf"])),
        ],
    },
}

def flat(opt, mode):
    return svg("".join(build(P[mode]) for _, build in OPTIONS[opt]["layers"]))

os.makedirs("previews", exist_ok=True)
for opt, o in OPTIONS.items():
    os.makedirs(opt, exist_ok=True)
    for i, (name, build) in enumerate(o["layers"]):
        open(f"{opt}/{i}-{name}.svg", "w").write(svg(build(P["light"])))  # Icon Composer layers
    for mode in P:
        open(f"previews/{opt}-{mode}.svg", "w").write(flat(opt, mode))

# Contrast of each foreground against what sits behind it (graphics: judgment floor 3:1).
checks = {
    "A light disc/bg": ("#3A5A2C", "#F5F2E6"), "A light leaf/disc": ("#A9BD7A", "#3A5A2C"),
    "A dark disc/bg": ("#527440", "#18210F"), "A dark leaf/disc": ("#DCE7BC", "#527440"),
    "B light leaf/bg": ("#F5F2E6", "#3A5A2C"), "B dark leaf/bg": ("#DCE7BC", "#18210F"),
    "C light disc/bg": ("#2B4421", "#FBFAF5"), "C light leaf/bg": ("#7A9858", "#FBFAF5"), "C light leaf/disc": ("#7A9858", "#2B4421"),
    "C dark disc/bg": ("#527440", "#18210F"), "C dark leaf/disc": ("#DCE7BC", "#527440"),
}
for k, (a, b) in checks.items():
    print(f"{k:20s} {cr(a, b):.2f}:1")

# Comparison sheet: rows = options; columns = light / dark / tinted (approx.) + home-screen sizes.
R = 229  # ponytail: rounded-rect approximation of Apple's squircle mask, preview only
TINT = "#9DB5E0"
def tile(opt, mode, x, y, size):
    s = size / 1024
    inner = flat(opt, mode).split(">", 1)[1].rsplit("</svg>", 1)[0]
    clip = f"m{opt}{mode}{x}{y}".replace("-", "")
    tint = (f'<rect width="1024" height="1024" fill="{TINT}" style="mix-blend-mode:multiply"/>' if mode == "tinted" else "")
    return (f'<clipPath id="{clip}"><rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{R * s}"/></clipPath>'
            f'<g clip-path="url(#{clip})"><g transform="translate({x} {y}) scale({s})">{inner}{tint}</g></g>')

W, row_h = 1500, 300
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {80 + row_h * 3}" font-family="Segoe UI, Arial, sans-serif">',
       f'<rect width="{W}" height="{80 + row_h * 3}" fill="#F7F7F5"/>']
for j, h in enumerate(["Claro (default)", "Oscuro (dark)", "Tintado (aprox.)", "Pantalla de inicio: 60 · 40 · 29 pt"]):
    out.append(f'<text x="{300 + j * 240}" y="52" font-size="20" fill="#555">{h}</text>')
for i, (opt, o) in enumerate(OPTIONS.items()):
    y = 80 + i * row_h
    out.append(f'<text x="30" y="{y + 110}" font-size="26" font-weight="700" fill="#111">{o["title"].split(" · ")[0]}</text>')
    out.append(f'<text x="30" y="{y + 145}" font-size="19" fill="#333">{o["title"].split(" · ")[1]}</text>')
    out.append(f'<rect x="1000" y="{y + 20}" width="470" height="220" rx="24" fill="#2E3B4E"/>')
    out.append(f'<rect x="770" y="{y + 20}" width="200" height="200" rx="24" fill="#0B0E12"/>')
    out.append(tile(opt, "light", 300, y + 20, 200))
    out.append(tile(opt, "dark", 520, y + 20, 200))
    out.append(tile(opt, "tinted", 770 + 10, y + 30, 180))
    x = 1030
    for pt in (120, 80, 58):
        out.append(tile(opt, "light", x, y + 40, pt)); x += pt + 30
    out.append(f'<text x="1030" y="{y + 215}" font-size="15" fill="#D0D6E0">60 · 40 · 29 pt @2x</text>')
out.append("</svg>")
open("icon-options.svg", "w").write("\n".join(out))
