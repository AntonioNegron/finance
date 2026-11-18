// npm run screens — screenshots of every screen with the FAKE budget only, at
// phone size (390 px wide), light and dark, into docs/screens/.
// Needs the fake server running (npm run dev:fake).
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Client, startApp } from '../test/helpers.ts';
import { ROOT, loadDevEnv } from './env.ts';

const OUT = join(ROOT, 'docs/screens');
mkdirSync(OUT, { recursive: true });

const app = await startApp();
try {
  // Find the most over-budget category for the detail screen.
  const c = new Client(app.base);
  await c.login();
  const cats = await (await c.get('/categories')).text();
  const firstCat = /href="(\/categories\/[^"]+)"/.exec(cats)?.[1]?.replace(/&amp;/g, '&');
  const screens: [string, string][] = [
    ['1-home', '/'],
    ['2-spending', '/categories'],
    ['2b-category', firstCat ?? '/categories'],
    ['3-bills', '/bills'],
    ['4-unusual', '/unusual'],
    ['5-accounts', '/accounts'],
  ];

  // User-level libraries from scripts/pw-libs.sh, if present.
  const pw = join(homedir(), '.local/share/finance-pw-libs');
  const libs = join(pw, 'root/usr/lib/x86_64-linux-gnu');
  const env = existsSync(libs)
    ? {
        ...process.env,
        LD_LIBRARY_PATH: [libs, join(libs, 'nss'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
        FONTCONFIG_FILE: join(pw, 'fonts.conf'),
      }
    : undefined;
  const browser = await chromium.launch({ env });
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${app.base}/login`);
    await page.screenshot({ path: join(OUT, `0-login-${scheme}.png`) });
    await page.fill('#pw', loadDevEnv().DEV_APP_PASSWORD);
    await Promise.all([page.waitForURL(`${app.base}/`), page.click('button[type=submit]')]);
    for (const [name, path] of screens) {
      // Grow the viewport to the whole page so the fixed tab bar sits at the
      // bottom, as on a phone, instead of mid-page in a full-page capture.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(app.base + path);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 390, height: Math.max(844, height) });
      await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`screenshots in docs/screens/`);
} finally {
  await app.stop();
}
