// Radar creator — segnalazione dal Comando rapido dell'iPhone (10/10/2026).
// ROUTE PUBBLICA (vedi middleware): si difende da sola col token personale che l'admin
// genera nel Radar (salvato solo come hash sha256 in scouting:tokens) + tetto d'uso.
// Accetta solo un link; dice soltanto se l'account era già nel radar (21/10/2026), nessun altro dato.
import { after } from "next/server";
import { ownerOfToken, queueSignal } from "@/lib/scouting-signal";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";
import { hashToken } from "@/lib/scouting-signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const body = await request.json().catch(() => ({}));
  const token = auth.replace(/^Bearer\s+/i, "").trim() || String(body.token || "");
  const owner = await ownerOfToken(token);
  if (!owner) return Response.json({ ok: false, message: "Chiave non valida: rigenerala nel Radar." }, { status: 401 });
  const rl = await checkRateLimit("scouting_signal", `tok:${hashToken(token).slice(0, 16)}`);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const text = String(body.url || body.text || "").trim();
  if (!text) return Response.json({ ok: false, message: "Nessun link ricevuto." }, { status: 400 });
  const { item, work } = await queueSignal({ text, why: body.why, by: owner.name || null, via: "iphone" });
  after(work);
  const h = item.pre?.h;
  const k = item.pre?.known;
  const message = !h ? "Ricevuta: il Radar la sta leggendo."
    : !k ? `@${h} è nuova: la leggo adesso.`
    : k.how === "segnalata" ? `@${h} era già nel radar (segnalata${k.by ? ` da ${k.by}` : ""}): la ricontrollo adesso.`
    : `@${h} l'aveva già trovata il radar: la ricontrollo adesso.`;
  return Response.json({ ok: true, message });
}
