// Controllo di raggiungibilità (usato dal monitor esterno ogni 5 minuti).
// Pubblica per costruzione: non restituisce dati, solo se l'app e il database rispondono.
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  let db = false;
  try { await kv.get("cron:heartbeat:dispatch"); db = true; } catch {}
  return Response.json({ ok: db, db, ms: Date.now() - t0 }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
