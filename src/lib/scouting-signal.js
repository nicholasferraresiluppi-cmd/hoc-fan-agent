// Radar creator — una segnalazione dall'app o dal Comando rapido dell'iPhone (10/10/2026).
// La richiesta risponde SUBITO ("ricevuta") e il lavoro (Apify, ~30-60 s) continua dopo la
// risposta con after(): chi segnala dal telefono non resta ad aspettare.
import { createHash, randomBytes } from "node:crypto";
import { getInbox, saveInbox, updateInboxItem, getTokenOwner, setToken } from "@/lib/scouting-store";
import { processSignal, precheckSignal } from "@/lib/scouting-intake";

export const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");

export async function newShortcutToken(owner) {
  const token = randomBytes(24).toString("base64url");
  await setToken(hashToken(token), { ...owner, at: Date.now() });
  return token;
}
export async function ownerOfToken(token) {
  if (!token || String(token).length < 20) return null;
  return (await getTokenOwner(hashToken(token))) || null;
}

/**
 * Mette in coda e ritorna l'elemento; `work()` va lanciato dopo la risposta. `pre` = se l'account
 * era già nel radar e chi l'aveva trovato, letto SUBITO (solo KV) così chi segnala lo sa all'istante.
 */
export async function queueSignal({ text, why, by, via }) {
  const t = String(text || "").slice(0, 500);
  const pre = await precheckSignal(t).catch(() => ({ h: null, known: null }));
  const item = { id: randomBytes(6).toString("hex"), at: Date.now(), by: by || null, via, text: t, why: String(why || "").slice(0, 200), status: "in_lettura", h: pre.h, pre, step: null, msg: pre.known ? "Già nel radar: la ricontrollo." : "In lettura…" };
  const items = await getInbox();
  await saveInbox([item, ...items]);
  const work = async () => {
    try {
      const r = await processSignal({ text: item.text, by: item.by, why: item.why }, { onStep: (step, extra) => updateInboxItem(item.id, { step, ...(extra || {}) }) });
      const { status, h, msg, sig, warn, known, checked, fol, medv, link, match } = r;
      await updateInboxItem(item.id, { status, h: h || null, msg, sig: sig || null, warn: !!warn, known: known ?? null, checked: !!checked, fol: fol ?? null, medv: medv ?? null, link: link || null, match: match || [], step: null, doneAt: Date.now() });
    } catch (e) {
      await updateInboxItem(item.id, { status: "errore", msg: `Errore: ${String(e.message || e).slice(0, 140)}`, step: null, doneAt: Date.now() });
    }
  };
  return { item, work };
}
