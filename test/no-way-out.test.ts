// No way out: the built app loads nothing from outside, makes no outbound
// calls of its own, and every page carries a strict Content Security Policy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT } from '../dev/env.ts';
import { Client, startApp, type RunningApp } from './helpers.ts';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

// The one URL literal in the app: a dummy base for parsing request paths.
const ALLOWED_URLS = new Set(['http://app']);

test('the built files contain no outside URLs and no outbound network code', () => {
  execFileSync('npm', ['run', '-s', 'build'], { cwd: ROOT, stdio: 'pipe' });
  const problems: string[] = [];
  for (const f of files(join(ROOT, 'dist'))) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    for (const m of src.matchAll(/\b(?:https?|wss?|ftp):\/\/[^\s'"`)<>]*/g)) if (!ALLOWED_URLS.has(m[0])) problems.push(`${rel}: ${m[0]}`);
    for (const m of src.matchAll(/(?:^|[^\w])\/\/[a-z0-9-]+\.[a-z]{2,}/gi)) problems.push(`${rel}: protocol-relative ${m[0].trim()}`);
    if (/\bfetch\s*\(/.test(src) && !rel.endsWith('public/app.js')) problems.push(`${rel}: fetch(`);
    if (/['"]node:(https|net|tls|dns|dgram|http2)['"]/.test(src)) problems.push(`${rel}: outbound network module`);
    if (/@import|url\(/.test(src) && rel.endsWith('.css')) problems.push(`${rel}: CSS loads a resource`);
  }
  // The page's own script may only call this app's /sync.
  const js = readFileSync(join(ROOT, 'dist/app/public/app.js'), 'utf8');
  for (const m of js.matchAll(/fetch\(\s*(['"`])([^'"`]*)\1/g)) if (m[2] !== '/sync') problems.push(`app.js fetches ${m[2]}`);
  assert.deepEqual(problems, []);
});

let app: RunningApp;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app?.stop();
});

test('every page has a strict CSP and only same-origin resources', async () => {
  const c = new Client(app.base);
  const login = await c.get('/login');
  for (const res of [login]) assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  await c.login();
  for (const p of ['/', '/categories', '/bills', '/unusual', '/accounts']) {
    const res = await c.get(p);
    const csp = res.headers.get('content-security-policy') ?? '';
    for (const d of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "form-action 'self'", "frame-ancestors 'none'"]) {
      assert.ok(csp.includes(d), `${p} CSP has ${d}`);
    }
    assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), `${p} CSP has no wildcards or unsafe-*`);
    const html = await res.text();
    for (const m of html.matchAll(/\b(?:src|href|action)="([^"]*)"/g)) {
      assert.ok(m[1]!.startsWith('/') && !m[1]!.startsWith('//'), `${p} links only same-origin: ${m[1]}`);
    }
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), `${p} has no inline script`);
    assert.ok(!/\sstyle=|<style/.test(html), `${p} has no inline style`);
  }
});
