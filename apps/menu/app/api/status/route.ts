import type { NextRequest, NextResponse } from 'next/server';
import { guestRpc } from '@/lib/server/guestRpc';
import { fail, guard, ok, sessionOf } from '@/lib/server/respond';
import { withoutSecrets } from '@/lib/sessionLogic';

/** GET /api/status → app.guest_status: the table, the switches, the call and this phone's orders. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const sessionId = sessionOf(req);
  if (!sessionId) return fail('SESSION_EXPIRED');

  const answer = await guestRpc('guest_status', { p_session_id: sessionId });
  // server_now lets the phone count down on the server's clock, not its own.
  return answer.ok ? ok({ ...(withoutSecrets(answer.data) as object), server_now: new Date().toISOString() }) : fail(answer.code);
}
