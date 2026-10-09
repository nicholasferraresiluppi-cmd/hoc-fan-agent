// Radar creator — modifiche al CRM (SEED). Body: { action, ... }
//   stage   { id, stage }            fase del percorso
//   note    { id, text }             nota sulla scheda
//   field   { id, field, value }     nome della scheda o chi la segue
//   link    { target, handle }       collega l'account `handle` alla creator di `target`
//   unlink  { handle }               stacca l'account dalla sua creator
//   dismiss { a, b }                 "non sono la stessa creator": la proposta non torna
//   forget  { handle }               cancellazione su richiesta: via da archivio e CRM, il giro non la riaggiunge
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProfiles, saveProfiles, getCrm, saveCrm, addForgotten } from "@/lib/scouting-store";
import { setStage, addNote, setField, linkHandles, unlinkHandle, dismissSuggestion, forgetHandle, normHandle } from "@/lib/scouting-core";

export const runtime = "nodejs";

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }
  const by = String(body.by || "").slice(0, 80) || az.userId;
  try {
    let crm = await getCrm();
    switch (body.action) {
      case "stage": crm = setStage(crm, String(body.id), String(body.stage), by); break;
      case "note": crm = addNote(crm, String(body.id), body.text, by); break;
      case "field": crm = setField(crm, String(body.id), String(body.field), body.value); break;
      case "link": crm = linkHandles(crm, normHandle(body.target), normHandle(body.handle)); break;
      case "unlink": crm = unlinkHandle(crm, normHandle(body.handle)); break;
      case "dismiss": crm = dismissSuggestion(crm, normHandle(body.a), normHandle(body.b)); break;
      case "forget": {
        const h = normHandle(body.handle);
        if (!h) throw new Error("account mancante");
        crm = forgetHandle(crm, h);
        const profiles = await getProfiles();
        await saveProfiles(profiles.filter((p) => p.h !== h));
        await addForgotten(h);
        break;
      }
      default: return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    }
    await saveCrm(crm);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 400 });
  }
}
