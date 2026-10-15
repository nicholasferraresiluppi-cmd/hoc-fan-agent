/**
 * /api/contabilita/tasso?m=YYYY-MM — tasso dollaro→euro SUGGERITO: media dei
 * fixing BCE del mese (api.frankfurter.app, dati ufficiali BCE, nessuna chiave).
 * È solo un suggerimento: il tasso che vale è quello salvato nel mese (il foglio
 * usava a volte un tasso fisso, es. 0,85).
 */
import { requireAccounting } from "@/lib/compensi-access";
import { isMonthId } from "@/lib/compensi-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET(request) {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const m = new URL(request.url).searchParams.get("m");
  if (!isMonthId(m)) return Response.json({ error: "mese non valido" }, { status: 400, headers: NS });
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);
  const end = `${m}-${String(last).padStart(2, "0")}`;
  const url = `https://api.frankfurter.app/${m}-01..${end < today ? end : today}?from=USD&to=EUR`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`BCE ${r.status}`);
    const j = await r.json();
    const vals = Object.values(j.rates || {}).map((x) => x.EUR).filter((v) => v > 0);
    if (!vals.length) return Response.json({ error: "Nessun fixing BCE per questo mese (ancora)." }, { status: 404, headers: NS });
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Response.json({ rate: Math.round(avg * 10000) / 10000, days: vals.length, source: `media BCE ${m} (${vals.length} giorni)` }, { headers: NS });
  } catch (e) {
    return Response.json({ error: `Tasso BCE non raggiungibile: ${e.message}` }, { status: 502, headers: NS });
  }
}
