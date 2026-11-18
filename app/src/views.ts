// Server-rendered pages. Phone-first, stacked lists, no outside resources.
import type { Account, Snapshot, Txn } from './actual.ts';
import type { Bill, CategoryRow, Home, Unusual } from './analysis.ts';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function money(cents: number, opts: { sign?: boolean } = {}) {
  const abs = Math.abs(cents) / 100;
  const s = `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (cents < 0) return `−${s}`;
  return opts.sign && cents > 0 ? `+${s}` : s;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
export const monthLabel = (m: string) =>
  `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function ago(d: Date, now = new Date()) {
  const min = Math.round((now.getTime() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export type Tab = 'home' | 'categories' | 'bills' | 'unusual' | 'accounts';
const TABS: [Tab, string, string][] = [
  ['home', '/', 'Home'],
  ['categories', '/categories', 'Spending'],
  ['bills', '/bills', 'Bills'],
  ['unusual', '/unusual', 'Unusual'],
  ['accounts', '/accounts', 'Accounts'],
];

export type SyncState = { snap: Snapshot | null; error: string | null; back: string };

export function page(title: string, tab: Tab | null, sync: SyncState | null, body: string) {
  const status = sync
    ? `<form method="post" action="/sync" class="sync" data-sync><input type="hidden" name="back" value="${esc(sync.back)}">
        <span class="synced${sync.error ? ' bad' : ''}">${
          sync.snap ? `Last synced <time datetime="${sync.snap.syncedAt.toISOString()}">${ago(sync.snap.syncedAt)}</time>` : 'Not synced yet'
        }${sync.error ? ' · last sync failed' : ''}</span>
        <button type="submit" class="refresh" aria-label="Sync now">↻</button>
      </form>`
    : '';
  const nav = tab
    ? `<nav class="tabs">${TABS.map(([t, href, label]) => `<a href="${href}"${t === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} · Finance</title>
<link rel="stylesheet" href="/static/app.css">
<script src="/static/app.js" defer></script>
</head>
<body>
<div class="pull" aria-hidden="true">Release to sync</div>
<header><h1>${esc(title)}</h1>${status}</header>
<main>${body}</main>
${nav}
</body>
</html>`;
}

const bar = (spent: number, budgeted: number) => {
  const pct = budgeted > 0 ? Math.min(100, Math.round((spent / budgeted) * 100)) : spent > 0 ? 100 : 0;
  const over = spent > budgeted;
  // Width as a class in 5% steps: the strict CSP allows no inline styles.
  return `<div class="bar${over ? ' over' : ''}" role="img" aria-label="${pct}% used"><span class="w${Math.round(pct / 5) * 5}"></span></div>`;
};

export function notSynced(sync: SyncState) {
  return page(
    'Finance',
    'home',
    sync,
    `<section class="card"><p>No budget data yet. ${sync.error ? `The last sync failed (code: ${esc(sync.error)}).` : 'The first sync is running.'}</p><p>Pull down or tap ↻ to try again.</p></section>`,
  );
}

export function homePage(sync: SyncState, h: Home) {
  const bills = h.nextBills.length
    ? h.nextBills.map((b) => `<li><span>${esc(b.payee)}<small>${shortDate(b.nextDate)}</small></span><b>${money(b.amount)}</b></li>`).join('')
    : '<li class="empty">No upcoming bills found</li>';
  return page(
    'Home',
    'home',
    sync,
    `<section class="card total">
      <p class="label">Total balance</p>
      <p class="big">${money(h.total)}</p>
      <p class="hint"><a href="/accounts">Counted accounts</a></p>
    </section>
    <section class="card">
      <p class="label">This month</p>
      ${bar(h.spent, h.budgeted)}
      <p class="row"><span>Spent ${money(h.spent)}</span><span>of ${money(h.budgeted)}</span></p>
      <p class="big ${h.left < 0 ? 'neg' : ''}">${money(Math.abs(h.left))}</p>
      <p class="hint">${h.left < 0 ? 'over budget' : 'left to spend'} · <a href="/categories">by category</a></p>
    </section>
    <section class="card">
      <p class="label">Next bills</p>
      <ul class="list">${bills}</ul>
      <p class="hint"><a href="/bills">All bills</a>${h.unusualOpen ? ` · <a href="/unusual">${h.unusualOpen} unusual charge${h.unusualOpen > 1 ? 's' : ''}</a>` : ''}</p>
    </section>`,
  );
}

export function categoriesPage(sync: SyncState, month: string, prev: string | null, next: string | null, rows: CategoryRow[]) {
  const nav = `<nav class="months">
      ${prev ? `<a href="/categories?month=${prev}" aria-label="Previous month">‹</a>` : '<span></span>'}
      <b>${monthLabel(month)}</b>
      ${next ? `<a href="/categories?month=${next}" aria-label="Next month">›</a>` : '<span></span>'}
    </nav>`;
  const items = rows.length
    ? rows
        .map(
          (r) => `<li><a class="cat" href="/categories/${encodeURIComponent(r.category.id)}?month=${month}">
          <span class="row"><span>${esc(r.category.name)}<small>${esc(r.category.groupName)}</small></span><b class="${r.left < 0 ? 'neg' : ''}">${
            r.left < 0 ? `${money(-r.left)} over` : `${money(r.left)} left`
          }</b></span>
          ${bar(r.spent, r.budgeted)}
          <small>${money(r.spent)} of ${money(r.budgeted)}</small>
        </a></li>`,
        )
        .join('')
    : '<li class="empty">Nothing budgeted or spent this month</li>';
  return page('Spending', 'categories', sync, `${nav}<ul class="list cats">${items}</ul>`);
}

export function categoryPage(sync: SyncState, name: string, month: string, row: CategoryRow | undefined, txns: Txn[], accounts: Account[]) {
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const list = txns.length
    ? txns.map((t) => txnItem(t, acct)).join('')
    : '<li class="empty">No transactions this month</li>';
  return page(
    name,
    'categories',
    sync,
    `<p class="back"><a href="/categories?month=${month}">‹ ${monthLabel(month)}</a></p>
    ${row ? `<section class="card">${bar(row.spent, row.budgeted)}<p class="row"><span>Spent ${money(row.spent)}</span><span>of ${money(row.budgeted)}</span></p></section>` : ''}
    <ul class="list">${list}</ul>`,
  );
}

function txnItem(t: Txn, acct: Map<string, string>) {
  return `<li><span>${esc(t.payee ?? 'Transfer')}<small>${shortDate(t.date)} · ${esc(acct.get(t.account) ?? '')}${t.notes ? ` · ${esc(t.notes)}` : ''}</small></span><b class="${t.amount < 0 ? '' : 'pos'}">${money(-t.amount)}</b></li>`;
}

export function billsPage(sync: SyncState, bills: Bill[]) {
  const total = bills.reduce((s, b) => s + b.perMonth, 0);
  const items = bills.length
    ? bills
        .map(
          (b) => `<li><span>${esc(b.payee)}<small>Next ${shortDate(b.nextDate)}${b.fromSchedule ? ' · scheduled' : ''}${b.varies ? ' · varies' : ''}</small>${
            b.increase ? `<em class="flag">Price up ${money(b.increase.from)} → ${money(b.increase.to)}</em>` : ''
          }</span><b>${b.varies ? '~' : ''}${money(b.perMonth)}</b></li>`,
        )
        .join('')
    : '<li class="empty">No recurring charges found</li>';
  return page(
    'Bills',
    'bills',
    sync,
    `<section class="card"><p class="label">Per month</p><p class="big">${money(total)}</p><p class="hint">${bills.length} bills and subscriptions</p></section>
    <ul class="list">${items}</ul>`,
  );
}

const KIND: Record<Unusual['kind'], string> = {
  duplicate: 'Possible duplicate',
  large: 'Larger than usual',
  new: 'New merchant',
};

export function unusualPage(sync: SyncState, items: Unusual[], accounts: Account[]) {
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const list = items.length
    ? items
        .map((u) => {
          const t = u.txns[0]!;
          const detail =
            u.kind === 'duplicate'
              ? `${u.txns.length} × ${money(-t.amount)}`
              : u.kind === 'large'
                ? `${money(-t.amount)} · usually ${money(u.typical ?? 0)}`
                : money(-t.amount);
          return `<li class="unusual${u.fine ? ' fine' : ''}"><span><em class="flag">${KIND[u.kind]}</em>${esc(t.payee)}<small>${shortDate(t.date)} · ${esc(
            acct.get(t.account) ?? '',
          )}</small><small>${detail}</small></span>
          <form method="post" action="/unusual/fine"><input type="hidden" name="key" value="${esc(u.key)}"><input type="hidden" name="fine" value="${u.fine ? '0' : '1'}">
          <button type="submit">${u.fine ? 'Undo' : 'Fine'}</button></form></li>`;
        })
        .join('')
    : '<li class="empty">Nothing unusual in the last 45 days</li>';
  return page('Unusual', 'unusual', sync, `<ul class="list">${list}</ul>`);
}

export function accountsPage(sync: SyncState, accounts: Account[], excluded: Set<string>) {
  const open = accounts.filter((a) => !a.closed);
  const group = (label: string, list: Account[]) =>
    list.length
      ? `<p class="label">${label}</p><ul class="list">${list
          .map((a) => {
            const on = !excluded.has(a.id);
            return `<li><span>${esc(a.name)}<small>${money(a.balance)}</small></span>
            <form method="post" action="/accounts/count"><input type="hidden" name="id" value="${esc(a.id)}"><input type="hidden" name="count" value="${on ? '0' : '1'}">
            <button type="submit" class="switch" role="switch" aria-checked="${on}" aria-label="Count in totals">${on ? 'Counted' : 'Left out'}</button></form></li>`;
          })
          .join('')}</ul>`
      : '';
  const total = open.filter((a) => !excluded.has(a.id)).reduce((s, a) => s + a.balance, 0);
  return page(
    'Accounts',
    'accounts',
    sync,
    `<section class="card"><p class="label">Counted total</p><p class="big">${money(total)}</p><p class="hint">Tap a switch to leave an account out of every total. Saved in this app only.</p></section>
    ${group('On budget', open.filter((a) => !a.offbudget))}
    ${group('Off budget', open.filter((a) => a.offbudget))}
    <form method="post" action="/logout" class="logout"><button type="submit">Log out</button></form>`,
  );
}

export function loginPage(message: string | null) {
  return page(
    'Finance',
    null,
    null,
    `<form method="post" action="/login" class="card login">
      <label for="pw">Password</label>
      <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
      ${message ? `<p class="neg">${esc(message)}</p>` : ''}
      <button type="submit">Log in</button>
    </form>`,
  );
}

export function notFoundPage() {
  return page('Not found', 'home', null, '<section class="card"><p>Nothing here.</p><p><a href="/">Home</a></p></section>');
}
