/**
 * "Vedi come…" — anteprima dell'app con i permessi di un altro membro o ruolo
 * (25/09/2026, richiesta Nicholas: capire che accessi ha ognuno).
 *
 * Regole di sicurezza (è il cuore dei permessi, quindi rigide):
 *  - si può solo RIDURRE: vale solo per chi è già admin "vero" (isUserIdAdminRaw),
 *    che ha già tutto; per chiunque altro il cookie è ignorato → nessuna escalation;
 *  - cookie firmato HMAC, httpOnly, scade in 2 ore;
 *  - vale solo per la PROPRIA sessione (l'override si applica quando il controllo
 *    riguarda l'utente loggato, mai quando l'app legge i ruoli di altre persone);
 *  - sola lettura: il middleware blocca ogni scrittura via API finché è attivo;
 *  - ogni attivazione finisce nel registro audit:access.
 * Le pagine personali (/me/*) restano sui dati di chi guarda: si simulano i
 * PERMESSI, non l'identità.
 */
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const VIEW_AS_COOKIE = "hoc_view_as";
export const VIEW_AS_TTL_MS = 2 * 3600 * 1000;

const secret = () => process.env.VIEW_AS_SECRET || process.env.CRON_SECRET || process.env.KV_REST_API_TOKEN || "hoc-view-as";
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeViewAs(v) {
  const payload = Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(raw) {
  if (!raw || !raw.includes(".")) return null;
  const [payload, sig] = raw.split(".");
  const good = Buffer.from(sign(payload));
  const got = Buffer.from(sig || "");
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!Array.isArray(v.roles) || !v.by || !(v.exp > Date.now())) return null;
    return v;
  } catch { return null; }
}

/** L'anteprima attiva per la richiesta corrente, se riguarda proprio `userId`. */
export async function viewAsFor(userId) {
  if (!userId) return null;
  let raw;
  try { raw = (await cookies()).get(VIEW_AS_COOKIE)?.value; } catch { return null; } // fuori da una richiesta (cron)
  if (!raw) return null;
  const v = decode(raw);
  if (!v || v.by !== userId) return null;
  let me = null;
  try { me = (await auth()).userId; } catch { return null; }
  return me === userId ? v : null;
}
