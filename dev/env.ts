// Loads dev/.env (git-ignored). On first run it creates the file with random
// throwaway passwords for the fake Actual server and the dev app login.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = dirname(DEV_DIR);
export const DEV_DATA = join(DEV_DIR, 'data');
export const SYNC_ID_FILE = join(DEV_DATA, 'sync-id');

export type DevEnv = {
  FAKE_ACTUAL_PORT: string;
  FAKE_ACTUAL_PASSWORD: string;
  DEV_APP_PORT: string;
  DEV_APP_PASSWORD: string;
};

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export function loadDevEnv(): DevEnv {
  const file = join(DEV_DIR, '.env');
  if (!existsSync(file)) {
    const pw = () => randomBytes(18).toString('base64url');
    writeFileSync(
      file,
      [
        '# Throwaway dev values (git-ignored). Delete this file to get new ones.',
        'FAKE_ACTUAL_PORT=5007',
        `FAKE_ACTUAL_PASSWORD=${pw()}`,
        'DEV_APP_PORT=5180',
        `DEV_APP_PASSWORD=${pw()}`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
  }
  const env = parseEnvFile(readFileSync(file, 'utf8'));
  for (const k of ['FAKE_ACTUAL_PORT', 'FAKE_ACTUAL_PASSWORD', 'DEV_APP_PORT', 'DEV_APP_PASSWORD']) {
    if (!env[k]) throw new Error(`dev/.env is missing ${k}`);
  }
  return env as DevEnv;
}

export const fakeServerUrl = (env: DevEnv) => `http://127.0.0.1:${env.FAKE_ACTUAL_PORT}`;

/** The fake budget's "today": FAKE_TODAY=YYYY-MM-DD, or the real date. */
export function fakeToday(): string {
  const t = process.env.FAKE_TODAY;
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
