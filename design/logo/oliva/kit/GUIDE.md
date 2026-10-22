# Oliva: logo usage guide

**Oliva** is named after the founder's grandmother, whose care inspired the app.
The mark, **La O**, is the O of her name with an olive leaf at its heart: the person
cared for, at the centre. The olive tree stands for long life and peace, and for
growth that needs tending.

## The logo

| File | Use |
|---|---|
| `oliva-horizontal-color.svg` | **Primary.** Headers, website, documents |
| `oliva-stacked-color.svg` | Square spaces: splash, badges, social posts |
| `oliva-symbol-color.svg` | App icon, avatar, anywhere the name is already shown |
| `oliva-symbol-small.svg` | **At 32 px and below** (favicon, tab icons): wider leaf that stays open |
| `oliva-wordmark.svg` | Text-only contexts where the symbol would repeat |
| `oliva-horizontal-reversed.svg`, `export/lockups/*-white.svg` | On dark or photographic backgrounds |
| `export/lockups/*-black.svg`, `*-mono-3a5a2c.svg` | One-colour print, stamps, embroidery, fax-style forms |

The one-colour versions cut the leaf out as a real hole. Don't fill it with white.

## Colour

| Name | HEX | RGB | CMYK (approx.) | Role |
|---|---|---|---|---|
| **Olivo** | `#3A5A2C` | 58 90 44 | 36 0 51 65 | Disc, wordmark, primary brand colour |
| **Hoja** | `#A9BD7A` | 169 189 122 | 11 0 35 26 | The leaf, **only inside the olive disc** |
| **Crema** | `#F5F2E6` | 245 242 230 | 0 1 6 4 | Icon tiles and warm backgrounds |

Contrast: Olivo on white 7.8:1, on Crema 7.0:1. Hoja against Olivo is 3.8:1, which passes the 3:1 minimum for graphics.
Hoja on white is only 2.0:1, so **never use Hoja for text or on its own on white**.
The CMYK values are a mechanical conversion. Confirm them in a print proof and pick the closest Pantone there.

## Clear space and minimum size

- **Clear space:** keep at least **half the disc's radius** empty on every side of the logo.
  Measured on the symbol: 48 units on the 256 grid.
- **Minimum size:** symbol **16 px** (use the small cut ≤ 32 px). Horizontal lockup **96 px** wide on screen or **25 mm** in print.

## Typography

The wordmark is built from geometry: round monoline strokes, 26 units on a 112-unit x-height.
It isn't a font, so never retype "oliva" in a typeface to stand in for it.
In the app, the interface stays in **Atkinson Hyperlegible Next**.

## Don't

- Rotate the leaf, change its angle, or move it off-centre.
- Recolour the disc, or put Hoja on the disc in one-colour contexts.
- Use the two-colour symbol on Olivo backgrounds (the disc disappears). Use Crema or white, or the reversed version.
- Add outlines, shadows, gradients or a red/medical cross.
- Stretch, squash or re-space the wordmark, or change the symbol-to-wordmark ratio.
- Put the logo on busy photos without a Crema or Olivo panel behind it.

## Files and rebuilding

- `build_kit.py` regenerates every master SVG (geometry and colours live at the top).
- `export/`: one-colour variants, PNGs, and the web icon set (`favicon.ico`, PWA icons, `site.webmanifest`, `head-snippet.html`).
- `expo/`: the app icon, Android adaptive icons, splash and favicon, already copied into `/assets`.
- `oliva-board.html` and `slides/`: the presentation board with mockups.

## Open items

- Trademark search for "Oliva" in classes 9, 42 and 44 (OEPM, EUIPO), plus the app stores and domains. Not done yet.
- The wordmark uses strokes, not outlines. Expand the strokes to fills in a vector editor before sending it to print vendors.
