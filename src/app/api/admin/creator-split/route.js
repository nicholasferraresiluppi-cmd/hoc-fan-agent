// Creator dello split (15/10/2026) — la sezione "come su Infloww": si cerca una creator per nome,
// HOC Pro trova le sue pagine OnlyFans (una per paese, niente copie) e le mette nello split
// (`sales:splits`). Da lì compare da sola in Revenue e chat, Analisi vendite, S4S, Sales coaching.
// GET            → split + creator dentro (con attività) | ?q=nome → risultati della ricerca
// POST add/remove { split_id, ids } · create { name }
// Gate SEED (admin): lo split decide cosa vedono tutti i sales manager.
export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listSplits, saveSplit } from "@/lib/sales-coaching";
import { buildLiveCreators } from "@/lib/live-creators";
import { pagesFor, searchPages, forgetLiveCreators } from "@/lib/live-creators-store";
import { bigQueryConfigured } from "@/lib/bigquery-api";

const pickSplit = (splits, id) => splits.find((s) => s.id === id) || splits[0] || null;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const splits = await listSplits();
  const split = pickSplit(splits, url.searchParams.get("split"));
  const inSplit = new Set((split?.creator_ids || []).map(Number));
  try {
    const q = url.searchParams.get("q");
    if (q != null) {
      const found = buildLiveCreators(await searchPages(q)).map((c) => ({
        ...c,
        accounts: c.accounts.map((a) => ({ ...a, in_split: inSplit.has(a.creator_id) })),
      }));
      return Response.json({ q, results: found });
    }
    const pages = split ? await pagesFor([...inSplit], { force: url.searchParams.get("refresh") === "1" }) : [];
    return Response.json({
      splits: splits.map((s) => ({ id: s.id, name: s.name, n: s.creator_ids.length })),
      split: split && { id: split.id, name: split.name, updated_at: split.updated_at },
      creators: buildLiveCreators(pages),
    });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    const splits = await listSplits();
    if (body.action === "create") {
      const split = await saveSplit({ name: body.name, creator_ids: body.ids || [] }, az.userId);
      forgetLiveCreators();
      return Response.json({ ok: true, split });
    }
    const split = splits.find((s) => s.id === body.split_id);
    if (!split) return Response.json({ error: "Split non trovato" }, { status: 404 });
    const ids = (body.ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return Response.json({ error: "Nessuna pagina indicata" }, { status: 400 });
    let next;
    if (body.action === "add") next = [...new Set([...split.creator_ids.map(Number), ...ids])];
    else if (body.action === "remove") next = split.creator_ids.map(Number).filter((id) => !ids.includes(id));
    else return Response.json({ error: "Azione non valida" }, { status: 400 });
    if (!next.length) return Response.json({ error: "Lo split non può restare vuoto" }, { status: 400 });
    const saved = await saveSplit({ id: split.id, name: split.name, creator_ids: next }, az.userId);
    forgetLiveCreators();
    return Response.json({ ok: true, split: saved });
  } catch (e) {
    return Response.json({ error: e.message || "Salvataggio non riuscito" }, { status: 400 });
  }
}
