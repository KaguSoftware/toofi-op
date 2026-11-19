#!/usr/bin/env node
/**
 * check-error-codes: every error code a migration raises has words in both
 * languages, so nobody ever reads "Something went wrong" for a known refusal.
 *
 * A code is `raise exception 'CODE'` in any migration. It is covered when it is a
 * key of ERROR_CODE_KEYS in packages/i18n/src/errors.ts (which holds its EN and AR
 * line; typecheck enforces both). FAILS on any raised code missing there.
 *
 * Stackless and dependency-free: the catalogue is read as text, so this runs on
 * any Node 22 without TypeScript support.
 *
 * Usage: node scripts/check-error-codes.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DB = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = path.join(DB, 'supabase/migrations');
const ERRORS_TS = path.resolve(DB, '../i18n/src/errors.ts');

/** Codes raised by migrations, with the files that raise each. */
function raisedCodes() {
  const codes = new Map();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const m of sql.matchAll(/raise\s+exception\s+'([A-Z][A-Z0-9_]+)'/gi)) {
      if (!codes.has(m[1])) codes.set(m[1], new Set());
      codes.get(m[1]).add(file);
    }
  }
  return codes;
}

/** The keys of the ERROR_CODE_KEYS object literal. */
function catalogueCodes() {
  const src = readFileSync(ERRORS_TS, 'utf8');
  const start = src.indexOf('export const ERROR_CODE_KEYS = {');
  const end = src.indexOf('} as const satisfies', start);
  if (start < 0 || end < 0) {
    console.error(`FAIL  could not find the ERROR_CODE_KEYS object in ${ERRORS_TS}`);
    process.exit(1);
  }
  const body = src.slice(start, end);
  return new Set([...body.matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*\{/gm)].map((m) => m[1]));
}

const raised = raisedCodes();
const catalogue = catalogueCodes();
const missing = [...raised.keys()].filter((c) => !catalogue.has(c)).sort();

if (missing.length) {
  console.error('FAIL  codes raised by migrations but missing from ERROR_CODE_KEYS');
  console.error('      (packages/i18n/src/errors.ts; add each with its en and ar line):');
  for (const code of missing) console.error(`        ${code}  (${[...raised.get(code)].join(', ')})`);
  process.exit(1);
}

console.log(
  `ok  ${raised.size} raised codes, all in ERROR_CODE_KEYS (${catalogue.size} codes in the catalogue)`,
);
