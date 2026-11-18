// Starts the app: quiet the console, read settings, connect to Actual, serve,
// and sync on a timer.
import { join } from 'node:path';
import { Actual } from './actual.ts';
import { loadConfig } from './config.ts';
import { log, logError, quietConsole } from './log.ts';
import { createApp } from './server.ts';
import { Store } from './store.ts';

quietConsole();

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  logError('config.error', 'loadConfig', e);
  process.exit(1);
}

const actual = new Actual(cfg);
const store = new Store(join(cfg.dataDir, 'app-state.json'));
const server = createApp(cfg, actual, store);

server.listen(cfg.port, cfg.host, () => log('started', { port: cfg.port, sync_minutes: cfg.syncMinutes }));

// First sync, retried with backoff until it works; then on a timer.
let delay = 5_000;
const firstSync = async () => {
  try {
    await actual.connect();
  } catch {
    setTimeout(firstSync, delay);
    delay = Math.min(delay * 2, 5 * 60_000);
  }
};
void firstSync();
const timer = setInterval(() => void actual.refresh().catch(() => {}), cfg.syncMinutes * 60_000);

const stop = () => {
  log('stopping');
  clearInterval(timer);
  server.close();
  actual.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
