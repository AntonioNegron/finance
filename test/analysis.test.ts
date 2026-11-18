// The screens' calculations, on the fake budget built in memory (no server).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot, Txn } from '../app/src/actual.ts';
import { categoryRows, findBills, findUnusual, home, type Settings } from '../app/src/analysis.ts';
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
const none: Settings = { excluded: new Set(), fine: new Set() };

test('the seed is the same every run', () => {
  assert.deepEqual(buildFakeBudget(TODAY), buildFakeBudget(TODAY));
});

test('unusual: exactly the planted duplicate, large charge and new merchant', () => {
  const u = findUnusual(snapshot(), none);
  assert.deepEqual(u.map((x) => x.kind).sort(), ['duplicate', 'large', 'new']);
  assert.equal(u.find((x) => x.kind === 'new')!.txns[0]!.payee, 'Summit Electronics');
  assert.equal(u.find((x) => x.kind === 'large')!.txns[0]!.amount, -612_40);
  assert.equal(u.find((x) => x.kind === 'duplicate')!.txns.length, 2);
  const marked = findUnusual(snapshot(), { excluded: new Set(), fine: new Set([u[0]!.key]) });
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
  const without = home(snap, { excluded: new Set(['other']), fine: new Set() }, mb('2026-11'));
  assert.equal(all.total - without.total, snap.accounts.find((a) => a.id === 'other')!.balance);
  assert.ok(without.spent < all.spent, "Riley's groceries leave the spending total");
});
