/**
 * activation.js — strumentazione dell'"aha moment" dell'operatore (I/O layer).
 *
 * Definizione v1 (decisione 2026-07-25, cfr CLAUDE.md decision log):
 *   ACTIVATION = "gap reale diagnosticato + allenato".
 *   L'operatore è ATTIVO quando, entro una finestra:
 *     (1) ha aperto il suo profilo-segnali e ha visto un gap VERO
 *         (evento signals_viewed con top_gap_key != null) — l'aha;
 *     (2) ha completato ≥ MIN_GAP_SCENARIOS scenari Academy nelle categorie
 *         che allenano proprio quel gap (recommendPathForGap(gap).categories),
 *         con overall ≥ MIN_OVERALL (floor qualità anti-grind).
 *
 * È un LEADING indicator, loggato app-side in tempo reale. La NORTH-STAR contro
 * cui si VALIDA (mai da ottimizzare direttamente — trap Airtable) è il movimento
 * reale del profilo-segnali warehouse (operator-signals). La SOGLIA numerica è un
 * PLACEHOLDER: va derivata dai dati (magic-number) su una coorte reale.
 *
 * La logica di calcolo pura vive in activation-core.js (zero import, testabile);
 * qui c'è solo l'I/O (KV) + il wiring del resolver gap→categorie.
 *
 * VINCOLO onesto: a lug 2026 nessun operatore è onboardato → l'activation rate
 * non è ancora calcolabile. Si strumenta ora, si legge dopo. Tutti gli eventi
 * girano in try/catch non-fatale: mai rompere la hot path.
 *
 * Store KV (namespace isolato, mai transcript, nessuna PII fan):
 *   activation:events:{userId}   LIST di eventi JSON (cap 200, TTL 120gg)
 *   activation:users             SET degli userId con ≥1 evento (enumerazione coorte)
 *   activation:identity:{userId} { employee, employee_id } — join key verso il warehouse
 *   activation:first:{userId}    primo timestamp visto (SET nx) — latenza di activation
 *   activation:baseline:{employee}  snapshot segnali all'aha (SET nx) — validazione forward
 */
import { kv } from "@vercel/kv";
import { recommendPathForGap } from "@/lib/coaching-paths";
import {
  ACTIVATION_VERSION,
  ACTIVATION_THRESHOLDS,
  EVENT,
  computeActivation as computeActivationCore,
} from "@/lib/activation-core";

export { ACTIVATION_VERSION, ACTIVATION_THRESHOLDS, EVENT };

/** Resolver gap→categorie (dal catalogo scenari corrente, a read-time). */
const gapCategoriesFor = (key) => {
  try {
    const p = recommendPathForGap(key);
    return (p && Array.isArray(p.categories)) ? p.categories : [];
  } catch {
    return [];
  }
};

/** Wrapper che inietta il resolver reale nel core puro. */
export function computeActivation(events, cfg = ACTIVATION_THRESHOLDS) {
  return computeActivationCore(events, cfg, gapCategoriesFor);
}

/**
 * Progresso self-help dell'operatore per la checklist della /guida (scope own).
 * Vista LENIENT (nessuna finestra): l'operatore vede il suo avanzamento all-time
 * sull'anello diagnostica → allena → applica. Distinta dalla METRICA di activation
 * (windowed, per l'admin): qui è incoraggiante, lì è disciplinata — così la checklist
 * non diventa il bersaglio da gamare (la metrica vera resta validata sul warehouse).
 */
export async function getOperatorGuideProgress(userId) {
  const events = await readEvents(userId);
  const wide = { ...ACTIVATION_THRESHOLDS, windowDays: 36500 }; // ~100 anni = nessuna finestra
  const state = computeActivation(events, wide);
  return {
    diagnosed: state.ahaReached,
    gapKey: state.gapKey,
    trained: state.gapScenariosInWindow,
    target: ACTIVATION_THRESHOLDS.minGapScenarios,
    applied: events.some((e) => e && e.t === EVENT.TURNO_VIEWED),
    eventCount: events.length,
  };
}

const EVENTS_KEY = (u) => `activation:events:${u}`;
const IDENTITY_KEY = (u) => `activation:identity:${u}`;
const FIRST_KEY = (u) => `activation:first:${u}`;
const BASELINE_KEY = (e) => `activation:baseline:${e}`;
const USERS_SET = "activation:users";
const EVENT_TTL = 60 * 60 * 24 * 120; // 120 giorni
// Cap alto: turno_viewed/signals_viewed scattano a ogni load, e l'attivazione si
// ricalcola dalla finestra di eventi presente → un cap basso farebbe scorrere via
// l'aha/gli scenari per utenti molto attivi (falsi negativi retroattivi). 1000 copre
// il pilota con margine. LIMITE v1 noto: a volume reale l'attivazione va latchata
// come milestone durevole (una volta attivo, sempre attivo), non ricalcolata.
const EVENT_CAP = 1000;

/**
 * Registra un evento di attivazione. Non-fatale: qualsiasi errore KV viene
 * inghiottito (la hot path — score/segnali/turno — non deve mai rompersi).
 */
export async function recordActivationEvent(userId, type, payload = {}) {
  if (!userId || !type) return;
  try {
    const ev = { t: type, ts: Date.now(), ...payload };
    const key = EVENTS_KEY(userId);
    await kv.lpush(key, JSON.stringify(ev));
    await kv.ltrim(key, 0, EVENT_CAP - 1);
    await kv.expire(key, EVENT_TTL);
    await kv.sadd(USERS_SET, userId);
    await kv.set(FIRST_KEY(userId), ev.ts, { nx: true }); // primo timestamp, una volta sola
  } catch (e) {
    console.warn("activation event non registrato (non-fatale):", e?.message);
  }
}

/**
 * Aggancia userId → employee per il join col warehouse. Non-fatale.
 * Non degrada un employee_id già noto: turno/coaching chiamano senza id, ma quello
 * è la join key su cui poggia la validazione forward — se assente, si preserva.
 */
export async function recordActivationIdentity(userId, employee, employeeId) {
  if (!userId || !employee) return;
  try {
    let empId = employeeId || null;
    if (!empId) {
      const existing = await kv.get(IDENTITY_KEY(userId)).catch(() => null);
      empId = existing?.employee_id || null;
    }
    await kv.set(IDENTITY_KEY(userId), { employee, employee_id: empId });
  } catch (e) {
    console.warn("activation identity non registrata (non-fatale):", e?.message);
  }
}

/**
 * Snapshot dei segnali all'aha (SET nx: solo il primo). È la baseline contro cui
 * si valida in avanti il movimento comportamentale reale (operator-signals).
 */
export async function recordActivationBaseline(employee, snapshot) {
  if (!employee || !snapshot) return;
  try {
    await kv.set(BASELINE_KEY(employee), { ...snapshot, at: Date.now() }, { nx: true });
  } catch (e) {
    console.warn("activation baseline non registrata (non-fatale):", e?.message);
  }
}

/** Legge gli eventi grezzi di un utente (parsati). */
async function readEvents(userId) {
  try {
    const raw = (await kv.lrange(EVENTS_KEY(userId), 0, -1)) || [];
    return raw
      .map((r) => {
        if (typeof r === "object" && r) return r; // kv può già deserializzare
        try { return JSON.parse(r); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Coorte di attivazione per la vista admin. Enumera gli utenti con eventi,
 * calcola lo stato per ciascuno, aggrega rate + latenza. Nessuna PII fan.
 */
export async function getActivationCohort(cfg = ACTIVATION_THRESHOLDS) {
  let userIds = [];
  try {
    userIds = (await kv.smembers(USERS_SET)) || [];
  } catch {
    return { config: cfg, cohortSize: 0, ahaCount: 0, activatedCount: 0, activationRate: null, members: [], note: "store non disponibile" };
  }

  const members = await Promise.all(
    userIds.map(async (userId) => {
      const [events, identity, first] = await Promise.all([
        readEvents(userId),
        kv.get(IDENTITY_KEY(userId)).catch(() => null),
        kv.get(FIRST_KEY(userId)).catch(() => null),
      ]);
      const state = computeActivation(events, cfg);
      const latencyMs = state.activatedTs && first ? state.activatedTs - Number(first) : null;
      return {
        employee: identity?.employee || null,
        firstSeen: first ? Number(first) : (events.length ? Math.min(...events.map((e) => e.ts)) : null),
        ahaReached: state.ahaReached,
        gapKey: state.gapKey,
        gapScenariosInWindow: state.gapScenariosInWindow,
        activated: state.activated,
        latencyMs,
        eventCount: events.length,
      };
    })
  );

  const cohortSize = members.length;
  const ahaCount = members.filter((m) => m.ahaReached).length;
  const activatedCount = members.filter((m) => m.activated).length;

  return {
    config: cfg,
    cohortSize,
    ahaCount,
    activatedCount,
    activationRate: cohortSize > 0 ? activatedCount / cohortSize : null,
    members: members.sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0)),
  };
}
