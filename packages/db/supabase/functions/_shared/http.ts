/**
 * HTTP helpers shared by edge functions (ported minimally from the reference).
 * Callers never see raw database or exception text: it goes to the log only.
 */

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/** A plain JSON error: { error: CODE } with an optional detail. */
export function errorResponse(code: string, status: number, detail?: string): Response {
  return json(detail === undefined ? { error: code } : { error: code, detail }, status);
}

export function logError(where: string, err: unknown): void {
  const text = err instanceof Error ? err.message : JSON.stringify(err);
  console.error(`[${where}]`, text);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** The body as a JSON object, capped at maxBytes; null when it is not one. */
export async function readJsonBody(req: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (raw.length > maxBytes) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Wraps a Deno.serve handler: CORS preflight, and a throw becomes a JSON 500. */
export function handle(name: string, fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      return await fn(req);
    } catch (err) {
      logError(name, err);
      return errorResponse('INTERNAL', 500);
    }
  };
}
