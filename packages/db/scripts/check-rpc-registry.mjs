#!/usr/bin/env node
/**
 * check-rpc-registry: every client-callable function is classified.
 *
 * The client-callable surface is `grant execute on function app.X(...) to
 * authenticated` in the migrations. GRANT, REVOKE and DROP FUNCTION are replayed
 * in migration order, so the result is the final grant state.
 *
 *   FAIL  a function granted to authenticated that is in neither
 *         tests/rls-matrix.ts (`fn: 'X'`) nor fixtures/rpc-allowlist.json;
 *   FAIL  an allowlist entry without a reason of at least 10 characters;
 *   FAIL  a matrix or allowlist entry naming a function that is not granted
 *         (a typo, or a function since revoked or dropped);
 *   FAIL  a function granted to anon (or to public, which anon inherits) that is
 *         not in fixtures/rpc-public.json with a reason of at least 10 characters,
 *         and a public-list entry that is not granted to anon. Anon is the guest QR
 *         menu's surface (no staff login), so it must stay an explicit, short list.
 *
 * Stackless. Usage: node scripts/check-rpc-registry.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DB = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = path.join(DB, 'supabase/migrations');
const MATRIX = path.join(DB, 'tests/rls-matrix.ts');
const ALLOWLIST = path.join(DB, 'fixtures/rpc-allowlist.json');
const PUBLIC_LIST = path.join(DB, 'fixtures/rpc-public.json');

const GRANT = /grant\s+execute\s+on\s+function\s+app\.([a-z0-9_]+)\s*\([^)]*\)\s*to\s+([a-z_,\s]+);/gi;
const REVOKE =
  /revoke\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+app\.([a-z0-9_]+)\s*\([^)]*\)\s*from\s+([a-z_,\s]+);/gi;
const DROP = /drop\s+function\s+(?:if\s+exists\s+)?app\.([a-z0-9_]+)\s*\(/gi;

const roleList = (txt) =>
  txt
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

/** Strip `--` line comments so commented-out SQL is not read as a grant. */
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

const grantedTo = new Map();
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = stripComments(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  const events = [];
  for (const m of sql.matchAll(GRANT)) events.push({ at: m.index, op: 'grant', name: m[1], roles: roleList(m[2]) });
  for (const m of sql.matchAll(REVOKE)) events.push({ at: m.index, op: 'revoke', name: m[1], roles: roleList(m[2]) });
  for (const m of sql.matchAll(DROP)) events.push({ at: m.index, op: 'drop', name: m[1], roles: [] });
  events.sort((a, b) => a.at - b.at);
  for (const e of events) {
    const name = e.name.toLowerCase();
    if (e.op === 'drop') {
      grantedTo.delete(name);
      continue;
    }
    if (!grantedTo.has(name)) grantedTo.set(name, new Set());
    const roles = grantedTo.get(name);
    for (const r of e.roles) {
      if (e.op === 'grant') roles.add(r);
      else roles.delete(r);
    }
  }
}

const exposed = new Set([...grantedTo].filter(([, roles]) => roles.has('authenticated') || roles.has('public')).map(([n]) => n));
const matrix = new Set(
  [...stripComments(readFileSync(MATRIX, 'utf8')).matchAll(/\bfn:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]),
);
const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8')).allowlist ?? {};

const failures = [];
for (const fn of [...exposed].sort()) {
  if (!matrix.has(fn) && !(fn in allowlist)) {
    failures.push(`app.${fn} is granted to authenticated but is in neither tests/rls-matrix.ts nor fixtures/rpc-allowlist.json`);
  }
}
for (const [fn, reason] of Object.entries(allowlist)) {
  if (typeof reason !== 'string' || reason.trim().length < 10) {
    failures.push(`fixtures/rpc-allowlist.json: app.${fn} needs a reason of at least 10 characters`);
  }
  if (!exposed.has(fn)) failures.push(`fixtures/rpc-allowlist.json lists app.${fn}, which is not granted to authenticated`);
}
for (const fn of matrix) {
  if (!exposed.has(fn)) failures.push(`tests/rls-matrix.ts lists app.${fn}, which is not granted to authenticated`);
}

const anonExposed = new Set([...grantedTo].filter(([, roles]) => roles.has('anon') || roles.has('public')).map(([n]) => n));
const publicList = JSON.parse(readFileSync(PUBLIC_LIST, 'utf8')).public ?? {};
for (const fn of [...anonExposed].sort()) {
  if (!(fn in publicList)) failures.push(`app.${fn} is granted to anon but is not in fixtures/rpc-public.json`);
}
for (const [fn, reason] of Object.entries(publicList)) {
  if (typeof reason !== 'string' || reason.trim().length < 10) {
    failures.push(`fixtures/rpc-public.json: app.${fn} needs a reason of at least 10 characters`);
  }
  if (!anonExposed.has(fn)) failures.push(`fixtures/rpc-public.json lists app.${fn}, which is not granted to anon`);
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  process.exit(1);
}

console.log(
  `ok  ${exposed.size} functions granted to authenticated: ${matrix.size} in the RLS matrix, ${Object.keys(allowlist).length} allowlisted; ${anonExposed.size} granted to anon, all in rpc-public.json`,
);
