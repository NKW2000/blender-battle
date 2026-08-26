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
| `still.mjs` | Single frames at given timestamps, for checking a scene without rendering the lot. |
| `build-ad.mjs` | Inlines the fonts into `scenes/ad.html`. |
| `scenes/ad.template.html` | The ad. Edit this, not `ad.html`. |

Check a scene before committing to a full render:

    node still.mjs scenes/ad.html 1.6 11.6 25.2

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
