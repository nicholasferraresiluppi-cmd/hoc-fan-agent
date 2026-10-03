// Sales manager AI — logica PURA (nessun import: la usano lib, route e test node).
//
// Cosa fa: dai messaggi di UNA giornata su una creator (ws_chat, già dedup),
// dai turni e dalle vendite costruisce il "pacchetto" per ogni operatore che
// ha lavorato da solo, con i momenti di vendita, i numeri e il riscontro sulla
// regola che si era impegnato a provare. Qui vivono anche il Garante (i
// controlli che bloccano un feedback prima che arrivi a qualcuno) e la
// contabilità dei costi.
//
// REGOLE NATE DA ERRORI REALI (ott 2026, non rimuovere):
//   - invii di massa: lo stesso testo ≥20 volte nella stessa ora sulla stessa
//     creator NON è lavoro dell'operatore (2.031 "heyy amo, che fai?" su Martina
//     in 5 ore, attribuiti a chi era in turno) → esclusi.
//   - PPV di benvenuto (fan che non ha mai scritto, entro 30' dal primo
//     contatto) = automatico → escluso.
//   - solo turni con UN operatore: in duo il warehouse non sa chi ha scritto.
//   - acquisti: finestra 72h. Il giorno dopo la finestra NON è chiusa → il
//     dato "comprati" è un pavimento e va dichiarato tale.
//   - LEVE PRESCRIVIBILI = solo quelle che non tolgono volume. Studio 6 mesi
//     (257 operatori): la % di PPV comprati NON predice la resa futura, il
//     numero di proposte sì. "Aspetta l'8° scambio" alza la conversione ma può
//     abbassare i soldi → sta nell'incubatrice, non si prescrive.

export const VERSION = "smai-1";

export const BULK_MIN = 20;          // stesso testo ≥ N volte in un'ora = invio di massa
export const WELCOME_MIN = 30;       // minuti dal primo contatto per il PPV di benvenuto
export const BUY_WINDOW_H = 72;
export const MIN_PPV_FOR_RULES = 8;  // sotto: giornata leggera, niente regole su percentuali
export const CAPTION_MIN_N = 30;     // caption giudicabile solo con ≥30 invii in 30 giorni
export const CAPTION_LOW_RATIO = 0.6; // "non vende per nessuno": resa ≤ 60% della media creator
export const MAX_MOMENTS = 30;

// Le leve. `prescrivibile` = dimostrata sui dati e senza perdita di volume.
// Le altre vivono nell'incubatrice: si propongono alla direzione, mai all'operatore.
export const LEVERS = {
  caption_bassa_resa: {
    prescrivibile: true,
    titolo: "Lascia da parte le caption che non vendono",
    metrica: "caption_bassa_resa_usi",
    evidenza: "La stessa caption rende poco con qualunque operatore: è un problema del testo, non della persona. Cambiarla non toglie proposte.",
  },
  proponi_a_chat_viva: {
    prescrivibile: true,
    titolo: "Proponi mentre lui ti sta scrivendo",
    metrica: "pct_ppv_fan_ha_scritto_2min",
    evidenza: "A settembre su Martina: PPV con il fan che ha scritto negli ultimi 2 minuti 18% comprati, fan zitto da più di un'ora 1,5%. Su tutte le creator è il comportamento più legato ai PPV comprati (31 creator su 36).",
  },
  niente_ppv_a_freddo: {
    prescrivibile: true,
    titolo: "Niente PPV a chi tace da più di un'ora",
    metrica: "ppv_fan_zitto_1h",
    evidenza: "Mandato a un fan zitto da più di un'ora, un PPV lo compra 1 fan su 70. Prima si riapre la conversazione.",
  },
  fan_chiede_vedere: {
    prescrivibile: true,
    titolo: "Quando chiede di vedere, è il momento",
    metrica: "pct_richieste_con_proposta",
    evidenza: "Quando il fan chiede di vedere qualcosa, il PPV si vende circa il doppio a ogni livello di conversazione (settembre, Martina).",
  },
  dopo_8_scambi: {
    prescrivibile: false,
    titolo: "Proporre solo dopo 8 scambi",
    metrica: "pct_ppv_dopo_8_scambi",
    evidenza: "Alza la % di PPV comprati (20% vs 9%) ma può ridurre quante proposte fai, e il numero di proposte è ciò che predice i soldi. Va testata prima.",
  },
  ritmo: {
    prescrivibile: false,
    titolo: "Più proposte all'ora",
    metrica: "ppv_ora",
    evidenza: "Predice la resa futura, ma può stancare i fan. Da misurare l'effetto sui fan prima di consigliarla.",
  },
};

export const METRICS = {
  ppv_a_mano: { label: "PPV mandati a mano", fmt: "n" },
  ppv_comprati: { label: "PPV comprati finora", fmt: "n" },
  ppv_ora: { label: "proposte all'ora", fmt: "d1" },
  pct_ppv_fan_ha_scritto_2min: { label: "proposte partite mentre il fan scriveva", fmt: "pct" },
  ppv_fan_zitto_1h: { label: "proposte a fan zitti da più di un'ora", fmt: "n" },
  pct_ppv_dopo_8_scambi: { label: "proposte dopo almeno 8 scambi", fmt: "pct" },
  caption_bassa_resa_usi: { label: "usi di caption che non vendono", fmt: "n" },
  pct_richieste_con_proposta: { label: "richieste del fan seguite da una proposta entro 10 minuti", fmt: "pct" },
  pct_risposta_fan_15min: { label: "messaggi a cui il fan ha risposto entro 15 minuti", fmt: "pct" },
};

// Numeri che si possono mostrare all'operatore: solo quelli delle leve dimostrate.
// Niente "proposte all'ora" (spingerebbe il volume = leva in incubatrice) né
// "comprati" (finestra di 72h aperta, e la % non predice i soldi).
export const OPERATOR_METRICS = ["caption_bassa_resa_usi", "pct_ppv_fan_ha_scritto_2min", "ppv_fan_zitto_1h", "pct_richieste_con_proposta", "pct_risposta_fan_15min"];

export function fmtMetric(key, v) {
  if (v == null || Number.isNaN(v)) return "n/d";
  const f = METRICS[key]?.fmt;
  if (f === "pct") return `${Math.round(v * 100)}%`;
  if (f === "d1") return v.toFixed(1).replace(".", ",");
  return String(Math.round(v));
}

const ASK_RE = /fammi vedere|fammela vedere|fammelo vedere|fammele vedere|fammeli vedere|voglio vedere|vorrei vedere|mandami|mandamelo|mandamela|fai vedere|mi fai vedere|show me|send me|let me see|i want to see|mostrami|fallo ora|fammi sentire|ens[eé][ñn]ame|quiero ver|m[aá]ndame/i;
export const isAsk = (t) => ASK_RE.test(t || "");

// Stessa normalizzazione di captionStatsSQL; Array.from = conta i code point
// come SUBSTR di BigQuery (con slice le emoji spostavano il taglio e la caption
// non si ritrovava nella tabella).
export const normCaption = (t) => Array.from(String(t || "").replace(/<[^>]+>/g, " ").trim().toLowerCase().replace(/\s+/g, " ")).slice(0, 120).join("");

const ts = (x) => (typeof x === "number" ? x : Date.parse(x));

/**
 * Pacchetti per operatore di una giornata.
 * @param {object} a
 * @param {Array} a.messages  [{creator_id,user_id,at,out,price,text}] ordinati o no
 * @param {Array} a.shifts    [{creator_id, member_name, start, end}] (ms)
 * @param {Array} a.buys      [{creator_id,user_id,at,amount}] tipo "message"
 * @param {object} a.firstSeen { "cid:uid": ms } primo contatto (lookback lungo)
 * @param {object} a.captionStats { cid: { avg_rate, captions: { norm: {n, rate} } } }
 * @param {number} a.dayStart, a.dayEnd  (ms) finestra della giornata
 * @param {number} a.now
 */
export function buildPacks({ messages, shifts, buys, firstSeen = {}, captionStats = {}, dayStart, dayEnd, now = Date.now() }) {
  // 1. invii di massa
  const bulkCount = new Map();
  for (const m of messages) {
    if (!m.out || !m.text) continue;
    const k = `${m.creator_id}|${normCaption(m.text)}|${Math.floor(ts(m.at) / 3600e3)}`;
    bulkCount.set(k, (bulkCount.get(k) || 0) + 1);
  }
  const isBulk = (m) => m.out && m.text && (bulkCount.get(`${m.creator_id}|${normCaption(m.text)}|${Math.floor(ts(m.at) / 3600e3)}`) || 0) >= BULK_MIN;

  // 2. conversazioni
  const conv = new Map();
  for (const m of messages) {
    if (isBulk(m)) continue;
    const k = `${m.creator_id}:${m.user_id}`;
    if (!conv.has(k)) conv.set(k, []);
    conv.get(k).push({ ...m, t: ts(m.at) });
  }
  for (const list of conv.values()) list.sort((a, b) => a.t - b.t);

  const buyMap = new Map();
  for (const b of buys) {
    const k = `${b.creator_id}:${b.user_id}`;
    if (!buyMap.has(k)) buyMap.set(k, []);
    buyMap.get(k).push({ t: ts(b.at), amount: Number(b.amount) });
  }

  // 3. chi era in turno (solo se unico)
  const whoAt = (cid, t) => {
    const names = new Set();
    for (const s of shifts) if (String(s.creator_id) === String(cid) && t >= s.start && t < s.end) names.add(s.member_name);
    return names.size === 1 ? [...names][0] : null;
  };

  const ops = new Map();
  const opOf = (name, cid) => {
    const key = `${name}|${cid}`;
    if (!ops.has(key)) ops.set(key, { operator: name, creator_id: String(cid), moments: [], txt: 0, txtReplied: 0, asks: 0, asksAnswered: 0, ppv: [] });
    return ops.get(key);
  };

  for (const [k, ms] of conv) {
    const [cid] = k.split(":");
    const first = firstSeen[k] != null ? ts(firstSeen[k]) : ms[0].t;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (m.t < dayStart || m.t >= dayEnd) continue;
      if (!m.out) {
        // richiesta del fan di vedere qualcosa: chi era in turno ha proposto entro 10'?
        if (isAsk(m.text)) {
          const name = whoAt(cid, m.t);
          if (name) {
            const o = opOf(name, cid);
            o.asks++;
            if (ms.slice(i + 1).some((y) => y.out && y.price > 0 && y.t - m.t <= 600e3)) o.asksAnswered++;
          }
        }
        continue;
      }
      const name = whoAt(cid, m.t);
      if (!name) continue;
      const o = opOf(name, cid);
      if (!(m.price > 0)) {
        o.txt++;
        const nx = ms.slice(i + 1).find((y) => !y.out);
        if (nx && nx.t - m.t <= 900e3) o.txtReplied++;
        continue;
      }
      const fanBefore = ms.slice(0, i).filter((y) => !y.out).length;
      const sinceFirst = (m.t - first) / 60e3;
      if (fanBefore === 0 && sinceFirst <= WELCOME_MIN) continue; // benvenuto
      const prev = ms.slice(0, i).filter((y) => m.t - y.t <= 3600e3);
      let alt = 0;
      for (let j = 1; j < prev.length; j++) if (prev[j].out !== prev[j - 1].out) alt++;
      const lastFan = [...ms.slice(0, i)].reverse().find((y) => !y.out);
      const since = lastFan ? (m.t - lastFan.t) / 60e3 : null;
      const bought = (buyMap.get(k) || []).some((b) => Math.abs(b.amount - m.price) < 0.01 && b.t >= m.t && b.t - m.t <= BUY_WINDOW_H * 3600e3);
      const cs = captionStats[cid]?.captions?.[normCaption(m.text)];
      const avg = captionStats[cid]?.avg_rate;
      const lowCaption = !!(cs && avg && cs.n >= CAPTION_MIN_N && cs.rate <= avg * CAPTION_LOW_RATIO);
      const ctx = ms.filter((y) => y.t >= m.t - 40 * 60e3 && y.t <= m.t + 20 * 60e3).slice(-26);
      o.ppv.push({ t: m.t, price: m.price, alt, since, bought, lowCaption, caption: normCaption(m.text), capRate: cs?.rate ?? null, capN: cs?.n ?? null });
      o.moments.push({
        id: null, t: m.t, price: m.price, venduto: bought, scambi_ora_prima: alt,
        min_da_ultimo_msg_fan: since == null ? null : Math.round(since * 10) / 10,
        caption_bassa_resa: lowCaption,
        caption_resa_creator: cs ? { invii_30g: cs.n, comprati_pct: Math.round(cs.rate * 1000) / 10 } : null,
        chat: ctx.map((y) => ({ who: y.out ? "OPERATORE" : "FAN", hhmm: new Date(y.t).toISOString().slice(11, 16), text: String(y.text || "").slice(0, 240), ppv: y.price > 0 ? y.price : null })),
      });
    }
  }

  const packs = [];
  for (const o of ops.values()) {
    o.moments.sort((a, b) => a.t - b.t);
    // tieni i momenti più informativi se sono troppi: tutti i venduti + i più recenti
    let ms = o.moments;
    if (ms.length > MAX_MOMENTS) {
      const sold = ms.filter((x) => x.venduto);
      const rest = ms.filter((x) => !x.venduto).slice(-(MAX_MOMENTS - Math.min(sold.length, MAX_MOMENTS)));
      ms = [...sold, ...rest].sort((a, b) => a.t - b.t).slice(0, MAX_MOMENTS);
    }
    ms.forEach((x, i) => { x.id = `M${i + 1}`; });
    const metrics = computeMetrics(o);
    const hours = estimateHours(shifts, o.operator, o.creator_id, dayStart, dayEnd);
    metrics.ppv_ora = hours ? o.ppv.length / hours : null;
    packs.push({
      version: VERSION,
      operator: o.operator,
      creator_id: o.creator_id,
      day_start: dayStart,
      ore_turno: hours,
      metrics,
      acquisti_finestra_aperta: now - dayEnd < BUY_WINDOW_H * 3600e3,
      giornata_leggera: o.ppv.length < MIN_PPV_FOR_RULES,
      caption_ripetute: topLowCaptions(o.ppv),
      moments: ms.map(({ t, ...rest }) => rest),
    });
  }
  return packs.sort((a, b) => b.metrics.ppv_a_mano - a.metrics.ppv_a_mano);
}

function estimateHours(shifts, name, cid, a, b) {
  let ms = 0;
  for (const s of shifts) {
    if (s.member_name !== name || String(s.creator_id) !== String(cid)) continue;
    ms += Math.max(0, Math.min(s.end, b) - Math.max(s.start, a));
  }
  return ms ? Math.round((ms / 3600e3) * 10) / 10 : null;
}

export function computeMetrics(o) {
  const n = o.ppv.length;
  const pct = (f) => (n ? o.ppv.filter(f).length / n : null);
  const alts = o.ppv.map((p) => p.alt).sort((x, y) => x - y);
  return {
    ppv_a_mano: n,
    ppv_comprati: o.ppv.filter((p) => p.bought).length,
    pct_ppv_fan_ha_scritto_2min: pct((p) => p.since != null && p.since <= 2),
    ppv_fan_zitto_1h: o.ppv.filter((p) => p.since == null || p.since > 60).length,
    pct_ppv_dopo_8_scambi: pct((p) => p.alt >= 8),
    mediana_scambi: n ? alts[Math.floor(n / 2)] : null,
    caption_bassa_resa_usi: o.ppv.filter((p) => p.lowCaption).length,
    pct_richieste_con_proposta: o.asks ? o.asksAnswered / o.asks : null,
    richieste_fan: o.asks,
    pct_risposta_fan_15min: o.txt >= 20 ? o.txtReplied / o.txt : null,
  };
}

function topLowCaptions(ppv) {
  const c = new Map();
  for (const p of ppv) if (p.lowCaption) {
    const x = c.get(p.caption) || { caption: p.caption, usi: 0, resa_creator_pct: p.capRate != null ? Math.round(p.capRate * 1000) / 10 : null, invii_30g: p.capN };
    x.usi++;
    c.set(p.caption, x);
  }
  return [...c.values()].sort((a, b) => b.usi - a.usi).slice(0, 3);
}

/* ─────────────── Garante: i controlli che bloccano ─────────────── */

const BANNED = [
  [/pi[uù] domande|fai domande|fagli domande|chiedigli di pi[uù]/i, "consiglia più domande: i dati dicono il contrario"],
  [/messaggi pi[uù] lunghi|scrivi di pi[uù]|allunga i messaggi/i, "consiglia messaggi più lunghi: i dati dicono il contrario"],
  [/collegh|altri operator|media del team|il team vende|rispetto agli altri/i, "confronto con i colleghi: vietato nel messaggio all'operatore"],
  [/sei scesa|sei sceso|in calo|peggiorat|sei andat[oa] male|deludent/i, "cattiva notizia nel messaggio automatico: va detta da una persona"],
  [/\bsei (bravo|brava|bravissim[oa])\b/i, "lode al tratto della persona invece che al comportamento"],
];

// "[PPV $79]" è un'etichetta del sistema nel testo dato all'AI, non parole dell'operatore
export const stripTags = (s) => String(s || "").replace(/\[\s*PPV[^\]]*\]/gi, " ").replace(/\s+/g, " ").trim();
const squash = (s) => stripTags(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Chi ha detto la frase citata in quel momento: "OPERATORE", "FAN" o null (non esiste). */
export function quoteSpeaker(pack, momentId, quote) {
  const m = pack?.moments?.find((x) => x.id === momentId);
  const q = squash(quote);
  if (!m || q.length < 6) return null;
  const hit = m.chat.find((c) => squash(c.text).includes(q));
  return hit ? hit.who : null;
}
/** La citazione esiste davvero, detta dall'OPERATORE, in quel momento? (per la "cosa fatta bene") */
export function citationExists(pack, momentId, quote) {
  return quoteSpeaker(pack, momentId, quote) === "OPERATORE";
}

/** Numeri scritti in un testo: ogni percentuale deve esistere nel pacchetto (± 1 punto). */
export function unknownPercents(text, pack) {
  const known = [];
  for (const v of Object.values(pack.metrics || {})) if (typeof v === "number" && v <= 1) known.push(Math.round(v * 100));
  for (const c of pack.caption_ripetute || []) if (c.resa_creator_pct != null) known.push(Math.round(c.resa_creator_pct));
  for (const m of pack.moments || []) if (m.caption_resa_creator) known.push(Math.round(m.caption_resa_creator.comprati_pct));
  const found = [...String(text || "").matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((x) => Math.round(Number(x[1].replace(",", "."))));
  return found.filter((p) => !known.some((k) => Math.abs(k - p) <= 1));
}

/**
 * Controlli del Garante sul feedback finale (output strutturato dell'arbitro).
 * @returns {{ok:boolean, problems:string[]}}
 */
export function guard(fb, pack, { operatorNames = [] } = {}) {
  const problems = [];
  if (!fb || typeof fb !== "object") return { ok: false, problems: ["feedback mancante o non leggibile"] };
  if (fb.forza) {
    if (!citationExists(pack, fb.forza.momento_id, fb.forza.citazione)) problems.push(`citazione non trovata nel momento ${fb.forza.momento_id}: "${String(fb.forza.citazione || "").slice(0, 60)}"`);
  } else problems.push("manca la cosa fatta bene");
  if (fb.regola && fb.regola.leva !== "nessuna") {
    const lev = LEVERS[fb.regola.leva];
    if (!lev) problems.push(`leva sconosciuta: ${fb.regola.leva}`);
    else if (!lev.prescrivibile) problems.push(`leva non prescrivibile (incubatrice): ${fb.regola.leva}`);
    const room = leverRoom(fb.regola.leva, pack.metrics || {});
    if (lev && room === false) problems.push(`la leva "${fb.regola.leva}" non ha margine nei dati di ieri`);
    if (pack.giornata_leggera && fb.regola.leva !== "caption_bassa_resa" && fb.regola.leva !== "fan_chiede_vedere") problems.push("giornata con pochi PPV: niente regole su percentuali");
  }
  for (const k of fb.numeri || []) if (!METRICS[k]) problems.push(`metrica sconosciuta: ${k}`);
    // un numero non mostrabile non blocca: renderMessage lo toglie e basta

  const text = operatorText(fb);
  for (const [re, why] of BANNED) if (re.test(text)) problems.push(why);
  const others = operatorNames.filter((n) => n && squash(n) !== squash(pack.operator));
  for (const n of others) {
    const first = squash(n).split(" ")[0];
    if (first.length >= 4 && new RegExp(`\\b${first}\\b`, "i").test(squash(text))) problems.push(`nomina un altro operatore (${n.split(" ")[0]})`);
  }
  const bad = unknownPercents(text, pack);
  if (bad.length) problems.push(`percentuali non presenti nei dati: ${bad.join(", ")}%`);
  if (text.length > 1400) problems.push("messaggio troppo lungo");
  return { ok: problems.length === 0, problems };
}

/** La leva ha margine nei dati del turno? (null = non si può dire) */
export function leverRoom(leva, m) {
  switch (leva) {
    case "caption_bassa_resa": return (m.caption_bassa_resa_usi || 0) > 0;
    case "niente_ppv_a_freddo": return (m.ppv_fan_zitto_1h || 0) > 0;
    case "proponi_a_chat_viva": return m.pct_ppv_fan_ha_scritto_2min == null ? null : m.pct_ppv_fan_ha_scritto_2min < 0.9;
    case "fan_chiede_vedere": return (m.richieste_fan || 0) > 0 ? (m.pct_richieste_con_proposta ?? 0) < 1 : false;
    default: return null;
  }
}

/** Tutto il testo che l'operatore leggerebbe (esclusi i numeri, che rende il codice). */
export function operatorText(fb) {
  const r = fb.regola?.leva !== "nessuna" ? fb.regola : null;
  return [fb.apertura, fb.forza?.perche, r?.quando, r?.allora, fb.regola?.leva !== "nessuna" ? fb.regola?.esempio : null, cambio(fb), fb.riscontro]
    .filter(Boolean).join("\n");
}

/** Il messaggio finale: il testo viene dall'AI, i NUMERI dal codice (l'AI non li scrive). */
export function renderMessage(fb, pack) {
  if (!fb) return null;
  const lines = [];
  if (fb.riscontro) lines.push(fb.riscontro);
  if (fb.apertura) lines.push(fb.apertura);
  if (fb.forza) lines.push(`Cosa fai già bene: ${fb.forza.perche}\n«${stripTags(fb.forza.citazione)}»`);
  if (fb.regola && fb.regola.leva !== "nessuna") lines.push(`Da provare oggi: quando ${lcFirst(stripLead(fb.regola.quando, "quando"))}, ${lcFirst(stripLead(fb.regola.allora, "allora"))}${fb.regola.esempio ? `\nPer esempio: «${stripTags(fb.regola.esempio)}»` : ""}`);
  if (cambio(fb)) lines.push(`Un cambio facile: ${cambio(fb)}`);
  const nums = (fb.numeri || []).filter((k) => METRICS[k] && OPERATOR_METRICS.includes(k)).map((k) => `${METRICS[k].label}: ${fmtMetric(k, pack.metrics?.[k])}`);
  if (nums.length) lines.push(`Domani guardiamo insieme: ${nums.join(" · ")}`);
  return lines.join("\n\n");
}
const cambio = (fb) => (typeof fb.cambio_facile === "string" ? fb.cambio_facile : fb.cambio_facile?.testo) || "";
const stripLead = (s, w) => String(s || "").replace(new RegExp(`^\\s*${w}\\b[\\s,:]*`, "i"), "");
const lcFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : "");

/* ─────────────── giorni in ora di Roma ─────────────── */
function romeOffsetMin(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUTC - ms) / 60000);
}
/** Inizio e fine (ms UTC) di una giornata di calendario italiana. */
export function romeDayBounds(day) {
  const [y, m, d] = day.split("-").map(Number);
  const at = (dd) => { const g = Date.UTC(y, m - 1, dd); return g - romeOffsetMin(g) * 60000; };
  return { start: at(d), end: at(d + 1) };
}
const ROME_DAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
export const romeToday = (now = Date.now()) => ROME_DAY().format(new Date(now));
export const romeYesterday = (now = Date.now()) => ROME_DAY().format(new Date(now - 86400e3));

/* ─────────────── costi ─────────────── */

// $/MTok (listino Anthropic ott 2026); il batch costa la metà.
export const PRICES = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
export function costUSD(model, usage, { batch = true } = {}) {
  const p = PRICES[model] || PRICES["claude-opus-5"];
  const f = batch ? 0.5 : 1;
  const inTok = (usage?.input_tokens || 0) + (usage?.cache_creation_input_tokens || 0) * 1.25 + (usage?.cache_read_input_tokens || 0) * 0.1;
  return ((inTok * p.in + (usage?.output_tokens || 0) * p.out) / 1e6) * f;
}
/** Stima prudente prima di inviare: caratteri/3 di input, output fisso. */
export function estimateCostUSD(model, inputChars, outTokens = 6000) {
  return costUSD(model, { input_tokens: inputChars / 3, output_tokens: outTokens });
}
