// Login everywhere: every route but /healthz refuses without a session;
// /healthz says only "ok" or "error"; repeated wrong passwords lock out.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MAX_FAILS } from '../app/src/auth.ts';
import { Client, startApp, type RunningApp } from './helpers.ts';

let app: RunningApp;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app?.stop();
});

const GETS = ['/', '/categories', '/categories?month=2026-01', '/categories/some-id', '/bills', '/unusual', '/accounts', '/static/app.css', '/static/app.js', '/nope', '/healthz/'];
const POSTS = ['/sync', '/logout', '/accounts/count', '/unusual/fine', '/', '/nope'];

test('/healthz answers only ok or error', async () => {
  const res = await fetch(`${app.base}/healthz`);
  const text = await res.text();
  assert.ok(text === 'ok' || text === 'error', 'body');
  assert.equal(text, 'ok');
  assert.ok(!res.headers.get('set-cookie'));
});

test('every other route refuses without a session', async () => {
  const c = new Client(app.base);
  for (const p of GETS) {
    const res = await c.get(p);
    const body = await res.text();
    assert.ok(res.status === 401 || (res.status === 303 && res.headers.get('location') === '/login'), `GET ${p} -> ${res.status}`);
    assert.ok(!/\$\d/.test(body), `GET ${p} shows no amounts`);
  }
  for (const p of POSTS) {
    const res = await c.post(p, { id: 'x', key: 'new:x', fine: '1', count: '0' });
    assert.equal(res.status, 401, `POST ${p}`);
  }
  // A made-up session cookie does not work either.
  c.cookie = 'fin_session=not-a-real-session';
  assert.equal((await c.get('/')).status, 303);
});

test('a session opens the pages; the cookie is http-only, same-site strict, 30 days', async () => {
  const c = new Client(app.base);
  const res = await c.login();
  assert.equal(res.status, 303);
  const set = res.headers.get('set-cookie') ?? '';
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Max-Age=2592000/);
  for (const p of GETS.filter((p) => !p.includes('some-id')).slice(0, 6)) assert.equal((await c.get(p)).status, 200, p);
  // Cross-site form posts are refused even with the cookie.
  const x = await c.req('/accounts/count', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: 'id=x&count=0' });
  assert.equal(x.status, 403);
  await c.post('/logout');
  assert.equal((await c.get('/')).status, 303, 'logged out');
});

test('repeated wrong passwords lock the login', async () => {
  const c = new Client(app.base);
  for (let i = 1; i < MAX_FAILS; i++) assert.equal((await c.login('wrong')).status, 401);
  assert.equal((await c.login('wrong')).status, 429);
  assert.equal((await c.login()).status, 429, 'even the right password waits out the lockout');
});
