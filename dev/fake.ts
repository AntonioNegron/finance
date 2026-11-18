// npm run dev:fake — starts a fresh fake Actual server on 127.0.0.1 only,
// sets its throwaway password, seeds the fake budget, and keeps running.
// Ctrl-C stops it. Its data lives in dev/data/server (wiped on every start).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_DATA, ROOT, fakeServerUrl, loadDevEnv } from './env.ts';
import { seed } from './seed.ts';

const env = loadDevEnv();
const url = fakeServerUrl(env);
const serverDir = join(DEV_DATA, 'server');
rmSync(serverDir, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });

const server = spawn(join(ROOT, 'node_modules/.bin/actual-server'), [], {
  cwd: serverDir,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ACTUAL_HOSTNAME: '127.0.0.1',
    ACTUAL_PORT: env.FAKE_ACTUAL_PORT,
    ACTUAL_DATA_DIR: serverDir,
    ACTUAL_LOGIN_METHOD: 'password',
  },
});
const stop = () => server.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));

async function waitHealthy() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('fake Actual server did not start');
}

try {
  await waitHealthy();
  const res = await fetch(`${url}/account/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: env.FAKE_ACTUAL_PASSWORD }),
  });
  if (!res.ok) throw new Error(`bootstrap failed: HTTP ${res.status}`);
  await seed();
  console.log(`fake Actual server ready at ${url} (Ctrl-C to stop)`);
} catch (e) {
  console.error(e);
  stop();
  process.exitCode = 1;
}
