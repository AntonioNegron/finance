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
  // before: runs before the page loads; onPage: runs on the loaded page.
  type Screen = { name: string; path: string; before?: () => Promise<unknown>; onPage?: (page: import('playwright').Page) => Promise<unknown> };
  const cinema = { key: 'p:Cinema 8' }; // the fake false-alarm bill
  const screens: Screen[] = [
    { name: '1-home', path: '/' },
    { name: '2-spending', path: '/categories' },
    { name: '2c-spending-open', path: '/categories', onPage: (p) => p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true))) },
    { name: '2b-category', path: firstCat ?? '/categories' },
    { name: '2d-saving-groups', path: '/groups' },
    { name: '3-bills', path: '/bills' },
    // Hide Cinema 8 to show the Hidden list, then undo it for the next shots.
    { name: '3b-bills-hidden', path: '/bills', before: () => c.post('/bills/hide', { ...cinema, hide: '1' }) },
    { name: '4-unusual', path: '/unusual', before: () => c.post('/bills/hide', { ...cinema, hide: '0' }) },
    { name: '5-accounts', path: '/accounts' },
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
    for (const { name, path, before, onPage } of screens) {
      // Grow the viewport to the whole page so the fixed tab bar sits at the
      // bottom, as on a phone, instead of mid-page in a full-page capture.
      await page.setViewportSize({ width: 390, height: 844 });
      await before?.();
      await page.goto(app.base + path);
      await onPage?.(page);
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
