// Settings: connection from environment variables, secrets from a file
// (KEY=value lines). Values are never logged.
import { readFileSync } from 'node:fs';

export type Config = {
  serverURL: string;
  syncId: string;
  dataDir: string;
  port: number;
  host: string;
  syncMinutes: number;
  secureCookie: boolean;
  actualPassword: string;
  encryptionPassword?: string;
  loginHash: string;
};

export function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export class ConfigError extends Error {
  code = 'config';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new ConfigError(`missing setting ${k}`);
    return v;
  };
  const secretsFile = need('FINANCE_SECRETS_FILE');
  let secrets: Record<string, string>;
  try {
    secrets = parseKeyValues(readFileSync(secretsFile, 'utf8'));
  } catch {
    throw new ConfigError('cannot read the secrets file');
  }
  const secret = (k: string) => {
    const v = secrets[k];
    if (!v) throw new ConfigError(`secrets file is missing ${k}`);
    return v;
  };
  return {
    serverURL: need('ACTUAL_SERVER_URL'),
    syncId: need('ACTUAL_SYNC_ID'),
    dataDir: need('FINANCE_DATA_DIR'),
    port: Number(env.FINANCE_PORT || 8080),
    host: env.FINANCE_HOST || '0.0.0.0',
    syncMinutes: Math.max(1, Number(env.FINANCE_SYNC_MINUTES || 15)),
    secureCookie: env.FINANCE_SECURE_COOKIE !== 'false',
    actualPassword: secret('ACTUAL_PASSWORD'),
    encryptionPassword: secrets.ACTUAL_ENCRYPTION_PASSWORD || undefined,
    loginHash: secret('FINANCE_LOGIN_HASH'),
  };
}
