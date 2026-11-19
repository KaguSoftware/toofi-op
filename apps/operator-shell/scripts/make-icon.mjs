#!/usr/bin/env node
/**
 * Rasterise assets/icon.svg to assets/icon.png (1024x1024) with Playwright's
 * bundled Chromium. electron-builder derives the platform
 * formats (.ico, .icns) from that one png at package time, so the png is the
 * only binary the repo carries.
 *
 *   pnpm --filter @rop/operator-shell icon
 *
 * Playwright is not a dependency of this package: install it where it resolves
 * (e.g. at the repo root) and run `npx playwright install chromium` once.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '..', 'assets');
const SRC = path.join(ASSETS, 'icon.svg');
const OUT = path.join(ASSETS, 'icon.png');
const SIZE = 1024;

const svg = await fs.readFile(SRC, 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const html = `<!doctype html><html><head><style>
  html,body{margin:0;background:transparent}
  body{width:${SIZE}px;height:${SIZE}px;overflow:hidden}
  img{display:block;width:${SIZE}px;height:${SIZE}px}
</style></head><body><img src="${dataUri}"></body></html>`;

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error('Playwright's Chromium is not installed: run `npx playwright install chromium` first.');
  throw error;
}
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: OUT,
    clip: { x: 0, y: 0, width: SIZE, height: SIZE },
    omitBackground: true,
    type: 'png',
  });
  console.log('wrote', path.relative(process.cwd(), OUT));
} finally {
  await browser.close();
}
