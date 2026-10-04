/**
 * Link pubblico della tessera (05/10/2026, richiesta Nicholas: «un link aperto con
 * l'animazione della tessera»). La persona, a modulo inviato, ottiene un link corto
 * /t/{id} da tenere o mandare: si apre senza account e mostra la tessera che gira e si
 * illumina.
 *
 * Dentro c'è SOLO quello che la tessera mostra già: nome, cognome, genere dichiarato
 * (per accordare "Esperta/Esperto"), competenze con livello e lingue. Mai email,
 * telefono, indirizzo, codice fiscale, documenti. L'id è casuale (16 byte): non si
 * indovina e non dice nulla della persona. Uno per scheda (si riusa se c'è già) e
 * si aggiorna coi dati attuali della scheda ogni volta che lo si chiede.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";

const K = {
  card: (id) => `hr:tcard:${id}`,
  byPerson: (pid) => `hr:tcard:byperson:${pid}`,
};
const ID_RE = /^[A-Za-z0-9_-]{16,40}$/;

/** I soli campi che la tessera mostra. */
export function cardDataOf(fields = {}) {
  const pick = (v) => (v == null ? undefined : v);
  return {
    firstName: String(fields.firstName || "").trim().slice(0, 60),
    surname: String(fields.surname || "").trim().slice(0, 60),
    gender: pick(fields.gender),
    skillLevels: fields.skillLevels && typeof fields.skillLevels === "object" ? fields.skillLevels : undefined,
    spokenLanguages: Array.isArray(fields.spokenLanguages) ? fields.spokenLanguages.slice(0, 10) : undefined,
  };
}

/** Crea (o aggiorna) il link della tessera di una scheda. → id */
export async function upsertTesseraLink(personId, fields) {
  let id = await kv.get(K.byPerson(personId));
  if (!id || !ID_RE.test(id)) {
    id = randomBytes(16).toString("base64url");
    await kv.set(K.byPerson(personId), id);
  }
  await kv.set(K.card(id), { data: cardDataOf(fields), at: Date.now() });
  return id;
}

export async function getTesseraCard(id) {
  if (!ID_RE.test(String(id || ""))) return null;
  return (await kv.get(K.card(id))) || null;
}
