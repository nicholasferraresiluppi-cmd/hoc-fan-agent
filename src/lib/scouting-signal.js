// Radar creator — una segnalazione dall'app o dal Comando rapido dell'iPhone (10/10/2026).
// La richiesta risponde SUBITO ("ricevuta") e il lavoro (Apify, ~30-60 s) continua dopo la
// risposta con after(): chi segnala dal telefono non resta ad aspettare.
import { createHash, randomBytes } from "node:crypto";
import { getInbox, saveInbox, updateInboxItem, getTokenOwner, setToken } from "@/lib/scouting-store";
import { processSignal } from "@/lib/scouting-intake";

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

/** Mette in coda e ritorna l'elemento; `work()` va lanciato dopo la risposta. */
export async function queueSignal({ text, why, by, via }) {
  const item = { id: randomBytes(6).toString("hex"), at: Date.now(), by: by || null, via, text: String(text || "").slice(0, 500), why: String(why || "").slice(0, 200), status: "in_lettura", h: null, msg: "In lettura…" };
  const items = await getInbox();
  await saveInbox([item, ...items]);
  const work = async () => {
    try {
      const r = await processSignal({ text: item.text, by: item.by, why: item.why });
      await updateInboxItem(item.id, { status: r.status, h: r.h || null, msg: r.msg, sig: r.sig || null, doneAt: Date.now() });
    } catch (e) {
      await updateInboxItem(item.id, { status: "errore", msg: `Errore: ${String(e.message || e).slice(0, 140)}`, doneAt: Date.now() });
    }
  };
  return { item, work };
}
