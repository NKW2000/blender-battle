# HTML → MP4

Renders an HTML/CSS animation to video by driving the page's clock frame by
frame, rather than playing it and recording the screen.

    npm install
    node build-ad.mjs
    node render.mjs scenes/ad.html --out ad.mp4 --seconds 28 --fps 30 --width 1920 --height 1080

## Why not just screen-record it

Real-time capture ties the output to how fast the machine happened to be. A
frame that takes too long to paint is a frame the recorder misses, so the video
stutters exactly where the renderer struggled — and two runs of the same source
produce two different files.

Here the page is never played. Every animation is paused, the clock is moved to
an exact timestamp, one screenshot is taken, and the clock moves on. The
renderer can take a minute over a single frame and the output is identical:
frame 240 is what the animation looks like at exactly 10.000s at 24fps, whatever
else was happening on the machine.

## How a page is seeked

Two mechanisms, and a page can use either or both.

**CSS animations and transitions.** `document.getAnimations()` hands back every
running one as a Web Animations object, which can be paused and have its
`currentTime` set. Nothing in the page has to know it is being recorded.

**A `window.seek(seconds)` export.** For anything CSS cannot express — a counter
ticking up, a chart drawing itself, a clock counting down. If the page defines
it, the renderer calls it with the same timestamp at every frame.

`scenes/ad.template.html` uses only the second. It has no CSS animation at all:
the entire film is one function of time, which is the most direct way to
guarantee the property the renderer needs rather than hoping the browser kept up.

## What is in here

| File | What it does |
| --- | --- |
| `render.mjs` | The renderer. Frames out of Chrome, MP4 out of FFmpeg. |
| `mix.mjs` | Builds the soundtrack and muxes it onto a rendered video. |
| `audio/synth.mjs` | Generates the music bed, applause and whistle. |
| `still.mjs` | Single frames at given timestamps, for checking a scene without rendering the lot. |
| `check-fit.mjs` | Walks both frame shapes through every scene, reporting overflow. |
| `build-ad.mjs` | Inlines the fonts into `scenes/ad.html`. |
| `scenes/ad.template.html` | The ad. Edit this, not `ad.html`. |

Check a scene before committing to a full render:

    node still.mjs scenes/ad.html 1.6 11.6 25.2

## The whole ad, end to end

    npm install
    node audio/synth.mjs
    AD_URL=blenderbattle.vercel.app node build-ad.mjs
    node render.mjs scenes/ad.html --out ad-16x9.mp4 --seconds 38.5 --fps 30 --width 1920 --height 1080
    node render.mjs scenes/ad.html --out ad-9x16.mp4 --seconds 38.5 --fps 30 --width 1080 --height 1920
    node mix.mjs ad-16x9.mp4 -o blenderbattle-ad-1080p.mp4
    node mix.mjs ad-9x16.mp4 -o blenderbattle-ad-vertical.mp4

## One design, two shapes

Every size in the ad is in `vmin`. The landscape frame is 1920x1080 and the
vertical one is 1080x1920 — different shapes, but the *smaller* side is 1080 in
both, so a `vmin` is the same number of pixels either way. Type is therefore
identical between the cuts rather than merely proportional.

Where a size also has to respect the frame's width — headlines, the wordmark,
the address — it is capped with `min(Nvmin, Mvw)`. 9:16 is only 1080 wide, and a
line that sits comfortably in the wide frame will run off the narrow one.

`check-fit.mjs` walks both viewports through the middle of every scene and
reports anything that overflows either edge:

    node check-fit.mjs scenes/ad.html

## Sound

`audio/synth.mjs` generates the music bed, the applause and the whistle from
oscillators and noise. Nothing is sampled. A stock loop brings a licence the
project would have to honour on every re-cut, and a "royalty free" file from an
unclear source is a copyright claim waiting to happen; generated audio belongs
to this repository outright. It is also seeded rather than random, so the same
files come out every run.

The voiceover is Windows SAPI, through `System.Speech`. That is why it sounds
synthetic: it is a placeholder that costs nothing and needs no account. To
replace it with a real read, drop six WAVs into `audio/trimmed/` named
`vo1.wav` to `vo6.wav` and re-run `mix.mjs` — the cue times are at the top of
that file, and the scene boundaries they match are at the top of the template.

`mix.mjs` places every cue, sums them, limits the peaks and normalises to
-14 LUFS. Two settings there are load-bearing: `normalize=0` on the mix, because
left on, ffmpeg divides by the input count and adding one short sound would
quietly drop the entire soundtrack; and an explicit `-ar 48000`, because
`loudnorm` resamples its output to 96kHz and unusual rates are what platform
transcoders mishandle.

## Dependencies

`puppeteer-core` deliberately ships no browser, so this stays a few megabytes
instead of a few hundred. It drives the Chrome that is already installed; set
`CHROME_PATH` if yours is somewhere unusual. FFmpeg arrives as a static binary
through `ffmpeg-static`, so there is nothing to install by hand.

This folder is outside the pnpm workspace and has its own `package.json`, so
none of it touches the app's dependency tree.

## Two details that are not optional

**`-pix_fmt yuv420p`.** Chrome writes RGB. H.264 in RGB plays fine in a video
editor and shows a black rectangle in Safari, on iOS, and in most social feeds.

**`document.fonts.ready` before the first frame.** A webfont that arrives on
frame 12 means the first eleven frames are set in a fallback face and the type
visibly jumps. The ad sidesteps this entirely by inlining its fonts as data
URIs — no network at render time, and the same bytes every run.

## Changing the ad

The timeline lives in one array near the bottom of `scenes/ad.template.html`:

```js
const SCENES = [
  { id: 's1', from: 0.0, to: 5.0 },
  ...
];
```

Each scene has a body function taking the time *since that scene started*, so
moving a scene does not require re-timing its contents. Re-run `build-ad.mjs`
after editing the template.

The URL on the end card comes from `AD_URL`:

    AD_URL=blenderchallenge.com node build-ad.mjs
