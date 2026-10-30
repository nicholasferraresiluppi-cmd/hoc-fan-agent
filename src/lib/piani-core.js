// Piani di lavoro (sprint) — logica pura, niente I/O. 30/10/2026, richiesta di Nicholas:
// «come degli sprint di ClickUp ma nella nostra web app». Un piano = fasi con scadenza, ogni fase
// ha voci (chi, entro quando, link alla pagina dove si fa). Tre tipi di voce:
//   - manuale:    si spunta a mano (chi l'ha fatta e quando resta scritto)
//   - domanda:    si chiude scrivendo la risposta (es. «quanto ti serve per un reel»)
//   - automatica: si spunta da sola leggendo i dati dell'app (`auto: {type, ...}`, valutata lato
//                 server in lib/piani.js) — chi lavora non deve dichiarare ciò che l'app già sa.
// Una fase `kind: "decision"` è una decisione con data: le sue voci sono le condizioni.
// Definizione del piano e stato delle voci vivono in chiavi separate: riscrivere il piano non
// cancella le spunte.

export const AUTO_TYPES = {
  radar_profiles: "Profili nel Radar",
  radar_saved: "Idee salvate nel Radar",
  editoriale_items: "Contenuti preparati",
  autopub: "Pubblicati riconosciuti in automatico",
  calendar_days: "Giorni di calendario pieni",
  weekly_data: "Dati della settimana inseriti",
  feedback_open: "Segnalazioni aperte",
};

const s = (v, n) => String(v ?? "").trim().slice(0, n);
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const slug = (v) => s(v, 40).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");

/** Valida e ripulisce un piano. Ritorna { ok, plan } o { ok:false, errors }. */
export function normalizePlan(input) {
  const errors = [];
  const id = slug(input?.id);
  if (!id) errors.push("Manca l'id del piano");
  const title = s(input?.title, 120);
  if (!title) errors.push("Manca il titolo");
  const seen = new Set();
  const phases = (Array.isArray(input?.phases) ? input.phases : []).map((ph, i) => {
    const pid = slug(ph?.id) || `fase-${i + 1}`;
    const items = (Array.isArray(ph?.items) ? ph.items : []).map((it, j) => {
      const iid = slug(it?.id) || `${pid}-${j + 1}`;
      if (seen.has(iid)) errors.push(`Voce ripetuta: ${iid}`);
      seen.add(iid);
      const auto = it?.auto && AUTO_TYPES[it.auto.type] ? { ...it.auto } : null;
      if (it?.auto && !auto) errors.push(`Tipo automatico sconosciuto: ${it.auto.type}`);
      return {
        id: iid,
        text: s(it?.text, 300),
        note: s(it?.note, 400),
        link: s(it?.link, 200) || null,
        who: s(it?.who, 40) || null,
        due: isDay(it?.due) ? it.due : null,
        ask: Boolean(it?.ask),
        auto,
      };
    }).filter((it) => it.text);
    return {
      id: pid,
      title: s(ph?.title, 120),
      note: s(ph?.note, 600),
      kind: ph?.kind === "decision" ? "decision" : "work",
      due: isDay(ph?.due) ? ph.due : null,
      items,
    };
  }).filter((ph) => ph.title);
  if (!phases.length) errors.push("Serve almeno una fase");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      id, title,
      goal: s(input?.goal, 600),
      area: s(input?.area, 40) || null,
      cap: s(input?.cap, 40) || null,
      people: (Array.isArray(input?.people) ? input.people : []).map((p) => s(p, 40)).filter(Boolean),
      start: isDay(input?.start) ? input.start : null,
      end: isDay(input?.end) ? input.end : null,
      archived: Boolean(input?.archived),
      phases,
    },
  };
}

/**
 * Stato di una voce: `st` = stato salvato ({done:{at,by}, answer}), `auto` = risultato del
 * controllo automatico ({ok, value, target, label}). La voce automatica si chiude da sola; si
 * può comunque spuntare a mano (il dato può non coprire tutto), e la spunta a mano vince.
 */
export function itemStatus(item, st, auto, today) {
  const manual = Boolean(st?.done);
  const answered = item.ask && Boolean(s(st?.answer, 2000));
  const autoOk = Boolean(item.auto && auto?.ok);
  const done = item.ask ? answered || manual : manual || autoOk;
  const late = !done && item.due && today && item.due < today;
  return {
    done,
    late: Boolean(late),
    via: done ? (manual ? "mano" : answered ? "risposta" : "dati") : null,
    by: st?.done?.by || st?.answerBy || null,
    at: st?.done?.at || st?.answerAt || null,
    answer: item.ask ? s(st?.answer, 2000) || null : null,
    auto: item.auto ? (auto || { ok: false, value: null, label: "dato non disponibile" }) : null,
  };
}

/** Piano valutato: ogni voce col suo stato + avanzamento per fase e totale. */
export function evaluatePlan(plan, state = {}, autos = {}, today) {
  let done = 0, total = 0, late = 0;
  const phases = plan.phases.map((ph) => {
    // una voce senza data sua scade con la sua fase
    const items = ph.items.map((it) => ({ ...it, status: itemStatus({ ...it, due: it.due || ph.due }, state[it.id], autos[it.id], today) }));
    const d = items.filter((x) => x.status.done).length;
    const l = items.filter((x) => x.status.late).length;
    done += d; total += items.length; late += l;
    const overdue = ph.due && today && ph.due < today && d < items.length;
    return { ...ph, items, done: d, total: items.length, late: l, overdue: Boolean(overdue), complete: items.length > 0 && d === items.length };
  });
  return { ...plan, phases, progress: { done, total, late, pct: total ? Math.round((done / total) * 100) : 0 } };
}

/** Prima fase non completa (quella «di adesso»). */
export function currentPhase(evaluated) {
  return evaluated.phases.find((ph) => !ph.complete) || null;
}

/**
 * Le voci aperte di una persona (o di tutti, se la persona non è nel piano), le più urgenti prima:
 * prima le in ritardo, poi per scadenza, le senza scadenza in fondo. Le condizioni di una
 * decisione non sono compiti di nessuno: restano fuori.
 */
export function openItemsFor(evaluated, name, limit = 6) {
  // il nome può essere solo l'email (Clerk senza nome): «luis.aguilar@…» → «luis»
  const first = String(name || "").trim().split(/[\s.@_]+/)[0]?.toLowerCase() || "";
  const mine = (it) => !it.who || !first || it.who.toLowerCase().split(/[\s,]+/).includes(first);
  const inPlan = first && evaluated.people.some((p) => p.toLowerCase().split(/\s+/)[0] === first);
  const out = [];
  for (const ph of evaluated.phases) {
    if (ph.kind === "decision") continue;
    for (const it of ph.items) {
      if (it.status.done) continue;
      if (inPlan && !mine(it)) continue;
      out.push({ ...it, phase: ph.title, phaseId: ph.id, due: it.due || ph.due });
    }
  }
  out.sort((a, b) => (b.status.late - a.status.late) || (a.due || "9999").localeCompare(b.due || "9999"));
  return out.slice(0, limit);
}

/** «oggi», «domani», «in ritardo di 2 giorni», «entro mar 3/11». */
export function dueLabel(due, today) {
  if (!due) return "";
  if (!today) return "entro " + shortDay(due);
  const diff = Math.round((Date.parse(due + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff === -1) return "in ritardo di 1 giorno";
  if (diff < 0) return `in ritardo di ${-diff} giorni`;
  return "entro " + shortDay(due);
}

const WD = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
export function shortDay(day) {
  if (!isDay(day)) return "";
  const d = new Date(day + "T12:00:00Z");
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** Giorni consecutivi da `today` coperti (almeno un contenuto) — per `calendar_days`. */
export function coveredDays(daysWithContent, today, max = 60) {
  const set = new Set(daysWithContent);
  let n = 0;
  const t = Date.parse(today + "T12:00:00Z");
  while (n < max && set.has(new Date(t + n * 86400000).toISOString().slice(0, 10))) n++;
  return n;
}
