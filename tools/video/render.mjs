/**
 * Renders an HTML/CSS animation to MP4, deterministically.
 *
 * The obvious way to do this is to play the page and screen-record it, and the
 * obvious way is wrong. Real-time capture ties the output to how fast the
 * machine happened to be: a frame that takes too long to paint is a frame the
 * recorder misses, so the video stutters where the renderer struggled, and two
 * runs of the same source produce two different files.
 *
 * So the page is never played. Every animation on it is paused, the clock is
 * moved to an exact timestamp, one screenshot is taken, and the clock moves on.
 * The renderer can take a minute over a frame and the result is identical —
 * frame 240 is what the animation looks like at exactly 10.000s at 24fps,
 * whatever the machine was doing at the time.
 *
 * Two things make that work:
 *
 *   `document.getAnimations()` returns every running CSS animation and
 *   transition as a Web Animations object, and each one can be paused and had
 *   its `currentTime` set. That covers anything authored in CSS without the
 *   animation needing to know it is being recorded.
 *
 *   A page can also export `window.seek(seconds)` for anything CSS cannot
 *   express — a counter ticking up, a chart drawing itself. If it exists it is
 *   called at every frame with the same timestamp.
 *
 * Usage:
 *   node render.mjs scenes/ad.html --out ad.mp4 --seconds 30 --fps 30 --width 1920 --height 1080
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ffmpeg from 'ffmpeg-static';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));

/*
  The browser that is already installed, rather than one downloaded per project.

  `puppeteer-core` deliberately ships no Chromium, which keeps this tool a few
  megabytes instead of a few hundred. The trade is that the browser has to be
  found; these are the ordinary install locations, and CHROME_PATH overrides
  them for anyone whose is elsewhere.
*/
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found) return found;

  throw new Error(
    `No Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}\n` +
      'Set CHROME_PATH to your browser if it lives elsewhere.',
  );
}

function parseArguments(argv) {
  const [source, ...rest] = argv;
  if (!source) throw new Error('Usage: node render.mjs <page.html> [--out file.mp4] [--seconds n] [--fps n] [--width n] [--height n]');

  const options = {
    source: resolve(HERE, source),
    out: resolve(HERE, 'out.mp4'),
    seconds: 20,
    fps: 30,
    width: 1920,
    height: 1080,
  };

  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, '');
    const value = rest[i + 1];
    if (!(key in options)) throw new Error(`Unknown option: --${key}`);
    options[key] = key === 'source' || key === 'out' ? resolve(HERE, value) : Number(value);
  }

  return options;
}

/** Pauses everything on the page and moves it to `seconds`. */
function seekPage(seconds) {
  // Runs inside the browser.
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = seconds * 1000;
  }

  const page = /** @type {{ seek?: (s: number) => void }} */ (window);
  page.seek?.(seconds);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const frames = Math.round(options.seconds * options.fps);
  const framesDir = join(HERE, '.frames');

  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'shell',
    args: [
      // Without this the compositor may skip work it thinks nobody can see,
      // which is exactly the work being screenshotted.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--hide-scrollbars',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
    });

    await page.goto(pathToFileURL(options.source).href, { waitUntil: 'networkidle0' });

    /*
      Fonts, before the first frame.

      A webfont that arrives on frame 12 means the first eleven frames are set
      in a fallback face and the type visibly jumps. `document.fonts.ready` is
      the only reliable point at which that cannot still happen.
    */
    await page.evaluate(() => document.fonts.ready);

    process.stdout.write(`Rendering ${frames} frames at ${options.fps}fps (${options.seconds}s)\n`);

    for (let frame = 0; frame < frames; frame += 1) {
      const seconds = frame / options.fps;
      await page.evaluate(seekPage, seconds);

      await page.screenshot({
        path: join(framesDir, `${String(frame).padStart(6, '0')}.png`),
        optimizeForSpeed: true,
      });

      if (frame % options.fps === 0) {
        process.stdout.write(`  ${String(seconds).padStart(5)}s  ${frame}/${frames}\r`);
      }
    }

    process.stdout.write(`\n  captured ${frames} frames\n`);
  } finally {
    await browser.close();
  }

  /*
    `-pix_fmt yuv420p` is not optional.

    Chrome writes RGB, and H.264 in RGB plays in a video editor and shows a
    black rectangle in Safari, on iOS, and in most social feeds. Converting to
    4:2:0 chroma is what makes the file play everywhere.
  */
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-framerate', String(options.fps),
      '-i', join(framesDir, '%06d.png'),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      // Both dimensions must be even for 4:2:0. Rounding down beats failing.
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      options.out,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  rmSync(framesDir, { recursive: true, force: true });
  process.stdout.write(`Wrote ${options.out}\n`);
}

await main();
