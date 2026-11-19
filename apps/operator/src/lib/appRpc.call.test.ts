import { describe, expect, it, vi } from 'vitest';

// A client whose rpc needs its receiver, like supabase-js's PostgrestClient.
const calls: unknown[] = [];
vi.mock('./supabase', () => ({
  supabase: {
    schema: () => ({
      url: 'http://stack',
      rpc(this: { url: string }, fn: string, args: unknown) {
        calls.push([this.url, fn, args]);
        return Promise.resolve({ data: { ok: true }, error: null });
      },
    }),
  },
}));

import { appRpc } from './appRpc';

describe('appRpc', () => {
  it('calls rpc on the schema client so it keeps its receiver', async () => {
    await expect(appRpc('open_day')).resolves.toEqual({ ok: true });
    expect(calls).toEqual([['http://stack', 'open_day', {}]]);
  });
});
