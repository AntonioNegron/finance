// The screen changes from the first review, on the fake budget through the
// running app: the Saving section, folded on-track categories, "Not a bill"
// with undo, the saving-group switch, and no version banner when they match.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client, startApp, type RunningApp } from './helpers.ts';

let app: RunningApp;
let c: Client;
before(async () => {
  app = await startApp();
  c = new Client(app.base);
  assert.equal((await c.login()).status, 303);
});
after(async () => {
  await app?.stop();
});

const text = async (path: string) => {
  const res = await c.get(path);
  assert.equal(res.status, 200, path);
  return res.text();
};

test('Home: spending bar without saving, plus one "Saved this month" line', async () => {
  const h = await text('/');
  assert.match(h, /Saved this month<\/span><span>\$100\.00 of \$450\.00</);
  assert.doesNotMatch(h, /class="banner"/, 'no version banner: the fake server is the API version');
});

test('Spending: Saving section after spending; on-track categories folded under one row', async () => {
  const p = await text('/categories');
  const fold = p.indexOf('<details>');
  const saving = p.indexOf('>Saving</p>');
  assert.ok(fold > 0 && saving > fold, 'fold row, then the Saving section');
  assert.match(p, /<summary><span>\d+ on track<\/span>/);
  const section = p.slice(saving);
  for (const n of ['Emergency Fund', 'Vacation', 'Investing']) {
    assert.ok(section.includes(`>${n}<small>`), `${n} under Saving`);
    assert.ok(!p.slice(0, saving).includes(`>${n}<small>`), `${n} not under spending`);
  }
  const visible = p.slice(0, fold);
  assert.ok(visible.includes('>Groceries<small>'), 'over budget stays visible');
  assert.ok(p.slice(fold, saving).includes('>Rent<small>'), 'rent, paid exactly, folds');
});

test('Saving groups: switching a group moves it between the sections', async () => {
  const g = await text('/groups');
  const m = /name="id" value="([^"]+)"><input type="hidden" name="kind" value="spending">[\s\S]*?aria-checked="true"/.exec(g);
  assert.ok(m, 'Savings Goals is guessed as saving');
  assert.equal((await c.post('/groups/kind', { id: m[1]!, kind: 'spending' })).status, 303);
  assert.doesNotMatch(await text('/categories'), />Saving<\/p>/);
  assert.match(await text('/groups'), /your choice/);
  assert.equal((await c.post('/groups/kind', { id: m[1]!, kind: 'saving' })).status, 303);
  assert.match(await text('/categories'), />Saving<\/p>/);
  assert.equal((await c.post('/groups/kind', { id: 'not-a-group', kind: 'saving' })).status, 400);
});

test('Bills: "Not a bill" moves a bill to Hidden, out of the total and Home; Undo brings it back', async () => {
  const before = await text('/bills');
  const total = (p: string) => /<p class="big">([^<]+)<\/p>/.exec(p)![1];
  const m = /value="(p:Cinema 8)"><input type="hidden" name="hide" value="1">/.exec(before);
  assert.ok(m, 'Cinema 8 shows as a bill with a Not a bill button');
  assert.equal((await c.post('/bills/hide', { key: m[1]!, hide: '1' })).status, 303);
  const after = await text('/bills');
  const hiddenAt = after.indexOf('Hidden (not bills)');
  assert.ok(hiddenAt > 0 && after.indexOf('Cinema 8') > hiddenAt, 'listed under Hidden');
  assert.notEqual(total(after), total(before), 'left out of the monthly total');
  assert.ok(!(await text('/')).includes('Cinema 8'), 'not among the next bills on Home');
  assert.equal((await c.post('/bills/hide', { key: m[1]!, hide: '0' })).status, 303);
  const undone = await text('/bills');
  assert.ok(!undone.includes('Hidden (not bills)'));
  assert.equal(total(undone), total(before));
  assert.equal((await c.post('/bills/hide', { key: 'x:bad', hide: '1' })).status, 400);
});
