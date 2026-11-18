// Environment for running the app against the fake server. Writes a dev
// secrets file (git-ignored) from dev/.env, the way the OptiPlex will have one.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from '../app/src/auth.ts';
import { DEV_DATA, SYNC_ID_FILE, fakeServerUrl, loadDevEnv } from './env.ts';

export async function devAppEnv(opts: { dataDir?: string; port?: string } = {}): Promise<NodeJS.ProcessEnv> {
  const env = loadDevEnv();
  if (!existsSync(SYNC_ID_FILE)) throw new Error('no fake budget yet: run npm run dev:fake first');
  const secrets = join(DEV_DATA, 'app-secrets.env');
  mkdirSync(DEV_DATA, { recursive: true });
  writeFileSync(
    secrets,
    `ACTUAL_PASSWORD=${env.FAKE_ACTUAL_PASSWORD}\nFINANCE_LOGIN_HASH=${await hashPassword(env.DEV_APP_PASSWORD)}\n`,
    { mode: 0o600 },
  );
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TZ: process.env.TZ,
    ACTUAL_SERVER_URL: fakeServerUrl(env),
    ACTUAL_SYNC_ID: readFileSync(SYNC_ID_FILE, 'utf8').trim(),
    FINANCE_DATA_DIR: opts.dataDir ?? join(DEV_DATA, 'app'),
    FINANCE_PORT: opts.port ?? env.DEV_APP_PORT,
    FINANCE_HOST: '127.0.0.1',
    FINANCE_SYNC_MINUTES: '15',
    FINANCE_SECURE_COOKIE: 'false',
    FINANCE_SECRETS_FILE: secrets,
  };
}
