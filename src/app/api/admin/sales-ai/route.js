/**
 * /api/admin/sales-ai — Quartier generale del sales manager AI.
 *
 * GET  ?day=YYYY-MM-DD           → configurazione, notte (uffici, log), feedback del giorno, spesa, eventi
 * GET  ?day=…&key=…              → dettaglio di un feedback: report dei due manager, arbitro, Garante, momenti
 * POST {action:"review", day, key, decision:"approva"|"blocca"|"modifica", message?, note?}
 * POST {action:"config", …}      → solo admin (creator pilota, visibilità agli operatori, tetto di spesa)
 *
 * Gate: dati di vendita di tutta la creator → authorizeAllCreators(SCORES_VIEW)
 * (admin e sales manager con vista su tutte le creator). La configurazione e
 * l'avvio a mano sono SEED (admin). Il feedback NON entra in score/comp: è
 * coaching, rivisto da una persona prima di arrivare all'operatore.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { authorizeAllCreators } from "@/lib/creator-scope";
import * as S from "@/lib/sales-ai/store";
import { LEVERS, METRICS, fmtMetric, romeToday, guard, renderMessage } from "@/lib/sales-ai/core";
import { romeYesterday } from "@/lib/sales-ai/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFICES = [
  { id: "dati", nome: "Ufficio dati", ruolo: "Raccoglie chat, vendite e turni della notte; toglie invii di massa e benvenuti", tipo: "codice" },
  { id: "smistamento", nome: "Smistamento", ruolo: "Decide chi analizzare stanotte, entro il tetto di spesa", tipo: "codice" },
  { id: "analisi", nome: "Analisi", ruolo: "Due manager AI: uno legge la qualità delle chat, l'altro i numeri", tipo: "AI" },
  { id: "garante", nome: "Garante", ruolo: "Blocca citazioni inventate, consigli vietati, numeri non nei dati, leve non provate", tipo: "codice" },
  { id: "consegne", nome: "Consegne", ruolo: "L'arbitro-coach scrive il feedback; i numeri li mette il codice", tipo: "AI" },
  { id: "valutazione", nome: "Valutazione", ruolo: "Riscontro sull'impegno del giorno prima, voti utile/non utile, errori della notte", tipo: "codice" },
  { id: "direzione", nome: "Direzione", ruolo: "Sales manager e admin: approvano, correggono, bloccano", tipo: "persone" },
];

function summary(fb, reply) {
  return {
    key: null, operator: fb.operator, creator_id: fb.creator_id, status: fb.status,
    leva: fb.arbiter?.regola?.leva || null, leva_titolo: LEVERS[fb.arbiter?.regola?.leva]?.titolo || null,
    confidenza: fb.arbiter?.confidenza || null, problemi: fb.guard?.problems || [],
    reviewed_by: fb.reviewed_by || null, reply: reply ? { commitment: reply.commitment || null, rating: reply.rating || null } : null,
  };
}

export async function GET(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const url = new URL(request.url);
  const days = await S.listDays(30);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") || "") ? url.searchParams.get("day") : (days[0] || romeYesterday());
  const key = url.searchParams.get("key");
  const job = await S.getJob(day);

  if (key) {
    const [fb, pack, reply] = await Promise.all([S.getFeedback(day, key), S.getPack(day, key), S.getReply(day, key)]);
    if (!fb) return Response.json({ error: "Feedback non trovato" }, { status: 404 });
    return Response.json({
      day, key, feedback: fb, reply,
      metrics: Object.keys(METRICS).map((k) => ({ key: k, label: METRICS[k].label, value: fmtMetric(k, pack?.metrics?.[k]) })),
      pack: pack ? { ore_turno: pack.ore_turno, acquisti_finestra_aperta: pack.acquisti_finestra_aperta, giornata_leggera: pack.giornata_leggera, caption_ripetute: pack.caption_ripetute, impegno_precedente: pack.impegno_precedente || null, moments: pack.moments } : null,
      levers: LEVERS,
    });
  }

  const items = [];
  for (const o of job?.operators || []) {
    const [fb, reply] = await Promise.all([S.getFeedback(day, o.key), S.getReply(day, o.key)]);
    if (fb) items.push({ ...summary(fb, reply), key: o.key, ppv: o.ppv });
  }
  const [cfg, events, spendToday] = await Promise.all([S.getConfig(), S.recentEvents(60), S.getSpend(romeToday())]);
  const isAdmin = (await authorize(CAPABILITIES.SEED)).ok;
  return Response.json({
    day, days, config: cfg, is_admin: isAdmin, offices: OFFICES,
    job: job ? { status: job.status, stage: job.stage, started_at: job.started_at, updated_at: job.updated_at, spend_usd: job.spend_usd, bq_gb: job.bq_gb, result: job.result || null, skipped: job.skipped || [], errors: job.errors || [], log: job.log || [], operators: (job.operators || []).length } : null,
    items, events, spend_today_usd: spendToday, levers: LEVERS,
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "config") {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
    return Response.json({ ok: true, config: await S.setConfig(body, az.userId) });
  }
  if (body.action === "recheck") {
    // Ripassa il feedback dal Garante con le regole attuali (solo codice, nessuna spesa AI)
    const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
    const { day, key } = body;
    const [fb, pack, job] = await Promise.all([S.getFeedback(day, key), S.getPack(day, key), S.getJob(day)]);
    if (!fb?.arbiter || !pack) return Response.json({ error: "Niente da ricontrollare" }, { status: 404 });
    if (!["bloccato", "in_revisione"].includes(fb.status)) return Response.json({ error: "Già rivisto da una persona" }, { status: 400 });
    const g = guard(fb.arbiter, pack, { operatorNames: job?.operator_names || [] });
    await S.saveFeedback(day, key, { ...fb, guard: g, message: renderMessage(fb.arbiter, pack), status: g.ok ? "in_revisione" : "bloccato" });
    return Response.json({ ok: true, guard: g });
  }
  if (body.action === "review") {
    const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
    const { day, key, decision } = body;
    const fb = await S.getFeedback(day, key);
    if (!fb) return Response.json({ error: "Feedback non trovato" }, { status: 404 });
    const next = { ...fb, reviewed_by: az.userId, reviewed_at: Date.now(), review_note: String(body.note || "").slice(0, 1000) || null };
    if (decision === "approva") {
      if (fb.status === "bloccato") return Response.json({ error: "Bloccato dal Garante: correggilo con «Modifica» prima di approvarlo." }, { status: 400 });
      next.status = "approvato";
    } else if (decision === "modifica") {
      const msg = String(body.message || "").trim();
      if (msg.length < 20) return Response.json({ error: "Messaggio troppo corto." }, { status: 400 });
      next.edited_message = msg.slice(0, 2500);
      next.status = "modificato";
    } else if (decision === "blocca") {
      next.status = "scartato";
    } else return Response.json({ error: "Decisione non valida" }, { status: 400 });
    await S.saveFeedback(day, key, next);
    await S.event("direzione", `Feedback ${next.status} per ${fb.operator.split(" ")[0]}`, { day });
    return Response.json({ ok: true, status: next.status });
  }
  return Response.json({ error: "Azione non valida" }, { status: 400 });
}
