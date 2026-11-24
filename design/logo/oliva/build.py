# Generates Oliva concept SVGs (symbols + stroke-built wordmark lockups).
SW = 26
def svg(vb, body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">\n{body}\n</svg>\n'
def stroke(d): return f'<path d="{d}" fill="none" stroke="#000" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>'

# Wordmark "oliva": x-height 112 (y 88..200), centerline geometry, round monoline.
def wordmark(leaf_dot, x0=0):
    o = f'<circle cx="{x0+56}" cy="144" r="43" fill="none" stroke="#000" stroke-width="{SW}"/>'
    l = stroke(f"M{x0+146} 45V187")
    i = stroke(f"M{x0+194} 101V187")
    if leaf_dot:
        dot = f'<path d="M{x0+176} 60A44 44 0 0 1 {x0+232} 44A44 44 0 0 1 {x0+176} 60Z"/>'
    else:
        dot = f'<circle cx="{x0+194}" cy="55" r="16"/>'
    v = stroke(f"M{x0+236} 101L{x0+278} 187L{x0+320} 101")
    a = f'<circle cx="{x0+399}" cy="144" r="43" fill="none" stroke="#000" stroke-width="{SW}"/>' + stroke(f"M{x0+442} 101V187")
    return o + l + i + dot + v + a  # right edge ~ x0+455

leaf_l = "M128 212A100 100 0 0 1 59.2 113.7A100 100 0 0 1 128 212Z"
leaf_r = "M128 212A100 100 0 0 0 196.8 113.7A100 100 0 0 0 128 212Z"
rama = '<ellipse cx="0" cy="0" rx="44" ry="68" transform="translate(112 162) rotate(-24)"/><path d="M84 96A150 150 0 0 1 226 50A150 150 0 0 1 84 96Z"/>'
la_o = '<path fill-rule="evenodd" d="M128 32A96 96 0 1 1 127.99 32ZM78 178A100 100 0 0 1 178 78A100 100 0 0 1 78 178Z"/>'
firma = '<path d="M118 222V130" fill="none" stroke="#000" stroke-width="44" stroke-linecap="round"/><path d="M80 96A120 120 0 0 1 210 62A120 120 0 0 1 80 96Z"/>'

files = {"a-rama.svg": svg("0 0 256 256", rama), "b-la-o.svg": svg("0 0 256 256", la_o), "c-firma.svg": svg("0 0 256 256", firma)}
for name, sym, leaf in [("a-rama", rama, False), ("b-la-o", la_o, False), ("c-firma", None, True)]:
    if sym:
        body = f'<g transform="translate(8 40) scale(0.69)">{sym}</g><g transform="translate(212 8)">{wordmark(leaf)}</g>'
        files[f"{name}-lockup.svg"] = svg("0 0 690 256", body)
    else:
        files[f"{name}-lockup.svg"] = svg("-16 0 490 256", f'<g transform="translate(0 8)">{wordmark(True)}</g>')
for f, s in files.items(): open(f, "w").write(s)
print(*files)
