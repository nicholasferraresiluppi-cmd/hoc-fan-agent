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
  const typ = row.med_buy || row.avg_buy || null; // prezzo tipico del fan
  const bundle = typ ? Math.max(10, Math.round((typ * 1.3) / 5) * 5) : null;
  const offerBundle = bundle
    ? `Proponi un bundle a ~$${bundle}${typ ? ` (il suo PPV tipico è $${typ})` : ""}`
    : null;
  const ref = row.last_buy_days != null ? `Ultimo acquisto ${row.last_buy_days}g fa` : null;

  // FRENO ETICO ("alta spesa ≠ sano"): confronta il tasso di spesa degli ultimi
  // 14g con la baseline PULITA dei 76g precedenti (spend_90d − spend_14d): così
  // la norma non è diluita dallo stesso picco che deve rilevare. Senza baseline
  // (fan nuovo) non si parla di "accelerazione" → non scatta.
  const s14 = row.spend_14d || 0;
  const r14 = s14 / 14;
  const prior = Math.max(0, (row.spend_90d || 0) - s14);
  const r76 = prior / 76;
  // Floor assoluto $400/14g: sotto non è "spesa alta", è attività normale — il
  // freno deve mirare a chi spende DAVVERO tanto e accelera, non a un fan che si
  // sta solo attivando. Scatta se accelera vs baseline reale, OPPURE se quasi
  // tutta la spesa è concentrata di recente (picco da base ~0). Il moltiplicatore
  // mostrato è cappato: da base ~0 sarebbe un numero assurdo (73×), inutile.
  const accel = s14 >= 400 && ((r76 > 0 && r14 >= 2.5 * r76) || prior <= s14 * 0.2);
  const mult = r76 > 0 ? r14 / r76 : Infinity;
  const multTxt = Number.isFinite(mult) && mult <= 10 ? `~${Math.round(mult)}× la sua norma` : "molto sopra la sua norma";
  const freno = accel
    ? `Spesa in accelerazione ($${s14} negli ultimi 14g, ${multTxt}): rallenta, tutela prima di vendere`
    : null;

  if (accel) {
    return {
      mossa: "Frena: relazione, non vendita — nessun push in questo tocco",
      angolo: "Sta spendendo molto più del suo normale in poco tempo. Un altro rilancio ora è esattamente il rischio da evitare: tienila calda, non caldissima.",
      offerta: null, freno,
      perche: "tutelare il fan protegge anche la relazione lunga (e HOC)",
    };
  }
  if (label?.rischio_churn) {
    return {
      mossa: "Ripara prima di vendere: tono di servizio, riconosci il problema",
      angolo: "L'ultima conversazione l'ha lasciata frustrata. Riconosci cosa è andato storto, zero offerta in questo tocco.",
      offerta: null, freno,
      perche: "un altro push ora la perde",
    };
  }
  if (row.state === "waiting") {
    switch (label?.obiezione) {
      case "prezzo":
        return {
          mossa: "Riconosci il budget e sposta il valore col bundle — niente sconto al primo tocco",
          angolo: `Non riproporre lo stesso PPV. ${ref ? ref + ". " : ""}Inquadra l'offerta come privilegio, non come sconto, e chiudi con una domanda.`,
          offerta: offerBundle, freno,
          perche: "aprire con lo sconto insegna ad aspettarlo; il bundle sposta il valore",
        };
      case "fiducia":
        return {
          mossa: "Rassicura coi fatti: cosa riceve e quando",
          angolo: "Prometti solo il consegnabile, niente vaghezza sui dettagli. La fiducia incrinata si ripara concreta, non con l'insistenza.",
          offerta: null, freno,
          perche: "la fiducia si ripara coi fatti",
        };
      case "interesse":
        return {
          mossa: "Cambia angolo: riparti da ciò che l'ha fatta spendere",
          angolo: `${ref ? ref + ". " : ""}Non riproporre lo stesso contenuto: proponi qualcosa di diverso, legato a ciò che ha già comprato.`,
          offerta: typ ? `Tieni l'offerta vicino al suo tipico $${typ}` : null, freno,
          perche: "era interesse, non prezzo: serve contenuto diverso, non uno sconto",
        };
      case "tempo":
        return {
          mossa: "Risposta breve ora + proponi un momento preciso",
          angolo: "Fissa un orario concreto invece di lasciare aperto: l'appuntamento converte più del rilancio.",
          offerta: null, freno,
          perche: "non era un no, era «non ora»",
        };
      default:
        return {
          mossa: "Rispondi ora, apertura personale (mai broadcast)",
          angolo: whale
            ? `È una whale in attesa. ${ref ? ref + ". " : ""}Apertura calda e personale, poi porta l'offerta.`
            : "Sta aspettando: il tempismo vale più dell'offerta.",
          offerta: whale ? offerBundle : null, freno,
          perche: "fan in attesa oltre SLA",
        };
    }
  }
  // cooling
  if (label?.opportunita_non_chiusa) {
    return {
      mossa: "Il terreno era caldo e nessuno ha proposto: riprendi e proponi soft",
      angolo: `${ref ? ref + ". " : ""}Riprendi il filo dell'ultima conversazione, stavolta con una proposta leggera.`,
      offerta: offerBundle, freno,
      perche: "fan positivo senza proposta = vendita lasciata sul tavolo",
    };
  }
  if (whale) {
    return {
      mossa: "Aggancio personale legato all'ultima conversazione — relazione prima della vendita",
      angolo: `Whale che si raffredda in silenzio. ${ref ? ref + ". " : ""}Un tocco personale riapre la porta senza pressione.`,
      offerta: null, freno,
      perche: "il valore si protegge prima che sparisca",
    };
  }
  return {
    mossa: "Riaggancio leggero e personale (non commerciale)",
    angolo: "Un tocco di relazione riapre la porta, senza pressione.",
    offerta: null, freno,
    perche: "si sta raffreddando",
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
  ),
  spend AS (
    SELECT user_id,
      -- prezzo tipico SOLO sui PPV veri (message/post): rinnovi subscription e
      -- tip da $3-8 falserebbero l'ancora e sottodimensionerebbero il bundle
      CAST(ROUND(AVG(IF(is_ppv, net, NULL)),0) AS INT64) avg_buy,
      CAST(ROUND(APPROX_QUANTILES(IF(is_ppv, net, NULL), 2 IGNORE NULLS)[OFFSET(1)],0) AS INT64) med_buy,
      UNIX_SECONDS(MAX(IF(is_ppv, created_at, NULL))) last_buy_t,
      -- spesa LORDA attribuita totale (tutti i tipi) per il freno etico
      CAST(ROUND(SUM(IF(created_at>=TIMESTAMP_SUB(CURRENT_TIMESTAMP(),INTERVAL 14 DAY),net,0)),0) AS INT64) spend_14d,
      CAST(ROUND(SUM(IF(created_at>=TIMESTAMP_SUB(CURRENT_TIMESTAMP(),INTERVAL 90 DAY),net,0)),0) AS INT64) spend_90d
    FROM (
      SELECT user_id, net, created_at, (type IN ('message','post')) AS is_ppv
      FROM \`${DATA()}.onlyfans.attributed_transactions\`
      WHERE creator_id=${cid} AND ${hocCreatorScopeSQL(DATA())} AND net>0 AND id IS NOT NULL
      QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC)=1
    )
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
      m.msgs_30d,
      sp.med_buy, sp.avg_buy, sp.last_buy_t, sp.spend_14d, sp.spend_90d
    FROM msgs m JOIN val ON val.user_id = m.user_id
      LEFT JOIN spend sp ON sp.user_id = m.user_id
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
      med_buy: r.med_buy == null ? null : Number(r.med_buy),
      avg_buy: r.avg_buy == null ? null : Number(r.avg_buy),
      last_buy_days: r.last_buy_t == null ? null : Math.floor((Date.now() / 1000 - Number(r.last_buy_t)) / 86400),
      spend_14d: Number(r.spend_14d) || 0,
      spend_90d: Number(r.spend_90d) || 0,
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
