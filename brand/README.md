# Blender Battle — brand files

Everything here is generated from the app's own component and colour tokens, so
it cannot drift from what the site actually shows.

## Files

| File | Use it for |
| --- | --- |
| `blender-battle-mark-1024.png` | Profile pictures. The safe default everywhere. |
| `blender-battle-mark-512.png` | Anywhere a smaller file is wanted. |
| `blender-battle-mark-1024-transparent.png` | Placing the mark over your own background. |
| `mark.svg` / `mark-transparent.svg` | Vector. Export any size from these. |
| `lockup.svg` | Mark plus wordmark, for banners and headers. |

## Colours

| Token | Hex | Where |
| --- | --- | --- |
| Ink | `#0e0b2b` | Background, and the hole in the mark |
| Sun | `#ffd23f` | The mark, and "BATTLE" |
| Cream | `#fff6e9` | "BLENDER" |

## Type

Fredoka, bold — free on Google Fonts. The app loads it as `--font-arcade`.

## Profile picture sizes

The 1024 PNG covers all of these; upload it as-is and let the platform resize.

| Platform | Wants |
| --- | --- |
| X / Twitter | 400×400 |
| Instagram | 320×320 |
| YouTube | 800×800 |
| Discord | 512×512 |
| TikTok | 200×200 |
| Facebook | 320×320 |

**Every one of them crops to a circle.** The mark is drawn to survive that — its
points reach 466px from the centre of a 1024 square, inside the 512px radius the
crop leaves, so nothing is clipped.

## Regenerating

    node brand/render.mjs

Rasterised directly from the geometry with Node's standard library — no image
tooling to install, and the same output on any machine.
