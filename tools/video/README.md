# Social cut

Renders a silent, 60fps promo from the site's own design, in three social
shapes. The picture is HTML and CSS; the renderer drives a headless Chrome frame
by frame and FFmpeg stitches the result.

    npm install
    pnpm --filter @bb/web build          # the stylesheet comes from here
    AD_URL=blenderbattle.vercel.app node build-ad.mjs
    node render.mjs scenes/ad.html --out vertical.mp4 --seconds 28 --fps 60 --width 1080 --height 1920
    node render.mjs scenes/ad.html --out square.mp4   --seconds 28 --fps 60 --width 1080 --height 1080
    node render.mjs scenes/ad.html --out wide.mp4     --seconds 28 --fps 60 --width 1920 --height 1080

## It is the website, not a copy of it

`build-ad.mjs` inlines the site's **compiled stylesheet** — the real Tailwind
output from `apps/web/.next` — and the scenes use real component markup with
real class names. The 22px panel radius, the 3px ink border, the 8px offset
shadow and the `eyebrow` rule are all resolved by the site's own CSS.

That means the film cannot drift from the product. Change a colour token or a
panel radius, rebuild the site, rebuild the ad, and the video follows. Nothing
here is a hex code copied by eye.

The layout is a **1152px site column** — `max-w-6xl`, the width the site's pages
use — scaled as one piece to fit whichever frame is being rendered. A square
post and a vertical story are therefore the same design at different
magnifications rather than three subtly different layouts.

## Why not just screen-record it

Real-time capture ties the output to how fast the machine happened to be. A
frame that takes too long to paint is a frame the recorder misses, so the video
stutters exactly where the renderer struggled, and two runs of the same source
give two different files.

Here the page is never played. Every animation is paused, the clock is moved to
an exact timestamp, one screenshot is taken, and the clock moves on. Frame 900
is what the film looks like at exactly 15.000s at 60fps whatever else the
machine was doing — and 60fps costs nothing extra in fidelity, because the film
is not being played faster, it is being sampled more often.

## What is in here

| File | What it does |
| --- | --- |
| `render.mjs` | The renderer. Frames out of Chrome, MP4 out of FFmpeg. |
| `build-ad.mjs` | Inlines the site's CSS and the fonts into `scenes/ad.html`. |
| `still.mjs` | Single frames at given timestamps, in any shape. |
| `check-fit.mjs` | Walks both frame shapes through every scene, reporting overflow. |
| `scenes/ad.template.html` | The film. Edit this, not `ad.html`. |

Check a scene without rendering the lot:

    node still.mjs scenes/ad.html --size 1080x1920 6.6 20.9

## No audio

Deliberate. These are built for feeds that autoplay muted, and a silent cut is
one less thing to license, re-clear and re-mix every time the film is re-cut.
Everything the film says, it says on screen.

## Two details that are not optional

**`-pix_fmt yuv420p`.** Chrome writes RGB. H.264 in RGB plays fine in an editor
and shows a black rectangle on iOS and in most social feeds.

**`document.fonts.ready` before the first frame.** A webfont that arrives on
frame 12 leaves the opening second set in a fallback face. The film also inlines
its fonts, so nothing is fetched at render time.

## Editing

The timeline is one array near the bottom of `scenes/ad.template.html`:

```js
const SCENES = [
  { id: 's1', from: 0.0, to: 4.6 },
  ...
];
```

Each scene has a body function taking the time *since that scene started*, so
moving a beat does not mean re-timing its contents. Re-run `build-ad.mjs` after
editing.

The address on the end card comes from `AD_URL`.
