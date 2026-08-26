/** Grabs single frames at given timestamps, for checking a scene before a full render. */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe']
  .filter(Boolean).find((p) => existsSync(p));

const args = process.argv.slice(2);
// Optional --size WxH, so a scene can be checked in the shape it will ship in.
const sizeAt = args.indexOf('--size');
const [W, H] = sizeAt >= 0 ? args[sizeAt + 1].split('x').map(Number) : [1920, 1080];
if (sizeAt >= 0) args.splice(sizeAt, 2);
const [source, ...times] = args;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve(HERE, source)).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);

for (const t of times) {
  await page.evaluate((s) => window.seek(Number(s)), t);
  const out = join(HERE, ["still-", W, "x", H, "-", String(t).replace(".", "_"), ".png"].join(""));
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
