// The fake budget, as plain data. Everything here is invented.
// buildFakeBudget() is a pure function of the anchor date: the same date
// always gives the same budget (seeded random numbers, no Date.now()).
// dev/seed.ts writes it into the fake Actual server; the guardrail tests
// use it to know every fake name, amount and note that must never be logged.

export type FakeAccount = {
  key: string;
  name: string;
  offbudget: boolean;
  opening: number; // cents
};

export type FakeTxn = {
  account: string; // account key
  date: string; // YYYY-MM-DD
  amount: number; // cents, negative = money out
  payee?: string; // payee name
  transferTo?: string; // account key (for transfers)
  category?: string; // category name
  notes?: string;
  importedId: string;
};

export type FakeSchedule = {
  name: string;
  account: string;
  payee: string;
  amount: number;
  start: string;
};

export type FakeBudget = {
  anchor: string; // "today" for this budget
  months: string[]; // YYYY-MM, oldest first, 12 months ending at anchor
  accounts: FakeAccount[];
  groups: { name: string; categories: string[] }[];
  incomeCategories: string[];
  budgets: Record<string, Record<string, number>>; // month -> category -> cents
  transactions: FakeTxn[];
  schedules: FakeSchedule[];
  unusual: { duplicate: FakeTxn[]; largeAtUsual: FakeTxn; newPayee: FakeTxn };
};

export const ACCOUNTS: FakeAccount[] = [
  { key: 'checking', name: 'Maple Checking', offbudget: false, opening: 3_200_00 },
  { key: 'savings', name: 'Maple Savings', offbudget: false, opening: 12_000_00 },
  { key: 'visa', name: 'Comet Visa', offbudget: false, opening: -450_00 },
  { key: 'store', name: 'Orbit Store Card', offbudget: false, opening: -120_00 },
  { key: 'loan', name: 'Juniper Auto Loan', offbudget: true, opening: -14_000_00 },
  { key: 'brokerage', name: 'Juniper Brokerage', offbudget: true, opening: 8_500_00 },
  { key: 'other', name: "Riley's Checking", offbudget: false, opening: 1_800_00 },
];

export const GROUPS = [
  { name: 'Housing', categories: ['Rent', 'Renters Insurance'] },
  { name: 'Utilities', categories: ['Electric', 'Water', 'Internet', 'Phone'] },
  { name: 'Food', categories: ['Groceries', 'Dining Out'] },
  { name: 'Transport', categories: ['Gas', 'Car Insurance', 'Car Payment'] },
  { name: 'Subscriptions', categories: ['Streaming', 'Music', 'Cloud Storage', 'Gym'] },
  { name: 'Fun', categories: ['Hobbies', 'Entertainment'] },
  { name: 'Savings Goals', categories: ['Emergency Fund', 'Vacation', 'Investing'] },
];

export const INCOME_CATEGORIES = ['Salary', 'Starting Balances'];

// Monthly budget per category, in cents. Dining Out and Gas are set tight on
// purpose so some months go over; others leave room.
const BUDGET: Record<string, number> = {
  Rent: 1_650_00,
  'Renters Insurance': 18_00,
  Electric: 120_00,
  Water: 45_00,
  Internet: 70_00,
  Phone: 55_00,
  Groceries: 520_00,
  'Dining Out': 140_00,
  Gas: 130_00,
  'Car Insurance': 128_00,
  'Car Payment': 320_00,
  Streaming: 16_00,
  Music: 11_00,
  'Cloud Storage': 3_00,
  Gym: 39_00,
  Hobbies: 60_00,
  Entertainment: 40_00,
  'Emergency Fund': 200_00,
  Vacation: 150_00,
  Investing: 100_00,
};

// Notes on a few transactions, so the log test can check notes too.
export const NOTES = ['Split with roommate', 'Annual checkup copay', 'Birthday dinner for Sam'];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** anchor: YYYY-MM-DD, the budget's "today". */
export function buildFakeBudget(anchor: string): FakeBudget {
  const [ay, am, ad] = anchor.split('-').map(Number) as [number, number, number];
  const rand = mulberry32(20261117);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

  const months: { y: number; m: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ay, am - 1 - i, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  const first = months[0]!;
  const openDate = ymd(first.y, first.m, 1);
  const inRange = (date: string) => date >= openDate && date <= anchor;

  const txns: FakeTxn[] = [];
  let seq = 0;
  const add = (t: Omit<FakeTxn, 'importedId'>) => {
    if (!inRange(t.date)) return;
    txns.push({ ...t, importedId: `fake-${++seq}` });
  };

  for (const a of ACCOUNTS) {
    add({
      account: a.key,
      date: openDate,
      amount: a.opening,
      payee: 'Starting Balance',
      category: a.offbudget ? undefined : 'Starting Balances',
    });
  }

  // Paychecks every two weeks (Fridays), starting from the first Friday.
  const start = new Date(Date.UTC(first.y, first.m - 1, 1));
  while (start.getUTCDay() !== 5) start.setUTCDate(start.getUTCDate() + 1);
  for (const d = new Date(start); ; d.setUTCDate(d.getUTCDate() + 14)) {
    const date = d.toISOString().slice(0, 10);
    if (date > anchor) break;
    add({ account: 'checking', date, amount: 2_150_00, payee: 'Northwind Payroll', category: 'Salary' });
    add({ account: 'other', date, amount: 1_400_00, payee: 'Contoso Payroll', category: 'Salary' });
  }

  const cardSpend: Record<string, number> = {};
  for (const [idx, { y, m }] of months.entries()) {
    const dim = daysIn(y, m);
    const on = (d: number) => ymd(y, m, Math.min(d, dim));
    const monthsAgo = 11 - idx;
    const card = (account: 'visa' | 'store', t: Omit<FakeTxn, 'importedId' | 'account'>) => {
      add({ account, ...t });
      if (inRange(t.date)) cardSpend[`${account}:${y}-${m}`] = (cardSpend[`${account}:${y}-${m}`] ?? 0) + t.amount;
    };

    add({ account: 'checking', date: on(1), amount: -1_650_00, payee: 'Lakeside Apartments', category: 'Rent' });
    add({ account: 'checking', date: on(2), amount: -300_00, transferTo: 'savings' });
    add({ account: 'checking', date: on(3), amount: -39_00, payee: 'IronWorks Gym', category: 'Gym' });
    add({ account: 'checking', date: on(5), amount: -70_00, payee: 'FiberNet', category: 'Internet' });
    add({ account: 'checking', date: on(10), amount: -18_00, payee: 'Hearth Renters Insurance', category: 'Renters Insurance' });
    add({ account: 'checking', date: on(12), amount: -between(85_00, 140_00), payee: 'Bright Power Co', category: 'Electric' });
    add({ account: 'checking', date: on(15), amount: -320_00, transferTo: 'loan', category: 'Car Payment' });
    add({ account: 'checking', date: on(16), amount: -100_00, transferTo: 'brokerage', category: 'Investing' });
    add({ account: 'checking', date: on(18), amount: -between(38_00, 47_00), payee: 'City Water Dept', category: 'Water' });
    add({ account: 'checking', date: on(25), amount: -128_00, payee: 'Shield Auto Insurance', category: 'Car Insurance' });

    // Subscriptions on fixed days; StreamFlix goes up three months ago.
    card('store', { date: on(7), amount: monthsAgo > 3 ? -15_49 : -17_99, payee: 'StreamFlix', category: 'Streaming' });
    card('store', { date: on(14), amount: -10_99, payee: 'TuneBox', category: 'Music' });
    card('store', { date: on(20), amount: -2_99, payee: 'CloudVault', category: 'Cloud Storage' });
    card('visa', { date: on(22), amount: -55_00, payee: 'Pinecone Mobile', category: 'Phone' });

    // Groceries about weekly, alternating stores.
    for (let d = 3; d <= dim; d += 7) {
      card('visa', {
        date: on(d),
        amount: -between(85_00, 145_00),
        payee: d % 2 ? 'FreshMart' : 'Green Grocer',
        category: 'Groceries',
      });
    }
    for (let d = 4; d <= dim; d += 9) card('visa', { date: on(d), amount: -between(35_00, 55_00), payee: 'QuickFuel', category: 'Gas' });
    const diners = ['Taco Haven', 'Noodle Bar', 'Corner Cafe'];
    for (let i = 0; i < 6; i++) {
      card('visa', {
        date: on(2 + i * 5),
        amount: -between(15_00, 48_00),
        payee: diners[i % 3]!,
        category: 'Dining Out',
        notes: i === 2 && monthsAgo === 4 ? NOTES[2] : undefined,
      });
    }
    card('visa', { date: on(19), amount: -between(20_00, 80_00), payee: 'Craft Corner', category: 'Hobbies' });
    card('visa', { date: on(26), amount: -between(24_00, 36_00), payee: 'Cinema 8', category: 'Entertainment' });
    if (monthsAgo === 6) add({ account: 'checking', date: on(9), amount: -60_00, payee: 'Valley Clinic', category: 'Groceries', notes: NOTES[1] });

    // Riley's account: some activity of their own.
    add({ account: 'other', date: on(6), amount: -between(60_00, 110_00), payee: 'FreshMart', category: 'Groceries', notes: monthsAgo === 2 ? NOTES[0] : undefined });

    // Pay last month's card spending on the 27th.
    const prev = new Date(Date.UTC(y, m - 2, 1));
    const pkey = `${prev.getUTCFullYear()}-${prev.getUTCMonth() + 1}`;
    for (const acct of ['visa', 'store'] as const) {
      const owed = -(cardSpend[`${acct}:${pkey}`] ?? (acct === 'visa' ? -450_00 : -120_00));
      if (owed > 0) add({ account: 'checking', date: on(27), amount: -owed, transferTo: acct });
    }
  }

  // Unusual charges, all in the anchor month and on or before the anchor day.
  const day = (d: number) => ymd(ay, am, Math.max(1, Math.min(d, ad)));
  const duplicate: FakeTxn[] = [];
  for (let i = 0; i < 2; i++) {
    add({ account: 'visa', date: day(ad - 1), amount: -42_18, payee: 'Noodle Bar', category: 'Dining Out' });
    duplicate.push(txns.at(-1)!);
  }
  add({ account: 'visa', date: day(ad - 2), amount: -612_40, payee: 'FreshMart', category: 'Groceries' });
  const largeAtUsual = txns.at(-1)!;
  add({ account: 'visa', date: day(ad), amount: -899_99, payee: 'Summit Electronics', category: 'Hobbies' });
  const newPayee = txns.at(-1)!;

  const budgets: FakeBudget['budgets'] = {};
  for (const { y, m } of months) {
    const key = `${y}-${pad(m)}`;
    budgets[key] = { ...BUDGET };
  }

  const schedStart = ymd(first.y, first.m, 1);
  const schedules: FakeSchedule[] = [
    { name: 'Rent', account: 'checking', payee: 'Lakeside Apartments', amount: -1_650_00, start: ymd(first.y, first.m, 1) },
    { name: 'Internet', account: 'checking', payee: 'FiberNet', amount: -70_00, start: ymd(first.y, first.m, 5) },
    { name: 'Car insurance', account: 'checking', payee: 'Shield Auto Insurance', amount: -128_00, start: ymd(first.y, first.m, 25) },
  ].filter((s) => s.start >= schedStart);

  return {
    anchor,
    months: months.map(({ y, m }) => `${y}-${pad(m)}`),
    accounts: ACCOUNTS,
    groups: GROUPS,
    incomeCategories: INCOME_CATEGORIES,
    budgets,
    transactions: txns,
    schedules,
    unusual: { duplicate, largeAtUsual, newPayee },
  };
}

/** Every string that must never show up in a log. */
export function sensitiveStrings(b: FakeBudget): string[] {
  const s = new Set<string>();
  for (const a of b.accounts) s.add(a.name);
  for (const g of b.groups) {
    s.add(g.name);
    for (const c of g.categories) s.add(c);
  }
  for (const c of b.incomeCategories) s.add(c);
  for (const t of b.transactions) {
    if (t.payee) s.add(t.payee);
    if (t.notes) s.add(t.notes);
  }
  for (const sc of b.schedules) s.add(sc.name);
  return [...s];
}

/** Every amount, formatted the ways the app or a log could print it. */
export function sensitiveAmounts(b: FakeBudget): string[] {
  const s = new Set<string>();
  const add = (cents: number) => {
    const abs = Math.abs(cents);
    if (abs < 10_00) return; // tiny amounts collide with ordinary numbers
    const dollars = (abs / 100).toFixed(2);
    s.add(dollars);
    s.add(Number(dollars).toLocaleString('en-US', { minimumFractionDigits: 2 }));
  };
  for (const t of b.transactions) add(t.amount);
  for (const a of b.accounts) add(a.opening);
  for (const m of Object.values(b.budgets)) for (const v of Object.values(m)) add(v);
  return [...s];
}
