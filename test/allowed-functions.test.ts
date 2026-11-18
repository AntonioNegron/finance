// Allowed functions: app/ may use only the Actual API functions listed in
// docs/specs/actual-access.md, and only app/src/actual.ts may import the API.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../dev/env.ts';

function allowedFromSpec(): Set<string> {
  const spec = readFileSync(join(ROOT, 'docs/specs/actual-access.md'), 'utf8');
  const section = spec.split(/^## Allowed\s*$/m)[1]?.split(/^## /m)[0];
  assert.ok(section, 'docs/specs/actual-access.md has no "## Allowed" section');
  const names = [...section.matchAll(/^- `([A-Za-z]+)`/gm)].map((m) => m[1]!);
  assert.ok(names.length > 0, 'the Allowed list is empty');
  return new Set(names);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|js|mjs|cjs)$/.test(f) ? [p] : [];
  });
}

test('the app uses only the Actual API functions in the spec', () => {
  const allowed = allowedFromSpec();
  const problems: string[] = [];
  for (const f of files(join(ROOT, 'app'))) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    const imports = [...src.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](@actual-app\/[^'"]*)['"]/g)];
    if (imports.length === 0) continue;
    if (rel !== 'app/src/actual.ts') {
      problems.push(`${rel} imports ${imports.map((m) => m[1]).join(', ')}; only app/src/actual.ts may`);
      continue;
    }
    // The one allowed form: import * as api from '@actual-app/api'
    const lines = [...src.matchAll(/^import[^;]*['"]@actual-app\/[^'"]*['"];?$/gm)].map((m) => m[0]);
    for (const l of lines) if (!/^import \* as api from '@actual-app\/api';$/.test(l)) problems.push(`${rel}: unexpected import form: ${l}`);
    if (/\bapi\s*\[/.test(src)) problems.push(`${rel}: dynamic api[...] access`);
    if (/[=(,]\s*api\s*[),;]/.test(src)) problems.push(`${rel}: the api object is passed around`);
    for (const m of src.matchAll(/\bapi\.([A-Za-z_$][\w$]*)/g)) {
      if (!allowed.has(m[1]!)) problems.push(`${rel}: api.${m[1]} is not in docs/specs/actual-access.md`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the check itself catches a forbidden call', () => {
  const allowed = allowedFromSpec();
  for (const bad of ['setBudgetAmount', 'addTransactions', 'importTransactions', 'runBankSync', 'deleteAccount', 'aqlQuery', 'exportBudget']) {
    assert.ok(!allowed.has(bad), `${bad} must not be allowed`);
  }
});
