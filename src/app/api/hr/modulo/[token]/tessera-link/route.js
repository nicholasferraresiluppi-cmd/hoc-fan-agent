/**
 * POST /api/hr/modulo/{token}/tessera-link → { ok, path: "/t/{id}" }
 * Pubblica, si difende da sé: vale solo un token che porta a una scheda (link
 * personale o token figlio dato all'invio dal link condiviso), con tetto per token.
 * Il link si costruisce dai dati SALVATI della scheda, mai da quelli del browser.
 */
import { getFormRecord, getPerson } from "@/lib/hr-people";
import { upsertTesseraLink } from "@/lib/hr-tessera-link";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request, props) {
  const { token } = await props.params;
  const rl = await checkRateLimit("hr_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);
  const rec = await getFormRecord(token).catch(() => null);
  if (!rec?.personId || rec.disabledAt) return Response.json({ ok: false, error: "Link non disponibile." }, { status: 404 });
  const person = await getPerson(rec.personId).catch(() => null);
  if (!person || person.archived) return Response.json({ ok: false, error: "Link non disponibile." }, { status: 404 });
  const id = await upsertTesseraLink(person.id, person.fields || {});
  return Response.json({ ok: true, path: `/t/${id}` }, { headers: { "Cache-Control": "no-store" } });
}
