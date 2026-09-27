/**
 * Salute dell'AI (27/09/2026). Il credito Anthropic si è esaurito senza che nessuno lo sapesse:
 * il simulatore degli operatori rispondeva "Errore nella generazione della risposta" e basta.
 * Qui: riconoscere l'errore di credito, ricordarlo in KV e accendere subito l'alert critico
 * (check "ai-credit" in ops-alerts, che ogni notte verifica anche con una chiamata da 1 token).
 */
import { kv } from "@vercel/kv";

const KEY = "ai:credit:error";
const CREDIT_RE = /credit balance|billing|insufficient.*(credit|fund)|purchase credits/i;

export const isCreditError = (err) => CREDIT_RE.test(String(err?.message || err?.error?.error?.message || err || ""));

/** Da chiamare nei catch delle route AI. Non lancia mai. */
export async function noteAiError(err, where) {
  try {
    if (!isCreditError(err)) return false;
    const prev = await kv.get(KEY);
    await kv.set(KEY, { at: Date.now(), where, first_at: prev?.first_at || Date.now() }, { ex: 30 * 24 * 3600 });
    if (!prev || Date.now() - (prev.alerted_at || 0) > 3600 * 1000) {
      await kv.set(KEY, { at: Date.now(), where, first_at: prev?.first_at || Date.now(), alerted_at: Date.now() }, { ex: 30 * 24 * 3600 });
      const { runChecks } = await import("@/lib/ops-alerts");
      await runChecks({ trigger: "event", only: ["ai-credit"] });
    }
    return true;
  } catch { return false; }
}

/** Chiamata minima (1 token, Haiku): { ok } oppure { ok:false, credit, message }. */
export async function probeAi() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, credit: false, message: "ANTHROPIC_API_KEY mancante" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
    });
    if (r.ok) { await kv.del(KEY).catch(() => {}); return { ok: true }; }
    const j = await r.json().catch(() => ({}));
    const message = j?.error?.message || `HTTP ${r.status}`;
    return { ok: false, credit: CREDIT_RE.test(message), message };
  } catch (e) {
    return { ok: false, credit: false, message: String(e?.message || e) };
  }
}
