// "Perché, nelle chat" (10/10/2026): sotto la scheda di una creator, l'AI legge le chat dei fan che
// hanno spostato la revenue e spiega il perché con esempi veri. Logica pura in analisi-perche-core.js.
//
// Flusso: numeri della creator (getAnalisi "creator", già in cache) → il CODICE sceglie i fan
// (percheFansSql) e conta su tutto il gruppo (percheStatsSql, percheBlastSql) → chat dei fan scelti
// → Sonnet 5 → il CODICE verifica le citazioni → KV.
//
// Costi sotto controllo: risultato in cache 7 giorni per creator+periodo (si rifà solo su richiesta),
// una sola lettura alla volta per creator+periodo, tetto di spesa mensile (ANALISI_AI_CAP_USD, def. $60).

import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { getAnalisi, runOnSource, splitCreators } from "@/lib/analisi-vendite";
import { normalizeRange, previousRange, percheFansSql, percheStatsSql, percheBlastSql, percheChatSql } from "@/lib/analisi-vendite-sql";
import {
  PERCHE_VERSION, PERCHE_MODEL, PERCHE_SYSTEM, PERCHE_TASK, PERCHE_SCHEMA,
  labelFans, buildPack, verifyQuotes, parseAnalysis, dirOf,
} from "@/lib/analisi-perche-core";
import { costUSD } from "@/lib/sales-ai/core";

const CAP_USD = () => Number(process.env.ANALISI_AI_CAP_USD) || 60;
const keyOf = (ids, range) => `analisi:perche:${PERCHE_VERSION}:${range.from}:${range.to}:${[...ids].sort((a, b) => a - b).join(",")}`;
const spendKey = (d = new Date()) => `analisi:perche:spesa:${d.toISOString().slice(0, 7)}`;

export async function getCachedPerche(ids, query) {
  const range = normalizeRange("creator", query);
  return (await kv.get(keyOf(ids, range)).catch(() => null)) || null;
}

export async function monthSpend() {
  return Number(await kv.get(spendKey()).catch(() => 0)) || 0;
}

/** Legge le chat e spiega. Ritorna {status:"busy"} se un'altra lettura identica è in corso. */
export async function runPerche(ids, query, { force = false, by = null } = {}) {
  const range = normalizeRange("creator", query);
  const key = keyOf(ids, range);
  if (!force) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return hit;
  }
  const spent = await monthSpend();
  if (spent >= CAP_USD()) throw Object.assign(new Error(`Tetto di spesa AI del mese raggiunto ($${spent.toFixed(2)} su $${CAP_USD()}).`), { status: 429 });

  const lock = `${key}:lock`;
  const got = await kv.set(lock, Date.now(), { nx: true, ex: 180 }).catch(() => "OK");
  if (!got) return { status: "busy" };
  try {
    const started = Date.now();
    const creator = await getAnalisi("creator", ids, range);
    const person = creator.person;
    if (!person) throw new Error("Nessun dato per questa creator nel periodo");
    const dir = dirOf(person);
    const names = Object.fromEntries((await splitCreators()).map((c) => [c.id, c.name]));

    const first = await runOnSource((refs) => [percheFansSql(refs, ids, range, dir), percheStatsSql(refs, ids, range, dir), percheBlastSql(refs, ids, range)]);
    const [fanRows, statRows, blastRows] = first.rows;
    const stats = statRows[0] ? Object.fromEntries(Object.entries(statRows[0]).map(([k, v]) => [k, Number(v) || 0])) : null;
    const blasts = blastRows.map((b) => ({ t: b.t, first_at: b.first_at, fans: Number(b.fans), minutes: Number(b.minutes) }));
    const base = {
      version: PERCHE_VERSION, person: person.name, ids, range, previous: previousRange(range), dir, stats, blasts,
      source: first.source, computed_at: new Date().toISOString(), by,
    };
    if (!fanRows.length) {
      const out = { ...base, status: "nothing", message: dir === "up" ? "Nessun fan ha più che raddoppiato una spesa di almeno $50: la crescita è distribuita, non c'è un gruppo di fan da leggere." : "Nessun fan da almeno $50 ha più che dimezzato la spesa: il calo è distribuito su tanti fan piccoli, non c'è un gruppo da leggere." };
      await kv.set(key, out, { ex: 7 * 24 * 3600 }).catch(() => {});
      return out;
    }

    const chatRes = await runOnSource((refs) => [percheChatSql(refs, fanRows.map((f) => [f.creator_id, f.user_id]), range)]);
    const fans = labelFans(fanRows, chatRes.rows[0], names);
    const pack = buildPack({ person: person.name, range, previous: base.previous, dir, stats, blasts, fans, reasons: person.reasons.map((r) => r.text) });

    const client = new Anthropic();
    const msg = await client.messages.create({
      model: PERCHE_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: PERCHE_SCHEMA } },
      system: PERCHE_SYSTEM,
      messages: [{ role: "user", content: `${pack}\n\nCOMPITO:\n${PERCHE_TASK}` }],
    }).catch((e) => {
      // il messaggio dell'API è tecnico e in inglese: al sales manager si dice cosa succede
      if (/credit balance/i.test(String(e?.message))) throw Object.assign(new Error("Il credito AI di House of Creators è finito: va ricaricato nella console Anthropic. I numeri qui sopra restano validi."), { status: 503 });
      if (e?.status === 429 || e?.status === 529) throw Object.assign(new Error("L'AI è sovraccarica in questo momento: riprova tra un minuto."), { status: 503 });
      throw e;
    });
    const cost = costUSD(msg.model || PERCHE_MODEL, msg.usage, { batch: false });
    await kv.incrbyfloat(spendKey(), cost).catch(() => {});
    if (msg.stop_reason === "refusal") throw new Error("L'AI ha rifiutato di leggere queste chat.");
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const analysis = verifyQuotes(parseAnalysis(text), fans);

    const out = {
      ...base, status: "ok", analysis,
      read: { fans: fans.length, messages: fans.reduce((a, f) => a + f.messages.length, 0) },
      ai: { model: msg.model || PERCHE_MODEL, cost_usd: Math.round(cost * 10000) / 10000, input_tokens: msg.usage?.input_tokens, output_tokens: msg.usage?.output_tokens, seconds: Math.round((Date.now() - started) / 1000) },
    };
    await kv.set(key, out, { ex: 7 * 24 * 3600 }).catch(() => {});
    return out;
  } finally {
    await kv.del(lock).catch(() => {});
  }
}
