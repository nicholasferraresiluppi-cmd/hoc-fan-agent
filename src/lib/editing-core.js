// Editing — la sala delle scrivanie (6/11/2026). Logica pura: nessun import, la usano API, pagine e test.
//
// Una SCRIVANIA per creator (con dentro i suoi profili): il lavoro dal girato al reel misurato in sette
// tappe, sempre nello stesso ordine, ognuna con chi ce l'ha in mano. Principi presi dagli strumenti di
// settore (studio 6/11): uno spazio per cliente (Planable), le tappe in fila coi conteggi (pipeline dei
// CRM), ciò che è fermo si accende (il "rotting" di Pipedrive), una sola riga «Adesso» con la cosa che
// blocca, i risultati per caratteristica del video e non per post (Adobe GenStudio) che tornano nel giro
// dopo. Il pezzo che nessuno ha: la tappa del GIRATO, che si accende quando il materiale utile è finito.
//
// Onestà dei numeri: le tappe 2-4 (idee, montaggio, revisione) girano in sessione e si conoscono solo
// a giro finito → mostrano l'ULTIMO giro, dichiarato. Scelta, uscita e misura vengono dal Banco e dal
// magazzino dati. Un tempo che non si può misurare resta «–».

export const STUCK_DAYS = { scelta: 2, uscita: 3 }; // oltre, la tappa si accende
const DAY_MS = 86400e3;

export const STAGES = [
  { id: "girato", label: "Girato", owner: "creator" },
  { id: "idee", label: "Idee", owner: "AI" },
  { id: "montaggio", label: "Montaggio", owner: "AI" },
  { id: "revisione", label: "Revisione", owner: "AI" },
  { id: "scelta", label: "Scelta", owner: "persona" },
  { id: "uscita", label: "Uscita", owner: "persona" },
  { id: "misura", label: "Misura", owner: "codice" },
];

export const GIRATO = {
  ok: "c'è materiale",
  poco: "sta finendo",
  finito: "utile finito",
};

export function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Profili di Regia social → una scrivania per creator (i profili archiviati restano fuori). */
export function groupDesks(profiles = []) {
  const by = new Map();
  for (const p of profiles) {
    if (!p || p.archived) continue;
    const name = String(p.creator || p.handle || p.id).trim();
    const slug = slugify(name) || slugify(p.id);
    if (!by.has(slug)) by.set(slug, { slug, creator: name, profiles: [] });
    by.get(slug).profiles.push({ id: p.id, handle: p.handle, platform: p.platform });
  }
  return [...by.values()].sort((a, b) => a.creator.localeCompare(b.creator, "it"));
}

const fmtDay = (d) => { const x = new Date(`${d}T12:00:00Z`); return isNaN(x) ? String(d || "") : x.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" }); };
const ts = (v) => (typeof v === "number" ? v : Date.parse(v || "")) || null;
const daysSince = (t, now) => (t ? Math.max(0, Math.floor((now - t) / DAY_MS)) : null);

export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** L'ultimo giro registrato su tutti i profili della scrivania. */
export function lastGiro(giri = []) {
  return [...giri].sort((a, b) => String(b.day).localeCompare(String(a.day)) || b.n - a.n)[0] || null;
}

/**
 * Le sette tappe. Ingressi già uniti su tutti i profili della scrivania:
 *   giri   giri registrati (studio-giri)          banco  righe del Banco { state, created, markedAt }
 *   esiti  righe di «Cosa ha funzionato» { fileId, ratio, views7, due7, pubAt, video }
 */
export function stages({ giri = [], banco = [], esiti = [], now = Date.now() } = {}) {
  const g = lastGiro(giri);
  const girato = g?.girato?.stato || null;
  const daVedere = banco.filter((r) => r.state === "da_vedere");
  const linkedIds = new Set(esiti.filter((o) => o.fileId).map((o) => o.fileId));
  const pronti = banco.filter((r) => r.state === "pronto" && !linkedIds.has(r.id));
  const linked = esiti.filter((o) => o.fileId && !o.video?.missing);
  const measured = linked.filter((o) => o.ratio != null);
  const ageScelta = daVedere.length ? daysSince(Math.min(...daVedere.map((r) => ts(r.created) || now)), now) : null;
  const agePronti = pronti.length ? daysSince(Math.min(...pronti.map((r) => ts(r.markedAt) || now)), now) : null;
  const giro = g ? `ultimo giro ${fmtDay(g.day)}` : "nessun giro";
  const out = {
    girato: { n: null, stato: girato, sub: girato ? GIRATO[girato] : "non registrato", stuck: girato === "finito", warn: girato === "poco" },
    idee: { n: g ? g.montati + (g.fermati?.length || 0) : null, sub: g?.fermati?.length ? `${g.fermati.length} fermate · ${giro}` : giro },
    montaggio: { n: g ? g.montati : null, sub: giro },
    revisione: { n: g ? g.tenuti : null, sub: g ? `${g.montati - g.tenuti} scartati · ${giro}` : giro },
    scelta: { n: daVedere.length, sub: daVedere.length ? (ageScelta >= 1 ? `da guardare, ferma da ${ageScelta} g` : "da guardare") : "niente da guardare", stuck: ageScelta != null && ageScelta >= STUCK_DAYS.scelta, age: ageScelta },
    uscita: { n: pronti.length, sub: pronti.length ? (agePronti >= 1 ? `pronti, fermi da ${agePronti} g` : "pronti da pubblicare") : "niente in attesa", stuck: agePronti != null && agePronti >= STUCK_DAYS.uscita, age: agePronti },
    misura: { n: measured.length, sub: linked.length - measured.length > 0 ? `${linked.length - measured.length} aspettano i 7 giorni` : measured.length ? "misurati a 7 giorni" : "nessun reel collegato", of: linked.length },
  };
  return STAGES.map((s) => ({ ...s, ...out[s.id] }));
}

/** Una sola riga: la cosa che blocca adesso e chi deve muoversi. */
export function adesso(st = [], { toLink = 0, girato = null } = {}) {
  const by = Object.fromEntries(st.map((s) => [s.id, s]));
  const nota = girato?.nota ? `: ${girato.nota}` : "";
  if (by.girato?.stuck) return { tone: "warn", stage: "girato", text: `Il girato utile è finito: serve uno shooting${nota}` };
  if (by.scelta?.stuck) return { tone: "warn", stage: "scelta", text: `${by.scelta.n} video aspettano la scelta da ${by.scelta.age} giorni` };
  if (by.uscita?.stuck) return { tone: "warn", stage: "uscita", text: `${by.uscita.n} video pronti non sono ancora usciti da ${by.uscita.age} giorni` };
  if (toLink > 0) return { tone: "info", stage: "misura", text: `${toLink} reel ${toLink === 1 ? "uscito va collegato" : "usciti vanno collegati"} al suo video, per misurarli` };
  if (by.scelta?.n) return { tone: "info", stage: "scelta", text: `${by.scelta.n} video da guardare nel Banco` };
  if (by.uscita?.n) return { tone: "info", stage: "uscita", text: `${by.uscita.n} video pronti da pubblicare` };
  if (by.girato?.warn) return { tone: "info", stage: "girato", text: `Il girato sta finendo: conviene programmare uno shooting${nota}` };
  return { tone: "ok", stage: "idee", text: "Niente di fermo: il prossimo passo è un nuovo giro di montaggio" };
}

/**
 * Quanto resta il lavoro tra una tappa e l'altra (mediane in giorni, null = non misurabile):
 *   scelta   dal caricamento nel Banco al primo giudizio
 *   uscita   da «pronto» all'uscita del reel collegato
 */
export function tempi({ banco = [], esiti = [] } = {}) {
  const byId = new Map(banco.map((r) => [r.id, r]));
  const scelta = banco.filter((r) => r.state !== "da_vedere" && ts(r.created) && ts(r.markedAt))
    .map((r) => (ts(r.markedAt) - ts(r.created)) / DAY_MS).filter((d) => d >= 0);
  const uscita = esiti.filter((o) => o.fileId && o.pubAt && byId.get(o.fileId)?.markedAt)
    .map((o) => (o.pubAt - ts(byId.get(o.fileId).markedAt)) / DAY_MS).filter((d) => d >= 0);
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return { scelta: r1(median(scelta)), sceltaN: scelta.length, uscita: r1(median(uscita)), uscitaN: uscita.length };
}

/** Cosa rifare nel prossimo giro: i formati con abbastanza reel misurati, dal migliore. */
export function rifare(formats = []) {
  return {
    sure: formats.filter((f) => f.enough).sort((a, b) => b.ratio - a.ratio),
    few: formats.filter((f) => !f.enough),
  };
}
