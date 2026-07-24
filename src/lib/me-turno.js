// Il mio turno — scheda-fan per l'operatore in turno (primo mattone del copilot).
//
// Per ogni fan della coda (in attesa / si raffredda) la scheda dice:
//   CHI è        → valore e attività (users_research + ws_chat, come Priority Queue)
//   DOV'ERA      → ultima etichetta dell'analisi contenuto (obiezione, sintesi)
//   COSA FARE    → la MOSSA suggerita (playbook statico stato×obiezione, niente LLM runtime)
//
// GUARDRAIL (non negoziabili):
//   - suggerisce mosse e argomenti, MAI il testo dei messaggi: l'operatore è il regista
//   - niente qui entra in score/comp (le etichette sono coaching, policy esistente)
//   - identità risolta server-side (docs/VISIBILITY_POLICY.md): l'operatore vede solo
//     il PROPRIO turno; il creator_id arbitrario è riservato allo scope "all"
//   - dati fan = LTV + tempi: per questo la pagina è gated COPILOT_PILOT (pilota)

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, hocCreatorScopeSQL } from "@/lib/bigquery-api";
import { resolveEmployeeForUser, normalizeName } from "@/lib/me";
import { getCreators } from "@/lib/priority-queue";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const QUEUE_TTL = 900;              // 15 min: è una worklist "adesso"
const LTV_FLOOR = 100;              // stesso floor della Priority Queue
const WHALE_LTV = 1000;             // sopra questa soglia il raffreddamento è prioritario
const LABEL_LOOKBACK_DAYS = 7;      // quanti giorni di analisi contenuto guardare
const SHIFT_GRACE_MS = 20 * 60000;  // tolleranza inizio/fine turno

export { bigQueryConfigured, getCreators };

/**
 * Turno attivo (o prossimo entro 12h) dell'operatore loggato, dai wage CP.
 * Identico principio di me.js: mai un employee dal client.
 */
export async function getMyShiftNow() {
  const who = await resolveEmployeeForUser();
  if (!who?.employee) return { employee: null, reason: who?.reason || "no_match" };
  // SICUREZZA (review 23 lug): il resolver via email matcha solo la parte locale
  // (dominio ignorato) → spoofabile aggiungendo un'email al profilo Clerk. Le
  // altre /me espongono solo dati PROPRI; qui ci sono LTV fan → per il pilota
  // vale SOLO il collegamento esplicito impostato da un admin (user_employee:*).
  if (who.source !== "override") {
    return { employee: null, reason: "pilot_link_required" };
  }

  const now = Date.now();
  // mese corrente + precedente: i turni notturni stanno nel mese dello started_at
  const months = new Set([
    new Date(now).toISOString().slice(0, 7),
    new Date(now - 2 * 86400_000).toISOString().slice(0, 7),
    new Date(now + 12 * 3600_000).toISOString().slice(0, 7), // upcoming oltre il cambio mese
  ]);
  const wageSets = await Promise.all([...months].map((m) => kv.get(`cp:wages:${m}`)));
  const wanted = normalizeName(who.employee);

  let active = null;
  let upcoming = null;
  for (const wages of wageSets) {
    for (const rec of wages || []) {
      if (normalizeName(rec.member_name) !== wanted) continue;
      for (const s of rec.shifts || []) {
        const st = Date.parse(s.started_at);
        const en = Date.parse(s.ended_at);
        if (!Number.isFinite(st)) continue;
        const enSafe = Number.isFinite(en) ? en : now;
        const cids = (s.creator_ids || []).map(Number).filter(Number.isInteger);
        if (!cids.length) continue;
        const shift = {
          start: new Date(st).toISOString(),
          end: new Date(enSafe).toISOString(),
          creator_ids: cids,
          k: Number(s.payment_profile?.cosellers_count) || 1,
        };
        if (st - SHIFT_GRACE_MS <= now && now < enSafe + SHIFT_GRACE_MS) {
          if (!active || st > Date.parse(active.start)) active = shift;
        } else if (st > now && st - now < 12 * 3600_000) {
          if (!upcoming || st < Date.parse(upcoming.start)) upcoming = shift;
        }
      }
    }
  }
  return { employee: who.employee, active, upcoming };
}

/**
 * La MOSSA suggerita: playbook statico stato×etichetta (traduzione dei settori
 * gemelli — cart-recovery, winback, clienteling). Trasparente e deterministico:
 * l'operatore capisce sempre PERCHÉ gli viene suggerita.
 */
export function suggestPlay(row, label) {
  const whale = (row.ltv_usd || 0) >= WHALE_LTV;
  if (label?.rischio_churn) {
    return {
      mossa: "Ripara prima di vendere: tono di servizio, riconosci il problema, zero push in questo tocco",
      perche: "l'ultima conversazione l'ha lasciato frustrato: un altro push ora lo perde",
    };
  }
  if (row.state === "waiting") {
    switch (label?.obiezione) {
      case "prezzo":
        return {
          mossa: "Riconosci l'obiezione prezzo e proponi un bundle mirato — niente sconto al primo tocco",
          perche: "aprire con lo sconto insegna ad aspettarlo; il bundle sposta il valore, non il prezzo",
        };
      case "fiducia":
        return {
          mossa: "Rassicura con fatti concreti (cosa riceve, quando): prometti solo ciò che vedi consegnabile",
          perche: "la fiducia incrinata si ripara coi fatti, non con l'insistenza",
        };
      case "interesse":
        return {
          mossa: "Cambia angolo: riparti da ciò che l'ha fatto spendere in passato, non riproporre lo stesso contenuto",
          perche: "l'obiezione era interesse, non prezzo: serve un contenuto diverso, non uno sconto",
        };
      case "tempo":
        return {
          mossa: "Risposta breve adesso + fissa un momento preciso (“stasera alle 22?”)",
          perche: "non era un no: era “non ora” — l'appuntamento concreto converte più del rilancio",
        };
      default:
        return {
          mossa: "Rispondi ora, apertura personale (mai broadcast): sta aspettando",
          perche: "fan in attesa oltre SLA: il tempismo vale più dell'offerta",
        };
    }
  }
  // cooling
  if (label?.opportunita_non_chiusa) {
    return {
      mossa: "Il terreno era caldo e nessuno ha proposto: riprendi il filo dell'ultima conversazione e stavolta proponi (soft)",
      perche: "fan positivo + tono buono senza proposta = vendita lasciata sul tavolo",
    };
  }
  if (whale) {
    return {
      mossa: "Aggancio personale legato all'ultima conversazione — relazione, non vendita, in questo tocco",
      perche: "le whale si raffreddano in silenzio: il valore si protegge prima che sparisca",
    };
  }
  return {
    mossa: "Riaggancio leggero e personale (non commerciale)",
    perche: "si sta raffreddando: un tocco di relazione riapre la porta senza pressione",
  };
}

/** Coda fan del creator + etichette recenti + mossa. */
export async function getFanCards(creatorId) {
  const cid = parseInt(creatorId, 10);
  if (!Number.isInteger(cid)) throw new Error("creator_id non valido");

  const key = `me:turno:q:${cid}`;
  let queue = await kv.get(key);
  if (!queue) {
    // Stessa logica della Priority Queue (stati waiting/cooling, floor LTV) + user_id
    // per il join con le etichette dell'analisi contenuto.
    const { rows } = await bqQuery(`
  WITH msgs AS (
    SELECT user_id,
      MAX(IF(sender_id=user_id, created_at, NULL)) AS last_fan_ts,
      MAX(IF(sender_id<>user_id, created_at, NULL)) AS last_reply_ts,
      MAX(created_at) AS last_any_ts,
      COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS msgs_30d
    FROM \`${DATA()}.hoc.ws_chat\`
    WHERE creator_id=${cid} AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
      AND ${hocCreatorScopeSQL(DATA())}
    GROUP BY user_id
  ),
  val AS (
    SELECT user_id, ANY_VALUE(username) username, SUM(total_net_expenses) ltv, SUM(transaction_count) tx
    FROM \`${DATA()}.onlyfans.users_research\`
    WHERE creator_id=${cid} AND ${hocCreatorScopeSQL(DATA())}
    GROUP BY user_id
  )
  SELECT * FROM (
    SELECT
      val.user_id,
      val.username,
      CAST(ROUND(val.ltv,0) AS INT64) AS ltv_usd,
      val.tx AS txns,
      CASE
        WHEN m.last_fan_ts > COALESCE(m.last_reply_ts, TIMESTAMP('1970-01-01'))
             AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_fan_ts, MINUTE) BETWEEN 20 AND 2880 THEN 'waiting'
        WHEN TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_any_ts, HOUR) BETWEEN 72 AND 504 THEN 'cooling'
        ELSE 'ok'
      END AS state,
      CAST(ROUND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_fan_ts, HOUR)) AS INT64) AS hrs_since_fan,
      CAST(ROUND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_any_ts, HOUR)) AS INT64) AS hrs_since_active,
      m.msgs_30d
    FROM msgs m JOIN val ON val.user_id = m.user_id
    WHERE val.ltv >= ${LTV_FLOOR}
  )
  WHERE state != 'ok'
  ORDER BY (state='waiting') DESC, ltv_usd DESC
  LIMIT 30`);
    queue = rows.map((r) => ({
      user_id: String(r.user_id),
      username: r.username,
      ltv_usd: Number(r.ltv_usd) || 0,
      txns: Number(r.txns) || 0,
      state: r.state,
      hrs_since_fan: r.hrs_since_fan == null ? null : Number(r.hrs_since_fan),
      hrs_since_active: r.hrs_since_active == null ? null : Number(r.hrs_since_active),
      msgs_30d: Number(r.msgs_30d) || 0,
    }));
    await kv.set(key, queue, { ex: QUEUE_TTL });
  }

  // Etichette per-fan dalle analisi contenuto recenti (se esistono: arricchiscono,
  // mai bloccano — la scheda funziona anche senza analisi).
  const days = [...Array(LABEL_LOOKBACK_DAYS)].map((_, i) =>
    new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)
  );
  const analyses = await Promise.all(days.map((d) => kv.get(`sq:analysis:${cid}:${d}`)));
  const labelByUid = new Map();
  for (const a of analyses) {
    for (const [uid, l] of Object.entries(a?.fans || {})) {
      if (labelByUid.has(uid)) continue;
      // niente tono/flag_onesta qui: sono segnali sul lavoro di un COLLEGA
      // (altro turno), non contesto sul fan — restano nell'analisi admin
      labelByUid.set(uid, {
        obiezione: l.obiezione,
        sentiment: l.sentiment,
        sintesi: l.sintesi,
        rischio_churn: l.rischio_churn,
        opportunita_non_chiusa: l.opportunita_non_chiusa,
        day: a.day,
      });
    }
  }

  return queue.map((r) => {
    const label = labelByUid.get(r.user_id) || null;
    return { ...r, label, play: suggestPlay(r, label) };
  });
}
