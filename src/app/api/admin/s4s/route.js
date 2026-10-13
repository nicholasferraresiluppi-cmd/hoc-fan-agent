// S4S — calendario degli scambi di uno split + risultato di ogni scambio.
// GATE (13/10, punto 2): authorizeScoped(SCORES_VIEW). Chi vede tutte le creator vede e
// gestisce tutto; un sales manager con creator assegnate vede solo gli scambi delle SUE pagine
// e agisce solo su quelle (link, accordi, "fatto"). Impostazioni, alias e ricalcolo: solo
// chi vede tutto. Operatori (scope own) → 403.
//
// GET  ?split=<id>            calendario (4 settimane indietro, 8 avanti) + risultati
// POST {action:"settings", split, weekdays, start, lang_override, paused}
// POST {action:"alias", label_key, partner}   partner = nome | null ("nessuna") | undefined (togli)
// POST {action:"refresh", split}              ricalcola i risultati dal warehouse
// POST {action:"link", split, day, receiver, partner, url}   link incollato (url vuoto = togli)
// POST {action:"deal", split, day, a, b, fmt_a, fmt_b, time, mass_time, pin_hours, status, note, prev_id?, prev_source?}
//      salva un accordo; con prev_id diverso (giorno o partner cambiati) il vecchio si annulla (giro) o si toglie (extra)
// POST {action:"deal_status", split, id, status}            conferma / annulla / ripristina
// POST {action:"done", split, id, page, done}               la pagina ha programmato la sua parte (done=false: annulla)

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured, listSplits, setAlias, setLink, putDeals, getNames } from "@/lib/s4s";
import { buildView, dayDeals, restrictView } from "@/lib/s4s-view";
import { cleanDeal, dealsOnDay, baseName, MAX_PER_DAY } from "@/lib/s4s-core";

// Pagine dello split su cui chi chiama può agire
async function access() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return { az };
  const names = await getNames();
  const mineOf = (split) => (az.creatorScope.all ? split.creator_ids.map(Number) : split.creator_ids.map(Number).filter((id) => allowsCreator(az.creatorScope, names[String(id)])));
  return { az, all: Boolean(az.creatorScope.all), mineOf };
}

export async function GET(request) {
  const { az, all, mineOf } = await access();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false });
  // a chi segue solo alcune creator si mostrano gli split che contengono almeno una sua pagina
  const splits = (await listSplits()).filter((s) => all || mineOf(s).length);
  const splitId = new URL(request.url).searchParams.get("split");
  const split = splits.find((s) => s.id === splitId) || splits[0];
  if (!split) return Response.json({ splits: [], view: null });
  try {
    const full = await buildView(split, { userId: az.userId });
    const view = all ? { ...full, me: { all: true, pages: split.creator_ids.map(Number) }, pages: full.pages.map((p) => ({ ...p, mine: true })) } : restrictView(full, mineOf(split));
    return Response.json({ splits: splits.map((s) => ({ id: s.id, name: s.name, n: s.creator_ids.length })), view });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}

export async function POST(request) {
  const { az, all, mineOf } = await access();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const onlyAll = () => Response.json({ error: "Serve la vista su tutte le creator" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "alias") {
      if (!all) return onlyAll();
      await setAlias(body.label_key, body.partner);
      return Response.json({ ok: true });
    }
    const split = (await listSplits()).find((s) => s.id === body.split);
    if (!split) return Response.json({ error: "Split non trovato" }, { status: 404 });
    const mine = new Set(mineOf(split));
    const notMine = () => Response.json({ error: "Questa pagina non è tra quelle che segui" }, { status: 403 });
    if (body.action === "link") {
      if (!mine.has(Number(body.receiver))) return notMine();
      if (!split.creator_ids.includes(Number(body.receiver)) || !split.creator_ids.includes(Number(body.partner))) {
        return Response.json({ error: "Pagina fuori dallo split" }, { status: 400 });
      }
      await setLink(split.id, body, az.userId);
      return Response.json({ ok: true });
    }
    if (body.action === "done") {
      const [day] = String(body.id || "").split("|");
      const page = Number(body.page);
      if (!mine.has(page)) return notMine();
      const { entry, stored } = await dayDeals(split, day);
      const x = entry?.deals.find((d) => d.id === body.id);
      if (!x || (x.a !== page && x.b !== page)) return Response.json({ error: "Scambio non trovato" }, { status: 404 });
      if (x.status === "annullato") return Response.json({ error: "Lo scambio è annullato" }, { status: 400 });
      const { lang, source, ...keep } = x; // eslint-disable-line no-unused-vars
      const done = { ...(x.done || {}) };
      if (body.done === false) delete done[page]; else done[page] = new Date().toISOString();
      // programmare la propria parte vale come conferma
      const map = { ...stored, [x.id]: { ...keep, status: "confermato", done, updated_at: new Date().toISOString(), updated_by: az.userId } };
      await putDeals(split.id, map);
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
      if (!mine.has(clean.a) && !mine.has(clean.b)) return notMine();
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
        if (!mine.has(Number(pa)) && !mine.has(Number(pb))) return notMine();
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
    if ((body.action === "settings" || body.action === "refresh") && !all) return onlyAll();
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
