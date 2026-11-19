/**
 * Runs the RPC role matrix (rls-matrix.ts) as every staff role, a signed-in user
 * with no staff row, and anon. Needs no changes when entries are appended.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STAFF_ROLES, type StaffRole } from '@rop/core';
import {
  anonClient,
  appRpc,
  cleanupStaff,
  createOutsider,
  createStaffOfRole,
  isForbidden,
  isPermissionDenied,
  stackAvailable,
} from './helpers';
import { RPC_MATRIX } from './rls-matrix';

const up = await stackAvailable();

describe.skipIf(!up)('RPC role matrix', () => {
  const clients = {} as Record<StaffRole | 'outsider' | 'anon', SupabaseClient>;

  beforeAll(async () => {
    for (const role of STAFF_ROLES) clients[role] = (await createStaffOfRole(role)).client;
    clients.outsider = (await createOutsider()).client;
    clients.anon = anonClient();
  });

  afterAll(cleanupStaff);

  for (const rule of RPC_MATRIX) {
    describe(`app.${rule.fn}`, () => {
      for (const principal of [...STAFF_ROLES, 'outsider', 'anon'] as const) {
        const allowed = (rule.allow as readonly string[]).includes(principal);
        it(`${principal}: ${allowed ? 'passes the guard' : 'refused'}`, async () => {
          const { error } = await appRpc(clients[principal], rule.fn, rule.args);
          const refused = isForbidden(error) || isPermissionDenied(error);
          if (allowed) {
            expect(refused, `${principal} was refused: ${error?.message}`).toBe(false);
            // The function must exist: PGRST202 means a typo in the matrix.
            expect(error?.code, error?.message).not.toBe('PGRST202');
          } else {
            expect(refused, `${principal} got: ${error ? error.message : 'success'}`).toBe(true);
          }
        });
      }
    });
  }
});
