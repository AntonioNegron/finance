// The app's own storage (never Actual): which accounts count in totals,
// unusual charges marked "fine", bills marked "not a bill", which category
// groups are saving, and login sessions (hashed). One JSON file in the data
// folder, written atomically.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type GroupKind = 'saving' | 'spending';

type State = {
  excludedAccounts: string[];
  fine: string[];
  notBills: string[];
  groupKinds: Record<string, GroupKind>; // category group id -> chosen kind
  sessions: Record<string, number>; // sha256(token) -> expiry (ms)
};

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class Store {
  private state: State;

  constructor(private file: string) {
    try {
      const s = JSON.parse(readFileSync(file, 'utf8')) as Partial<State>;
      this.state = {
        excludedAccounts: s.excludedAccounts ?? [],
        fine: s.fine ?? [],
        notBills: s.notBills ?? [],
        groupKinds: s.groupKinds ?? {},
        sessions: s.sessions ?? {},
      };
    } catch {
      this.state = { excludedAccounts: [], fine: [], notBills: [], groupKinds: {}, sessions: {} };
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
  get notBills() {
    return new Set(this.state.notBills);
  }
  get groupKinds(): ReadonlyMap<string, GroupKind> {
    return new Map(Object.entries(this.state.groupKinds));
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

  setNotBill(key: string, notBill: boolean) {
    const s = this.notBills;
    if (notBill) s.add(key);
    else s.delete(key);
    this.state.notBills = [...s];
    this.save();
  }

  setGroupKind(groupId: string, kind: GroupKind) {
    this.state.groupKinds[groupId] = kind;
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
