// S4S — calendario degli scambi di uno split + risultato di ogni scambio.
// GATE: authorizeAllCreators(SCORES_VIEW), come Coaching vendite (stessi split,
// espone l'incasso per pagina). Team lead e operatori → 403.
//
// GET  ?split=<id>            calendario (4 settimane indietro, 8 avanti) + risultati
// POST {action:"settings", split, weekdays, start, lang_override, paused}
// POST {action:"alias", label_key, partner}   partner = nome | null ("nessuna") | undefined (togli)
// POST {action:"refresh", split}              ricalcola i risultati dal warehouse

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorizeAllCreators } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured, listSplits, setAlias } from "@/lib/s4s";
import { buildView } from "@/lib/s4s-view";

export async function GET(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false });
  const splits = await listSplits();
  const splitId = new URL(request.url).searchParams.get("split");
  const split = splits.find((s) => s.id === splitId) || splits[0];
  if (!split) return Response.json({ splits: [], view: null });
  try {
    const view = await buildView(split, { userId: az.userId });
    return Response.json({ splits: splits.map((s) => ({ id: s.id, name: s.name, n: s.creator_ids.length })), view });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "alias") {
      await setAlias(body.label_key, body.partner);
      return Response.json({ ok: true });
    }
    const split = (await listSplits()).find((s) => s.id === body.split);
    if (!split) return Response.json({ error: "Split non trovato" }, { status: 404 });
    if (body.action === "settings") {
      const { weekdays, start, lang_override, paused } = body;
      await buildView(split, { settings: { weekdays, start, lang_override, paused }, userId: az.userId });
      return Response.json({ ok: true });
    }
    if (body.action === "refresh") {
      await buildView(split, { force: true, userId: az.userId });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || "Operazione fallita" }, { status: 400 });
  }
}
