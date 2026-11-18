// Builds the fake budget (dev/fake-data.ts) on the fake Actual server with the
// API's import functions. The seed may write; the app may not.
// Run on its own: tsx dev/seed.ts (the fake server must be running).
import * as api from '@actual-app/api';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFakeBudget, type FakeBudget } from './fake-data.ts';
import { DEV_DATA, SYNC_ID_FILE, fakeServerUrl, fakeToday, loadDevEnv } from './env.ts';

export const FAKE_BUDGET_NAME = 'Fake Household';

async function importAll(b: FakeBudget) {
  const acctId: Record<string, string> = {};
  for (const a of b.accounts) acctId[a.key] = await api.createAccount({ name: a.name, offbudget: a.offbudget }, 0);

  const catId: Record<string, string> = {};
  for (const g of b.groups) {
    const gid = await api.createCategoryGroup({ name: g.name });
    for (const c of g.categories) catId[c] = await api.createCategory({ name: c, group_id: gid });
  }
  const groups = await api.getCategoryGroups();
  const income = groups.find((g) => g.is_income);
  if (!income) throw new Error('no income group');
  for (const c of await api.getCategories()) if (c.is_income) catId[c.name] = c.id;
  for (const c of b.incomeCategories) catId[c] ??= await api.createCategory({ name: c, group_id: income.id, is_income: true });

  const transferPayee: Record<string, string> = {};
  for (const p of await api.getPayees()) {
    const key = Object.keys(acctId).find((k) => acctId[k] === p.transfer_acct);
    if (key) transferPayee[key] = p.id;
  }

  for (const a of b.accounts) {
    const txns = b.transactions
      .filter((t) => t.account === a.key)
      .map((t) => ({
        date: t.date,
        amount: t.amount,
        imported_id: t.importedId,
        notes: t.notes,
        category: t.category && !(t.transferTo && b.accounts.find((x) => x.key === t.transferTo)?.offbudget === false) ? catId[t.category] : undefined,
        ...(t.transferTo ? { payee: transferPayee[t.transferTo] } : { payee_name: t.payee }),
      }));
    await api.addTransactions(acctId[a.key]!, txns, { runTransfers: true });
  }

  for (const [month, cats] of Object.entries(b.budgets)) {
    for (const [cat, amount] of Object.entries(cats)) await api.setBudgetAmount(month, catId[cat]!, amount);
  }

  const payeeId: Record<string, string> = {};
  for (const p of await api.getPayees()) payeeId[p.name] = p.id;
  for (const s of b.schedules) {
    await api.createSchedule({
      name: s.name,
      posts_transaction: false,
      payee: payeeId[s.payee],
      account: acctId[s.account],
      amount: s.amount,
      amountOp: 'is',
      date: { frequency: 'monthly', interval: 1, start: s.start, endMode: 'never' },
    });
  }
}

export async function seed(): Promise<string> {
  const env = loadDevEnv();
  const budget = buildFakeBudget(fakeToday());
  const cache = join(DEV_DATA, 'seed-cache');
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(cache, { recursive: true });
  await api.init({ dataDir: cache, serverURL: fakeServerUrl(env), password: env.FAKE_ACTUAL_PASSWORD });
  try {
    await api.runImport(FAKE_BUDGET_NAME, () => importAll(budget));
    const files = await api.getBudgets();
    const ids = new Set(files.filter((f) => f.name === FAKE_BUDGET_NAME && f.groupId).map((f) => f.groupId!));
    if (ids.size !== 1) throw new Error(`expected one uploaded fake budget, found ${ids.size}`);
    const syncId = [...ids][0]!;
    writeFileSync(SYNC_ID_FILE, syncId + '\n');
    console.log(`seeded fake budget: ${budget.transactions.length} transactions, ${budget.accounts.length} accounts, anchor ${budget.anchor}`);
    return syncId;
  } finally {
    await api.shutdown();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
