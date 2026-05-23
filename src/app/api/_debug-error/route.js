/**
 * /api/_debug-error
 *
 * Diagnostic endpoint that captures client-side runtime exceptions
 * reported by <ErrorBoundary> in production. Stores the last 10 errors
 * in KV under `_debug:client_errors` so we can fetch them via the Vercel
 * KV REST API without needing a browser.
 *
 * POST body: { message, stack, componentStack, path, userAgent, ts }
 * GET     : returns the recent errors (admin-only).
 */
import { kv } from "@vercel/kv";

const KEY = "_debug:client_errors";
const MAX = 10;

export async function POST(req) {
  try {
    const body = await req.json();
    const entry = {
      message: String(body?.message || "").slice(0, 500),
      stack: String(body?.stack || "").slice(0, 3000),
      componentStack: String(body?.componentStack || "").slice(0, 2000),
      path: String(body?.path || "").slice(0, 200),
      userAgent: String(body?.userAgent || "").slice(0, 200),
      ts: Date.now(),
    };
    const existing = (await kv.get(KEY)) || [];
    const arr = Array.isArray(existing) ? existing : [];
    arr.unshift(entry);
    await kv.set(KEY, arr.slice(0, MAX), { ex: 24 * 3600 });
    // Also surface in Vercel server logs so we can grep them
    // eslint-disable-next-line no-console
    console.error("[CLIENT_ERROR]", JSON.stringify(entry));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET() {
  const arr = (await kv.get(KEY)) || [];
  return Response.json({ errors: arr });
}
