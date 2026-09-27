// La città — API (SEED). GET = città del mese (fotografia ClickUp + dati vivi di HOC Pro + prese in carico);
//   ?month=YYYY-MM per il mese precedente (solo i piani di HOC Pro hanno storico).
// POST = { action: "claim"|"release", tower, area } per prendere in carico un piano, oppure una fotografia nuova.
// GATE: SEED (admin) — nomi di persone, carichi di lavoro e ritardi di tutta l'azienda.
export const runtime = "nodejs";
export const maxDuration = 60;

import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { kv } from "@vercel/kv";
import { getCitySnapshot, saveCitySnapshot, getClaims, setClaim, citySince, romeDay, getCustodians, setCustodian, recentRelit } from "@/lib/citta";
import { commentClaim } from "@/lib/citta-clickup";
import { getCityLive, mergeCityLive, currentMonthId, previousMonthId, monthLabel } from "@/lib/citta-live";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const snap = await getCitySnapshot();
  if (!snap) return Response.json({ projects: [], generated: null });
  const cur = currentMonthId(), prev = previousMonthId(cur);
  const asked = new URL(request.url).searchParams.get("month");
  const month = asked === prev ? prev : cur;
  const months = [{ id: cur, label: monthLabel(cur) }, { id: prev, label: monthLabel(prev) }];
  try {
    const [live, claims, weekly] = await Promise.all([getCityLive(month), getClaims(), month === cur ? citySince() : { base: null }]);
    // striscia "cosa è cambiato": dalla TUA ultima visita (se c'è ed è di un altro giorno), altrimenti la settimana
    let since = weekly;
    if (month === cur) {
      const seenKey = `citta:seen:${az.userId}`;
      const seen = await kv.get(seenKey).catch(() => null);
      const today = romeDay();
      if (seen?.day && seen.day < today) {
        const v = await citySince(new Date(), 7, { fromDay: seen.day });
        if (v.base) since = { ...v, mode: "visit" };
      }
      await kv.set(seenKey, { day: today, at: Date.now() }, { ex: 90 * 864e2 }).catch(() => {});
    }
    const merged = mergeCityLive(snap, live, { past: month !== cur, claims: month === cur ? claims : {} });
    // prese in carico ferme: piano ancora in ritardo dopo 7 giorni dalla presa in carico
    const staleClaims = [];
    for (const t of [...merged.projects, merged.hq]) for (const a of t.areas) {
      if (a.claim && (a.s === "wait" || a.s === "stop") && Date.now() - a.claim.at > 7 * 864e5) staleClaims.push(`${t.n} · ${a.n} (${a.claim.by})`);
    }
    // luci credibili: lampeggia solo ciò che è tra le priorità misurate o è peggiorato di recente
    const hot = new Set([...(merged.top || []).flatMap((x) => (x.areas || [x.area]).map((a) => `${x.tower} · ${a}`)), ...(weekly.worse || [])]);
    // "Da guardare": chi la segue, o da quanto nessuno (per il "Prendi in carico" sulla riga)
    if (month === cur) {
      const seen = (await kv.get("citta:topseen").catch(() => null)) || {};
      for (const x of merged.top || []) {
        const keys = (x.areas || [x.area]).map((a) => `${x.tower}|${a}`);
        const c = keys.map((k) => claims[k]).find(Boolean);
        if (c) x.claim = { by: c.by, at: c.at };
        else { const first = Math.min(...keys.map((k) => seen[k] || Date.now())); x.openHours = Math.floor((Date.now() - first) / 36e5); }
      }
    }
    for (const t of [...merged.projects, merged.hq]) for (const a of t.areas) if (hot.has(`${t.n} · ${a.n}`)) a.hot = true;
    // Fase 3: responsabili dei palazzi, "i miei palazzi", piani riaccesi di recente
    const [custodians, relit] = await Promise.all([getCustodians(), month === cur ? recentRelit(7) : []]);
    for (const t of [...merged.projects, merged.hq]) if (custodians[t.n]) t.custodian = { name: custodians[t.n].name, userId: custodians[t.n].userId };
    const mine = Object.entries(custodians).filter(([, c]) => c.userId === az.userId).map(([t]) => t);
    // Fase 4: chi è in turno adesso (programma CP) e strade delle persone condivise
    if (month === cur) {
      try {
        const { shiftsNow, sharedRoads } = await import("@/lib/citta-vita");
        const { remainingShifts } = await import("@/lib/citta-vita");
        const [on, roads, rest] = await Promise.all([shiftsNow(), sharedRoads(merged.projects.map((p) => p.n)), remainingShifts()]);
        for (const t of merged.projects) {
          if (on[t.n]) t.onShift = on[t.n];
          // previsione di fine mese al ritmo attuale: venduto + venduto a turno × turni ancora in programma
          const x = live.people[t.n];
          if (x?.perShift && rest[t.n] != null) t.projection = Math.round((x.sales || 0) + x.perShift * rest[t.n]);
          else if (x?.sales) t.projection = Math.round(x.sales);
        }
        merged.roads = roads;
      } catch { /* la vita è un di più: se manca, la città resta */ }
    }
    return Response.json({ ...merged, since: { ...since, staleClaims, relit: relit.map((r) => `${r.tower} · ${r.area} (${r.by})`) }, months, month, canClaim: month === cur, mine });
  } catch (e) {
    return Response.json({ ...snap, months, month, live_error: String(e?.message || e) });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 1_000_000) return Response.json({ error: "Fotografia troppo grande (max 1 MB)." }, { status: 413 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  if (body?.action === "custodian") {
    if (!body.tower) return Response.json({ error: "tower richiesto" }, { status: 400 });
    let who = null;
    if (body.userId) {
      try {
        const cc = await clerkClient();
        const u = await cc.users.getUser(String(body.userId).slice(0, 80));
        who = { userId: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id };
      } catch { return Response.json({ error: "Membro non trovato." }, { status: 404 }); }
    }
    const all = await setCustodian(body.tower, who);
    return Response.json({ ok: true, custodian: all[body.tower] || null });
  }
  if (body?.action === "claim" || body?.action === "release") {
    if (!body.tower || !body.area) return Response.json({ error: "tower e area richiesti" }, { status: 400 });
    const me = await currentUser().catch(() => null);
    const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.emailAddresses?.[0]?.emailAddress || "Admin";
    const claims = await setClaim(body.tower, body.area, body.action === "claim" ? { name, userId: me?.id } : null);
    // Presa in carico → commento sull'attività ClickUp del piano (il link lo prende il server
    // dalla fotografia, mai dal browser). Best-effort: se ClickUp non risponde la presa resta.
    let clickup = false;
    if (body.action === "claim") {
      try {
        const snap = await getCitySnapshot();
        const tower = snap?.hq?.n === body.tower ? snap.hq : snap?.projects?.find((p) => p.n === body.tower);
        const link = tower?.areas?.find((a) => a.n === body.area)?.link;
        if (link) clickup = await commentClaim(link, `${name} ha preso in carico ${body.area} · ${body.tower} da HOC Pro (La città).`);
      } catch { clickup = false; }
    }
    return Response.json({ ok: true, clickup, claim: claims[`${body.tower}|${body.area}`] || null });
  }
  try {
    const snap = await saveCitySnapshot(body);
    return Response.json({ ok: true, generated: snap.generated, projects: snap.projects.length });
  } catch (e) {
    return Response.json({ error: e?.message || "Fotografia non valida." }, { status: 400 });
  }
}
