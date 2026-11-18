// npm run dev:app — runs the app against the fake server on 127.0.0.1.
// Log in with DEV_APP_PASSWORD from dev/.env.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { devAppEnv } from './app-env.ts';
import { ROOT } from './env.ts';

const env = await devAppEnv();
console.log(`app on http://127.0.0.1:${env.FINANCE_PORT} (password: DEV_APP_PASSWORD in dev/.env)`);
const child = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'app/src/main.ts')], { env, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
