// Studio social — agente qualità del video: chiamata all'AI, fotogrammi salvati, esito sul contenuto.
// Logica pura in studio-quality-core.js. Il video NON passa dal server: il browser lo legge dal
// computer, misura la parte tecnica ed estrae i fotogrammi (lib/video-check-client).
//
// Chiavi:
//   studio:qc:spesa:{YYYY-MM}        spesa del mese in dollari (tetto STUDIO_QC_CAP_USD, def. 30)
//   studio:qc:lock:{pid}:{itemId}    un controllo alla volta per contenuto (5 min)
//   studio:qc:run:{runId}            fotogrammi caricati a pacchetti per un giro (1 ora)
//   Blob privato studio/{pid}/qc/{itemId}/{runId}/{i}.jpg   fotogrammi letti (la tavola per chi approva)
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { costUSD } from "@/lib/sales-ai/core";
import { getProfile } from "@/lib/studio-social";
import { qualityChecksFor, QUALITY_CHECKS } from "@/lib/studio-social-core";
import { getTgConfig, readPhoto, blobReady } from "@/lib/studio-telegram";
import {
  QC_VERSION, QC_MODEL, QC_MAX_FRAMES, QC_FRAMES_PER_CALL, AI_CHECKS, qcSchema, normalizeAgentAnswer, mergeAnswers, applyAgentToReviews, technicalVerdict, fmtSec,
} from "@/lib/studio-quality-core";

const itemsKey = (pid) => `studio:items:${pid}`;
const SPEND = (d = new Date()) => `studio:qc:spesa:${d.toISOString().slice(0, 7)}`;
const LOCK = (pid, id) => `studio:qc:lock:${pid}:${id}`;
const CAP_USD = () => Number(process.env.STUDIO_QC_CAP_USD) || 30;
const FRAME_MAX_BYTES = 900 * 1024; // un fotogramma a risoluzione piena; i pacchetti restano sotto ~4 MB
const sdk = async () => globalThis.__studioFakeBlob || (await import("@vercel/blob"));
const fakeAi = () => globalThis.__studioFakeAnthropic;

const SYSTEM = `Sei il revisore qualità di una redazione che pubblica reel Instagram di una creator italiana.
La regola della casa: quello che esce deve essere perfetto. Un errore visibile (una mano sbagliata, un refuso
nel sottotitolo, un vestito che cambia tra due tagli, una faccia che non è la sua) fa perdere credibilità e
non si pubblica. L'etichetta AI va bene, gli errori no.

Ricevi: le foto di riferimento della creator, i fotogrammi del video montato col loro secondo, lo script e i
numeri tecnici già misurati dal computer. NON senti l'audio. I fotogrammi sono campioni: quello che sta tra
due fotogrammi non lo vedi, e lo dici.

Per ogni voce rispondi:
- "ok" solo se sei sicuro che nei fotogrammi non c'è niente che non va;
- "dubbio" se non sei sicuro o non puoi giudicare dai fotogrammi (dillo nella nota);
- "errore" se vedi un problema: nota breve e concreta + i secondi esatti dei fotogrammi dove si vede.
Nel dubbio scegli "dubbio", mai "ok". Sul volto in particolare: il tuo giudizio è solo un aiuto, decide una
persona; segnala ogni differenza che noti (naso, labbra, occhi, sopracciglia, nei, attaccatura dei capelli,
corporatura) rispetto alle foto di riferimento.

In "testo_letto" trascrivi i testi a schermo e i sottotitoli che leggi, col secondo. In "sintesi" due frasi
in italiano semplice per chi deve approvare: cosa guardare per primo.`;

const CHECK_HELP = {
  volto: "È lei: volto, corpo, capelli, nei uguali alle foto di riferimento, in ogni fotogramma in cui si vede.",
  anatomia: "Mani e dita (numero, forma), denti, occhi, orecchie giusti; niente pelle di plastica o lineamenti che si deformano.",
  coerenza: "Vestiti, gioielli, trucco, oggetti, luce e stanza restano uguali tra un fotogramma e l'altro della stessa scena.",
  montaggio: "Inquadrature pulite: niente fotogrammi sfocati a caso, salti di colore, scatti visibili, bordi neri, zoom deformati.",
  testo: "Testi a schermo e sottotitoli: senza refusi, coerenti con lo script, leggibili, non nelle zone coperte dall'interfaccia di Instagram (fascia bassa ~20% e lato destro).",
  aggancio: "I fotogrammi dei primi 2 secondi fermano chi scorre? Il gancio si legge subito? (opinione, decide una persona)",
};

async function streamToBase64(stream) {
  return Buffer.from(await new Response(stream).arrayBuffer()).toString("base64");
}

function parseFrame(f) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(f?.dataUrl || ""));
  const t = Number(f?.t);
  if (!m || !Number.isFinite(t)) return null;
  const buf = Buffer.from(m[1], "base64");
  if (!buf.length || buf.length > FRAME_MAX_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return { t, buf };
}

export async function qcSpend() {
  return { spent: Number(await kv.get(SPEND())) || 0, cap: CAP_USD() };
}

const RUN = (runId) => `studio:qc:run:${runId}`;

async function gateItem(pid, itemId) {
  const profile = await getProfile(pid);
  const item = ((await kv.get(itemsKey(pid))) || {})[itemId];
  if (!profile || !item) return { error: { ok: false, status: 404, error: "Contenuto non trovato" } };
  if (["programmato", "pubblicato"].includes(item.status)) return { error: { ok: false, status: 409, error: "Il contenuto è già approvato: riportalo a «Da approvare» per ricontrollarlo" } };
  return { profile, item };
}

/**
 * Passo 1 (ripetuto): il browser manda i fotogrammi a pacchetti (ogni richiesta sotto ~4 MB) e il
 * server li mette nello spazio privato. Il giro vive 1 ora in `studio:qc:run:{runId}`.
 */
export async function addFrames(pid, itemId, runId, frames, by) {
  if (!blobReady()) return { ok: false, status: 503, error: "Lo spazio per i fotogrammi è attivo solo online, non in locale" };
  if (!/^[a-f0-9]{12}$/.test(String(runId || ""))) return { ok: false, status: 400, error: "Giro non valido" };
  const g = await gateItem(pid, itemId);
  if (g.error) return g.error;
  const run = (await kv.get(RUN(runId))) || { pid, itemId, by: by || null, frames: [], at: Date.now() };
  if (run.pid !== pid || run.itemId !== itemId) return { ok: false, status: 403, error: "Giro di un altro contenuto" };
  const parsed = (Array.isArray(frames) ? frames : []).map(parseFrame).filter(Boolean);
  if (!parsed.length) return { ok: false, status: 400, error: "Fotogrammi non validi" };
  if (run.frames.length + parsed.length > QC_MAX_FRAMES) return { ok: false, status: 400, error: "Troppi fotogrammi" };
  const { put } = await sdk();
  const added = [];
  for (const f of parsed) {
    const i = run.frames.length + added.length;
    const path = `studio/${pid}/qc/${itemId}/${runId}/${i}.jpg`;
    await put(path, f.buf, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
    added.push({ t: f.t, path });
  }
  const fresh = (await kv.get(RUN(runId))) || run; // due pacchetti in parallelo non si cancellano
  fresh.frames = [...(fresh.frames || []), ...added].sort((a, b) => a.t - b.t);
  await kv.set(RUN(runId), fresh, { ex: 3600 });
  return { ok: true, count: fresh.frames.length };
}

async function blobBase64(path) {
  const { get } = await sdk();
  const r = await get(path, { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return streamToBase64(r.stream);
}

/** Una chiamata all'AI su un gruppo di fotogrammi (sempre con le foto di riferimento). */
async function askAi({ header, refs, frames, keys }) {
  const content = [{ type: "text", text: header }];
  refs.forEach((r, i) => {
    content.push({ type: "text", text: `Foto di riferimento ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: r.type === "image/png" ? "image/png" : r.type === "image/webp" ? "image/webp" : "image/jpeg", data: r.b64 } });
  });
  for (const f of frames) {
    content.push({ type: "text", text: `Fotogramma a ${fmtSec(f.t)} (secondo ${f.t})` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.b64 } });
  }
  content.push({ type: "text", text: `VOCI DA VALUTARE (solo su questi fotogrammi):\n${keys.map((k) => `- ${k}: ${CHECK_HELP[k]}`).join("\n")}\n\nRispondi nel formato richiesto.` });
  const client = fakeAi() || new Anthropic();
  const msg = await client.messages.create({
    model: QC_MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: qcSchema(keys) } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  }).catch((e) => {
    if (/credit balance/i.test(String(e?.message))) throw Object.assign(new Error("Il credito AI è finito: va ricaricato nella console Anthropic."), { status: 503 });
    if (e?.status === 429 || e?.status === 529) throw Object.assign(new Error("L'AI è sovraccarica: riprova tra un minuto."), { status: 503 });
    throw e;
  });
  const cost = costUSD(msg.model || QC_MODEL, msg.usage, { batch: false });
  await kv.incrbyfloat(SPEND(), cost).catch(() => {});
  if (msg.stop_reason === "refusal") throw Object.assign(new Error("L'AI non ha voluto leggere questi fotogrammi: serve il controllo a mano."), { status: 422 });
  const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let raw;
  try { raw = JSON.parse(text); } catch { throw Object.assign(new Error("Risposta dell'AI non leggibile: riprova"), { status: 502 }); }
  return { raw, cost, model: msg.model || QC_MODEL };
}

/** Passo 2: l'AI legge i fotogrammi del giro a gruppi (in parallelo), il codice scrive gli esiti. */
export async function runQualityCheck(pid, itemId, { runId, tech }, by) {
  if (!process.env.ANTHROPIC_API_KEY && !fakeAi()) return { ok: false, status: 503, error: "AI non configurata in questo ambiente" };
  const g = await gateItem(pid, itemId);
  if (g.error) return g.error;
  const { profile, item } = g;
  const run = await kv.get(RUN(String(runId || "")));
  if (!run || run.pid !== pid || run.itemId !== itemId) return { ok: false, status: 400, error: "Fotogrammi non trovati: riprova a scegliere il video" };
  if (run.frames.length < 4) return { ok: false, status: 400, error: "Troppi pochi fotogrammi: riprova a scegliere il video" };
  const duration = Number(tech?.duration);
  const { spent, cap } = await qcSpend();
  if (spent >= cap) return { ok: false, status: 429, error: `Tetto di spesa del mese raggiunto (${cap} $): va alzato per continuare` };
  if (!(await kv.set(LOCK(pid, itemId), Date.now(), { nx: true, ex: 300 }))) return { ok: false, status: 409, error: "C'è già un controllo in corso su questo contenuto" };

  try {
    const cfg = await getTgConfig(pid);
    const refs = [];
    for (const id of (cfg.referencePhotoIds || []).slice(0, 4)) {
      const ph = await readPhoto(pid, id).catch(() => null);
      if (ph) refs.push({ id, type: ph.type, b64: await streamToBase64(ph.stream) });
    }
    const frames = [];
    for (const f of run.frames) { const b64 = await blobBase64(f.path); if (b64) frames.push({ ...f, b64 }); }
    if (frames.length < 4) return { ok: false, status: 400, error: "Fotogrammi non leggibili: riprova" };
    const allKeys = AI_CHECKS.filter((k) => qualityChecksFor(item).some((c) => c.key === k));
    const tv = technicalVerdict(tech);
    const idn = profile.identity || {};
    const groups = [];
    for (let i = 0; i < frames.length; i += QC_FRAMES_PER_CALL) groups.push(frames.slice(i, i + QC_FRAMES_PER_CALL));
    const header = (gi) => [
      `CREATOR: ${profile.creator || profile.handle}. ${idn.personaggio || ""}`,
      idn.estetica ? `Estetica del profilo: ${idn.estetica}` : "",
      `CONTENUTO: ${item.title}${item.hook ? ` — gancio a schermo: "${item.hook}"` : ""}`,
      item.script ? `SCRIPT:\n${item.script}` : "",
      item.ai ? "Il video ha parti generate con l'AI: guarda con ancora più attenzione volto, mani e coerenza." : "",
      `TECNICO MISURATO: ${tech.width}×${tech.height}, ${Number(duration).toFixed(1)} s, audio ${tech.audio?.present ? "presente" : "assente"}${(tech.cuts || []).length ? `, tagli a ${tech.cuts.map(fmtSec).join(", ")}` : ""}. Esito tecnico: ${tv.outcome}.`,
      `Questa è la PARTE ${gi + 1} di ${groups.length} del video (fotogrammi da ${fmtSec(groups[gi][0].t)} a ${fmtSec(groups[gi][groups[gi].length - 1].t)}).`,
      refs.length ? `Seguono ${refs.length} foto di riferimento della creator, poi i fotogrammi.` : "ATTENZIONE: nessuna foto di riferimento caricata. Per la voce «volto» rispondi «dubbio» e scrivi che mancano i riferimenti.",
    ].filter(Boolean).join("\n\n");

    const started = Date.now();
    const results = new Array(groups.length);
    let next = 0;
    const worker = async () => {
      while (next < groups.length) {
        const gi = next++;
        // il gancio (primi 2 s) si giudica solo nella prima parte
        const keys = gi === 0 ? allKeys : allKeys.filter((k) => k !== "aggancio");
        const r = await askAi({ header: header(gi), refs, frames: groups[gi], keys });
        results[gi] = { ...r, answer: normalizeAgentAnswer(r.raw, keys, duration) };
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const answer = mergeAnswers(results.map((r) => r.answer), allKeys);
    const cost = results.reduce((s0, r) => s0 + r.cost, 0);

    const fresh = (await kv.get(itemsKey(pid))) || {};
    const cur = fresh[itemId] || item;
    const old = (cur.aiReview?.frames || []).map((f) => f.path).filter((p0) => p0 && !p0.includes(`/${runId}/`));
    if (old.length) { const { del } = await sdk(); await del(old).catch(() => {}); }
    const applied = applyAgentToReviews(cur.reviews, { tech, answer }, qualityChecksFor(cur).map((c) => c.key));
    const aiReview = {
      version: QC_VERSION, runId, at: Date.now(), by: by || null, model: results[0]?.model || QC_MODEL,
      cost_usd: Math.round(cost * 10000) / 10000, seconds: Math.round((Date.now() - started) / 1000), calls: groups.length,
      tech, technical: applied.technical, answer, refs: refs.map((r) => r.id),
      frames: frames.map((f) => ({ t: f.t, path: f.path })),
    };
    fresh[itemId] = { ...cur, reviews: applied.reviews, aiReview, updatedAt: Date.now(), updatedBy: by || null };
    await kv.set(itemsKey(pid), fresh);
    await kv.del(RUN(runId)).catch(() => {});
    return { ok: true, item: fresh[itemId], errors: applied.errors };
  } catch (e) {
    return { ok: false, status: e.status || 500, error: e.message || "Controllo non riuscito" };
  } finally {
    await kv.del(LOCK(pid, itemId)).catch(() => {});
  }
}

/** Un fotogramma salvato dell'ultimo controllo (per la tavola). */
export async function readQcFrame(pid, itemId, index) {
  if (!blobReady()) return null;
  const item = ((await kv.get(itemsKey(pid))) || {})[itemId];
  const f = item?.aiReview?.frames?.[Number(index)];
  if (!f?.path) return null;
  const { get } = await sdk();
  const r = await get(f.path, { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { stream: r.stream };
}

export { QUALITY_CHECKS };
