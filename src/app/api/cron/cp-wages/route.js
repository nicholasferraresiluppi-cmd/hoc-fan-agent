/**
 * GET/POST /api/cron/cp-wages — sync automatico giornaliero delle wage CP.
 *
 * PERCHÉ (20 lug 2026): il refund impact e l'albero payout attribuiscono le
 * vendite agli operatori leggendo cp:wages:{mese} — che fino a oggi si
 * aggiornava SOLO a mano da /admin/wage-audit. Risultato osservato: wage di
 * luglio ferme al 9/7 → tutti i refund su vendite successive "non attribuiti"
 * per pura stanchezza del dato, e numeri sottostimati senza che nulla lo
 * dicesse. La gamba Infloww ha il suo cron (payout-ledger): questa è la
 * seconda gamba, stessa meccanica.
 *
 * Meccanica: un cron al giorno (03:00 UTC, prima del ledger) + catena
 * auto-concatenante (vincolo Hobby, vedi lib/cron-chain). Ogni tick avanza la
 * macchina a fasi dell'orchestrazione ESISTENTE di lib/creatorspro-sync
 * (refdata → prepare incrementale → batch → riparazioni → finalize) restando
 * sotto i 60s; lo stato di progresso vive in KV e ogni ripresa riparte da lì.
 * Target: mese corrente, sempre; mese precedente nei primi 3 giorni del mese
 * (coda di turni a cavallo della chiusura).
 *
 * Auth: Bearer CRON_SECRET (lib/cron-auth) oppure sessione SEED. Il path è
 * pubblico nel middleware (namespace /api/cron/*). La pagina wage-audit resta
 * la via manuale per storici e riparazioni mirate.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import {
  syncRefdata, prepareSync, syncWageBatch,
  retryFailedPages, retryFailedDetails, finalizeSync,
} from "@/lib/creatorspro-sync";

export const maxDuration = 60;

const progKey = (p) => `cp:cron:progress:${p}`;
const TTL_PROG = 40 * 24 * 3600;
const STALE_MS = 20 * 3600 * 1000;   // refresh giornaliero, con margine
const RESTART_MS = 24 * 3600 * 1000; // sync incagliato da un giorno → si riparte puliti
const FRESH_MS = 90 * 1000;          // guardia anti-sovrapposizione (solo chain 0)
const BUDGET_MS = 35000;
const PREPARE_PAGES = 3;
const BATCH_SIZE = 30;
// Un mese pieno: ~10 link di prepare + ~25-30 batch (2-5 per tick) + code.
const MAX_CHAIN = 60;

function targets() {
  const now = new Date();
  const cur = now.toISOString().slice(0, 7);
  const out = [cur];
  if (now.getUTCDate() <= 3) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

async function tickPeriod(period, chain) {
  let prog = await kv.get(progKey(period));
  if (prog?.phase === "done" && Date.now() - (prog.finished_at || 0) <= STALE_MS) return null; // fresco
  if (!prog || prog.phase === "done" || Date.now() - (prog.started_at || 0) > RESTART_MS) {
    prog = { phase: "refdata", page: 1, offset: 0, repair_rounds: 0, started_at: Date.now(), updated_at: 0 };
  }
  if (chain === 0 && prog.updated_at && Date.now() - prog.updated_at < FRESH_MS) {
    return { action: "skip", period, reason: "tick già in corso", phase: prog.phase };
  }
  // L'errore salvato appartiene a un tentativo passato: se stiamo di nuovo
  // lavorando, via — altrimenti resta "appiccicato" nei salvataggi successivi
  // e confonde la diagnosi (osservato col primo run: errore locale rimasto
  // scritto per tutta la catena prod riuscita).
  delete prog.error;

  const t0 = Date.now();
  const save = async () => {
    prog.updated_at = Date.now();
    await kv.set(progKey(period), prog, { ex: TTL_PROG });
  };

  try {
    while (Date.now() - t0 < BUDGET_MS) {
      if (prog.phase === "refdata") {
        await syncRefdata();
        prog.phase = "prepare";
        prog.page = 1;
        await save();
      } else if (prog.phase === "prepare") {
        const r = await prepareSync({ periodId: period, pageOffset: prog.page, pagesLimit: PREPARE_PAGES });
        if (r.done) { prog.phase = "batch"; prog.offset = 0; }
        else prog.page = r.next_page;
        await save();
      } else if (prog.phase === "batch") {
        const r = await syncWageBatch({ periodId: period, offset: prog.offset, batchSize: BATCH_SIZE });
        prog.offset = r.next_offset;
        if (r.done) prog.phase = "repair";
        await save();
      } else if (prog.phase === "repair") {
        // Pagine perse al prepare: se il retry recupera stub, servono altri
        // batch (gli stub nuovi sono in coda, offset già corretto). Max 2 giri.
        const rp = await retryFailedPages({ periodId: period }).catch(() => ({ recovered: 0 }));
        if (rp.recovered > 0 && prog.repair_rounds < 2) {
          prog.repair_rounds += 1;
          prog.phase = "batch";
        } else {
          await retryFailedDetails({ periodId: period }).catch(() => {});
          prog.phase = "finalize";
        }
        await save();
      } else if (prog.phase === "finalize") {
        await finalizeSync({ periodId: period });
        prog.phase = "done";
        prog.finished_at = Date.now();
        delete prog.error;
        await save();
        return { action: "done", period };
      }
    }
    return { action: "step", period, phase: prog.phase, page: prog.page, offset: prog.offset };
  } catch (e) {
    const msg = String(e?.message || e);
    // Stato dell'orchestrazione scaduto (TTL 6h): riparti pulito al prossimo
    // tick invece di ribattere per sempre sulla stessa fase.
    if (/Nessuno stato sync/i.test(msg)) prog = { phase: "refdata", page: 1, offset: 0, repair_rounds: 0, started_at: Date.now(), updated_at: 0 };
    prog.error = msg;
    await save();
    return { action: "error", period, phase: prog.phase, error: msg };
  }
}

async function tick(chain) {
  for (const period of targets()) {
    const out = await tickPeriod(period, chain);
    if (out) return out; // primo periodo con lavoro (o skip/errore); i freschi si saltano
  }
  return { action: "idle", reason: "wage CP fresche (<20h)" };
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const chain = chainDepth(request);
  try {
    const out = await tick(chain);
    let chained = null;
    if (out.action === "step" || out.action === "done") {
      // "done" concatena ancora una volta: nei primi giorni del mese c'è un
      // secondo periodo in coda; se non c'è, il prossimo tick risponde idle.
      chained = await continueChain(request, chain, { maxChain: MAX_CHAIN });
    }
    return Response.json({ ...out, chain, ...(chained ? { next: chained } : {}) });
  } catch (e) {
    return Response.json({ action: "error", error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
