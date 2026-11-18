// The app's own storage (never Actual): which accounts count in totals,
// unusual charges marked "fine", and login sessions (hashed). One JSON file
// in the data folder, written atomically.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type State = {
  excludedAccounts: string[];
  fine: string[];
  sessions: Record<string, number>; // sha256(token) -> expiry (ms)
};

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class Store {
  private state: State;

  constructor(private file: string) {
    try {
      const s = JSON.parse(readFileSync(file, 'utf8')) as Partial<State>;
      this.state = { excludedAccounts: s.excludedAccounts ?? [], fine: s.fine ?? [], sessions: s.sessions ?? {} };
    } catch {
      this.state = { excludedAccounts: [], fine: [], sessions: {} };
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  get excluded() {
    return new Set(this.state.excludedAccounts);
  }
  get fine() {
    return new Set(this.state.fine);
  }

  setCounted(accountId: string, count: boolean) {
    const s = this.excluded;
    if (count) s.delete(accountId);
    else s.add(accountId);
    this.state.excludedAccounts = [...s];
    this.save();
  }

  setFine(key: string, fine: boolean) {
    const s = this.fine;
    if (fine) s.add(key);
    else s.delete(key);
    this.state.fine = [...s];
    this.save();
  }

  addSession(token: string, expires: number) {
    this.pruneSessions();
    this.state.sessions[tokenHash(token)] = expires;
    this.save();
  }

  hasSession(token: string) {
    const exp = this.state.sessions[tokenHash(token)];
    return exp !== undefined && exp > Date.now();
  }

  removeSession(token: string) {
    delete this.state.sessions[tokenHash(token)];
    this.save();
  }

  private pruneSessions() {
    const now = Date.now();
    for (const [k, exp] of Object.entries(this.state.sessions)) if (exp <= now) delete this.state.sessions[k];
  }
}
