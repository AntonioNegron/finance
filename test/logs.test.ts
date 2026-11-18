// No data in logs: run the app against the fake budget, open every screen and
// action, and fail if any fake amount, name, note, date or secret is logged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { buildFakeBudget, sensitiveAmounts, sensitiveStrings } from '../dev/fake-data.ts';
import { SYNC_ID_FILE, fakeToday, loadDevEnv } from '../dev/env.ts';
import { Client, startApp, type RunningApp } from './helpers.ts';

let app: RunningApp;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app?.stop();
});

const LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z ([a-z.]+)((?: [a-z0-9_.-]+=[\w.-]+)*)$/;

test('every screen and action, then nothing sensitive in the logs', async () => {
  const c = new Client(app.base);
  assert.equal((await c.login('wrong password')).status, 401);
  assert.equal((await c.login()).status, 303);

  const pages = ['/', '/categories', '/bills', '/unusual', '/accounts', '/static/app.css', '/static/app.js', '/nope'];
  for (const p of pages) assert.ok((await c.get(p)).status < 500, p);

  // Every category in this month and two earlier months, plus the month switcher.
  const catPage = await (await c.get('/categories')).text();
  const catLinks = [...catPage.matchAll(/href="(\/categories\/[^"?]+)\?month=([\d-]+)"/g)].map((m) => m[1]!);
  assert.ok(catLinks.length > 5, 'category links found');
  const month = fakeToday().slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const months = [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  for (const mo of months) {
    assert.equal((await c.get(`/categories?month=${mo}`)).status, 200);
    for (const l of catLinks) assert.equal((await c.get(`${l}?month=${mo}`)).status, 200);
  }

  // Toggle every account off and on; mark every unusual charge fine and back.
  const acctPage = await (await c.get('/accounts')).text();
  const ids = [...acctPage.matchAll(/name="id" value="([^"]+)"/g)].map((x) => x[1]!);
  assert.equal(ids.length, 7);
  for (const id of ids) {
    assert.equal((await c.post('/accounts/count', { id, count: '0' })).status, 303);
    await c.get('/');
    assert.equal((await c.post('/accounts/count', { id, count: '1' })).status, 303);
  }
  const unPage = await (await c.get('/unusual')).text();
  const keys = [...unPage.matchAll(/name="key" value="([^"]+)"/g)].map((x) => x[1]!);
  assert.ok(keys.length >= 3);
  for (const key of keys) {
    assert.equal((await c.post('/unusual/fine', { key, fine: '1' })).status, 303);
    assert.equal((await c.post('/unusual/fine', { key, fine: '0' })).status, 303);
  }
  // Every bill marked "Not a bill" and back; every group switched both ways and back.
  const billPage = await (await c.get('/bills')).text();
  const billKeys = [...billPage.matchAll(/action="\/bills\/hide"><input type="hidden" name="key" value="([^"]+)"/g)].map((x) => x[1]!.replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  assert.ok(billKeys.length >= 5);
  for (const key of billKeys) {
    assert.equal((await c.post('/bills/hide', { key, hide: '1' })).status, 303);
    await c.get('/bills');
    await c.get('/');
    assert.equal((await c.post('/bills/hide', { key, hide: '0' })).status, 303);
  }
  const groupPage = await (await c.get('/groups')).text();
  const groups = [...groupPage.matchAll(/name="id" value="([^"]+)"><input type="hidden" name="kind" value="(\w+)"/g)].map((x) => [x[1]!, x[2]!] as const);
  assert.equal(groups.length, 7);
  for (const [id, kind] of groups) {
    assert.equal((await c.post('/groups/kind', { id, kind })).status, 303);
    await c.get('/categories');
    assert.equal((await c.post('/groups/kind', { id, kind: kind === 'saving' ? 'spending' : 'saving' })).status, 303);
  }
  assert.equal((await c.post('/sync', { back: '/bills' })).status, 303);
  await c.req('/sync', { method: 'POST', headers: { accept: 'application/json', origin: app.base } });
  await c.post('/unusual/fine', { key: 'bad key' });
  assert.equal((await c.post('/logout')).status, 303);
  await app.stop();

  const output = app.output();
  const lines = output.split('\n').filter(Boolean);
  assert.ok(lines.some((l) => l.includes('login.failed')));
  assert.ok(lines.some((l) => l.includes('sync.ok')));
  assert.ok(lines.some((l) => l.includes('server_version_match=1')), 'the fake server version matches the API');

  // 1. Every line is an event with numbers only (the logger's grammar).
  const bad = lines.filter((l) => !LINE.test(l));
  assert.deepEqual(bad.map((l) => l.slice(0, 120)), [], 'log lines outside the event grammar');

  // 2. None of the fake budget's names, notes, amounts, dates or the secrets.
  const budget = buildFakeBudget(fakeToday());
  const env = loadDevEnv();
  const body = lines.map((l) => l.slice(25)).join('\n'); // drop each line's timestamp
  const lower = body.toLowerCase();
  const found: string[] = [];
  const squashed = lower.replace(/[\s_'-]/g, '');
  for (const s of sensitiveStrings(budget)) {
    const n = s.toLowerCase();
    const sq = n.replace(/[\s_'-]/g, '');
    if (lower.includes(n) || (sq.length >= 5 && squashed.includes(sq))) found.push(`name:${s}`);
  }
  for (const a of sensitiveAmounts(budget)) if (body.includes(a)) found.push(`amount:${a}`);
  for (const d of new Set(budget.transactions.map((t) => t.date))) if (body.includes(d)) found.push(`date:${d}`);
  for (const sec of [env.FAKE_ACTUAL_PASSWORD, env.DEV_APP_PASSWORD, readFileSync(SYNC_ID_FILE, 'utf8').trim()]) {
    if (body.includes(sec)) found.push('a secret');
  }
  assert.deepEqual(found, []);
});
