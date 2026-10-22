#!/usr/bin/env node
// Guarda un video per Claude: link (Instagram, YouTube, mp4 diretto) o file locale →
// fotogrammi + fogli di provini con il secondo scritto sopra + (se c'è la chiave) parlato
// e testi a schermo letti da Gemini. Claude poi apre i fogli con Read e risponde.
//
//   node scripts/guarda-video.mjs <link|file> [--domanda "…"] [--gemini|--no-gemini] [--out cartella]
//
// Chiavi (variabili d'ambiente, oppure .env.local/.env del repo, oppure ~/.config/hoc/*.env):
//   APIFY_TOKEN     → per i link di Instagram (attore apify/instagram-scraper, ~0,3 cent a reel)
//   GEMINI_API_KEY  → facoltativa: senza, niente parlato (si vedono solo i fotogrammi)
//   GEMINI_MODEL    → facoltativa; se il modello non esiste se ne sceglie un "flash" dall'elenco
//
// Privacy: con la chiave gratuita Google può usare i video ricevuti. Per questo Gemini parte da
// solo SOLO sui link pubblici; un file locale (es. un reel non ancora pubblicato di una creator)
// va a Gemini solo con --gemini esplicito. Nessun video finisce nel repo: tutto in --out
// (di base la cartella temporanea del sistema).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_FRAMES = 60;
const LONG_SIDE = 768;
const DEFAULT_MODEL = "gemini-3.8-flash";

function loadEnv() {
  const files = [".env.local", ".env"].map((f) => path.resolve(f));
  const cfg = path.join(os.homedir(), ".config", "hoc");
  try {
    for (const f of fs.readdirSync(cfg)) if (f.endsWith(".env")) files.push(path.join(cfg, f));
  } catch {}
  for (const f of files) {
    let txt;
    try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function parseArgs(argv) {
  const a = { src: null, domanda: "", gemini: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--domanda") a.domanda = argv[++i] || "";
    else if (x === "--gemini") a.gemini = true;
    else if (x === "--no-gemini") a.gemini = false;
    else if (x === "--out") a.out = argv[++i];
    else if (!a.src) a.src = x;
  }
  return a;
}

const kindOf = (src) => {
  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(src)) return "instagram";
  if (/^https?:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\//i.test(src)) return "youtube";
  if (/^https?:\/\//i.test(src)) return "url";
  return "file";
};

// "fetch failed" non dice niente: si nomina l'host (in cloud la rete può non lasciarlo passare).
async function net(url, opts) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    throw new Error(`rete: ${new URL(url).host} non raggiungibile (${e.cause?.code || e.message}). In un ambiente cloud va aggiunto ai domini permessi.`);
  }
}

const slug = (s) => s.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(-60) || "video";

async function download(url, dest) {
  const r = await net(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`download ${r.status} da ${new URL(url).host}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function fromInstagram(link, dir) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Manca APIFY_TOKEN (variabile d'ambiente o ~/.config/hoc/apify.env).");
  const api = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=120&maxTotalChargeUsd=0.05&token=${encodeURIComponent(token)}`;
  const r = await net(api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directUrls: [link], resultsType: "posts", resultsLimit: 1 }),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const [it] = await r.json();
  if (!it) throw new Error("Apify non ha restituito il post (privato, rimosso o link sbagliato?).");
  if (it.error) throw new Error(`Apify: ${it.error} ${it.errorDescription || ""}`.trim());
  if (!it.videoUrl) throw new Error("Il post non è un video (foto o carosello senza video).");
  const file = path.join(dir, "video.mp4");
  await download(it.videoUrl, file); // il link firmato scade presto: subito
  return {
    file,
    meta: {
      link: it.url || link,
      autore: it.ownerUsername,
      didascalia: it.caption || "",
      durata_s: it.videoDuration,
      visualizzazioni: it.videoPlayCount ?? it.videoViewCount,
      like: it.likesCount,
      commenti: it.commentsCount,
      pubblicato: it.timestamp,
      audio: it.musicInfo ? (it.musicInfo.uses_original_audio ? "audio originale" : `${it.musicInfo.artist_name || ""} – ${it.musicInfo.song_name || ""}`) : null,
      collaborazione_pagata: it.paidPartnership || false,
    },
  };
}

function fromYoutube(link, dir) {
  // Con yt-dlp si scarica (fotogrammi veri); senza, Gemini legge il link da solo.
  const has = spawnSync("yt-dlp", ["--version"]).status === 0;
  if (!has) return { file: null, meta: { link } };
  const file = path.join(dir, "video.mp4");
  execFileSync("yt-dlp", ["-q", "-f", "mp4[height<=720]/best[height<=720]/best", "-o", file, link], { stdio: "inherit" });
  return { file, meta: { link } };
}

function probe(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file]).toString();
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === "video");
  return { duration: Number(j.format.duration) || 0, width: v?.width, height: v?.height, audio: j.streams.some((s) => s.codec_type === "audio") };
}

// Quando guardare: fitto nei primi 3 secondi (il gancio), poi a passo regolare, più ogni taglio.
function sceneCuts(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  return [...(r.stderr || "").matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

export function pickTimes(duration, cuts, max = MAX_FRAMES) {
  const t = [];
  for (let s = 0; s < Math.min(3, duration); s += 0.5) t.push(s);
  const step = Math.max(1, (duration - 3) / Math.max(1, max - 6 - Math.min(cuts.length, 20)));
  for (let s = 3; s < duration; s += step) t.push(s);
  for (const c of cuts.slice(0, 20)) t.push(c + 0.1); // subito dopo il taglio
  t.push(Math.max(0, duration - 0.2));
  const sorted = [...new Set(t.map((x) => Math.round(x * 10) / 10))].filter((x) => x >= 0 && x < duration).sort((a, b) => a - b);
  const kept = [];
  for (const x of sorted) if (!kept.length || x - kept[kept.length - 1] >= 0.3) kept.push(x);
  if (kept.length <= max) return kept;
  const out = [];
  for (let i = 0; i < max; i++) out.push(kept[Math.round((i * (kept.length - 1)) / (max - 1))]);
  return [...new Set(out)];
}

function findFont() {
  const cands = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  ];
  for (const f of cands) if (fs.existsSync(f)) return f;
  const r = spawnSync("fc-match", ["-f", "%{file}", "sans:bold"], { encoding: "utf8" });
  return r.status === 0 && r.stdout && fs.existsSync(r.stdout) ? r.stdout : null;
}

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function extractFrames(file, times, dir, info) {
  const fdir = path.join(dir, "fotogrammi");
  fs.mkdirSync(fdir, { recursive: true });
  const font = findFont();
  const scale = (info.width || 0) >= (info.height || 0) ? `scale=${LONG_SIDE}:-2` : `scale=-2:${LONG_SIDE}`;
  const frames = [];
  times.forEach((t, i) => {
    const name = `f${String(i + 1).padStart(3, "0")}_${t.toFixed(1)}s.jpg`;
    const label = font
      ? `,drawtext=fontfile='${font.replace(/:/g, "\\:")}':text='${fmt(t).replace(/:/g, "\\:")}':x=12:y=12:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8`
      : "";
    spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", scale + label, "-q:v", "3", "-y", path.join(fdir, name)]);
    if (fs.existsSync(path.join(fdir, name))) frames.push({ t, file: path.join(fdir, name) });
  });
  return frames;
}

// Fogli 3×3: Claude legge 9 fotogrammi per immagine invece di uno.
function contactSheets(frames, dir) {
  const sheets = [];
  for (let i = 0; i < frames.length; i += 9) {
    const group = frames.slice(i, i + 9);
    const out = path.join(dir, `foglio_${String(sheets.length + 1).padStart(2, "0")}_${group[0].t.toFixed(1)}-${group[group.length - 1].t.toFixed(1)}s.jpg`);
    const list = path.join(dir, `.list${sheets.length}.txt`);
    fs.writeFileSync(list, group.map((f) => `file '${f.file.replace(/'/g, "'\\''")}'\nduration 1`).join("\n") + "\n");
    const cols = Math.min(3, group.length);
    const rows = Math.ceil(group.length / 3);
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", `scale=360:-2:force_original_aspect_ratio=decrease,pad=360:ih:(ow-iw)/2:0,tile=${cols}x${rows}:padding=6:color=white`, "-frames:v", "1", "-q:v", "3", "-y", out]);
    fs.rmSync(list, { force: true });
    if (r.status === 0 && fs.existsSync(out)) sheets.push(out);
  }
  return sheets;
}

const GEMINI = "https://generativelanguage.googleapis.com";

async function geminiModel(key) {
  const want = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const r = await fetch(`${GEMINI}/v1beta/models?pageSize=200&key=${key}`);
  if (!r.ok) return want;
  const names = ((await r.json()).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  if (names.includes(want)) return want;
  const flash = names.filter((n) => /flash/.test(n) && !/lite|image|tts|live|audio|thinking|exp/.test(n)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return flash[0] || want;
}

async function geminiUpload(key, file) {
  const size = fs.statSync(file).size;
  const start = await fetch(`${GEMINI}/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: path.basename(file) } }),
  });
  const up = start.headers.get("x-goog-upload-url");
  if (!up) throw new Error(`Gemini upload: ${start.status} ${(await start.text()).slice(0, 200)}`);
  const done = await fetch(up, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "content-length": String(size) },
    body: fs.readFileSync(file),
  });
  let f = (await done.json()).file;
  for (let i = 0; i < 60 && f?.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    f = await (await fetch(`${GEMINI}/v1beta/${f.name}?key=${key}`)).json();
  }
  if (f?.state !== "ACTIVE") throw new Error(`Gemini: file non pronto (${f?.state || "sconosciuto"})`);
  return f;
}

const GEMINI_PROMPT = (domanda) => `Guarda questo video (immagini e audio) e rispondi in italiano, in testo semplice, con queste sezioni:
PARLATO: trascrizione fedele di tutto ciò che si dice, con il secondo [m:ss] a inizio frase e chi parla. Se non si parla, scrivi "nessun parlato" e descrivi l'audio (musica, suoni).
TESTI A SCHERMO: ogni scritta sovrimpressa, con il secondo in cui compare.
AUDIO: musica/suoni, tono della voce.
COSA SUCCEDE: la sequenza delle scene in breve, con i secondi.
${domanda ? `DOMANDA: ${domanda}\n` : ""}Non inventare: se una parola non si capisce scrivi [incomprensibile].`;

async function askGemini({ key, file, youtube, domanda }) {
  const model = await geminiModel(key);
  let part;
  let uploaded = null;
  if (youtube) part = { file_data: { file_uri: youtube } };
  else {
    uploaded = await geminiUpload(key, file);
    part = { file_data: { mime_type: uploaded.mimeType || "video/mp4", file_uri: uploaded.uri } };
  }
  try {
    const r = await fetch(`${GEMINI}/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [part, { text: GEMINI_PROMPT(domanda) }] }], generationConfig: { temperature: 0.2 } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return { model, text: text || "(Gemini non ha risposto)" };
  } finally {
    if (uploaded) await fetch(`${GEMINI}/v1beta/${uploaded.name}?key=${key}`, { method: "DELETE" }).catch(() => {});
  }
}

async function main() {
  loadEnv();
  const a = parseArgs(process.argv.slice(2));
  if (!a.src) {
    console.error('Uso: node scripts/guarda-video.mjs <link|file> [--domanda "…"] [--gemini|--no-gemini] [--out cartella]');
    process.exit(2);
  }
  const kind = kindOf(a.src);
  const dir = path.resolve(a.out || path.join(os.tmpdir(), "guarda-video", `${new Date().toISOString().slice(0, 10)}_${slug(a.src)}`));
  fs.mkdirSync(dir, { recursive: true });

  let file = null;
  let meta = { link: kind === "file" ? null : a.src };
  if (kind === "instagram") ({ file, meta } = await fromInstagram(a.src, dir));
  else if (kind === "youtube") ({ file, meta } = fromYoutube(a.src, dir));
  else if (kind === "url") { file = path.join(dir, "video.mp4"); await download(a.src, file); }
  else { file = path.resolve(a.src); if (!fs.existsSync(file)) throw new Error(`File non trovato: ${file}`); }

  const result = { cartella: dir, fonte: kind, meta, problemi: [] };
  if (file) {
    const info = probe(file);
    const cuts = sceneCuts(file);
    const times = pickTimes(info.duration, cuts);
    const frames = extractFrames(file, times, dir, info);
    result.video = { durata_s: Math.round(info.duration * 10) / 10, risoluzione: `${info.width}x${info.height}`, audio: info.audio, tagli: cuts.length };
    result.fotogrammi = frames.length;
    result.fogli = contactSheets(frames, dir);
  } else result.problemi.push("YouTube senza yt-dlp: niente fotogrammi, solo la lettura di Gemini dal link.");

  const useGemini = a.gemini ?? (kind !== "file");
  const key = process.env.GEMINI_API_KEY;
  if (useGemini && key) {
    try {
      const g = await askGemini({ key, file, youtube: kind === "youtube" && !file ? a.src : null, domanda: a.domanda });
      fs.writeFileSync(path.join(dir, "gemini.txt"), g.text);
      result.gemini = { modello: g.model, file: path.join(dir, "gemini.txt") };
    } catch (e) {
      result.problemi.push(`Gemini: ${e.message}`);
    }
  } else if (useGemini) result.problemi.push("Manca GEMINI_API_KEY: niente parlato, solo fotogrammi.");
  else result.problemi.push("Gemini non usato (file locale: serve --gemini esplicito). Il parlato non è stato letto.");

  fs.writeFileSync(path.join(dir, "risultato.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`ERRORE: ${e.message}`);
    process.exit(1);
  });
}
