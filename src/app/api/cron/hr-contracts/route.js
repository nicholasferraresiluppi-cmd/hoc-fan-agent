// Contratti Dropbox Sign → Centro HR (09/10/2026). Smistata dal dispatcher (mai cron
// proprio in vercel.json), nella SUA funzione per avere il suo budget: elenco richieste,
// lettura dei contratti nuovi, stato del contratto sulle schede, PDF firmati su ClickUp.
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { syncContracts, beat } from "@/lib/hr-contracts";
import { dropboxSignConfigured } from "@/lib/dropbox-sign";
import { continueChain, chainDepth } from "@/lib/cron-chain";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  // 10/10/2026: l'elenco di Dropbox Sign richiede ~38 s → il primo giro (dal dispatcher) fa
  // l'elenco, i giri successivi della catena (x-tick-chain, o ?apply=1 dal bottone in pagina)
  // leggono i contratti nuovi e allegano i PDF, e si richiamano finché resta lavoro.
  const depth = chainDepth(request);
  const applyOnly = depth > 0 || new URL(request.url).searchParams.get("apply") === "1";
  let result;
  if (!dropboxSignConfigured()) result = "skip:no-key";
  else {
    try {
      const r = await syncContracts({ budgetMs: 48_000, list: !applyOnly });
      result = r.ok
        ? `${applyOnly ? `giro ${depth || "a"} (file)` : "elenco"}: ${r.requests} contratti, ${r.classified} letti${r.pending ? ` (+${r.pending} da leggere)` : ""}, ${r.statusSet} stati, ${r.attached} PDF${r.attachPending ? ` (+${r.attachPending} da allegare)` : ""}${r.noPdf ? `, ${r.noPdf} senza PDF su Dropbox Sign` : ""}${r.errors.length ? `, ${r.errors.length} errori: ${r.errors.slice(0, 2).join("; ")}` : ""}`
        : `err:${r.reason}`;
      if (r.ok && r.more) {
        const c = await continueChain(request, depth, { maxChain: 15 });
        result += c.chained ? " → continua" : ` → catena ferma (${c.reason})`;
      }
    } catch (e) {
      result = "err:" + (e?.message || "unknown");
    }
  }
  await beat(result);
  return Response.json({ result });
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handle(request);
}
