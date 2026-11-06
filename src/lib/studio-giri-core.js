// La redazione video — logica pura (6/11/2026). Nessun import: la usano API, componente, script e test.
//
// Rende visibile il lavoro dell'ufficio che produce i reel di un profilo, per poterlo moltiplicare
// sulle altre creator. Il lavoro gira a giri: il direttore creativo sceglie le idee (e ne ferma
// alcune prima del montaggio), il montaggio le monta, il revisore le guarda una per una e scarta
// quelle con un errore (anche più passaggi), quello che resta va nel Banco montaggi. Lì una persona
// sceglie cosa pubblicare; poi «Cosa ha funzionato» misura cosa è uscito.
//
// Un GIRO (registrato a fine lavoro da chi l'ha fatto, con scripts/studio-giro.mjs):
//   { n, titolo, day, cartella, montati, tenuti, revisioni, scartati: [{ titolo, motivo }], fermati: [{ titolo, motivo }] }
// fermati = idee bloccate PRIMA del montaggio (dal direttore creativo).

export const GIRI_VERSION = "giri-1";

/** I ruoli dell'ufficio, nell'ordine in cui il lavoro passa. `chi` = AI | persona | codice. */
export const TEAM = [
  { id: "direttore", nome: "Direttore creativo", chi: "AI", compito: "Sceglie dal girato le idee da montare e scrive l'aggancio; ferma quelle deboli o fuori regola" },
  { id: "montaggio", nome: "Montaggio", chi: "AI", compito: "Monta, colora sul profilo di destinazione, mette la scritta nella fascia sicura" },
  { id: "revisore", nome: "Revisore", chi: "AI", compito: "Guarda ogni video fotogramma per fotogramma: scarta errori, doppioni e ciò che non si può pubblicare" },
  { id: "scelta", nome: "Scelta", chi: "persona", compito: "Nel Banco decide cosa pubblicare e cosa no" },
  { id: "misura", nome: "Misura", chi: "codice", compito: "Dopo l'uscita: view a 7 giorni contro il solito, visite al link" },
];

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const int = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function items(list, max = 60) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map((x) => ({ titolo: str(x?.titolo, 80), motivo: str(x?.motivo, 240) })).filter((x) => x.titolo);
}

/** Controlla e pulisce un giro. Ritorna { ok, giro } o { ok:false, error }. */
export function validateGiro(raw = {}) {
  const n = int(raw.n);
  if (!n) return { ok: false, error: "Numero del giro mancante" };
  const day = str(raw.day, 10);
  if (!DAY.test(day)) return { ok: false, error: "Data del giro (YYYY-MM-DD) mancante" };
  const montati = int(raw.montati), tenuti = int(raw.tenuti);
  if (montati == null || tenuti == null) return { ok: false, error: "Montati e tenuti sono obbligatori" };
  if (tenuti > montati) return { ok: false, error: "Più tenuti che montati" };
  const scartati = items(raw.scartati);
  if (scartati.length > montati - tenuti) return { ok: false, error: `Elencati ${scartati.length} scartati ma ne mancano solo ${montati - tenuti}` };
  return {
    ok: true,
    giro: {
      n, day, titolo: str(raw.titolo, 120) || `Giro ${n}`, cartella: str(raw.cartella, 160) || null,
      montati, tenuti, revisioni: int(raw.revisioni) ?? null,
      scartati, fermati: items(raw.fermati),
    },
  };
}

/** Inserisce o sostituisce (stesso numero) e riordina dal più recente. */
export function upsertGiro(list = [], giro) {
  return [...list.filter((g) => g.n !== giro.n), giro].sort((a, b) => b.n - a.n);
}

/** Totali dell'ufficio sul profilo. */
export function teamTotals(giri = []) {
  const t = { giri: giri.length, montati: 0, tenuti: 0, scartati: 0, fermati: 0, revisioni: 0, primo: null, ultimo: null };
  for (const g of giri) {
    t.montati += g.montati || 0;
    t.tenuti += g.tenuti || 0;
    t.scartati += (g.montati || 0) - (g.tenuti || 0);
    t.fermati += g.fermati?.length || 0;
    t.revisioni += g.revisioni || 0;
    if (!t.primo || g.day < t.primo) t.primo = g.day;
    if (!t.ultimo || g.day > t.ultimo) t.ultimo = g.day;
  }
  return t;
}

/**
 * Dal montaggio al reel che rende: ogni passaggio con quanti ci arrivano.
 * banco: righe del Banco { state }; esiti: righe di «Cosa ha funzionato» { fileId, ratio }.
 * I passaggi dopo il Banco contano i video del Banco, non i giri: un video caricato a mano conta lo stesso.
 */
export function funnel({ giri = [], banco = [], esiti = [] } = {}) {
  const t = teamTotals(giri);
  const scelti = banco.filter((r) => r.state === "scelto" || r.state === "pronto").length;
  const linked = esiti.filter((o) => o.fileId && !o.video?.missing);
  const measured = linked.filter((o) => o.ratio != null);
  return [
    { id: "montati", label: "Montati", n: t.giri ? t.montati : null, who: "montaggio" },
    { id: "tenuti", label: "Passati dal revisore", n: t.giri ? t.tenuti : null, who: "revisore" },
    { id: "banco", label: "Nel Banco", n: banco.length, who: "revisore" },
    { id: "scelti", label: "Scelti", n: scelti, who: "scelta" },
    { id: "usciti", label: "Usciti", n: linked.length, who: "scelta" },
    { id: "sopra", label: "Sopra il solito", n: measured.filter((o) => o.ratio >= 1).length, of: measured.length, who: "misura" },
  ];
}

/** Quante volte per ruolo ha lavorato l'ufficio (per le schede della squadra). */
export function teamWork({ giri = [], banco = [], esiti = [] } = {}) {
  const t = teamTotals(giri);
  const marked = banco.filter((r) => r.state && r.state !== "da_vedere").length;
  const measured = esiti.filter((o) => o.fileId && o.ratio != null).length;
  return {
    direttore: t.giri ? `${t.giri} ${t.giri === 1 ? "giro" : "giri"} di idee${t.fermati ? `, ${t.fermati} ${t.fermati === 1 ? "fermata" : "fermate"} prima del montaggio` : ""}` : null,
    montaggio: t.giri ? `${t.montati} video montati` : null,
    revisore: t.giri ? `${t.scartati} scartati su ${t.montati}${t.revisioni ? `, ${t.revisioni} passaggi` : ""}` : null,
    scelta: banco.length ? `${marked} ${marked === 1 ? "giudicato" : "giudicati"} su ${banco.length}` : null,
    misura: measured ? `${measured} reel ${measured === 1 ? "misurato" : "misurati"}` : null,
  };
}

/** Riga per la Sede: cosa ha fatto l'ultima volta. */
export function beatLine(handle, giro) {
  return `@${handle} · ${giro.titolo}: ${giro.tenuti} tenuti su ${giro.montati} montati (${giro.day})`;
}
