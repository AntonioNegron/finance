// Starts a separate copy of the app against the running fake server, with
// its own data folder and port, and captures everything it writes.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devAppEnv } from '../dev/app-env.ts';
import { ROOT, fakeServerUrl, loadDevEnv } from '../dev/env.ts';

export type RunningApp = {
  base: string;
  output: () => string;
  stop: () => Promise<void>;
};

export async function fakeServerUp() {
  try {
    return (await fetch(`${fakeServerUrl(loadDevEnv())}/health`)).ok;
  } catch {
    return false;
  }
}

export async function requireFakeServer() {
  if (!(await fakeServerUp())) throw new Error('The fake Actual server is not running. Start it with: npm run dev:fake');
}

let nextPort = 5300 + Math.floor(Math.random() * 500);

export async function startApp(): Promise<RunningApp> {
  await requireFakeServer();
  const dataDir = mkdtempSync(join(tmpdir(), 'finance-test-'));
  const port = String(nextPort++);
  const env = await devAppEnv({ dataDir, port });
  let out = '';
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'app/src/main.ts')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => (out += d));
  child.stderr!.on('data', (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120 && !/sync\.ok/.test(out); i++) await new Promise((r) => setTimeout(r, 250));
  if (!/sync\.ok/.test(out)) {
    child.kill();
    throw new Error('app did not sync with the fake server');
  }
  return {
    base,
    output: () => out,
    stop: async () => {
      if (child.exitCode === null) {
        const done = new Promise((r) => child.on('exit', r));
        child.kill('SIGTERM');
        await done;
      }
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** A tiny cookie-keeping client. */
export class Client {
  cookie = '';
  constructor(private base: string) {}

  async req(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('cookie', this.cookie);
    const res = await fetch(this.base + path, { ...init, headers, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    return res;
  }

  get(path: string) {
    return this.req(path);
  }

  post(path: string, form: Record<string, string> = {}) {
    return this.req(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: this.base },
      body: new URLSearchParams(form).toString(),
    });
  }

  async login(password = loadDevEnv().DEV_APP_PASSWORD) {
    return this.post('/login', { password });
  }
}
