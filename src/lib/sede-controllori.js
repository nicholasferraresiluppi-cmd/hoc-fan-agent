// Controllo delle uscite — i controllori indipendenti degli uffici della Sede che
// non ne avevano (4/10/2026). Logica PURA (nessun import): la route legge i dati,
// qui si decide se il RISULTATO di un ufficio è credibile. Non basta che un
// lavoro sia "partito": "Misura del progresso" risultava partito ogni notte ma il
// suo risultato nel database non c'era (trovato il giorno in cui è nata la Sede).
//
// Ogni controllo riceve il risultato corrente e le metriche dell'ultimo controllo
// (la sua memoria) e restituisce { ok, problemi[], metriche }. Le soglie sono
// prudenti: segnalano i guasti evidenti (vuoto, vecchio, crollato, impossibile),
// non i cambiamenti normali da un giorno all'altro.

export const VERSION = "ctrl-1";

const H = 3600e3;
const ageOf = (iso, now) => {
  const t = typeof iso === "number" ? iso : Date.parse(iso || "");
  return Number.isFinite(t) ? now - t : null;
};
const crollo = (cur, prev, quota = 0.65) => prev != null && prev > 0 && cur != null && cur < prev * quota;
const fmtH = (ms) => (ms > 48 * H ? `${Math.round(ms / 24 / H)} giorni` : `${Math.round(ms / H)} ore`);

export const CONTROLLI = [
  {
    id: "operator-signals",
    label: "Segnali operatori",
    check(d, prev, now) {
      const p = [];
      if (!d) return { ok: false, problemi: ["Nessun risultato nel database: il calcolo notturno non ha salvato niente"], metriche: {} };
      const n = Number(d.operators ?? d.profiles?.length ?? 0);
      const age = ageOf(d.generated_at, now);
      if (age != null && age > 30 * H) p.push(`Risultato vecchio di ${fmtH(age)}`);
      if (n < 50) p.push(`Solo ${n} operatori profilati (di solito 150-200)`);
      if (crollo(n, prev?.operatori)) p.push(`Operatori profilati crollati: ${n} contro ${prev.operatori} dell'ultimo controllo`);
      const med = d.org_medians || {};
      const bad = Object.entries(med).filter(([k, v]) => k !== "slow_reply_rate" && !(Number.isFinite(v) && v > 0)).map(([k]) => k);
      if (bad.length) p.push(`Valori di riferimento non validi: ${bad.join(", ")}`);
      return { ok: p.length === 0, problemi: p, metriche: { operatori: n } };
    },
  },
  {
    id: "academy-signals",
    label: "Cosa fa vendere",
    check(d, prev, now) {
      const p = [];
      if (!d) return { ok: false, problemi: ["Nessun risultato nel database"], metriche: {} };
      const turni = Number(d.shifts_analyzed || 0), creator = Number(d.creators_analyzed || 0);
      const age = ageOf(d.generated_at, now);
      if (age != null && age > 30 * H) p.push(`Risultato vecchio di ${fmtH(age)}`);
      if (turni < 1000) p.push(`Solo ${turni} turni analizzati (di solito 4-5 mila)`);
      if (creator < 15) p.push(`Solo ${creator} creator analizzate`);
      if (crollo(turni, prev?.turni)) p.push(`Turni analizzati crollati: ${turni} contro ${prev.turni}`);
      // il sales manager AI e la formazione si basano su questi due segnali: se si
      // ribaltano, prima di usarli va capito perché (dato rotto o mondo cambiato)
      for (const key of ["ppv_avg_price", "ppv_cadence"]) {
        const s = (d.signals || []).find((x) => x.key === key);
        if (!s) p.push(`Manca il segnale «${key}»`);
        else if (s.direction !== "up" || (s.consistency ?? 0) < 0.6) p.push(`«${s.label}» non conferma più lo studio (direzione ${s.direction}, concordano ${Math.round((s.consistency || 0) * 100)}% delle creator): verificare prima di usarlo nel coaching`);
      }
      return { ok: p.length === 0, problemi: p, metriche: { turni, creator } };
    },
  },
  {
    id: "transfer",
    label: "Misura del progresso",
    check(d, prev, now) {
      const p = [];
      if (!d) return { ok: false, problemi: ["Nessun risultato nel database: il lavoro risulta partito ma non salva niente"], metriche: {} };
      const n = Array.isArray(d.operators) ? d.operators.length : 0;
      const mesi = Array.isArray(d.months) ? d.months.length : 0;
      if (n < 30) p.push(`Solo ${n} operatori con una traiettoria`);
      if (mesi < 2) p.push(`Solo ${mesi} mesi: serve almeno un confronto`);
      if (crollo(n, prev?.operatori)) p.push(`Operatori crollati: ${n} contro ${prev.operatori}`);
      return { ok: p.length === 0, problemi: p, metriche: { operatori: n, mesi } };
    },
  },
  {
    id: "creator-difficulty",
    label: "Difficoltà creator",
    check(d, prev, now) {
      const p = [];
      if (!d) return { ok: false, problemi: ["Nessun risultato nel database"], metriche: {} };
      const n = Number(d.creators_total ?? d.profiles?.length ?? 0);
      const age = ageOf(d.generated_at, now);
      if (age != null && age > 8 * 24 * H) p.push(`Risultato vecchio di ${fmtH(age)} (si rifà ogni settimana)`);
      if (n < 20) p.push(`Solo ${n} creator con un profilo`);
      if (crollo(n, prev?.creator)) p.push(`Creator crollate: ${n} contro ${prev.creator}`);
      const conIndice = (d.profiles || []).filter((x) => x.difficulty_index != null).length;
      if (n && conIndice / n < 0.4) p.push(`Solo ${conIndice} creator su ${n} hanno un indice: troppi dati mancanti`);
      return { ok: p.length === 0, problemi: p, metriche: { creator: n, con_indice: conIndice } };
    },
  },
  {
    id: "citta-lunedi",
    label: "Il lunedì della città",
    check(d, prev, now) {
      const p = [];
      const w = d?.weekly, beat = d?.beat;
      const age = ageOf(w?.at, now);
      if (!w || age == null) return { ok: false, problemi: ["Il riepilogo del lunedì non è mai uscito"], metriche: {} };
      if (age > 8 * 24 * H) p.push(`L'ultimo riepilogo è di ${fmtH(age)} fa: questo lunedì non è uscito`);
      if (beat && beat.ok === false) p.push("Il riepilogo è stato preparato ma l'email non è partita");
      if (!Array.isArray(w.open)) p.push("Riepilogo senza la lista delle priorità");
      return { ok: p.length === 0, problemi: p, metriche: { priorita: Array.isArray(w.open) ? w.open.length : null } };
    },
  },
  {
    id: "queue",
    label: "Fan in attesa",
    check(d, prev, now) {
      const p = [];
      if (!d?.at) return { ok: false, problemi: ["Nessuna fotografia salvata"], metriche: {} };
      const age = ageOf(d.at, now);
      const creator = Number(d.creators || 0), fan = Number(d.fans_total ?? -1);
      if (age > 30 * H) p.push(`Ultima fotografia di ${fmtH(age)} fa`);
      if (creator < 10) p.push(`Fotografia su sole ${creator} creator`);
      if (fan === 0 && creator > 0) p.push("Zero fan in attesa su tutte le creator: improbabile, probabile dato vuoto");
      if (crollo(fan, prev?.fan, 0.3)) p.push(`Fan in attesa crollati: ${fan} contro ${prev.fan}`);
      return { ok: p.length === 0, problemi: p, metriche: { creator, fan } };
    },
  },
];

export const controlloById = (id) => CONTROLLI.find((c) => c.id === id);

/** Esegue un controllo senza mai lanciare: un controllore che si rompe è esso stesso un problema. */
export function runControl(c, data, prev, now = Date.now()) {
  try {
    const r = c.check(data, prev || null, now);
    return { ok: !!r.ok, problemi: r.problemi || [], metriche: r.metriche || {} };
  } catch (e) {
    return { ok: false, problemi: [`Il controllo stesso è fallito: ${String(e?.message || e).slice(0, 120)}`], metriche: {} };
  }
}
