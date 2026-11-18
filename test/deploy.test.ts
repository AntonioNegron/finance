// The OptiPlex install, updater and uninstall, dry-run on the NUC in a
// throwaway folder. Stand-ins (test/deploy-stubs) take the place of docker,
// systemctl, useradd and the other root-only commands; git, ssh-keygen, flock
// and the scripts themselves are real. What only the OptiPlex can check (the
// real build, Docker networks, HAProxy, systemd) is listed in the F1-1 report.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT } from '../dev/env.ts';

const STUBS = join(ROOT, 'test/deploy-stubs');
// Throwaway test values, nothing real.
const ACTUAL_PW = 'stub-actual-pw-Kq7';
const APP_PW = 'stub-app-password-Zx9';
const SYNC_ID = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';

let dir: string;
let work: string; // stands in for the GitHub repo
let base: string; // stands in for /opt/finance
let state: string; // the stand-ins' state
let systemd: string;

const git = (...args: string[]) => execFileSync('git', ['-C', work, ...args], { encoding: 'utf8' }).trim();
const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);
const calls = () => (existsSync(join(state, 'calls')) ? readFileSync(join(state, 'calls'), 'utf8') : '');
const image = (tag: string) => readFileSync(join(state, 'images', `finance-app:${tag}`), 'utf8').trim();

function run(script: string, answers: string[] = [], env: Record<string, string> = {}) {
  const tty = join(dir, 'answers');
  writeFileSync(tty, answers.map((a) => `${a}\n`).join(''));
  const r = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: `${STUBS}:${process.env.PATH}`,
      HOME: dir,
      STUB_STATE: state,
      FINANCE_BASE: base,
      FINANCE_SYSTEMD_DIR: systemd,
      FINANCE_TTY: tty,
      FINANCE_REPO: work,
      GIT_CONFIG_GLOBAL: join(dir, 'gitconfig'),
      ...env,
    },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A new commit on the stand-in repo's deploy branch. */
function shipCommit(msg: string) {
  writeFileSync(join(work, 'CHANGE'), msg);
  git('add', '-A');
  git('commit', '-q', '-m', msg);
  git('branch', '-f', 'deploy', 'HEAD');
  return git('rev-parse', 'HEAD');
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'finance-deploy-'));
  work = join(dir, 'repo');
  base = join(dir, 'opt-finance');
  state = join(dir, 'stub-state');
  systemd = join(dir, 'systemd');
  for (const d of [work, state, systemd]) mkdirSync(d, { recursive: true });
  writeFileSync(join(dir, 'gitconfig'), '[user]\n\tname = test\n\temail = test@example.invalid\n[init]\n\tdefaultBranch = main\n');
  cpSync(join(ROOT, 'deploy'), join(work, 'deploy'), { recursive: true });
  execFileSync('git', ['init', '-q', work], { env: { ...process.env, GIT_CONFIG_GLOBAL: join(dir, 'gitconfig') } });
  process.env.GIT_CONFIG_GLOBAL = join(dir, 'gitconfig');
  shipCommit('first');
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('the paste-ready command decodes to bootstrap.sh exactly, and stays short', () => {
  const cmd = execFileSync('bash', [join(ROOT, 'deploy/paste.sh')], { encoding: 'utf8' }).trim();
  assert.ok(cmd.length < 4000, `${cmd.length} characters`);
  const b64 = /echo '([A-Za-z0-9+/=]+)'/.exec(cmd)![1]!;
  const decoded = execFileSync('bash', ['-c', 'base64 -d | gunzip'], { input: b64 }).toString();
  assert.equal(decoded, readFileSync(join(ROOT, 'deploy/bootstrap.sh'), 'utf8'));
  // A paste cut short fails before anything runs.
  const cut = cmd.replace(b64, b64.slice(0, -40)).replace('sudo bash', 'echo WOULD-RUN');
  const r = spawnSync('bash', ['-c', cut], { encoding: 'utf8' });
  assert.ok(!r.stdout.includes('WOULD-RUN'));
});

test('bootstrap + install: key, clone, user, folders, secrets, compose, updater', () => {
  const r = run(join(ROOT, 'deploy/bootstrap.sh'), [ACTUAL_PW, ACTUAL_PW, APP_PW, APP_PW, SYNC_ID]);
  assert.equal(r.code, 0, r.out);
  const commit = git('rev-parse', 'deploy');

  // Deploy key and GitHub's pinned host key.
  assert.equal(mode(join(base, 'deploy-key')), '600');
  assert.match(readFileSync(join(base, 'known_hosts'), 'utf8'), /^github\.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl$/m);
  assert.equal(git('-C', join(base, 'src'), 'rev-parse', 'HEAD'), commit);

  // User: system, no login, never in docker or sudo.
  assert.match(calls(), /^useradd --system --user-group --no-create-home --home-dir \/nonexistent --shell \/usr\/sbin\/nologin finance$/m);

  // Folders and owners.
  assert.equal(mode(base), '755');
  assert.equal(mode(join(base, 'data')), '700');
  assert.equal(mode(join(base, 'secrets')), '700');
  assert.equal(mode(join(base, 'state')), '700');
  assert.match(calls(), new RegExp(`^chown finance:finance ${base}/data$`, 'm'));
  assert.match(calls(), new RegExp(`^chown finance:finance ${base}/secrets/finance.env$`, 'm'));

  // Secrets: mode 600, the Actual password as typed, the app password only as a hash.
  const secrets = join(base, 'secrets/finance.env');
  assert.equal(mode(secrets), '600');
  const text = readFileSync(secrets, 'utf8');
  assert.match(text, new RegExp(`^ACTUAL_PASSWORD=${ACTUAL_PW}$`, 'm'));
  assert.match(text, /^FINANCE_LOGIN_HASH=scrypt\$/m);
  assert.match(text, new RegExp(`^ACTUAL_SYNC_ID=${SYNC_ID}$`, 'm'));
  assert.ok(!text.includes(APP_PW), 'no plain app password');
  assert.equal(readFileSync(join(state, 'hashed-length'), 'utf8'), String(APP_PW.length), 'hashed from stdin');
  // Never on a command line, never printed.
  for (const pw of [ACTUAL_PW, APP_PW]) {
    assert.ok(!calls().includes(pw), 'a password on a command line');
    assert.ok(!r.out.includes(pw), 'a password in the output');
  }
  assert.match(calls(), /^docker run --rm -i --network none --read-only --cap-drop ALL --user 1234:1234 finance-app:[0-9a-f]{40} node dist\/app\/src\/hash-password\.js$/m);

  // Compose: filled in, root-only, checked before use; forwarder config checked.
  const compose = readFileSync(join(base, 'compose.yml'), 'utf8');
  assert.equal(mode(join(base, 'compose.yml')), '600');
  assert.ok(!/@[A-Z_]+@/.test(compose));
  assert.match(compose, /user: "1234:1234"/);
  assert.match(compose, /- "172\.17\.0\.1:8015:8080"/);
  assert.match(calls(), /^docker compose -f \S+compose\.yml\.new config -q$/m);
  assert.match(calls(), /^docker run --rm --network none -v \S+haproxy\.cfg:\/usr\/local\/etc\/haproxy\/haproxy\.cfg:ro haproxy:3\.2\.26-alpine3\.24@sha256:[0-9a-f]{64} haproxy -c -q -f/m);
  assert.equal(mode(join(base, 'forwarder/haproxy.cfg')), '644');

  // Image and state.
  assert.equal(image('current'), commit);
  assert.equal(readFileSync(join(base, 'state/deployed'), 'utf8').trim(), commit);
  assert.equal(readFileSync(join(state, 'running'), 'utf8').trim(), commit);

  // Updater: the root-owned copy, the timer, the health URL on the bridge address.
  assert.equal(readFileSync(join(base, 'bin/finance-update'), 'utf8'), readFileSync(join(ROOT, 'deploy/update.sh'), 'utf8'));
  assert.equal(readFileSync(join(base, 'updater.conf'), 'utf8'), 'HEALTH_URL=http://172.17.0.1:8015/healthz\n');
  assert.match(calls(), /^systemctl enable --now finance-update\.timer$/m);
  assert.match(readFileSync(join(systemd, 'finance-update.service'), 'utf8'), new RegExp(`^ExecStart=${base}/bin/finance-update$`, 'm'));
  const verify = spawnSync('systemd-analyze', ['verify', join(systemd, 'finance-update.service'), join(systemd, 'finance-update.timer')], { encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr);

  assert.match(r.out, /The app is up and synced with Actual/);
  assert.match(r.out, /Accounts tab: switch off the accounts that aren't yours/);
});

test('install again: keeps the secrets when asked, takes finance out of docker', () => {
  const before = readFileSync(join(base, 'secrets/finance.env'), 'utf8');
  rmSync(join(state, 'hashed-length'));
  const r = run(join(ROOT, 'deploy/install.sh'), ['y'], { STUB_EXTRA_GROUPS: 'docker' });
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(base, 'secrets/finance.env'), 'utf8'), before);
  assert.ok(!existsSync(join(state, 'hashed-length')), 'no new hash');
  assert.match(calls(), /^gpasswd -d finance docker$/m);
  assert.equal((calls().match(/^useradd /gm) ?? []).length, 1, 'user created once');
});

test('install refuses a short app password and mismatched entries, then accepts', () => {
  const r = run(join(ROOT, 'deploy/install.sh'), ['n', ACTUAL_PW, 'typo', ACTUAL_PW, ACTUAL_PW, 'short', APP_PW, APP_PW, 'not a sync id!', SYNC_ID]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /They don't match/);
  assert.match(r.out, /at least 12 characters/);
  assert.match(r.out, /doesn't look like a Sync ID/);
  assert.match(calls(), /^docker compose -f \S+ restart app$/m);
});

const updater = () => join(base, 'bin/finance-update');
const LOG_LINE = /^(update [0-9a-f]{0,12} -> [0-9a-f]{12}|build [0-9a-f]{12}|start [0-9a-f]{12}|up [0-9a-f]{12}( \(rolled back\))?|down [0-9a-f]{12}: [a-z ,;]+( [0-9a-f]{12})?|build failed; still running [0-9a-f]{12}|fetch failed)$/;
const fast = { FINANCE_HEALTH_TRIES: '2', FINANCE_HEALTH_WAIT: '0' };
const clearCalls = () => writeFileSync(join(state, 'calls'), '');

test('updater: nothing new, nothing logged', () => {
  const r = run(updater(), [], fast);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('updater: a new deploy commit is built, started and kept; the old one stays for rollback', () => {
  clearCalls();
  const old = image('current');
  const next = shipCommit('second');
  const r = run(updater(), [], fast);
  assert.equal(r.code, 0, r.out);
  const lines = r.out.trim().split('\n');
  assert.deepEqual(lines.filter((l) => !LOG_LINE.test(l)), [], 'log has commits, steps and up/down only');
  assert.deepEqual(lines.map((l) => l.split(' ')[0]), ['update', 'build', 'start', 'up']);
  assert.equal(image('current'), next);
  assert.equal(image('previous'), old);
  assert.equal(readFileSync(join(base, 'state/deployed'), 'utf8').trim(), next);
  assert.match(calls(), new RegExp(`^docker build -f \\S+/src/deploy/Dockerfile --build-arg FINANCE_COMMIT=${next} -t finance-app:${next} `, 'm'));
  assert.match(calls(), /^docker compose -f \S+\/compose\.yml up -d --no-deps --force-recreate app$/m);
  // The updater never rewrites the compose file, the forwarder, the secrets or the networks.
  assert.doesNotMatch(calls(), /^docker (network|compose \S+ \S+ down)/m);
});

test('updater: an unhealthy commit is rolled back and not retried', () => {
  clearCalls();
  const good = image('current');
  const bad = shipCommit('third, broken');
  const r = run(updater(), [], { ...fast, STUB_BAD_COMMIT: bad });
  assert.equal(r.code, 1);
  const lines = r.out.trim().split('\n');
  assert.deepEqual(lines.filter((l) => !LOG_LINE.test(l)), []);
  assert.match(r.out, /^down [0-9a-f]{12}: not healthy; rolling back to [0-9a-f]{12}$/m);
  assert.match(r.out, /^up [0-9a-f]{12} \(rolled back\)$/m);
  assert.equal(image('current'), good);
  assert.equal(readFileSync(join(state, 'running'), 'utf8').trim(), good);
  assert.equal(readFileSync(join(base, 'state/deployed'), 'utf8').trim(), good);
  assert.equal(readFileSync(join(base, 'state/failed'), 'utf8').trim(), bad);
  // The next run leaves it alone until deploy moves again.
  const again = run(updater(), [], { ...fast, STUB_BAD_COMMIT: bad });
  assert.equal(again.code, 0);
  assert.equal(again.out, '');
});

test('updater: a failed build changes nothing', () => {
  const good = image('current');
  shipCommit('fourth, does not build');
  const r = run(updater(), [], { ...fast, STUB_BUILD_FAIL: '1' });
  assert.equal(r.code, 1);
  assert.match(r.out, /^build failed; still running [0-9a-f]{12}$/m);
  assert.equal(image('current'), good);
  assert.equal(readFileSync(join(state, 'running'), 'utf8').trim(), good);
});

test('uninstall: removes the app, timer and user; keeps /opt/finance unless told yes', () => {
  let r = run(join(ROOT, 'deploy/uninstall.sh'), ['no']);
  assert.equal(r.code, 0, r.out);
  assert.match(calls(), /^systemctl disable --now finance-update\.timer$/m);
  assert.match(calls(), /^docker compose -f \S+\/compose\.yml down --remove-orphans$/m);
  assert.match(calls(), /^userdel finance$/m);
  assert.ok(!existsSync(join(systemd, 'finance-update.timer')));
  assert.ok(existsSync(base), 'kept');
  r = run(join(ROOT, 'deploy/uninstall.sh'), ['yes']);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(base), 'deleted');
  assert.match(r.out, /Deploy keys > delete/);
});

test('compose: the app is only on the internal network, locked down; only the forwarder publishes', () => {
  const c = readFileSync(join(ROOT, 'deploy/compose.yml'), 'utf8');
  const app = c.split(/^  forwarder:$/m)[0]!.split(/^  app:$/m)[1]!;
  const fwd = c.split(/^  forwarder:$/m)[1]!.split(/^networks:$/m)[0]!;
  const nets = c.split(/^networks:$/m)[1]!;
  assert.match(nets, /^  inside:\n    internal: true$/m);
  assert.match(app, /networks:\n      - inside\n    logging/);
  assert.doesNotMatch(app, /ports:|extra_hosts|network_mode|privileged|cap_add|docker\.sock/);
  for (const part of [app, fwd]) {
    assert.match(part, /read_only: true/);
    assert.match(part, /cap_drop:\n      - ALL/);
    assert.match(part, /no-new-privileges:true/);
    assert.match(part, /logging: \*logging/);
  }
  assert.match(app, /user: "@UID@:@GID@"/);
  assert.match(app, /TZ: America\/New_York/);
  assert.match(app, /secrets\/finance\.env:\/run\/secrets\/finance\.env:ro/);
  assert.match(fwd, /image: haproxy:[\d.]+-alpine[\d.]+@sha256:[0-9a-f]{64}/);
  assert.match(fwd, /ports:\n(?:\s+#.*\n)*\s+- "@BRIDGE_IP@:@PORT@:8080"/);
  assert.match(c, /cache-disabled: "true"/);
  // Forwarder: no logs, two forwards only.
  const h = readFileSync(join(ROOT, 'deploy/haproxy.cfg'), 'utf8').replace(/#.*$/gm, '');
  assert.doesNotMatch(h, /^\s*log\b/m);
  assert.deepEqual([...h.matchAll(/^\s*bind (\S+)/gm)].map((m) => m[1]), [':8080', ':5006']);
  assert.deepEqual([...h.matchAll(/^\s*server \S+ (\S+)/gm)].map((m) => m[1]), ['app:8080', 'host.docker.internal:5006']);
});

test('shellcheck: the deploy scripts are clean', (t) => {
  const bin = process.env.SHELLCHECK || 'shellcheck';
  if (spawnSync(bin, ['--version']).status !== 0) return t.skip('shellcheck not installed (set SHELLCHECK=/path/to/shellcheck)');
  const scripts = ['bootstrap.sh', 'install.sh', 'update.sh', 'uninstall.sh', 'paste.sh'].map((f) => join(ROOT, 'deploy', f));
  const r = spawnSync(bin, ['-x', ...scripts], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});
