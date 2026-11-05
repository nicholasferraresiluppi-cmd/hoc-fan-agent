/**
 * Rete amici — logica pura (20/10/2026). Vedi lib/rete-amici.js per il perché.
 *
 * Classificazione di ogni nuovo iscritto di una pagina "promossa" (prima iscrizione di sempre):
 *   link      → è arrivato da un tracking link / trial / funnel (lo sa già Infloww)
 *   friends   → nessun link, e nel momento dell'iscrizione era iscritto a una pagina che la mostra tra gli Amici
 *   other_hoc → nessun link, non iscritto alle pagine che la mostrano, ma iscritto ad altre pagine HOC
 *   direct    → nessun link e nessuna pagina HOC: arriva da fuori (social, ricerca, passaparola)
 * "friends" è il TETTO di ciò che gli Amici portano: dentro c'è anche ogni altra spinta della pagina che
 * la mostra (post, messaggi di massa, S4S senza link). Lo si stringe col prima/dopo quando un amico
 * viene aggiunto o tolto, ed è per questo che ogni collegamento ha la sua data.
 */

export const WEEKS = 13;
export const KINDS = ["friends", "link", "other_hoc", "direct"];

const num = (v) => Number(v) || 0;
const isId = (n) => Number.isInteger(n) && n > 0;
const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Valida un collegamento "host mostra target tra gli Amici". Lancia con un messaggio leggibile. */
export function normalizeLink(input, today) {
  const host = Number(input?.host_id);
  const target = Number(input?.target_id);
  if (!isId(host) || !isId(target)) throw new Error("Indica la pagina che mostra e la pagina mostrata");
  if (host === target) throw new Error("Una pagina non può mostrare sé stessa");
  const since = input?.since ? String(input.since) : null;
  if (since !== null && !isDay(since)) throw new Error("Data non valida");
  if (since && since > today) throw new Error("La data non può essere nel futuro");
  return { host_id: host, target_id: target, since, note: String(input?.note || "").trim().slice(0, 200) };
}

/** Collegamenti attivi oggi (non chiusi). */
export const activeLinks = (links) => (links || []).filter((l) => !l.until);

/** Coppie (host,target) da misurare: attive + chiuse da meno di WEEKS settimane (per il prima/dopo). */
export function pairsToMeasure(links, today) {
  const cutoff = new Date(Date.parse(today) - WEEKS * 7 * 86400e3).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  for (const l of links || []) {
    if (l.until && l.until < cutoff) continue;
    const k = `${l.host_id}>${l.target_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ host: Number(l.host_id), target: Number(l.target_id) });
  }
  return out;
}

/** Lunedì della settimana ISO di una data YYYY-MM-DD. */
export function weekOf(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10);
}

/** Le WEEKS settimane fino a oggi (l'ultima è parziale). */
export function weekList(today) {
  const last = weekOf(today);
  const out = [];
  for (let i = WEEKS - 1; i >= 0; i--) out.push(new Date(Date.parse(last) - i * 7 * 86400e3).toISOString().slice(0, 10));
  return out;
}

const emptyBucket = () => ({ fans: 0, ripe: 0, ripeNet: 0, ripePayers: 0 });
const add = (b, r) => { b.fans += num(r.fans); b.ripe += num(r.ripe_fans); b.ripeNet += num(r.ripe_net30); b.ripePayers += num(r.ripe_payers); };
const value = (b) => ({ fans: b.fans, ripe: b.ripe, avgNet30: b.ripe >= 20 ? b.ripeNet / b.ripe : null, payRate: b.ripe >= 20 ? b.ripePayers / b.ripe : null });

/**
 * Prima/dopo di un collegamento: media settimanale degli iscritti "da questa pagina" nelle settimane
 * intere prima e dopo la data. Serve almeno 2 settimane intere per lato, altrimenti null (meglio niente
 * che un numero su una settimana sola).
 */
export function beforeAfter(series, since, today) {
  if (!since) return null;
  const sw = weekOf(since);
  const cur = weekOf(today);
  const before = series.filter((w) => w.week < sw);
  const after = series.filter((w) => w.week > sw && w.week < cur); // la settimana dell'aggiunta e quella in corso sono a metà
  if (before.length < 2 || after.length < 2) return { before: null, after: null, weeksBefore: before.length, weeksAfter: after.length };
  const avg = (a) => a.reduce((t, w) => t + w.fans, 0) / a.length;
  return { before: avg(before), after: avg(after), weeksBefore: before.length, weeksAfter: after.length };
}

/**
 * Righe SQL → una scheda per pagina promossa.
 * rows: { target, week, kind, host, fans, ripe_fans, ripe_net30, ripe_payers }
 *   kind ∈ KINDS (host null) oppure 'host' (host = pagina che la mostra, solo per i fan "friends").
 * names: { [creator_id]: nome }
 */
export function shapeResults(rows, links, names, today) {
  const weeks = weekList(today);
  const last4 = new Set(weeks.slice(-4));
  const nameOf = (id) => names?.[Number(id)] || `Pagina ${id}`;
  const targets = new Map();
  const ensure = (t) => {
    if (!targets.has(t)) {
      targets.set(t, {
        target_id: t, name: nameOf(t),
        weekly: Object.fromEntries(weeks.map((w) => [w, Object.fromEntries(KINDS.map((k) => [k, 0]))])),
        tot: Object.fromEntries(KINDS.map((k) => [k, emptyBucket()])),
        last4: Object.fromEntries(KINDS.map((k) => [k, 0])),
        hosts: new Map(),
      });
    }
    return targets.get(t);
  };
  for (const l of links || []) ensure(Number(l.target_id));
  for (const r of rows || []) {
    const t = ensure(Number(r.target));
    const week = r.week ? String(r.week).slice(0, 10) : null;
    if (r.kind === "host") {
      const h = Number(r.host);
      if (!t.hosts.has(h)) t.hosts.set(h, { weekly: Object.fromEntries(weeks.map((w) => [w, 0])), tot: emptyBucket() });
      const hb = t.hosts.get(h);
      if (week && week in hb.weekly) hb.weekly[week] += num(r.fans);
      add(hb.tot, r);
      continue;
    }
    if (!KINDS.includes(r.kind)) continue;
    if (week && t.weekly[week]) t.weekly[week][r.kind] += num(r.fans);
    if (week && last4.has(week)) t.last4[r.kind] += num(r.fans);
    add(t.tot[r.kind], r);
  }
  return [...targets.values()].map((t) => {
    const total = KINDS.reduce((s, k) => s + t.tot[k].fans, 0);
    const total4 = KINDS.reduce((s, k) => s + t.last4[k], 0);
    const myLinks = (links || []).filter((l) => Number(l.target_id) === t.target_id);
    const hostIds = [...new Set([...myLinks.map((l) => Number(l.host_id)), ...t.hosts.keys()])];
    const hosts = hostIds.map((h) => {
      const hb = t.hosts.get(h) || { weekly: Object.fromEntries(weeks.map((w) => [w, 0])), tot: emptyBucket() };
      const link = myLinks.filter((l) => Number(l.host_id) === h).sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0] || null;
      const series = weeks.map((w) => ({ week: w, fans: hb.weekly[w] }));
      return {
        host_id: h, name: nameOf(h),
        link: link && { id: link.id, since: link.since || null, until: link.until || null, at: link.at || null },
        fans: hb.tot.fans,
        last4: weeks.slice(-4).reduce((s, w) => s + hb.weekly[w], 0),
        value: value(hb.tot),
        series,
        beforeAfter: link ? (link.until ? beforeAfter(series.filter((w) => w.week <= weekOf(link.until)), link.since, link.until) : beforeAfter(series, link.since, today)) : null,
        // tolto: prima = da quando c'era (o tutto lo storico se la data d'aggiunta non è nota), dopo = da quando non c'è più
        removedEffect: link?.until ? beforeAfter(link.since ? series.filter((w) => w.week >= weekOf(link.since)) : series, link.until, today) : null,
      };
    }).sort((a, b) => b.fans - a.fans);
    return {
      target_id: t.target_id, name: t.name,
      total, total4,
      share: total > 0 ? t.tot.friends.fans / total : null,
      share4: total4 > 0 ? t.last4.friends / total4 : null,
      byKind: Object.fromEntries(KINDS.map((k) => [k, { ...value(t.tot[k]), last4: t.last4[k] }])),
      weekly: weeks.map((w) => ({ week: w, ...t.weekly[w] })),
      hosts,
    };
  }).sort((a, b) => b.byKind.friends.fans - a.byKind.friends.fans);
}
