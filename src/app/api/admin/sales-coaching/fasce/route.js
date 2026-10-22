// Coaching vendite → scheda Fasce (22/10/2026): chi rende di più e in quali turni.
// GATE: authorizeAllCreators(SCORES_VIEW), come Squadra: nomi operatori + venduto
// per turno = dati denaro di tutte le creator.
//
// GET ?split=<id> → pagine dello split (valore delle fasce, chi le copre) e la
//   squadra dello split (chi fa almeno metà delle ore sulle sue pagine). Legge SOLO
//   la cache notturna `fasce:data:*`; se manca calcola una volta (lock).
// POST { action: "recompute" } → ricalcola ora.

export const runtime = "nodejs";
export const maxDuration = 120;

import { authorizeAllCreators } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { listSplits } from "@/lib/sales-coaching";
import { listPeople } from "@/lib/hr-people";
import { getFasceData, computeFasceOnce, isFasceComputing, isFasceStale } from "@/lib/fasce";
import { splitSlotValues } from "@/lib/fasce-core";
import { matchName, SPLIT_SHARE } from "@/lib/squadra-core";

export async function GET(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const splitId = new URL(request.url).searchParams.get("split");
  try {
    let data = await getFasceData();
    if (!data) {
      const done = await computeFasceOnce();
      if (!done) return Response.json({ computing: true });
      data = done;
    }
    const [splits, people, computing] = await Promise.all([listSplits(), listPeople(), isFasceComputing()]);
    const split = splitId ? splits.find((s) => s.id === splitId) || null : null;
    const inSplit = split ? new Set(split.creator_ids.map(String)) : null;

    // chi è uscito dal CRM non entra nelle liste d'azione (resta nei numeri dei colleghi)
    const exited = people
      .filter((p) => p.fields?.collaborationStatus === "Uscita")
      .map((p) => `${p.fields?.firstName || ""} ${p.fields?.surname || ""}`.trim())
      .filter(Boolean);
    const isOut = (name) => Boolean(exited.length && matchName(name, exited));

    const pages = data.pages
      .filter((p) => !inSplit || inSplit.has(p.cid))
      .map((p) => {
        const people_ = p.people.map((x) => ({ ...x, uscita: isOut(x.name) }));
        const ok = new Set(people_.filter((x) => !x.uscita).map((x) => x.op));
        return { ...p, people: people_, weak_in_prime: p.weak_in_prime.filter((o) => ok.has(o)), strong_outside: p.strong_outside.filter((o) => ok.has(o)) };
      });

    const operators = [];
    for (const o of data.operators) {
      const tot = Object.values(o.pages).reduce((s, h) => s + h, 0);
      const mine = inSplit ? Object.entries(o.pages).reduce((s, [cid, h]) => s + (inSplit.has(cid) ? h : 0), 0) : tot;
      const share = tot ? mine / tot : 0;
      if (inSplit && share < SPLIT_SHARE) continue;
      const uscita = isOut(o.name);
      operators.push({ ...o, share, uscita, verdict: uscita ? null : o.verdict });
    }

    return Response.json({
      computing,
      stale: isFasceStale(data),
      generated_at: data.generated_at,
      window: data.window,
      until: data.until || null,
      stability: data.stability,
      overall: inSplit ? splitSlotValues(pages) : data.overall,
      split: split ? { id: split.id, name: split.name } : null,
      pages,
      operators,
    });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura fallita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  if (body?.action === "recompute") {
    const doc = await computeFasceOnce();
    return Response.json(doc ? { ok: true, generated_at: doc.generated_at } : { computing: true });
  }
  return Response.json({ error: "Azione non prevista." }, { status: 400 });
}
