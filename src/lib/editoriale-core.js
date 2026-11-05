// Editoriale Instagram — logica pura (26/10/2026). Nessun import: la usano API, pagine e test.
//
// Il lavoro, come lo ha disegnato Nicholas: l'editor entra nel drive della creator e smista il
// materiale. Le foto diventano caroselli, i video diventano reel da montare. Un carosello finito,
// o un reel montato, è PRONTO; quando ha un giorno, un'ora e un profilo Instagram è IN CALENDARIO;
// quando esce è PUBBLICATO.
//
// Scelte:
//  - i file non si spostano tra cartelle: nel drive restano dove sono, cambia il loro stato qui.
//    Niente cartelle parallele da tenere allineate.
//  - NIENTE DOPPIONI, per creator (decisione di Nicholas, 26/10): una foto o un video usato in un
//    contenuto non si può più scegliere, su nessun profilo della stessa creator. Torna libero solo
//    se il contenuto viene smontato. Il blocco vero sta nel server (lock per file), qui la regola.
//  - il Warm-up sa quanto deve uscire ogni giorno (1 carosello, 2-3 reel…): da lì vengono le
//    caselle vuote del calendario, e la spunta «Pubblica il carosello» nel Warm-up segna pubblicato
//    il contenuto in calendario quel giorno.

export const EDITORIALE_VERSION = "edit-ig-1";

export const TYPES = {
  carosello: { label: "Carosello", plural: "Caroselli", kind: "photo", min: 2, max: 20 },
  reel: { label: "Reel", plural: "Reel", kind: "video", min: 1, max: 10 },
};

// Le colonne, nell'ordine in cui il lavoro le attraversa (calcolate dallo stato, non salvate).
export const STAGES = [
  { key: "lavorazione", label: { carosello: "In preparazione", reel: "Da montare" } },
  { key: "pronto", label: { carosello: "Pronti", reel: "Montati" } },
  { key: "calendario", label: { carosello: "In calendario", reel: "In calendario" } },
  { key: "pubblicato", label: { carosello: "Pubblicati", reel: "Pubblicati" } },
];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const s = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));

/** Chiave stabile di una creator (il nome come lo scrivono in Account social). */
export const creatorKey = (name) =>
  s(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** In che colonna sta un contenuto. */
export function stageOf(item) {
  if (!item) return null;
  if (item.status === "pubblicato") return "pubblicato";
  if (item.status === "pronto" && item.slot) return "calendario";
  if (item.status === "pronto") return "pronto";
  return "lavorazione";
}

/** Tutti i file che un contenuto tiene occupati (le foto, i video grezzi, il reel montato). */
export const filesOf = (item) => [...new Set([...(item?.files || []), ...(item?.final ? [item.final] : [])])];

/**
 * I file che un contenuto tiene BLOCCATI per sé: le foto del carosello e il reel montato.
 * I video grezzi di un reel no (29/10/2026, Nicholas: «invece che bloccare i video usati, fammi
 * vedere quante volte è stato usato ma posso riselezionarlo»): da uno stesso girato si montano più
 * reel, quindi si contano (`rawUses`) invece di bloccarli. Le foto restano senza doppioni.
 */
export const lockedFilesOf = (item) => [...new Set([...(item?.type === "carosello" ? item.files || [] : []), ...(item?.final ? [item.final] : [])])];

/** Mappa fileId → id del contenuto che lo tiene bloccato. */
export function usageMap(items) {
  const m = new Map();
  for (const it of items || []) for (const f of lockedFilesOf(it)) if (!m.has(f)) m.set(f, it.id);
  return m;
}

/** Mappa fileId → id dei reel che usano quel video grezzo (quante volte è stato riusato). */
export function rawUses(items) {
  const m = new Map();
  for (const it of items || []) {
    if (it.type === "carosello") continue;
    for (const f of new Set(it.files || [])) { if (!m.has(f)) m.set(f, []); m.get(f).push(it.id); }
  }
  return m;
}

/** Cosa manca perché il contenuto sia pronto ([] = pronto). */
export function readyProblems(item) {
  const t = TYPES[item?.type];
  if (!t) return ["Tipo di contenuto sconosciuto"];
  const out = [];
  const n = (item.files || []).length;
  if (item.type === "carosello") {
    if (n < t.min) out.push(`Servono almeno ${t.min} foto`);
  } else {
    if (n < 1) out.push("Manca il video da montare");
    if (!item.final && !item.noEdit) out.push("Manca il reel montato");
  }
  return out;
}

/**
 * Valida e ripulisce un contenuto. `kinds` = Map fileId → "photo"|"video" dei file nel drive:
 * un file che non c'è più, o del tipo sbagliato, non entra.
 */
export function normalizeItem(input, prev, kinds) {
  const errors = [];
  const type = prev?.type || input?.type;
  const t = TYPES[type];
  if (!t) return { ok: false, errors: ["Scegli carosello o reel"] };
  const files = [...new Set((Array.isArray(input?.files) ? input.files : prev?.files || []).map((x) => s(x, 80)).filter(Boolean))];
  if (files.length > t.max) errors.push(`Al massimo ${t.max} ${t.kind === "photo" ? "foto" : "video"}`);
  const want = t.kind;
  for (const f of files) {
    const k = kinds?.get(f);
    if (!k) errors.push("Un file non è più nel drive: ricarica la cartella");
    else if (k !== want) errors.push(type === "carosello" ? "In un carosello vanno solo foto" : "In un reel vanno solo video");
  }
  let final = input && "final" in input ? s(input.final, 80) || null : prev?.final || null;
  if (type !== "reel") final = null;
  if (final) {
    const k = kinds?.get(final);
    if (!k) errors.push("Il reel montato non è più nel drive: ricarica la cartella");
    else if (k !== "video") errors.push("Il reel montato deve essere un video");
    if (files.includes(final)) errors.push("Il reel montato non può essere anche uno dei video grezzi");
  }
  const pick = (k, max) => (input && k in input ? s(input[k], max) : prev?.[k] || "");
  const item = {
    id: prev?.id || s(input?.id, 40) || null,
    type,
    title: pick("title", 80),
    files,
    final,
    noEdit: type === "reel" ? Boolean(input && "noEdit" in input ? input.noEdit : prev?.noEdit) : false,
    caption: pick("caption", 2200),
    sound: pick("sound", 200),
    city: pick("city", 80),
    notes: pick("notes", 600),
    status: prev?.status || "lavorazione",
    slot: prev?.slot || null,
  };
  if (!item.title) item.title = type === "carosello" ? "Carosello" : "Reel";
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  // un contenuto già pronto che perde un pezzo torna in preparazione (e fuori dal calendario)
  if (item.status === "pronto" && readyProblems(item).length) { item.status = "lavorazione"; item.slot = null; }
  return { ok: true, item };
}

/** Segna pronto / riporta in preparazione. */
export function setReady(item, on) {
  if (item.status === "pubblicato") return { ok: false, errors: ["È già pubblicato"] };
  if (!on) return { ok: true, item: { ...item, status: "lavorazione", slot: null } };
  const p = readyProblems(item);
  if (p.length) return { ok: false, errors: p };
  return { ok: true, item: { ...item, status: "pronto" } };
}

/**
 * Pronto da solo (29/10/2026, Nicholas: «la fase in preparazione non serve più»): un contenuto
 * completo (carosello con le foto, reel col montato o «va bene così») è pronto senza un clic in più.
 * Resta in lavorazione solo ciò che manca davvero (es. il reel ancora da montare).
 */
export function autoReady(item) {
  if (item?.status !== "lavorazione" || readyProblems(item).length) return item;
  return { ...item, status: "pronto" };
}

/** Mette in calendario (o toglie con slot null). `profileIds` = profili IG della stessa creator. */
export function schedule(item, slot, profileIds) {
  if (item.status === "pubblicato") return { ok: false, errors: ["È già pubblicato"] };
  if (!slot) return { ok: true, item: { ...item, slot: null } };
  const p = readyProblems(item);
  if (p.length) return { ok: false, errors: ["Prima va finito: " + p.join(", ").toLowerCase()] };
  const profileId = s(slot.profileId, 80), date = s(slot.date, 10), time = s(slot.time, 5);
  if (!profileIds?.includes(profileId)) return { ok: false, errors: ["Profilo non di questa creator"] };
  if (!DAY_RE.test(date)) return { ok: false, errors: ["Data non valida"] };
  if (time && !TIME_RE.test(time)) return { ok: false, errors: ["Ora non valida (hh:mm)"] };
  return { ok: true, item: { ...item, status: "pronto", slot: { profileId, date, time: time || null } } };
}

/** Pubblicato sì/no. Pubblicare un contenuto senza calendario lo mette nel giorno di oggi. */
export function setPublished(item, on, { by, today, profileId, task } = {}) {
  if (!on) {
    if (item.status !== "pubblicato") return { ok: true, item };
    const { publishedAt, publishedBy, pubTask, autoPub, ...rest } = item;
    // riaperto dopo il segno automatico: quel post non è questo contenuto, non va riabbinato
    if (autoPub?.post) rest.autoReject = [...new Set([...(item.autoReject || []), autoPub.post])].slice(-10);
    return { ok: true, item: { ...rest, status: "pronto" } };
  }
  const p = readyProblems(item);
  if (p.length) return { ok: false, errors: p };
  const slot = item.slot || (profileId ? { profileId, date: today, time: null } : null);
  if (!slot) return { ok: false, errors: ["Scegli prima su quale profilo è uscito"] };
  return { ok: true, item: { ...item, status: "pubblicato", slot, publishedAt: Date.now(), publishedBy: by || "", pubTask: task || null } };
}

// ── legame col Warm-up ───────────────────────────────────────────────────────

/** Che tipo di contenuto pubblica una task del Warm-up (null se non pubblica nulla). */
export function pubKindOfTask(taskId) {
  const id = String(taskId || "");
  if (/-car$/.test(id)) return "carosello";
  if (/-r\d+$/.test(id) || id === "w1-reels") return "reel";
  return null;
}

/** Quanti contenuti chiede il piano del Warm-up in un giorno, dalle task di quel giorno. */
export function needsFromTaskIds(ids) {
  const out = { carosello: 0, reel: 0, reelMax: 0 };
  for (const id of ids || []) {
    const k = pubKindOfTask(id);
    if (k === "carosello") out.carosello++;
    else if (k === "reel") {
      if (id === "w1-reels") { out.reel += 1; out.reelMax += 3; } else { out.reel++; out.reelMax++; }
    }
  }
  return out;
}

const byTime = (a, b) => String(a.slot?.time || "99").localeCompare(String(b.slot?.time || "99")) || String(a.id).localeCompare(String(b.id));

/** I contenuti in calendario per un profilo in un giorno, in ordine di ora. */
export function dayItems(items, profileId, date, type) {
  return (items || []).filter((it) => it.slot?.profileId === profileId && it.slot?.date === date && (!type || it.type === type)).sort(byTime);
}

/**
 * Il contenuto a cui si riferisce una task di pubblicazione del Warm-up: il carosello del
 * giorno; per i reel numerati il n-esimo del giorno; per «da 1 a 3 reels» il primo non uscito.
 * Se la task viene spuntata ma il contenuto collegato è già uscito con un'altra task, si
 * prende il primo ancora da pubblicare.
 */
export function itemForTask(items, profileId, date, taskId) {
  const kind = pubKindOfTask(taskId);
  if (!kind) return null;
  const list = dayItems(items, profileId, date, kind);
  if (!list.length) return null;
  const linked = list.find((it) => it.pubTask === taskId);
  if (linked) return linked;
  const m = /-r(\d+)$/.exec(taskId);
  const idx = m ? Number(m[1]) - 1 : 0;
  const cand = list[idx] && list[idx].status !== "pubblicato" ? list[idx] : null;
  return cand || list.find((it) => it.status !== "pubblicato") || null;
}

/** Quanto c'è in calendario rispetto a quanto chiede il piano, per tipo. */
export function coverage(items, profileId, date, needs) {
  const car = dayItems(items, profileId, date, "carosello").length;
  const reel = dayItems(items, profileId, date, "reel").length;
  return {
    carosello: { have: car, need: needs?.carosello || 0, missing: Math.max(0, (needs?.carosello || 0) - car) },
    reel: { have: reel, need: needs?.reel || 0, max: needs?.reelMax || 0, missing: Math.max(0, (needs?.reel || 0) - reel) },
  };
}

// ── calendario ────────────────────────────────────────────────────────────────

/** Le date (YYYY-MM-DD) delle settimane intere che coprono un mese, da lunedì. */
export function monthGrid(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(y, m, 0));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));
  const out = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export const shiftMonth = (ym, n) => {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

// ── pubblicato in automatico (29/10/2026) ────────────────────────────────────
// Nicholas: «far sì che si segni pubblicato in automatico, un giro ogni ora sul profilo IG che
// controlla in base all'orario». Si leggono gli ultimi post PUBBLICI del profilo (Apify, nessun
// accesso all'account) e si abbina ogni contenuto in calendario a un post dello stesso tipo uscito
// vicino all'orario previsto. Prova in più: la didascalia. Mai abbinato due volte lo stesso post.

const AUTO_BEFORE_H = 3;   // un post uscito fino a 3 ore prima dell'orario conta
const AUTO_AFTER_H = 18;   // …e fino a 18 ore dopo
export const AUTO_GIVEUP_H = 30; // oltre, si smette di cercare: lo si segna a mano

/** Millisecondi dell'orario in calendario (ora di Roma). Senza ora = inizio del giorno. */
export function romeTs(date, time) {
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(time || "") ? time.split(":").map(Number) : [0, 0];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asRome = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return guess - (asRome - guess);
}

/** Contenuti da controllare adesso: pronti, in calendario, orario passato da 15 min, non oltre 30 h. */
export function dueForAutoCheck(items, now) {
  return (items || []).filter((it) => {
    if (it.status !== "pronto" || !it.slot?.date) return false;
    const t = romeTs(it.slot.date, it.slot.time);
    return now >= t + 15 * 60000 && now <= t + AUTO_GIVEUP_H * 3600000;
  });
}

const words = (s) => new Set(String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/https?:\/\/\S+/g, "").match(/[\p{L}\p{N}]{3,}/gu) || []);
/** Somiglianza delle didascalie (0-1): parole in comune sulle parole della più corta. */
export function captionMatch(a, b) {
  const A = words(a), B = words(b);
  if (A.size < 3 || B.size < 3) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

/**
 * Abbina i contenuti ai post letti. posts: [{ id, ts, kind: "reel"|"carosello"|"post", caption, url }].
 * `taken` = post già abbinati ad altri contenuti. Ritorna [{ itemId, post }].
 * Con più candidati vince la didascalia (≥0,5), poi il più vicino all'orario.
 */
export function matchPublished(items, posts, taken = new Set()) {
  const used = new Set(taken);
  const out = [];
  const sorted = [...(items || [])].sort((a, b) => romeTs(a.slot.date, a.slot.time) - romeTs(b.slot.date, b.slot.time));
  for (const it of sorted) {
    const t = romeTs(it.slot.date, it.slot.time);
    const lo = t - AUTO_BEFORE_H * 3600000, hi = t + (it.slot.time ? AUTO_AFTER_H : 24 + 6) * 3600000;
    const reject = new Set(it.autoReject || []);
    const cands = (posts || []).filter((p) => p.kind === it.type && p.ts >= lo && p.ts <= hi && !used.has(p.id) && !reject.has(p.id))
      .map((p) => ({ p, cap: captionMatch(it.caption, p.caption), dist: Math.abs(p.ts - t) }))
      .sort((a, b) => (b.cap >= 0.5) - (a.cap >= 0.5) || a.dist - b.dist);
    if (!cands.length) continue;
    used.add(cands[0].p.id);
    out.push({ itemId: it.id, post: cands[0].p, caption: cands[0].cap >= 0.5 });
  }
  return out;
}

/** La task del Warm-up risulta fatta se il suo contenuto è stato segnato pubblicato in automatico. */
export function autoItemForTask(items, profileId, date, taskId) {
  const kind = pubKindOfTask(taskId);
  if (!kind) return null;
  const list = dayItems(items, profileId, date, kind);
  if (taskId === "w1-reels") return list.find((it) => it.status === "pubblicato" && it.autoPub) || null;
  const m = /-r(\d+)$/.exec(taskId);
  const it = list[m ? Number(m[1]) - 1 : 0];
  return it && it.status === "pubblicato" && it.autoPub ? it : null;
}
