// Fase 4 della città, la vita (27/09/2026):
//  - chi è IN TURNO adesso, per creator: dal programma turni di CreatorsPro sincronizzato nella notte
//    (inizio/fine programmati). Un cambio di turno fatto in giornata non si vede fino alla notte dopo:
//    dichiarato in pagina ("da programma").
//  - le STRADE: persone del team progetto (assegnatari ClickUp, citta:teams) in comune tra due palazzi.
import { kv } from "@vercel/kv";
import { getWages } from "@/lib/cp-wages-store";

const personOf = (alias) => String(alias || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();
const monthOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** { [creatorPerson]: [{ name, until }] } dei turni in corso adesso (+ quanti iniziano entro 2 ore). */
export async function shiftsNow(now = Date.now()) {
  const ck = "citta:onshift";
  const hit = await kv.get(ck).catch(() => null);
  if (hit && now - hit.at < 5 * 60e3) return hit.out;
  const d = new Date(now);
  const [wages, mapping] = await Promise.all([getWages(monthOf(d)), kv.get("cp:member_mapping")]);
  const out = {};
  for (const w of wages || []) {
    const name = mapping?.[w.member_id] || null;
    for (const s of w.shifts || []) {
      const a = Date.parse(s.started_at), b = Date.parse(s.ended_at);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const on = a <= now && b > now, soon = a > now && a - now <= 2 * 36e5;
      if (!on && !soon) continue;
      for (const alias of s.creator_aliases || []) {
        const p = personOf(alias);
        (out[p] ||= { on: [], soon: 0 });
        if (on && name && !out[p].on.some((x) => x.name === name)) out[p].on.push({ name: String(name).split(" ").slice(0, 2).join(" "), until: b });
        if (soon) out[p].soon += 1;
      }
    }
  }
  await kv.set(ck, { at: now, out }, { ex: 900 }).catch(() => {});
  return out;
}

/** Strade tra palazzi: [{ a, b, n, names }] per coppie che condividono persone del team progetto. */
export async function sharedRoads(towers) {
  const teams = await kv.get("citta:teams");
  const who = {};
  for (const t of towers) for (const m of teams?.towers?.[t] || []) {
    const k = m.email || m.cuId || m.name;
    (who[k] ||= { name: String(m.name || "").replace(/\s*[([{][^)\]}]*[)\]}]/g, "").trim(), set: new Set() }).set.add(t);
  }
  const roads = {};
  for (const { name, set } of Object.values(who)) {
    const list = [...set].sort();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = `${list[i]}|${list[j]}`;
      (roads[k] ||= { a: list[i], b: list[j], n: 0, names: [] });
      roads[k].n += 1; if (roads[k].names.length < 6) roads[k].names.push(name.split(" ")[0]);
    }
  }
  return Object.values(roads).sort((x, y) => y.n - x.n).slice(0, 40);
}

/**
 * Previsione di fine mese per creator (giro 2 visionari, "livello 3 di Endsley"):
 * turni ANCORA IN PROGRAMMA da adesso a fine mese (programma CP sincronizzato di notte), a quota
 * tra le pagine dello stesso turno. La previsione = venduto finora + venduto a turno × turni rimasti.
 * È una stima al ritmo attuale, dichiarata come tale.
 */
export async function remainingShifts(now = Date.now()) {
  const d = new Date(now);
  const wages = await getWages(monthOf(d));
  const out = {};
  for (const w of wages || []) for (const s of w.shifts || []) {
    const a = Date.parse(s.started_at);
    if (!Number.isFinite(a) || a <= now) continue;
    const aliases = s.creator_aliases || [];
    for (const alias of aliases) { const p = personOf(alias); out[p] = (out[p] || 0) + 1 / Math.max(1, aliases.length); }
  }
  return out;
}
