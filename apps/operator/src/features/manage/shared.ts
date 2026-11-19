// Small helpers shared by the manage and stock screens: a loose table reader and a
// write runner that toasts and refetches.
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@rop/i18n';
import { useToast } from '../../components';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

interface Query {
  select: (cols: string) => Query;
  order: (col: string, o?: { ascending: boolean }) => Query;
  limit: (n: number) => Query;
  eq: (col: string, v: unknown) => Query;
  then: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>['then'];
}

/** Read rows of a table or view (RLS select policies apply). Throws the PostgREST error. */
export async function selectRows<T>(
  table: string,
  columns: string,
  opts: { order?: string; desc?: boolean; limit?: number; eq?: [string, unknown] } = {},
): Promise<T[]> {
  let q = (supabase as unknown as { from: (t: string) => Query }).from(table).select(columns);
  if (opts.eq) q = q.eq(opts.eq[0], opts.eq[1]);
  if (opts.order) q = q.order(opts.order, { ascending: !opts.desc });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export type RunResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * run(fn, okKey): awaits a write, toasts success or the translated error, refetches the
 * given query-key prefixes. `quiet` skips the error toast so a screen can show its own.
 */
export function useRun(invalidate: readonly string[]) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okKey?: MessageKey, opts: { quiet?: boolean } = {}): Promise<RunResult<T>> => {
      setBusy(true);
      try {
        const value = await fn();
        if (okKey) toast(tr(okKey), 'success');
        for (const k of invalidate) void qc.invalidateQueries({ queryKey: [k] });
        return { ok: true, value };
      } catch (error) {
        if (!opts.quiet) toast(errorMessage(error, locale), 'error');
        return { ok: false, error };
      } finally {
        setBusy(false);
      }
    },
    // invalidate is a stable literal at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tr, locale, toast, qc, invalidate.join('|')],
  );
  return { busy, run };
}

/** Download text as a file (CSV export). */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorCodeOf(err: unknown): string | null {
  return err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : null;
}
