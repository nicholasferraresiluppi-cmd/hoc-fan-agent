/**
 * CP Sync Job — orchestrazione SERVER-SIDE del sync, stato in KV.
 *
 * Fase 1 (questo file): il sync diventa un "job" persistito in KV
 * (cp:syncjob). Un worker fa UN chunk per chiamata (<60s) e avanza lo
 * stato. Il driver che chiama il worker in loop può essere:
 *   - il client (pagina wage-audit): sopravvive al RELOAD perché lo stato
 *     vive in KV e al caricamento la pagina riprende il job.
 *   - Fase 2: QStash, che guida il worker indipendente dal browser
 *     (sopravvive a tab chiuso) + schedule mensile.
 *
 * Il worker riusa le funzioni già provate: syncRefdata / prepareSync /
 * syncWageBatch / finalizeSync. Niente nuova logica di fetch.
 *
 * Stato job:
 *   { months:[pid...], idx, phase, page_offset, batch_offset, total,
 *     status: "running"|"done"|"error"|"idle", started_at, updated_at,
 *     done_months:[], error?, last_step? }
 *   phase ∈ "prepare" | "batch" | "finalize"
 */
import { kv } from "@vercel/kv";
import { syncRefdata, prepareSync, syncWageBatch, finalizeSync } from "./creatorspro-sync";

const JOB_KEY = "cp:syncjob";
const PAGES_PER_STEP = 5;
const BATCH_PER_STEP = 30;
const TTL_JOB = 6 * 3600;

export async function getJob() {
  return (await kv.get(JOB_KEY)) || null;
}

export async function cancelJob() {
  const job = await getJob();
  if (job && job.status === "running") {
    await kv.set(JOB_KEY, { ...job, status: "idle", updated_at: Date.now() }, { ex: TTL_JOB });
  }
  return { ok: true };
}

/**
 * Avvia un job per i mesi dati. Fa subito il refdata (condiviso, una volta)
 * e mette il primo mese in fase "prepare".
 */
export async function startJob(months) {
  const list = (Array.isArray(months) ? months : []).filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (list.length === 0) throw new Error("Nessun mese valido da sincronizzare");
  await syncRefdata(); // members/groups/intervals — una volta per job
  const job = {
    months: list,
    idx: 0,
    phase: "prepare",
    page_offset: 1,
    batch_offset: 0,
    total: 0,
    status: "running",
    started_at: Date.now(),
    updated_at: Date.now(),
    done_months: [],
    last_step: "start",
  };
  await kv.set(JOB_KEY, job, { ex: TTL_JOB });
  return job;
}

/**
 * Esegue UN chunk del job corrente e avanza lo stato. Idempotente rispetto
 * allo stato KV (legge → fa un passo → riscrive). Ritorna { has_more, job }.
 */
export async function stepJob() {
  const job = await getJob();
  if (!job || job.status !== "running") return { has_more: false, job };

  const pid = job.months[job.idx];
  try {
    if (job.phase === "prepare") {
      const r = await prepareSync({ periodId: pid, pageOffset: job.page_offset, pagesLimit: PAGES_PER_STEP });
      job.total = r.total || 0;
      if (r.done) { job.phase = "batch"; job.batch_offset = 0; }
      else { job.page_offset = r.next_page || job.page_offset + PAGES_PER_STEP; }
      job.last_step = `${pid} prep pag ${job.page_offset}`;
    } else if (job.phase === "batch") {
      if (job.total === 0) {
        job.phase = "finalize";
      } else {
        const r = await syncWageBatch({ periodId: pid, offset: job.batch_offset, batchSize: BATCH_PER_STEP });
        job.batch_offset = r.next_offset;
        if (r.done) job.phase = "finalize";
        job.last_step = `${pid} batch ${Math.floor(job.batch_offset / BATCH_PER_STEP)}/${Math.ceil((job.total || 1) / BATCH_PER_STEP)}`;
      }
    } else if (job.phase === "finalize") {
      await finalizeSync({ periodId: pid });
      job.done_months = [...(job.done_months || []), pid];
      job.idx += 1;
      if (job.idx >= job.months.length) {
        job.status = "done";
        job.last_step = "completato";
      } else {
        job.phase = "prepare";
        job.page_offset = 1;
        job.batch_offset = 0;
        job.total = 0;
        job.last_step = `${job.months[job.idx]} start`;
      }
    }
    job.updated_at = Date.now();
    await kv.set(JOB_KEY, job, { ex: TTL_JOB });
    return { has_more: job.status === "running", job };
  } catch (e) {
    // Non marchiamo "error" definitivo: salviamo l'errore ma teniamo running
    // così un retry (client o QStash) può riprovare lo stesso chunk.
    job.error = String(e?.message || e);
    job.updated_at = Date.now();
    await kv.set(JOB_KEY, job, { ex: TTL_JOB });
    return { has_more: true, job, retry: true, error: job.error };
  }
}

/**
 * Progress leggibile per la UI.
 */
export function jobProgress(job) {
  if (!job) return null;
  return {
    status: job.status,
    current_month: job.months?.[job.idx] || null,
    month_index: job.idx,
    months_total: job.months?.length || 0,
    done_months: job.done_months || [],
    phase: job.phase,
    last_step: job.last_step,
    error: job.error || null,
  };
}
