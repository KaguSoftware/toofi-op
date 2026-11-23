import { useQuery } from '@tanstack/react-query';
import { appRpc } from '../../lib/appRpc';
import { QK } from '../../lib/queryKeys';
import type { DateRange } from './manageLogic';
import { parseAttention } from './reportsLogic';

/** One analytics function over the chosen range. Disabled while the range is invalid. */
export function useReport<T>(fn: string, range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: QK.manage('analytics', fn, range.from, range.to),
    enabled,
    queryFn: () => appRpc<T>(fn as never, { p_from: range.from, p_to: range.to }),
  });
}

/** What needs the owner now. It does not depend on the range. */
export function useAttention() {
  return useQuery({
    queryKey: QK.manage('analytics', 'attention'),
    queryFn: async () => parseAttention(await appRpc<unknown>('analytics_attention' as never, {})),
  });
}
