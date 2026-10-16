// Studio social — agente qualità del video: chiamata all'AI, fotogrammi salvati, esito sul contenuto.
// Logica pura in studio-quality-core.js. Il video NON passa dal server: il browser lo legge dal
// computer, misura la parte tecnica ed estrae i fotogrammi (lib/video-check-client).
//
// Chiavi:
//   studio:qc:spesa:{YYYY-MM}        spesa del mese in dollari (tetto STUDIO_QC_CAP_USD, def. 30)
//   studio:qc:lock:{pid}:{itemId}    un controllo alla volta per contenuto (5 min)
//   Blob privato studio/{pid}/qc/{itemId}/{runId}/{i}.jpg   fotogrammi letti (la tavola per chi approva)
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { costUSD } from "@/lib/sales-ai/core";
import { getProfile } from "@/lib/studio-social";
import { qualityChecksFor, QUALITY_CHECKS } from "@/lib/studio-social-core";
import { getTgConfig, readPhoto, blobReady } from "@/lib/studio-telegram";
import {
  QC_VERSION, QC_MODEL, QC_MAX_FRAMES, AI_CHECKS, qcSchema, normalizeAgentAnswer, applyAgentToReviews, technicalVerdict, fmtSec,
} from "@/lib/studio-quality-core";

const itemsKey = (pid) => `studio:items:${pid}`;
const SPEND = (d = new Date()) => `studio:qc:spesa:${d.toISOString().slice(0, 7)}`;
const LOCK = (pid, id) => `studio:qc:lock:${pid}:${id}`;
const CAP_USD = () => Number(process.env.STUDIO_QC_CAP_USD) || 30;
const FRAME_MAX_BYTES = 250 * 1024; // il corpo della richiesta deve stare sotto i ~4,5 MB di Vercel
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
  return { t, buf, b64: m[1] };
}

export async function qcSpend() {
  return { spent: Number(await kv.get(SPEND())) || 0, cap: CAP_USD() };
}

/** Un controllo: tecnico misurato dal browser + lettura AI dei fotogrammi → esito sul contenuto. */
export async function runQualityCheck(pid, itemId, { tech, frames }, by) {
  if (!process.env.ANTHROPIC_API_KEY && !fakeAi()) return { ok: false, status: 503, error: "AI non configurata in questo ambiente" };
  const profile = await getProfile(pid);
  const all = (await kv.get(itemsKey(pid))) || {};
  const item = all[itemId];
  if (!profile || !item) return { ok: false, status: 404, error: "Contenuto non trovato" };
  if (["programmato", "pubblicato"].includes(item.status)) return { ok: false, status: 409, error: "Il contenuto è già approvato: riportalo a «Da approvare» per ricontrollarlo" };
  const parsed = (Array.isArray(frames) ? frames : []).slice(0, QC_MAX_FRAMES).map(parseFrame).filter(Boolean);
  if (parsed.length < 4) return { ok: false, status: 400, error: "Fotogrammi non validi: riprova a scegliere il video" };
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
    const keys = AI_CHECKS.filter((k) => qualityChecksFor(item).some((c) => c.key === k));
    const tv = technicalVerdict(tech);
    const idn = profile.identity || {};
    const content = [];
    content.push({ type: "text", text: [
      `CREATOR: ${profile.creator || profile.handle}. ${idn.personaggio || ""}`,
      idn.estetica ? `Estetica del profilo: ${idn.estetica}` : "",
      `CONTENUTO: ${item.title}${item.hook ? ` — gancio a schermo: "${item.hook}"` : ""}`,
      item.script ? `SCRIPT:\n${item.script}` : "",
      item.ai ? "Il video ha parti generate con l'AI: guarda con ancora più attenzione volto, mani e coerenza." : "",
      `TECNICO MISURATO: ${tech.width}×${tech.height}, ${Number(duration).toFixed(1)} s, audio ${tech.audio?.present ? "presente" : "assente"}. Esito tecnico: ${tv.outcome}${tv.problems.length ? ` (${tv.problems.join("; ")})` : ""}.`,
      refs.length ? `Seguono ${refs.length} foto di riferimento della creator, poi i fotogrammi del video.` : "ATTENZIONE: nessuna foto di riferimento caricata. Per la voce «volto» rispondi «dubbio» e scrivi che mancano i riferimenti.",
    ].filter(Boolean).join("\n\n") });
    refs.forEach((r, i) => {
      content.push({ type: "text", text: `Foto di riferimento ${i + 1}` });
      content.push({ type: "image", source: { type: "base64", media_type: r.type === "image/png" ? "image/png" : r.type === "image/webp" ? "image/webp" : "image/jpeg", data: r.b64 } });
    });
    for (const f of parsed) {
      content.push({ type: "text", text: `Fotogramma a ${fmtSec(f.t)} (secondo ${f.t})` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.b64 } });
    }
    content.push({ type: "text", text: `VOCI DA VALUTARE:\n${keys.map((k) => `- ${k}: ${CHECK_HELP[k]}`).join("\n")}\n\nRispondi nel formato richiesto.` });

    const started = Date.now();
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
    if (msg.stop_reason === "refusal") return { ok: false, status: 422, error: "L'AI non ha voluto leggere questi fotogrammi: serve il controllo a mano." };
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    let raw;
    try { raw = JSON.parse(text); } catch { return { ok: false, status: 502, error: "Risposta dell'AI non leggibile: riprova" }; }
    const answer = normalizeAgentAnswer(raw, keys, duration);

    // fotogrammi salvati per la tavola di chi approva (quelli del giro prima si cancellano)
    const runId = crypto.randomBytes(6).toString("hex");
    const saved = [];
    if (blobReady()) {
      const { put, del } = await sdk();
      for (const [i, f] of parsed.entries()) {
        const path = `studio/${pid}/qc/${itemId}/${runId}/${i}.jpg`;
        await put(path, f.buf, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: false });
        saved.push({ t: f.t, path });
      }
      const old = (item.aiReview?.frames || []).map((f) => f.path).filter(Boolean);
      if (old.length) await del(old).catch(() => {});
    }

    const fresh = (await kv.get(itemsKey(pid))) || {};
    const cur = fresh[itemId] || item;
    const applied = applyAgentToReviews(cur.reviews, { tech, answer }, qualityChecksFor(cur).map((c) => c.key));
    const aiReview = {
      version: QC_VERSION, runId, at: Date.now(), by: by || null, model: msg.model || QC_MODEL,
      cost_usd: Math.round(cost * 10000) / 10000, seconds: Math.round((Date.now() - started) / 1000),
      tech, technical: applied.technical, answer, refs: refs.map((r) => r.id),
      frames: saved.length ? saved : parsed.map((f) => ({ t: f.t })),
    };
    fresh[itemId] = { ...cur, reviews: applied.reviews, aiReview, updatedAt: Date.now(), updatedBy: by || null };
    await kv.set(itemsKey(pid), fresh);
    return { ok: true, item: fresh[itemId], errors: applied.errors };
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
