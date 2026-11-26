import type { NextRequest, NextResponse } from 'next/server';
import { guestRpc } from '@/lib/server/guestRpc';
import { fail, guard, ok, readJson, sessionOf } from '@/lib/server/respond';
import { parseOrderBody } from '@/lib/requestLogic';
import { withoutSecrets } from '@/lib/sessionLogic';

/** POST /api/order {items, key} → app.send_guest_order. Items carry ids, quantities, modifier ids and a note; never a price. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = parseOrderBody(await readJson(req));
  if (!body) return fail('INVALID_ARGUMENT');
  const sessionId = sessionOf(req);
  if (!sessionId) return fail('SESSION_EXPIRED');

  const answer = await guestRpc('send_guest_order', { p_session_id: sessionId, p_items: body.items, p_idempotency_key: body.key });
  return answer.ok ? ok(withoutSecrets(answer.data)) : fail(answer.code);
}
