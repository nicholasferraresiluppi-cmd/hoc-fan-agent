/**
 * Accordi creator — archivio (15/10/2026). Logica in creator-deals-core.js.
 *
 * KV `acct:deals` CIFRATO con la chiave della contabilità (stessa sezione, stesso
 * accesso: titolari + chi ha l'accesso contabilità; gli admin no):
 *   { rev, deals: [{ id, creator, text, tiers, mode, ecosystem, revenueName, active, note }], updatedAt, updatedBy }
 * Gli accordi non sono mensili: valgono finché non si cambiano (ogni cambio nel registro).
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { sealJson, openJson } from "@/lib/compensi-crypto";
import { sanitizeDeal } from "@/lib/creator-deals-core";
import { ConflictError } from "@/lib/compensi";

const P = process.env.ACCOUNTING_KV_PREFIX || "acct"; // vedi compensi.js
const K_DEALS = `${P}:deals`;

export const newDealId = () => "d_" + randomBytes(6).toString("hex");

export async function getDeals() {
  const raw = await kv.get(K_DEALS);
  return raw ? openJson(raw, K_DEALS) : { rev: 0, deals: [] };
}

export async function saveDeals(list, { by, expectRev = null } = {}) {
  const cur = await getDeals();
  if (expectRev !== null && Number(expectRev) !== Number(cur.rev || 0)) {
    throw new ConflictError("Qualcun altro ha salvato gli accordi nel frattempo: ricarica la pagina.");
  }
  const doc = {
    rev: (cur.rev || 0) + 1,
    deals: (Array.isArray(list) ? list : []).slice(0, 300).map((d) => sanitizeDeal(d, newDealId)).filter((d) => d.creator),
    updatedAt: Date.now(),
    updatedBy: by || null,
  };
  await kv.set(K_DEALS, sealJson(doc, K_DEALS));
  return doc;
}
