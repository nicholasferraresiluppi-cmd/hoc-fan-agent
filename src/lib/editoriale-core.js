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

/** Mappa fileId → id del contenuto che lo usa. */
export function usageMap(items) {
  const m = new Map();
  for (const it of items || []) for (const f of filesOf(it)) if (!m.has(f)) m.set(f, it.id);
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
    const { publishedAt, publishedBy, pubTask, ...rest } = item;
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
