// The only module that talks to Actual. It uses only the functions listed in
// docs/specs/actual-access.md (a test enforces this): connect, sync, and read.
import * as api from '@actual-app/api';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Config } from './config.ts';
import { addMonths, localToday } from './dates.ts';
import { log, logError } from './log.ts';

export type Account = { id: string; name: string; offbudget: boolean; closed: boolean; balance: number };
export type Category = { id: string; name: string; groupId: string; groupName: string; isIncome: boolean; hidden: boolean };
export type Txn = {
  id: string;
  account: string;
  date: string;
  amount: number;
  payee: string | null; // payee name, null for transfers or none
  payeeId: string | null;
  category: string | null;
  notes: string | null;
  transfer: boolean;
  startingBalance: boolean;
};
export type Schedule = { id: string; name: string | null; nextDate: string | null; amount: number | null; payee: string | null; account: string | null };
export type MonthBudget = { month: string; budgeted: Record<string, number> };

export type Snapshot = {
  syncedAt: Date;
  today: string;
  accounts: Account[];
  categories: Category[];
  transactions: Txn[]; // from `windowStart` on, splits expanded
  windowStart: string;
  schedules: Schedule[];
  budgetMonths: string[];
  budgets: Map<string, MonthBudget>;
};

export const HISTORY_MONTHS = 13;

/** The installed @actual-app/api version (its package.json isn't exported, so read it beside the entry point). */
export const API_VERSION: string = (() => {
  try {
    const entry = createRequire(import.meta.url).resolve('@actual-app/api');
    for (let dir = dirname(entry); dir !== dirname(dir); dir = dirname(dir)) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string; version?: string };
        if (pkg.name === '@actual-app/api' && pkg.version) return pkg.version;
      } catch {}
    }
  } catch {}
  return 'unknown';
})();

/** Serializes every call into the API (it holds one open budget). */
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

export class Actual {
  private connected = false;
  snapshot: Snapshot | null = null;
  lastError: string | null = null;
  /** The Actual server's version, or null if it couldn't be read. */
  serverVersion: string | null = null;

  constructor(private cfg: Config) {}

  /** init + downloadBudget, then a first read. */
  connect(): Promise<void> {
    return exclusive(async () => {
      const dataDir = join(this.cfg.dataDir, 'actual');
      mkdirSync(dataDir, { recursive: true });
      try {
        await api.init({ dataDir, serverURL: this.cfg.serverURL, password: this.cfg.actualPassword });
        await api.downloadBudget(this.cfg.syncId, { password: this.cfg.encryptionPassword });
        this.connected = true;
        log('connect.ok');
      } catch (e) {
        this.lastError = errCode(e);
        logError('connect.failed', 'downloadBudget', e);
        try {
          await api.shutdown();
        } catch {}
        throw e;
      }
      await this.read();
    });
  }

  /** Pulls the latest changes from the server, then re-reads. */
  refresh(): Promise<void> {
    if (!this.connected) return this.connect();
    return exclusive(async () => {
      try {
        await api.sync();
      } catch (e) {
        this.lastError = errCode(e);
        logError('sync.failed', 'sync', e);
        throw e;
      }
      await this.read();
    });
  }

  /** Budget amounts for a month, read on demand and kept with the snapshot. */
  monthBudget(month: string): Promise<MonthBudget | null> {
    const snap = this.snapshot;
    if (!snap) return Promise.resolve(null);
    const hit = snap.budgets.get(month);
    if (hit) return Promise.resolve(hit);
    if (!snap.budgetMonths.includes(month)) return Promise.resolve(null);
    return exclusive(async () => {
      const mb = await readMonth(month);
      snap.budgets.set(month, mb);
      return mb;
    });
  }

  close(): Promise<void> {
    return exclusive(async () => {
      if (this.connected) await api.shutdown();
      this.connected = false;
    });
  }

  private async read() {
    const before = this.snapshot?.transactions.length ?? 0;
    const today = localToday();
    const windowStart = `${addMonths(today.slice(0, 7), -(HISTORY_MONTHS - 1))}-01`;

    const accounts: Account[] = [];
    for (const a of await api.getAccounts()) {
      accounts.push({
        id: a.id,
        name: a.name,
        offbudget: !!a.offbudget,
        closed: !!a.closed,
        balance: await api.getAccountBalance(a.id),
      });
    }

    const groups = await api.getCategoryGroups();
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    const categories: Category[] = (await api.getCategories()).map((c) => ({
      id: c.id,
      name: c.name,
      groupId: c.group_id,
      groupName: groupName.get(c.group_id) ?? '',
      isIncome: !!c.is_income,
      hidden: !!c.hidden,
    }));

    const payees = new Map<string, { name: string; transfer: boolean }>();
    for (const p of await api.getPayees()) payees.set(p.id, { name: p.name, transfer: !!p.transfer_acct });

    const transactions: Txn[] = [];
    for (const a of accounts) {
      const raw = await api.getTransactions(a.id, windowStart, today);
      const childrenOf = new Map<string, typeof raw>();
      for (const t of raw) if (t.is_child && t.parent_id) childrenOf.set(t.parent_id, [...(childrenOf.get(t.parent_id) ?? []), t]);
      for (const t of raw) {
        if (t.is_child && t.parent_id && raw.some((p) => p.id === t.parent_id)) continue;
        const parts = t.is_parent ? (t.subtransactions?.length ? t.subtransactions : childrenOf.get(t.id) ?? [t]) : [t];
        for (const s of parts) {
          const p = s.payee ?? t.payee;
          const payee = p ? payees.get(p) : undefined;
          transactions.push({
            id: s.id,
            account: a.id,
            date: t.date,
            amount: s.amount,
            payee: payee && !payee.transfer ? payee.name : null,
            payeeId: p ?? null,
            category: s.category ?? null,
            notes: s.notes ?? t.notes ?? null,
            transfer: !!s.transfer_id || !!payee?.transfer,
            startingBalance: !!t.starting_balance_flag,
          });
        }
      }
    }

    const schedules: Schedule[] = (await api.getSchedules())
      .filter((s) => !s.completed)
      .map((s) => ({
        id: s.id,
        name: s.name ?? null,
        nextDate: s.next_date ?? null,
        amount: typeof s.amount === 'number' ? s.amount : null,
        payee: s.payee ? payees.get(s.payee)?.name ?? null : null,
        account: s.account ?? null,
      }));

    const budgetMonths = await api.getBudgetMonths();
    const budgets = new Map<string, MonthBudget>();
    const thisMonth = today.slice(0, 7);
    if (budgetMonths.includes(thisMonth)) budgets.set(thisMonth, await readMonth(thisMonth));

    const sv = await api.getServerVersion();
    this.serverVersion = 'version' in sv && typeof sv.version === 'string' ? sv.version : null;

    this.snapshot = { syncedAt: new Date(), today, accounts, categories, transactions, windowStart, schedules, budgetMonths, budgets };
    this.lastError = null;
    log('sync.ok', {
      accounts: accounts.length,
      transactions: transactions.length,
      new_transactions: Math.max(0, transactions.length - before),
      schedules: schedules.length,
      server_version_match: this.serverVersion === API_VERSION ? 1 : 0,
    });
  }
}

async function readMonth(month: string): Promise<MonthBudget> {
  const m = await api.getBudgetMonth(month);
  const budgeted: Record<string, number> = {};
  for (const g of m.categoryGroups) {
    for (const c of g.categories ?? []) {
      if (typeof c.id === 'string' && typeof c.budgeted === 'number') budgeted[c.id] = c.budgeted;
    }
  }
  return { month, budgeted };
}

function errCode(e: unknown): string {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' && /^[a-z0-9-]{1,40}$/i.test(c) ? c : 'unknown';
}
