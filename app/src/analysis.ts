// Pure calculations for the screens. No I/O, no logging.
import type { Account, Category, MonthBudget, Snapshot, Txn } from './actual.ts';
import { addDays, addMonths, addOneMonth, dayDiff } from './dates.ts';
import type { GroupKind } from './store.ts';

export type Settings = {
  excluded: Set<string>;
  fine: Set<string>;
  notBills: Set<string>;
  groupKinds: ReadonlyMap<string, GroupKind>;
};

export const emptySettings = (): Settings => ({ excluded: new Set(), fine: new Set(), notBills: new Set(), groupKinds: new Map() });

// ---- Saving vs. spending ----

/** Until Antonio picks, a group counts as saving if its name says so. */
const SAVING_NAME = /sav|goal|invest/i;

export function isSavingGroup(groupId: string, groupName: string, s: Settings) {
  const chosen = s.groupKinds.get(groupId);
  return chosen ? chosen === 'saving' : SAVING_NAME.test(groupName);
}

export type GroupChoice = { id: string; name: string; saving: boolean; chosen: boolean };

/** The expense category groups, with whether each counts as saving. */
export function groupChoices(snap: Snapshot, s: Settings): GroupChoice[] {
  const seen = new Map<string, GroupChoice>();
  for (const c of snap.categories) {
    if (c.isIncome || seen.has(c.groupId)) continue;
    seen.set(c.groupId, { id: c.groupId, name: c.groupName, saving: isSavingGroup(c.groupId, c.groupName, s), chosen: s.groupKinds.has(c.groupId) });
  }
  return [...seen.values()];
}

export const counted = (snap: Snapshot, s: Settings) => snap.accounts.filter((a) => !a.closed && !s.excluded.has(a.id));

/** Money out to an expense category from counted on-budget accounts. */
function spendingTxns(snap: Snapshot, s: Settings): Txn[] {
  const ok = new Set(counted(snap, s).filter((a) => !a.offbudget).map((a) => a.id));
  const expense = new Set(snap.categories.filter((c) => !c.isIncome).map((c) => c.id));
  return snap.transactions.filter((t) => ok.has(t.account) && t.category && expense.has(t.category));
}

export type CategoryRow = { category: Category; budgeted: number; spent: number; left: number; saving: boolean };

export function categoryRows(snap: Snapshot, s: Settings, month: string, mb: MonthBudget | null): CategoryRow[] {
  const spent = new Map<string, number>();
  for (const t of spendingTxns(snap, s)) {
    if (t.date.slice(0, 7) === month) spent.set(t.category!, (spent.get(t.category!) ?? 0) - t.amount);
  }
  const rows = snap.categories
    .filter((c) => !c.isIncome && (!c.hidden || spent.has(c.id)))
    .map((c) => {
      const budgeted = mb?.budgeted[c.id] ?? 0;
      const sp = spent.get(c.id) ?? 0;
      return { category: c, budgeted, spent: sp, left: budgeted - sp, saving: isSavingGroup(c.groupId, c.groupName, s) };
    })
    .filter((r) => r.budgeted !== 0 || r.spent !== 0);
  // Over budget first (most over first), then by how much of the budget is used.
  const used = (r: CategoryRow) => (r.budgeted > 0 ? r.spent / r.budgeted : r.spent > 0 ? Infinity : 0);
  return rows.sort((a, b) => {
    const ao = a.left < 0, bo = b.left < 0;
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) return a.left - b.left;
    return used(b) - used(a) || a.category.name.localeCompare(b.category.name);
  });
}

export type SpendingView = {
  /** Over budget, or spending under way with money left: always shown. */
  attention: CategoryRow[];
  /** Nothing spent yet, or spent exactly the budget: folded under one row. */
  onTrack: CategoryRow[];
  /** Saving categories, in their own section. */
  saving: CategoryRow[];
};

export function spendingView(rows: CategoryRow[]): SpendingView {
  const view: SpendingView = { attention: [], onTrack: [], saving: [] };
  for (const r of rows) {
    if (r.saving) view.saving.push(r);
    else if (r.left >= 0 && (r.spent <= 0 || r.left === 0)) view.onTrack.push(r);
    else view.attention.push(r);
  }
  return view;
}

export function categoryTxns(snap: Snapshot, s: Settings, categoryId: string, month: string): Txn[] {
  return spendingTxns(snap, s)
    .filter((t) => t.category === categoryId && t.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---- Bills & subscriptions ----

export type Bill = {
  key: string;
  payee: string;
  nextDate: string;
  amount: number; // positive cents, latest charge (or schedule amount)
  perMonth: number;
  varies: boolean;
  increase: { from: number; to: number } | null;
  fromSchedule: boolean;
  hidden: boolean; // marked "Not a bill" in the app
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};

/**
 * Recurring charges found from history: a payee charged in at least 3 of the
 * last 6 months, about once a month, on about the same day, with amounts
 * within 30% of their median. Actual schedules are merged in.
 */
export function findBills(snap: Snapshot, s: Settings): Bill[] {
  const ok = new Set(counted(snap, s).map((a) => a.id));
  const since = `${addMonths(snap.today.slice(0, 7), -6)}-01`;
  const byPayee = new Map<string, Txn[]>();
  for (const t of snap.transactions) {
    if (!ok.has(t.account) || t.transfer || t.startingBalance || t.amount >= 0 || !t.payee || t.date < since) continue;
    byPayee.set(t.payee, [...(byPayee.get(t.payee) ?? []), t]);
  }

  const bills: Bill[] = [];
  for (const [payee, list] of byPayee) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    if (months.size < 3 || list.length > months.size * 1.25) continue;
    const amounts = list.map((t) => -t.amount);
    const med = median(amounts);
    if (amounts.some((a) => Math.abs(a - med) > med * 0.3)) continue;
    const days = list.map((t) => Number(t.date.slice(8, 10)));
    const medDay = median(days);
    if (days.some((d) => Math.abs(d - medDay) > 4)) continue;

    const last = list.at(-1)!;
    let next = addOneMonth(last.date);
    while (next < snap.today) next = addOneMonth(next);
    const latest = -last.amount;
    // A price increase: a step up between two runs of steady charges.
    const flat = (xs: number[]) => Math.max(...xs) - Math.min(...xs) <= Math.max(...xs) * 0.02;
    let increase: Bill['increase'] = null;
    for (let i = amounts.length - 1; i > 0; i--) {
      if (amounts[i]! > amounts[i - 1]! * 1.01) {
        if (flat(amounts.slice(0, i)) && flat(amounts.slice(i))) increase = { from: amounts[i - 1]!, to: amounts[i]! };
        break;
      }
    }
    const varies = !increase && !flat(amounts);
    bills.push({
      key: `p:${payee}`,
      payee,
      nextDate: next,
      amount: latest,
      perMonth: varies ? Math.round(median(amounts)) : latest,
      varies,
      increase,
      fromSchedule: false,
      hidden: false,
    });
  }

  for (const sc of snap.schedules) {
    if (!sc.nextDate || sc.amount === null || sc.amount >= 0) continue;
    if (sc.account && !ok.has(sc.account)) continue;
    const name = sc.payee ?? sc.name ?? 'Scheduled';
    const existing = bills.find((b) => b.payee === sc.payee);
    if (existing) {
      existing.nextDate = sc.nextDate;
      existing.fromSchedule = true;
      continue;
    }
    bills.push({
      key: `s:${sc.id}`,
      payee: name,
      nextDate: sc.nextDate,
      amount: -sc.amount,
      perMonth: -sc.amount,
      varies: false,
      increase: null,
      fromSchedule: true,
      hidden: false,
    });
  }
  for (const b of bills) b.hidden = s.notBills.has(b.key);
  return bills.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.payee.localeCompare(b.payee));
}

// ---- Unusual charges ----

export const UNUSUAL_DAYS = 45;
export const NEW_PAYEE_THRESHOLD = 100_00; // cents
export const LARGE_FACTOR = 3;

export type Unusual = {
  key: string; // stable id, used to mark it "fine"
  kind: 'duplicate' | 'large' | 'new';
  txns: Txn[];
  typical?: number; // usual charge at this payee, for "large"
  fine: boolean;
};

export function findUnusual(snap: Snapshot, s: Settings): Unusual[] {
  const ok = new Set(counted(snap, s).map((a) => a.id));
  const since = addDays(snap.today, -UNUSUAL_DAYS);
  const charges = snap.transactions
    .filter((t) => ok.has(t.account) && !t.transfer && !t.startingBalance && t.amount < 0 && t.payee)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out: Unusual[] = [];

  // Duplicates: same account, payee and amount, within a day of each other.
  const seen = new Set<string>();
  for (let i = 0; i < charges.length; i++) {
    const a = charges[i]!;
    if (a.date < since || seen.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < charges.length; j++) {
      const b = charges[j]!;
      if (dayDiff(a.date, b.date) > 1) break;
      if (b.account === a.account && b.payee === a.payee && b.amount === a.amount) group.push(b);
    }
    if (group.length > 1) {
      group.forEach((t) => seen.add(t.id));
      out.push({ key: `dup:${group.map((t) => t.id).join(',')}`, kind: 'duplicate', txns: group, fine: false });
    }
  }

  // Large charges at a usual payee, and new payees with a big first charge.
  const history = new Map<string, number[]>();
  for (const t of charges) {
    const prior = history.get(t.payee!) ?? [];
    if (t.date >= since) {
      if (prior.length >= 4) {
        const typical = median(prior);
        if (-t.amount > typical * LARGE_FACTOR && -t.amount - typical > 50_00) {
          out.push({ key: `large:${t.id}`, kind: 'large', txns: [t], typical: Math.round(typical), fine: false });
        }
      } else if (prior.length === 0 && -t.amount >= NEW_PAYEE_THRESHOLD) {
        out.push({ key: `new:${t.id}`, kind: 'new', txns: [t], fine: false });
      }
    }
    prior.push(-t.amount);
    history.set(t.payee!, prior);
  }

  for (const u of out) u.fine = s.fine.has(u.key);
  return out.sort((a, b) => Number(a.fine) - Number(b.fine) || b.txns[0]!.date.localeCompare(a.txns[0]!.date));
}

// ---- Home ----

export type Home = {
  total: number;
  budgeted: number; // spending categories only
  spent: number;
  left: number;
  saved: number; // put into saving categories this month
  savingBudgeted: number;
  nextBills: Bill[];
  unusualOpen: number;
};

export function home(snap: Snapshot, s: Settings, mb: MonthBudget | null): Home {
  const total = counted(snap, s).reduce((sum, a) => sum + a.balance, 0);
  const rows = categoryRows(snap, s, snap.today.slice(0, 7), mb);
  const sum = (list: CategoryRow[], k: 'budgeted' | 'spent') => list.reduce((n, r) => n + r[k], 0);
  const spending = rows.filter((r) => !r.saving);
  const saving = rows.filter((r) => r.saving);
  const budgeted = sum(spending, 'budgeted');
  const spent = sum(spending, 'spent');
  return {
    total,
    budgeted,
    spent,
    left: budgeted - spent,
    saved: sum(saving, 'spent'),
    savingBudgeted: sum(saving, 'budgeted'),
    nextBills: findBills(snap, s).filter((b) => !b.hidden).slice(0, 3),
    unusualOpen: findUnusual(snap, s).filter((u) => !u.fine).length,
  };
}

export const accountName = (snap: Snapshot, id: string) => snap.accounts.find((a: Account) => a.id === id)?.name ?? '';
