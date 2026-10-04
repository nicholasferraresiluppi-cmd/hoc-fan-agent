/**
 * /api/hr/modulo/[token] — modulo pubblico "i miei dati" (Centro HR, 29/09/2026).
 *
 * GET  → contesto per /hr/modulo/[token]: stato del link, valori già noti
 *        (MAI il codice fiscale: solo "già inserito sì/no"), opzioni.
 *        Col link CONDIVISO (03/10/2026) mai dati di persone: niente prefill.
 * POST → invio del modulo { data, consent: true }.
 *        Link personale: monouso, dopo l'invio resta aperto solo per i file (1 ora).
 *        Link condiviso: ogni invio crea una scheda nuova e il link resta aperto;
 *        la risposta porta `uploadToken` (token figlio, 1 ora) per i file.
 *
 * Nessuna auth Clerk: il token (24 byte casuali) È l'auth, come
 * /api/candidate/[token]. Difesa qui e in lib/hr-people (validità, scadenza,
 * stato); tetto di richieste per token e per IP (lib/rate-limit). Il link
 * condiviso lo usano tutti: tetto per token più largo (`hr_form_shared`) e
 * tetto giornaliero di INVII in lib/hr-people (`hr_form_shared_submit`).
 *
 * 03/10/2026 (300 persone, anche tutte insieme): l'invio salva la scheda e
 * risponde SUBITO; la scrittura su ClickUp (creazione del task) avviene dopo la
 * risposta con `after()`, insieme a una piccola ripresa delle scritture e dei
 * file rimasti in sospeso. Sotto un picco i 429 di ClickUp non fanno aspettare
 * la persona e il salvataggio in app non fallisce mai per ClickUp.
 */
import { after } from "next/server";
import { getFormContext, submitForm, isSharedFormToken, pushPersonSafe, getPerson } from "@/lib/hr-people";
import { formSubmitted } from "@/lib/hr-form-notify";
import { drainHrBackground } from "@/lib/hr-uploads";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300; // copia di file fino a 50 MB verso ClickUp (in after()): margine ampio

function ipOf(request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";
}

async function limited(request, token) {
  const b = await checkRateLimit("hr_form_ip", ipOf(request));
  if (!b.ok) return tooMany(b.retryAfter);
  const shared = await isSharedFormToken(token).catch(() => false);
  const a = await checkRateLimit(shared ? "hr_form_shared" : "hr_form", String(token || "").slice(0, 64));
  if (!a.ok) return tooMany(a.retryAfter);
  return null;
}

export async function GET(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  const ctx = await getFormContext(token);
  if (!ctx.ok) return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  return Response.json(ctx, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
  }
  const res = await submitForm(token, body || {}, { deferSync: true });
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: res.status });
  const { personId, ...out } = res; // l'id della scheda non esce verso il browser
  after(async () => {
    try {
      const p = personId ? await getPerson(personId) : null;
      // avviso WhatsApp a Nicholas: col passo documenti parte quando arriva il documento
      // (o dopo 45 minuti senza), non all'invio dei dati (lib/hr-form-notify, mai bloccante)
      if (p) await formSubmitted(p.id, { waitForDocument: Boolean(out.uploadsEnabled) }).catch(() => {});
      if (p) await pushPersonSafe(p, p.clickupTaskId ? p.pendingKeys || [] : null, { actor: "modulo" });
    } catch { /* resta in hr:sync:retry: la riprende il giro dopo o la notte */ }
    await drainHrBackground({ budgetMs: 8000 }).catch(() => {});
  });
  return Response.json(out);
}
