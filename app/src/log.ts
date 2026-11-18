// The only way the app writes logs. Events and counts only: an event name
// from a fixed list, and numbers. No free text, so no amounts, names, notes
// or dates can get in. Errors carry a code and the function name only.
//
// Everything else that writes to the console (including @actual-app/api's
// own chatter, which can include file names) is silenced by quietConsole().

export type LogEvent =
  | 'started'
  | 'stopping'
  | 'connect.ok'
  | 'connect.failed'
  | 'sync.ok'
  | 'sync.failed'
  | 'login.ok'
  | 'login.failed'
  | 'login.locked'
  | 'logout'
  | 'setting.changed'
  | 'unusual.marked'
  | 'bill.marked'
  | 'request.error'
  | 'config.error';

const SAFE_CODE = /^[a-z0-9][a-z0-9._-]{0,40}$/i;

function write(stream: NodeJS.WriteStream, line: string) {
  stream.write(`${new Date().toISOString()} ${line}\n`);
}

export function log(event: LogEvent, counts: Record<string, number> = {}) {
  const parts = Object.entries(counts)
    .filter(([k, v]) => SAFE_CODE.test(k) && Number.isFinite(v))
    .map(([k, v]) => `${k}=${Math.trunc(v)}`);
  write(process.stdout, [event, ...parts].join(' '));
}

/** Logs an error by code and function name only, never its message or data. */
export function logError(event: LogEvent, fn: string, err: unknown) {
  const raw = (err as { code?: unknown; reason?: unknown } | null)?.code ?? (err as { reason?: unknown } | null)?.reason;
  const code = typeof raw === 'string' && SAFE_CODE.test(raw) ? raw : 'unknown';
  const name = SAFE_CODE.test(fn) ? fn : 'unknown';
  write(process.stderr, `${event} fn=${name} code=${code}`);
}

export function quietConsole() {
  const noop = () => {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'group', 'groupCollapsed'] as const) {
    (console as unknown as Record<string, unknown>)[k] = noop;
  }
}
