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
// POST {action:"avail", split, c, per_week, weekdays, times, formats, exclude}   disponibilità di una pagina
// POST {action:"accept_all", split, days}                  accetta per le proprie pagine tutte le proposte dei
//      prossimi `days` giorni (max 21) che non sforano la disponibilità; le altre restano da guardare una per una
// Accettazione (punto 3): un accordo è confermato quando l'hanno accettato ENTRAMBE le pagine
// (accepted = {pagina → quando}). Chi crea o modifica accetta per le sue pagine; se cambia
// giorno, ora, formati o fissato, l'accettazione dell'altra decade. Chi vede tutte le creator
// (o segue entrambe le pagine) accetta per tutte e due. "Rifiuta" = annullato con declined_by.

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured, listSplits, setAlias, setLink, putDeals, getNames, getAvails, saveAvail } from "@/lib/s4s";
import { buildView, dayDeals, restrictView, rangeDeals } from "@/lib/s4s-view";
import { cleanDeal, dealsOnDay, baseName, MAX_PER_DAY, cleanAvail, availIssues, weekRange, weekCount, accept, termsChanged } from "@/lib/s4s-core";

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
    const now = () => new Date().toISOString();
    const stamp = (d) => ({ ...d, updated_at: now(), updated_by: az.userId });
    // per quali pagine dell'accordo agisce chi chiama
    const actorPages = (a, b) => (all ? [a, b] : [a, b].filter((p) => mine.has(Number(p))));

    if (body.action === "avail") {
      const c = Number(body.c);
      if (!split.creator_ids.map(Number).includes(c)) return Response.json({ error: "Pagina fuori dallo split" }, { status: 400 });
      if (!mine.has(c)) return notMine();
      await saveAvail(c, cleanAvail(body, split.creator_ids), az.userId);
      return Response.json({ ok: true });
    }

    // controlli comuni: stessa creator, massimo al giorno, disponibilità di entrambe le pagine
    async function check(clean) {
      const [w0, w1] = weekRange(clean.day);
      const [{ days, names }, avails] = await Promise.all([rangeDeals(split, w0, w1), getAvails([clean.a, clean.b])]);
      const nm = (id) => baseName(names[String(id)] || String(id));
      if (nm(clean.a) === nm(clean.b)) return "Sono due pagine della stessa creator";
      const entry = days.find((d) => d.day === clean.day);
      for (const pid of [clean.a, clean.b]) {
        if (dealsOnDay(entry, pid, clean.id) >= MAX_PER_DAY) return `${nm(pid)} ha già ${MAX_PER_DAY} S4S quel giorno (il massimo)`;
      }
      for (const [me, other, fmt] of [[clean.a, clean.b, clean.fmt_a], [clean.b, clean.a, clean.fmt_b]]) {
        const iss = availIssues(avails[me], { day: clean.day, time: clean.time, fmt, partnerId: other, partnerName: nm(other), weekCount: weekCount(days, me, clean.id) });
        if (iss.length) return `${nm(me)} ${iss.join("; ")}. Cambia giorno, ora o formato, oppure la sua disponibilità.`;
      }
      return null;
    }
    // accordo del giorno così com'è ora (giro + salvato), in forma da archivio
    async function current(id) {
      const [day] = String(id || "").split("|");
      const { entry, stored } = await dayDeals(split, day);
      const x = entry?.deals.find((d) => d.id === id);
      if (!x) return { stored };
      const { lang, source, ...keep } = x; // eslint-disable-line no-unused-vars
      return { x: keep, stored };
    }

    if (body.action === "accept_all") {
      // solo per chi segue le pagine: per chi vede tutto confermerebbe ogni proposta per entrambi i team
      if (all) return Response.json({ error: "L'accettazione in blocco è per i sales manager delle pagine" }, { status: 403 });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
      const until = new Date(Date.parse(`${today}T00:00:00Z`) + Math.min(21, Math.max(1, Number(body.days) || 14)) * 86400000).toISOString().slice(0, 10);
      const { days, stored } = await rangeDeals(split, today, until);
      const map = { ...stored };
      let ok = 0, skipped = 0;
      for (const d of days) {
        for (const x0 of d.deals) {
          if (x0.status === "annullato") continue;
          const pages = actorPages(x0.a, x0.b).filter((p) => !(x0.accepted || {})[p] && !(x0.status === "confermato" && !Object.keys(x0.accepted || {}).length));
          if (!pages.length) continue;
          const { lang, source, ...x } = { ...x0, ...(map[x0.id] || {}) }; // eslint-disable-line no-unused-vars
          if (await check(x)) { skipped++; continue; }
          map[x.id] = stamp(accept(x, pages));
          ok++;
        }
      }
      await putDeals(split.id, map);
      return Response.json({ ok: true, accepted: ok, skipped });
    }

    if (body.action === "done") {
      const page = Number(body.page);
      if (!mine.has(page)) return notMine();
      const { x, stored } = await current(body.id);
      if (!x || (x.a !== page && x.b !== page)) return Response.json({ error: "Scambio non trovato" }, { status: 404 });
      if (x.status === "annullato") return Response.json({ error: "Lo scambio è annullato" }, { status: 400 });
      const done = { ...(x.done || {}) };
      if (body.done === false) delete done[page]; else done[page] = now();
      // programmare la propria parte vale come accettazione di quella pagina
      const next = body.done === false ? { ...x, done } : accept({ ...x, done }, [page]);
      await putDeals(split.id, { ...stored, [x.id]: stamp(next) });
      return Response.json({ ok: true });
    }

    if (body.action === "deal_status") {
      const { x, stored } = await current(body.id);
      if (!x) return Response.json({ error: "Scambio non trovato" }, { status: 404 });
      const pages = actorPages(x.a, x.b);
      if (!pages.length) return notMine();
      let next;
      if (body.status === "confermato") {
        const err = await check(x);
        if (err) return Response.json({ error: err }, { status: 400 });
        next = accept(x, pages);
      } else if (body.status === "annullato") {
        next = { ...x, status: "annullato", declined_by: all ? null : pages[0], decline_note: String(body.note || "").slice(0, 200) };
      } else {
        next = { ...x, status: "proposto", accepted: {}, declined_by: null }; // ripristina
      }
      await putDeals(split.id, { ...stored, [x.id]: stamp(next) });
      return Response.json({ ok: true });
    }

    if (body.action === "deal") {
      const clean = cleanDeal(body, split.creator_ids);
      const pages = actorPages(clean.a, clean.b);
      if (!pages.length) return notMine();
      const err = await check(clean);
      if (err) return Response.json({ error: err }, { status: 400 });
      const { stored } = await dayDeals(split, clean.day);
      const map = { ...stored };
      let prev = map[clean.id] || null;
      if (body.prev_id && body.prev_id !== clean.id) {
        const [pday, pa, pb] = String(body.prev_id).split("|");
        if (!mine.has(Number(pa)) && !mine.has(Number(pb))) return notMine();
        const old = (await current(body.prev_id)).x || cleanDeal({ day: pday, a: pa, b: pb }, split.creator_ids);
        if (body.prev_source === "giro") map[body.prev_id] = stamp({ ...old, status: "annullato" });
        else delete map[body.prev_id];
        prev = null; // giorno o partner nuovi: si riparte da capo con l'accettazione
      } else if (!prev) {
        prev = (await current(clean.id)).x || null; // proposta del giro mai salvata
      }
      const base = { ...(prev || {}), ...clean, status: prev?.status === "annullato" ? "proposto" : clean.status };
      // termini cambiati: l'accettazione dell'altra pagina decade
      const kept = prev && !termsChanged(prev, clean) ? prev.accepted || {} : {};
      let next = { ...base, accepted: kept, declined_by: null, requested_by: prev?.requested_by || pages[0] };
      // chi salva accetta per le sue pagine; chi vede tutto conferma solo se lo chiede (status confermato)
      next = accept(next, all && body.status !== "confermato" ? [] : pages);
      await putDeals(split.id, { ...map, [clean.id]: stamp(next) });
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
