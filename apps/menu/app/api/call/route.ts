import type { NextRequest, NextResponse } from 'next/server';
import { guestRpc } from '@/lib/server/guestRpc';
import { fail, guard, ok, readJson, sessionOf } from '@/lib/server/respond';
import { parseCallBody } from '@/lib/requestLogic';
import { withoutSecrets } from '@/lib/sessionLogic';

/** POST /api/call {reason, key} → app.raise_waiter_call. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = parseCallBody(await readJson(req));
  if (!body) return fail('INVALID_ARGUMENT');
  const sessionId = sessionOf(req);
  if (!sessionId) return fail('SESSION_EXPIRED');

  const answer = await guestRpc('raise_waiter_call', { p_session_id: sessionId, p_reason: body.reason, p_idempotency_key: body.key });
  return answer.ok ? ok(withoutSecrets(answer.data)) : fail(answer.code);
}
