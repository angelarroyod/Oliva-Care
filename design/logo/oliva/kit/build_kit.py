# Oliva logo kit masters. Run: python build_kit.py
OLIVO, HOJA, CREMA = "#3A5A2C", "#A9BD7A", "#F5F2E6"
SW = 26  # wordmark stroke

def svg(vb, body, title="Oliva"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img"><title>{title}</title>\n{body}\n</svg>\n'

# Symbol on 256 grid: disc r=96, leaf counter = vesica 45° (chord 141, width 58).
DISC = "M128 32A96 96 0 1 1 127.99 32Z"
LEAF = "M78 178A100 100 0 0 1 178 78A100 100 0 0 1 78 178Z"
# Small cut (≤32 px): shorter, fatter leaf so the ring at the tips never drops below ~2 px at 16 px.
LEAF_SMALL = "M84 172A72 72 0 0 1 172 84A72 72 0 0 1 84 172Z"

def symbol(fill, leaf=LEAF, leaf_fill=None):
    out = f'<path fill="{fill}" fill-rule="evenodd" d="{DISC}{leaf}"/>'
    return out + (f'<path fill="{leaf_fill}" d="{leaf}"/>' if leaf_fill else "")

def wordmark(color):
    st = f'fill="none" stroke="{color}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"'
    return (f'<circle cx="56" cy="144" r="43" {st}/>'
            f'<path d="M146 45V187M194 101V187M236 101L278 187L320 101M442 101V187" {st}/>'
            f'<circle cx="194" cy="55" r="16" fill="{color}"/>'
            f'<circle cx="399" cy="144" r="43" {st}/>')  # extent x 0..455, y 32..200

def horizontal(sym, word):
    # symbol r=76 (scale 0.79): sits on the baseline with ~1% overshoot, top just under the ascender
    return svg("-16 -6 683 256", f'<g transform="translate(-25.3 25) scale(0.7917)">{sym}</g><g transform="translate(196 0)">{word}</g>')

def stacked(sym, word):
    return svg("-24 -8 503 440", f'<g transform="translate(99.5 -32)">{sym}</g><g transform="translate(0 196)">{word}</g>')

files = {
    "oliva-symbol.svg": svg("0 0 256 256", symbol(OLIVO)),
    "oliva-symbol-color.svg": svg("0 0 256 256", symbol(OLIVO, leaf_fill=HOJA)),
    "oliva-symbol-small.svg": svg("0 0 256 256", symbol(OLIVO, LEAF_SMALL)),
    "oliva-wordmark.svg": svg("-8 24 471 184", wordmark(OLIVO)),
    "oliva-horizontal.svg": horizontal(symbol(OLIVO), wordmark(OLIVO)),
    "oliva-horizontal-color.svg": horizontal(symbol(OLIVO, leaf_fill=HOJA), wordmark(OLIVO)),
    "oliva-horizontal-reversed.svg": horizontal(symbol(CREMA), wordmark(CREMA)),
    "oliva-stacked.svg": stacked(symbol(OLIVO), wordmark(OLIVO)),
    "oliva-stacked-color.svg": stacked(symbol(OLIVO, leaf_fill=HOJA), wordmark(OLIVO)),
    # Expo / store icons: full-bleed square (iOS rounds it), colour mark on cream.
    "oliva-ios-icon.svg": svg("0 0 256 256", f'<rect width="256" height="256" fill="{CREMA}"/><g transform="translate(48.6 48.6) scale(0.62)">{symbol(OLIVO, LEAF, HOJA)}</g>'),
    # Android adaptive: mark inside the 66% safe zone, transparent.
    "oliva-android-foreground.svg": svg("0 0 256 256", f'<g transform="translate(64 64) scale(0.5)">{symbol(OLIVO, LEAF, HOJA)}</g>'),
    "oliva-android-background.svg": svg("0 0 256 256", f'<rect width="256" height="256" fill="{CREMA}"/>'),
    "oliva-android-monochrome.svg": svg("0 0 256 256", f'<g transform="translate(64 64) scale(0.5)">{symbol("#FFFFFF")}</g>'),
    "oliva-splash.svg": svg("0 0 256 256", f'<g transform="translate(48 48) scale(0.625)">{symbol(OLIVO, leaf_fill=HOJA)}</g>'),
}
for name, content in files.items():
    open(name, "w").write(content)
print("\n".join(files))
