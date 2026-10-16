"use client";
// Studio social — lettura del video NEL BROWSER per l'agente qualità (16/10/2026).
// Il file resta sul computer: si misurano formato, durata, audio, schermo nero e fermi immagine, e si
// estraggono i fotogrammi (JPEG piccoli) da mandare all'AI. Nessun ffmpeg sul server.
import { frameTimes, runsOver, TECH_RULES, QC_MAX_FRAMES } from "@/lib/studio-quality-core";

const FRAME_W = 576;           // larghezza dei fotogrammi per l'AI (9:16 → 1024 di altezza)
const BODY_BUDGET = 3.6e6;     // tutti i fotogrammi in base64 devono stare sotto ~3,6 MB
const PROBE_STEP = 0.5;        // passo per nero/fermi (secondi)
const PROBE_W = 48;            // miniatura per nero/fermi

function once(el, ev) {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const ko = () => { cleanup(); reject(new Error("Il browser non riesce a leggere questo video (prova un MP4 H.264)")); };
    const cleanup = () => { el.removeEventListener(ev, ok); el.removeEventListener("error", ko); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", ko, { once: true });
  });
}

async function seek(video, t) {
  const p = once(video, "seeked");
  video.currentTime = t;
  await p;
}

async function measureAudio(file) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return { present: null };
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    let peak = 0; let sum = 0; let n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 4) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; n++; }
    }
    ctx.close?.();
    const rms = Math.sqrt(sum / Math.max(1, n));
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
    // traccia presente ma muta = come assente
    return { present: rms > 1e-4, peakDb: Math.round(db(peak) * 10) / 10, rmsDb: Math.round(db(rms) * 10) / 10 };
  } catch {
    return { present: false }; // nessuna traccia audio decodificabile
  }
}

/**
 * Legge il video. onStage(testo) per mostrare l'avanzamento.
 * → { tech: { width, height, duration, audio, black[], freeze[] }, frames: [{ t, dataUrl }] }
 */
export async function analyzeVideo(file, { onStage } = {}) {
  if (!file || !/^video\//.test(file.type || "")) throw new Error("Scegli un file video (MP4 o MOV)");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
  try {
    onStage?.("Apro il video…");
    await once(video, "loadedmetadata");
    if (video.readyState < 2) await once(video, "loadeddata");
    const duration = video.duration;
    const width = video.videoWidth; const height = video.videoHeight;
    if (!Number.isFinite(duration) || !width) throw new Error("Il browser non riesce a leggere questo video (prova un MP4 H.264)");

    // nero e fermi immagine: miniature ogni mezzo secondo
    onStage?.("Cerco schermo nero e fermi immagine…");
    const pc = document.createElement("canvas");
    pc.width = PROBE_W; pc.height = Math.round(PROBE_W * height / width);
    const pctx = pc.getContext("2d", { willReadFrequently: true });
    const blackS = []; const freezeS = [];
    let prev = null;
    for (let t = 0; t < duration; t += PROBE_STEP) {
      await seek(video, Math.min(t, duration - 0.05));
      pctx.drawImage(video, 0, 0, pc.width, pc.height);
      const px = pctx.getImageData(0, 0, pc.width, pc.height).data;
      let lum = 0; let diff = 0;
      for (let i = 0; i < px.length; i += 4) {
        const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        lum += y;
        if (prev) diff += Math.abs(y - prev[i >> 2]);
      }
      const count = px.length / 4;
      const cur = new Float32Array(count);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) cur[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      blackS.push({ t, on: lum / count < 16 });
      if (prev) freezeS.push({ t, on: diff / count < 0.4 });
      prev = cur;
    }
    const black = runsOver(blackS, TECH_RULES.blackSec, { endGrace: 0.6 });
    // un fermo "vero" dura più di 1 s; il campione è ogni 0,5 s → servono ≥3 campioni uguali
    const freeze = runsOver(freezeS, TECH_RULES.freezeSec);

    onStage?.("Ascolto l'audio…");
    const audio = await measureAudio(file);

    onStage?.("Estraggo i fotogrammi…");
    const times = frameTimes(duration, QC_MAX_FRAMES);
    const fc = document.createElement("canvas");
    fc.width = Math.min(FRAME_W, width); fc.height = Math.round(fc.width * height / width);
    const fctx = fc.getContext("2d");
    let quality = 0.78;
    let frames = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      frames = [];
      for (const t of times) {
        await seek(video, t);
        fctx.drawImage(video, 0, 0, fc.width, fc.height);
        frames.push({ t, dataUrl: fc.toDataURL("image/jpeg", quality) });
      }
      const total = frames.reduce((s, f) => s + f.dataUrl.length, 0);
      if (total <= BODY_BUDGET) break;
      quality -= 0.15;
    }
    return { tech: { width, height, duration: Math.round(duration * 100) / 100, audio, black, freeze, size: file.size, name: file.name }, frames };
  } finally {
    video.removeAttribute("src"); video.load?.();
    URL.revokeObjectURL(url);
  }
}
