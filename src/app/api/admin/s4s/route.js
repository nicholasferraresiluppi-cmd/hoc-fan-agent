// S4S — calendario degli scambi di uno split + risultato di ogni scambio.
// GATE: authorizeAllCreators(SCORES_VIEW), come Coaching vendite (stessi split,
// espone l'incasso per pagina). Team lead e operatori → 403.
//
// GET  ?split=<id>            calendario (4 settimane indietro, 8 avanti) + risultati
// POST {action:"settings", split, weekdays, start, lang_override, paused}
// POST {action:"alias", label_key, partner}   partner = nome | null ("nessuna") | undefined (togli)
// POST {action:"refresh", split}              ricalcola i risultati dal warehouse
// POST {action:"link", split, day, receiver, partner, url}   link incollato (url vuoto = togli)
// POST {action:"deal", split, day, a, b, fmt_a, fmt_b, time, mass_time, pin_hours, status, note, prev_id?, prev_source?}
//      salva un accordo; con prev_id diverso (giorno o partner cambiati) il vecchio si annulla (giro) o si toglie (extra)
// POST {action:"deal_status", split, id, status}            conferma / annulla / ripristina

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorizeAllCreators } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured, listSplits, setAlias, setLink, putDeals } from "@/lib/s4s";
import { buildView, dayDeals } from "@/lib/s4s-view";
import { cleanDeal, dealsOnDay, baseName, MAX_PER_DAY } from "@/lib/s4s-core";

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
    if (body.action === "link") {
      if (!split.creator_ids.includes(Number(body.receiver)) || !split.creator_ids.includes(Number(body.partner))) {
        return Response.json({ error: "Pagina fuori dallo split" }, { status: 400 });
      }
      await setLink(split.id, body, az.userId);
      return Response.json({ ok: true });
    }
    if (body.action === "deal" || body.action === "deal_status") {
      let input = body;
      if (body.action === "deal_status") {
        const [day, a, b] = String(body.id || "").split("|");
        const { stored } = await dayDeals(split, day);
        input = { ...(stored[body.id] || { day, a, b }), status: body.status };
      }
      const clean = cleanDeal(input, split.creator_ids);
      const { entry, stored, names } = await dayDeals(split, clean.day);
      const nm = (id) => baseName(names[String(id)] || String(id));
      if (nm(clean.a) === nm(clean.b)) return Response.json({ error: "Sono due pagine della stessa creator" }, { status: 400 });
      if (clean.status !== "annullato") {
        for (const pid of [clean.a, clean.b]) {
          if (dealsOnDay(entry, pid, clean.id) >= MAX_PER_DAY) {
            return Response.json({ error: `${nm(pid)} ha già ${MAX_PER_DAY} S4S quel giorno (il massimo)` }, { status: 400 });
          }
        }
      }
      const map = { ...stored };
      if (body.action === "deal" && body.prev_id && body.prev_id !== clean.id) {
        const [pday, pa, pb] = String(body.prev_id).split("|");
        if (body.prev_source === "giro") {
          const prev = map[body.prev_id] || cleanDeal({ day: pday, a: pa, b: pb }, split.creator_ids);
          map[body.prev_id] = { ...prev, status: "annullato", updated_at: new Date().toISOString(), updated_by: az.userId };
        } else {
          delete map[body.prev_id]; // extra spostato: l'archivio è unico per split, basta toglierlo
        }
      }
      map[clean.id] = { ...(map[clean.id] || {}), ...clean, updated_at: new Date().toISOString(), updated_by: az.userId };
      await putDeals(split.id, map);
      return Response.json({ ok: true, id: clean.id });
    }
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
