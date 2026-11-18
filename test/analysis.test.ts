// The screens' calculations, on the fake budget built in memory (no server).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot, Txn } from '../app/src/actual.ts';
import { categoryRows, emptySettings, findBills, findUnusual, groupChoices, home, spendingView, type Settings } from '../app/src/analysis.ts';
import { page } from '../app/src/views.ts';
import { buildFakeBudget } from '../dev/fake-data.ts';

const TODAY = '2026-11-17';
const b = buildFakeBudget(TODAY);

function snapshot(): Snapshot {
  const txns: Txn[] = [];
  for (const t of b.transactions) {
    const base = { date: t.date, notes: t.notes ?? null, startingBalance: t.payee === 'Starting Balance' };
    txns.push({ ...base, id: t.importedId, account: t.account, amount: t.amount, payee: t.transferTo ? null : t.payee!, payeeId: null, category: t.transferTo && !b.accounts.find((a) => a.key === t.transferTo)!.offbudget ? null : t.category ?? null, transfer: !!t.transferTo });
    if (t.transferTo) txns.push({ ...base, id: `${t.importedId}-other`, account: t.transferTo, amount: -t.amount, payee: null, payeeId: null, category: null, transfer: true });
  }
  const balance = (k: string) => txns.filter((t) => t.account === k).reduce((s, t) => s + t.amount, 0);
  return {
    syncedAt: new Date(),
    today: TODAY,
    accounts: b.accounts.map((a) => ({ id: a.key, name: a.name, offbudget: a.offbudget, closed: false, balance: balance(a.key) })),
    categories: [
      ...b.groups.flatMap((g) => g.categories.map((c) => ({ id: c, name: c, groupId: g.name, groupName: g.name, isIncome: false, hidden: false }))),
      ...b.incomeCategories.map((c) => ({ id: c, name: c, groupId: 'Income', groupName: 'Income', isIncome: true, hidden: false })),
    ],
    transactions: txns,
    windowStart: `${b.months[0]}-01`,
    schedules: [],
    budgetMonths: b.months,
    budgets: new Map(),
  };
}
const mb = (month: string) => ({ month, budgeted: b.budgets[month]! });
const none: Settings = emptySettings();
const MONTH = TODAY.slice(0, 7);

test('the seed is the same every run', () => {
  assert.deepEqual(buildFakeBudget(TODAY), buildFakeBudget(TODAY));
});

test('unusual: exactly the planted duplicate, large charge and new merchant', () => {
  const u = findUnusual(snapshot(), none);
  assert.deepEqual(u.map((x) => x.kind).sort(), ['duplicate', 'large', 'new']);
  assert.equal(u.find((x) => x.kind === 'new')!.txns[0]!.payee, 'Summit Electronics');
  assert.equal(u.find((x) => x.kind === 'large')!.txns[0]!.amount, -612_40);
  assert.equal(u.find((x) => x.kind === 'duplicate')!.txns.length, 2);
  const marked = findUnusual(snapshot(), { ...emptySettings(), fine: new Set([u[0]!.key]) });
  assert.equal(marked.filter((x) => x.fine).length, 1);
});

test('bills: subscriptions found, StreamFlix price increase flagged, groceries not a bill', () => {
  const bills = findBills(snapshot(), none);
  const names = bills.map((x) => x.payee);
  for (const n of ['Lakeside Apartments', 'FiberNet', 'StreamFlix', 'TuneBox', 'CloudVault', 'IronWorks Gym', 'Pinecone Mobile']) assert.ok(names.includes(n), n);
  for (const n of ['FreshMart', 'QuickFuel', 'Noodle Bar', 'Northwind Payroll']) assert.ok(!names.includes(n), n);
  const sf = bills.find((x) => x.payee === 'StreamFlix')!;
  assert.deepEqual(sf.increase, { from: 15_49, to: 17_99 });
  assert.equal(sf.nextDate, '2026-12-07');
  assert.ok(bills.every((x) => x.nextDate >= TODAY));
});

test('categories: over budget first; leaving an account out changes totals', () => {
  const snap = snapshot();
  const rows = categoryRows(snap, none, '2026-11', mb('2026-11'));
  assert.ok(rows[0]!.left < 0);
  const firstUnder = rows.findIndex((r) => r.left >= 0);
  assert.ok(rows.slice(firstUnder).every((r) => r.left >= 0));
  const all = home(snap, none, mb('2026-11'));
  const without = home(snap, { ...emptySettings(), excluded: new Set(['other']) }, mb('2026-11'));
  assert.equal(all.total - without.total, snap.accounts.find((a) => a.id === 'other')!.balance);
  assert.ok(without.spent < all.spent, "Riley's groceries leave the spending total");
});

test('saving: savings-goal groups get their own section and stay out of the spending bar', () => {
  const snap = snapshot();
  const rows = categoryRows(snap, none, MONTH, mb(MONTH));
  const saving = rows.filter((r) => r.saving).map((r) => r.category.name).sort();
  assert.deepEqual(saving, ['Emergency Fund', 'Investing', 'Vacation']);
  const h = home(snap, none, mb(MONTH));
  const spend = rows.filter((r) => !r.saving);
  assert.equal(h.budgeted, spend.reduce((n, r) => n + r.budgeted, 0));
  assert.equal(h.spent, spend.reduce((n, r) => n + r.spent, 0));
  // Only the $100 to the brokerage is categorized (Investing); $450 is budgeted to saving.
  assert.equal(h.saved, 100_00);
  assert.equal(h.savingBudgeted, 450_00);
  // Antonio's choice beats the name guess, both ways.
  const ids = new Map(groupChoices(snap, none).map((g) => [g.name, g.id]));
  const flipped: Settings = { ...emptySettings(), groupKinds: new Map([[ids.get('Savings Goals')!, 'spending'], [ids.get('Food')!, 'saving']]) };
  const flippedSaving = categoryRows(snap, flipped, MONTH, mb(MONTH)).filter((r) => r.saving).map((r) => r.category.name).sort();
  assert.deepEqual(flippedSaving, ['Dining Out', 'Groceries']);
  assert.deepEqual(groupChoices(snap, flipped).filter((g) => g.chosen).map((g) => g.name).sort(), ['Food', 'Savings Goals']);
});

test('spending: over-budget and in-progress shown, on track and not started folded', () => {
  for (const month of ['2026-09', '2026-10', MONTH]) {
    const rows = categoryRows(snapshot(), none, month, mb(month));
    const v = spendingView(rows);
    assert.equal(v.attention.length + v.onTrack.length + v.saving.length, rows.length, month);
    for (const r of rows.filter((r) => r.left < 0 && !r.saving)) assert.ok(v.attention.includes(r), `${month} ${r.category.name} over budget stays visible`);
    for (const r of v.onTrack) assert.ok(r.left >= 0 && (r.spent <= 0 || r.left === 0), `${month} ${r.category.name}`);
    for (const r of v.attention) assert.ok(r.left < 0 || (r.spent > 0 && r.left > 0), `${month} ${r.category.name}`);
  }
  const v = spendingView(categoryRows(snapshot(), none, MONTH, mb(MONTH)));
  assert.ok(v.onTrack.some((r) => r.category.name === 'Rent'), 'rent paid exactly folds');
  assert.ok(v.attention.some((r) => r.category.name === 'Groceries'), 'groceries over budget visible');
});

test('bills: "Not a bill" hides a bill everywhere, and undo brings it back', () => {
  const snap = snapshot();
  const all = findBills(snap, none);
  const cinema = all.find((b) => b.payee === 'Cinema 8');
  assert.ok(cinema, 'the monthly cinema trip is the false alarm');
  const s: Settings = { ...emptySettings(), notBills: new Set([cinema.key]) };
  const marked = findBills(snap, s);
  assert.equal(marked.filter((b) => b.hidden).map((b) => b.payee).join(), 'Cinema 8');
  const next = home(snap, s, mb(MONTH)).nextBills;
  assert.ok(next.every((b) => !b.hidden));
  assert.ok(findBills(snap, none).every((b) => !b.hidden), 'undo');
});

test('version banner: only when the server differs from the app', () => {
  const sync = { snap: null, error: null, back: '/' };
  const differs = page('Home', 'home', { ...sync, version: { server: '26.4.0', app: '26.11.0' } }, '');
  assert.match(differs, /class="banner"[^>]*>Actual server is v26\.4\.0, but this app is built for v26\.11\.0/);
  assert.doesNotMatch(page('Home', 'home', { ...sync, version: null }, ''), /class="banner"/);
});
