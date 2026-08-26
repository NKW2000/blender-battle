/**
 * Checks that nothing overflows either frame, at every scene.
 *
 * A vertical cut is not a landscape cut turned sideways: the frame is 1080 wide
 * where the other is 1920, so a line that fits comfortably in one can run off
 * the other. This walks both viewports through the middle of every scene and
 * reports anything wider than the frame.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe']
  .filter(Boolean).find((p) => existsSync(p));

const source = process.argv[2];
const frames = [
  { name: '16:9 ', width: 1920, height: 1080 },
  { name: '9:16 ', width: 1080, height: 1920 },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--hide-scrollbars'] });

for (const frame of frames) {
  const page = await browser.newPage();
  await page.setViewport({ width: frame.width, height: frame.height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve(HERE, source)).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  const problems = [];
  // The midpoint of each scene, where everything has arrived.
  for (const t of [3.0, 10.0, 18.0, 25.0, 31.0, 36.5]) {
    await page.evaluate((s) => window.seek(Number(s)), t);
    const found = await page.evaluate((at) => {
      const out = [];
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const node of document.querySelectorAll('.scene')) {
        if (getComputedStyle(node).visibility === 'hidden') continue;
        for (const child of node.querySelectorAll('*')) {
          const r = child.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < -1 || r.right > w + 1) {
            out.push(`${at}s  ${child.className || child.tagName} width ${Math.round(r.width)} at ${Math.round(r.left)}..${Math.round(r.right)} (frame ${w})`);
          }
          if (r.top < -1 || r.bottom > h + 1) {
            out.push(`${at}s  ${child.className || child.tagName} VERTICAL ${Math.round(r.top)}..${Math.round(r.bottom)} (frame ${h})`);
          }
        }
      }
      return out;
    }, t);
    problems.push(...found);
  }

  console.log(`${frame.name} ${frame.width}x${frame.height}: ${problems.length ? problems.length + ' overflow(s)' : 'everything fits'}`);
  for (const p of [...new Set(problems)].slice(0, 8)) console.log('    ' + p);
  await page.close();
}

await browser.close();
