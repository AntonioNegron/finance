// The web server: login on every route but /healthz, strict headers, no
// outside resources. Plain node:http, no framework.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Actual } from './actual.ts';
import { categoryRows, categoryTxns, findBills, findUnusual, home, type Settings } from './analysis.ts';
import { Lockout, verifyPassword } from './auth.ts';
import type { Config } from './config.ts';
import { addMonths } from './dates.ts';
import { log, logError } from './log.ts';
import type { Store } from './store.ts';
import * as v from './views.ts';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const STATIC: Record<string, { type: string; body: Buffer }> = {};
for (const [name, type] of [
  ['app.css', 'text/css; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
] as const) {
  STATIC[`/static/${name}`] = { type, body: readFileSync(join(PUBLIC, name)) };
}

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SESSION_DAYS = 30;
const COOKIE = 'fin_session';

function headers(res: ServerResponse) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cache-Control', 'no-store');
}

const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
};
const html = (res: ServerResponse, body: string, status = 200) => send(res, status, 'text/html; charset=utf-8', body);
const redirect = (res: ServerResponse, to: string) => {
  res.statusCode = 303;
  res.setHeader('Location', to);
  res.end();
};

function cookies(req: IncomingMessage) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 8192) throw Object.assign(new Error('body too large'), { code: 'too-large' });
    chunks.push(c as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/** Rejects cross-site form posts (on top of the SameSite=Strict cookie). */
function sameOrigin(req: IncomingMessage) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
  return true;
}

export function createApp(cfg: Config, actual: Actual, store: Store) {
  const lockout = new Lockout();

  const settings = (): Settings => ({ excluded: store.excluded, fine: store.fine });
  const syncState = (back: string): v.SyncState => ({ snap: actual.snapshot, error: actual.lastError, back });

  function setSession(res: ServerResponse) {
    const token = randomBytes(32).toString('base64url');
    const maxAge = SESSION_DAYS * 86400;
    store.addSession(token, Date.now() + maxAge * 1000);
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${cfg.secureCookie ? '; Secure' : ''}`,
    );
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    headers(res);
    const url = new URL(req.url ?? '/', 'http://app');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/healthz') {
      const ok = actual.snapshot !== null && actual.lastError === null;
      return send(res, ok ? 200 : 503, 'text/plain; charset=utf-8', ok ? 'ok' : 'error');
    }

    if (method === 'POST' && !sameOrigin(req)) return send(res, 403, 'text/plain; charset=utf-8', 'forbidden');

    if (path === '/login') {
      if (method === 'GET') return html(res, v.loginPage(null));
      if (method !== 'POST') return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed');
      if (lockout.locked()) {
        log('login.locked');
        return html(res, v.loginPage('Too many tries. Wait 15 minutes.'), 429);
      }
      const form = await readForm(req);
      if (await verifyPassword(form.get('password') ?? '', cfg.loginHash)) {
        lockout.success();
        setSession(res);
        log('login.ok');
        return redirect(res, '/');
      }
      const nowLocked = lockout.fail();
      log(nowLocked ? 'login.locked' : 'login.failed');
      return html(res, v.loginPage(nowLocked ? 'Too many tries. Wait 15 minutes.' : 'Wrong password.'), nowLocked ? 429 : 401);
    }

    // Everything below needs a session.
    const token = cookies(req)[COOKIE];
    if (!token || !store.hasSession(token)) {
      if (method === 'GET' && !path.startsWith('/static/')) return redirect(res, '/login');
      return send(res, 401, 'text/plain; charset=utf-8', 'login required');
    }

    const asset = STATIC[path];
    if (asset && method === 'GET') {
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return send(res, 200, asset.type, asset.body);
    }

    if (method === 'POST') {
      if (path === '/logout') {
        store.removeSession(token);
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${cfg.secureCookie ? '; Secure' : ''}`);
        log('logout');
        return redirect(res, '/login');
      }
      const form = await readForm(req);
      if (path === '/sync') {
        try {
          await actual.refresh();
        } catch {
          // already logged by Actual; the page shows "last sync failed"
        }
        if (req.headers.accept?.includes('application/json')) return send(res, 200, 'application/json', '{"done":true}');
        return redirect(res, safeBack(form.get('back')));
      }
      if (path === '/accounts/count') {
        const id = form.get('id') ?? '';
        if (!actual.snapshot?.accounts.some((a) => a.id === id)) return send(res, 400, 'text/plain; charset=utf-8', 'bad request');
        store.setCounted(id, form.get('count') === '1');
        log('setting.changed', { excluded_accounts: store.excluded.size });
        return redirect(res, '/accounts');
      }
      if (path === '/unusual/fine') {
        const key = form.get('key') ?? '';
        if (!/^(dup|large|new):[\w,-]{1,400}$/.test(key)) return send(res, 400, 'text/plain; charset=utf-8', 'bad request');
        store.setFine(key, form.get('fine') === '1');
        log('unusual.marked', { marked_fine: store.fine.size });
        return redirect(res, '/unusual');
      }
      return send(res, 404, 'text/plain; charset=utf-8', 'not found');
    }

    if (method !== 'GET') return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed');

    const snap = actual.snapshot;
    const sync = syncState(path + url.search);
    if (!snap) return html(res, v.notSynced(sync));
    const s = settings();
    const thisMonth = snap.today.slice(0, 7);

    if (path === '/') return html(res, v.homePage(sync, home(snap, s, await actual.monthBudget(thisMonth))));

    if (path === '/categories' || path.startsWith('/categories/')) {
      const first = snap.windowStart.slice(0, 7);
      const asked = url.searchParams.get('month') ?? thisMonth;
      const month = /^\d{4}-\d{2}$/.test(asked) && asked >= first && asked <= thisMonth ? asked : thisMonth;
      const prev = month > first ? addMonths(month, -1) : null;
      const next = month < thisMonth ? addMonths(month, 1) : null;
      const rows = categoryRows(snap, s, month, await actual.monthBudget(month));
      if (path === '/categories') return html(res, v.categoriesPage(sync, month, prev, next, rows));
      const id = decodeURIComponent(path.slice('/categories/'.length));
      const cat = snap.categories.find((c) => c.id === id);
      if (!cat) return html(res, v.notFoundPage(), 404);
      return html(
        res,
        v.categoryPage(sync, cat.name, month, rows.find((r) => r.category.id === id), categoryTxns(snap, s, id, month), snap.accounts),
      );
    }
    if (path === '/bills') return html(res, v.billsPage(sync, findBills(snap, s)));
    if (path === '/unusual') return html(res, v.unusualPage(sync, findUnusual(snap, s), snap.accounts));
    if (path === '/accounts') return html(res, v.accountsPage(sync, snap.accounts, s.excluded));
    return html(res, v.notFoundPage(), 404);
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      logError('request.error', 'handle', e);
      if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', 'error');
      else res.end();
    });
  });
}

/** Where to go back to after the sync form: a local path only. */
function safeBack(back: string | null) {
  return back && /^\/(?!\/)[\w\/?=&%.-]*$/.test(back) ? back : '/';
}
