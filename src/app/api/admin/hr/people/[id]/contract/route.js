/**
 * /api/admin/hr/people/[id]/contract — preparazione e invio del contratto (SEED, 10/10/2026).
 *
 * GET  → contesto della pagina (modello suggerito, condizioni, dati del documento, controlli, cosa manca)
 * POST → { action: "save", templateId, terms }      salva la bozza (cifrata)
 *        { action: "read-id" }                       legge il documento d'identità dal task ClickUp (AI, ~3 cent)
 *        { action: "save-id", idDoc }                corregge a mano i dati del documento
 *        { action: "send", confirmMismatch, testMode } invia in firma su Dropbox Sign
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson } from "@/lib/hr-people";
import { contractContext, saveDraft, sendContract } from "@/lib/hr-contract-drafts";
import { readIdDocument, saveIdDocument, getIdDocument } from "@/lib/hr-id-document";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const ctx = await contractContext(id);
  if (!ctx) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  return Response.json(ctx);
}

const clip = (v, n = 400) => (v == null ? "" : String(v)).slice(0, n);

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  const person = await getPerson(id);
  if (!person) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  try {
    if (body?.action === "save") {
      const t = body.terms || {};
      const terms = {
        mansione: clip(t.mansione, 80), descrizione: clip(t.descrizione, 600), valuta: clip(t.valuta, 3).toUpperCase(), importo: clip(t.importo, 20),
        minimoGarantito: t.minimoGarantito !== false, incentivi: t.incentivi !== false, dispositivi: clip(t.dispositivi, 200), compensoEn: clip(t.compensoEn, 600),
        email: clip(t.email, 200).trim(), gender: ["Male", "Female"].includes(t.gender) ? t.gender : "", data: clip(t.data, 10),
      };
      await saveDraft(id, { templateId: String(body.templateId || ""), terms }, { actor: az.userId });
      return Response.json(await contractContext(id));
    }
    if (body?.action === "read-id") {
      const r = await readIdDocument(person, { actor: az.userId });
      if (!r.ok) return Response.json({ error: r.error, files: r.files || [] }, { status: 422 });
      return Response.json({ ...(await contractContext(id)), readFiles: r.files });
    }
    if (body?.action === "save-id") {
      const d = body.idDoc || {};
      const prev = (await getIdDocument(id)) || {};
      await saveIdDocument(id, { ...prev, type: clip(d.type, 80), number: clip(d.number, 40), issuer: clip(d.issuer, 120), expiry: clip(d.expiry, 10) }, { actor: az.userId, via: "a mano" });
      return Response.json(await contractContext(id));
    }
    if (body?.action === "send") {
      const r = await sendContract(id, { actor: az.userId, confirmMismatch: body.confirmMismatch === true, testMode: body.testMode === true });
      return Response.json(r, { status: r.ok ? 200 : r.status || 400 });
    }
  } catch (e) {
    return Response.json({ error: e?.message || "Errore." }, { status: 502 });
  }
  return Response.json({ error: "Azione sconosciuta." }, { status: 400 });
}
