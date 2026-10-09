// Chat Monitor per creator — orchestrazione e cache (una cache per creator e scheda). Ricostruzione di chat.hoc.tools
// (vedi chat-monitor-sql.js per fonti e definizioni).
//
// Costi e freschezza (misurati 8/10/2026):
//   - live:  ~4 GB a giro (chat in tempo reale + liste) → cache 15 min, come l'originale.
//   - daily: ~12 GB (chat di 37 giorni col corpo del messaggio) → cache 6 ore:
//            il dettaglio giornaliero cambia davvero una volta al giorno.
//   - trend: ~6 GB (26 settimane) → cache 6 ore.
// Single-flight su KV: N persone che aprono insieme = una sola query.
// Le liste contengono nomi utente e anteprime dei messaggi dei fan: in KV con TTL breve.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";
import {
  boundarySQL, liveTodaySQL, liveListsSQL, liveUnlocksSQL,
  dailyChatSQL, dailyMoneySQL, chattersSQL, weeklySQL, ltvSQL, LTV_BUCKETS,
} from "@/lib/chat-monitor-sql";

export { bigQueryConfigured, LTV_BUCKETS };

const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const GB = 1024 ** 3;
const TABS = {
  live: { ttl: 15 * 60 * 1000, kvTtl: 3600 },
  daily: { ttl: 6 * 3600 * 1000, kvTtl: 26 * 3600 },
  trend: { ttl: 6 * 3600 * 1000, kvTtl: 26 * 3600 },
};
// v4 (09/10): la coda porta data di iscrizione e speso 182gg (coda a priorità)
const key = (slug, tab) => `chatmon:${slug}:${tab}:v4`;
const lockKey = (slug, tab) => `chatmon:${slug}:${tab}:lock`;

// TIMESTAMP via REST = secondi epoch (anche in notazione 1.7E9) → ISO
function iso(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^[\d.]+(E\d+)?$/i.test(String(v))) return new Date(Number(v) * 1000).toISOString();
  return String(v);
}
const n = (v) => (v == null || v === "" ? null : Number(v));
const parseRows = (rows) => rows.map((r) => ({ kind: r.kind, country: r.country, d: r.d, ...JSON.parse(r.payload || "{}") }));

async function computeLive(creator) {
  const p = P();
  const A = creator.accounts;
  const [b, today, lists, unlocks] = await Promise.all([
    bqQuery(boundarySQL(p, A), { maxBytesBilled: 1 * GB }),
    bqQuery(liveTodaySQL(p, A), { maxBytesBilled: 4 * GB }),
    bqQuery(liveListsSQL(p, A), { maxBytesBilled: 5 * GB }),
    bqQuery(liveUnlocksSQL(p, A), { maxBytesBilled: 2 * GB }),
  ]);
  const br = b.rows[0] || {};
  const mapList = (r) => ({
    kind: r.kind, country: r.country, user_id: String(r.user_id), username: r.username || null,
    wrote_today: r.wrote_today, unanswered: r.unanswered,
    last_fan_at: iso(r.last_fan_at), last_out_at: iso(r.last_out_at),
    msg_fan: n(r.msg_fan), revenue_today: n(r.revenue_today), tx_today: n(r.tx_today),
    spent_60d: n(r.spent_60d), ltv_7d: n(r.ltv_7d), ltv_30d: n(r.ltv_30d),
    ltv_project: n(r.ltv_project), ltv_agency: n(r.ltv_agency),
    sub_date: r.sub_date ? String(r.sub_date) : null, preview: r.preview || null,
    sub_kind: r.sub_kind || null, sub_at: iso(r.sub_at),
  });
  const all = lists.rows.map(mapList);
  return {
    boundary: { of_max: iso(br.of_max), ws_max: iso(br.ws_max), tx_max: iso(br.tx_max), subs_max: iso(br.subs_max) },
    today: today.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "country" ? v : n(v)]))),
    fans: all.filter((r) => r.kind === "fan"),
    queue: all.filter((r) => r.kind === "queue").sort((a, b) => (a.last_fan_at < b.last_fan_at ? -1 : 1)),
    pending: all.filter((r) => r.kind === "pending"),
    unlocks: unlocks.rows.map((r) => ({ country: r.country, user_id: String(r.user_id), username: r.username || null, ts: iso(r.ts), net: n(r.net), is_mass: Boolean(r.is_mass) })),
    bytes: b.totalBytesProcessed + today.totalBytesProcessed + lists.totalBytesProcessed + unlocks.totalBytesProcessed,
  };
}

async function computeDaily(creator) {
  const p = P();
  const A = creator.accounts;
  const [chat, money, ch] = await Promise.all([
    bqQuery(dailyChatSQL(p, A), { maxBytesBilled: 18 * GB }),
    bqQuery(dailyMoneySQL(p, A), { maxBytesBilled: 2 * GB }),
    bqQuery(chattersSQL(p, A), { maxBytesBilled: 1 * GB }),
  ]);
  const rows = [...parseRows(chat.rows), ...parseRows(money.rows), ...parseRows(ch.rows)];
  const by = (k) => rows.filter((r) => r.kind === k);
  return {
    daily: by("daily"), latency: by("latency"), ppv: by("ppv"), heat: by("heat"),
    revenue: by("revenue"), conv7: by("conv7"), cohorts30: by("cohort30"),
    chatters: by("chatter"), staff: by("staff"),
    bytes: chat.totalBytesProcessed + money.totalBytesProcessed + ch.totalBytesProcessed,
  };
}

async function computeTrend(creator) {
  const p = P();
  const A = creator.accounts;
  const [w, l] = await Promise.all([
    bqQuery(weeklySQL(p, A), { maxBytesBilled: 8 * GB }),
    bqQuery(ltvSQL(p, A), { maxBytesBilled: 2 * GB }),
  ]);
  const num = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ["country", "settimana", "kind", "wk"].includes(k) ? v : typeof v === "boolean" ? v : n(v)]));
  return {
    rows: w.rows.map(num),
    ltv: l.rows.filter((r) => r.kind === "ltv").map(num),
    weeklyLtv: l.rows.filter((r) => r.kind === "weekly").map(num),
    buckets: LTV_BUCKETS,
    bytes: w.totalBytesProcessed + l.totalBytesProcessed,
  };
}

const COMPUTE = { live: computeLive, daily: computeDaily, trend: computeTrend };

/** Dati di una scheda (live | daily | trend) dalla cache, o ricalcolati se scaduti / `force`. */
export async function getChatMonitor(creator, tab, { force = false } = {}) {
  const cfg = TABS[tab];
  if (!cfg) throw new Error("Scheda non valida");
  const cached = await kv.get(key(creator.slug, tab)).catch(() => null);
  const fresh = cached && Date.now() - new Date(cached.generated_at).getTime() < cfg.ttl;
  if (cached && fresh && !force) return { ...cached, cached: true };

  const got = await kv.set(lockKey(creator.slug, tab), Date.now(), { nx: true, ex: 120 }).catch(() => "OK");
  if (!got) {
    if (cached) return { ...cached, cached: true, refreshing: true };
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const c = await kv.get(key(creator.slug, tab)).catch(() => null);
      if (c) return { ...c, cached: true };
    }
    throw new Error("Calcolo già in corso — riprova tra qualche secondo");
  }
  try {
    const out = { ...(await COMPUTE[tab](creator)), generated_at: new Date().toISOString() };
    await kv.set(key(creator.slug, tab), out, { ex: cfg.kvTtl });
    return { ...out, cached: false };
  } finally {
    await kv.del(lockKey(creator.slug, tab)).catch(() => {});
  }
}
