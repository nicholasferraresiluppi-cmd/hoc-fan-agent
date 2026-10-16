// Radar creator — apertura dei link che da soli non dicono niente (17/10/2026).
//
// Perché: Elisa Esposito (nostra) e Elena Maraga risultavano "nessun segnale" o "da guardare"
// perché il loro link porta a una pagina che il radar non conosceva (cliickto.me, iambabye.com).
// Aperte, contengono OnlyFans e Telegram. Qui si aprono quelle pagine dal server e si legge il
// codice (logica pura in scouting-core: probeVerdict / applyProbes). Nessun costo Apify.
//
// Sicurezza: solo http(s), niente indirizzi IP, localhost o nomi di rete interna (gli URL
// arrivano da bio di Instagram, cioè da sconosciuti); al massimo 3 rimandi, ognuno ricontrollato;
// 8 secondi e 600 KB per pagina. Si legge e basta: niente cookie, niente moduli, niente clic.
import { lookup } from "node:dns/promises";
import { getProfiles, commitProfiles } from "@/lib/scouting-store";
import { probeCandidates, probeVerdict, probeKind, applyProbes } from "@/lib/scouting-core";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const TIMEOUT_MS = 8000;
const MAX_BYTES = 600_000;

/** URL che si può aprire dal server senza rischi: http(s), nome di dominio pubblico. */
export function safeProbeUrl(raw) {
  let u;
  try { u = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|vercel\.internal)$/.test(host)) return null;
  if (u.port && !["80", "443"].includes(u.port)) return null;
  return u;
}

// un nome pubblico può comunque puntare a un indirizzo interno: si controlla dove risolve
const PRIVATE_IP = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd]|fe80)/i;
async function resolvesPublic(host) {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !PRIVATE_IP.test(a.address));
  } catch {
    return false;
  }
}

async function readCapped(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const dec = new TextDecoder();
  let out = "";
  while (out.length < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return out;
}

/** Apre una pagina: verdetto, null (aperta, niente di parlante) o { err: true } (non aperta). */
export async function probeUrl(raw) {
  const kind = probeKind(raw);
  if (!kind) return null;
  let u = safeProbeUrl(raw);
  if (!u) return null;
  for (let hop = 0; u && hop < 4; hop++) {
    if (!(await resolvesPublic(u.hostname))) return { err: true };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(u, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": UA, accept: "text/html,*/*" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        // il rimando stesso può essere il segnale (es. redirect diretto a onlyfans.com)
        const loc = new URL(res.headers.get("location"), u).toString();
        const v = probeVerdict(loc);
        if (v && v.strength >= 3) return v;
        if (!probeKind(loc)) return null; // rimanda a un social o a un sito generico
        u = safeProbeUrl(loc);
        continue;
      }
      if (!res.ok) return res.status === 404 || res.status === 410 ? null : { err: true };
      if (!/html|text|json/i.test(res.headers.get("content-type") || "text/html")) return null;
      return probeVerdict(await readCapped(res), kind);
    } catch {
      return { err: true };
    } finally {
      clearTimeout(t);
    }
  }
  return { err: true }; // troppi rimandi
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/**
 * Un passo: apre i link di fino a `max` profili e salva. Ritorna { done, probed, upgraded }.
 * I profili si rileggono subito prima di scrivere (il giro settimanale potrebbe averli toccati).
 */
export async function probeStep({ max = 40, concurrency = 6, now = Date.now() } = {}) {
  const cands = probeCandidates(await getProfiles(), { now, max });
  if (!cands.length) return { done: true, probed: 0, upgraded: 0 };
  const results = {};
  await pool(cands, concurrency, async (c) => {
    results[c.h] = {};
    for (const url of c.urls.slice(0, 4)) results[c.h][url] = await probeUrl(url);
  });
  const profiles = await getProfiles();
  let upgraded = 0;
  const next = profiles.map((p) => {
    if (!results[p.h]) return p;
    const q = applyProbes(p, results[p.h], now);
    if (q.sig !== p.sig) upgraded++;
    return q;
  });
  await commitProfiles(profiles, next);
  return { done: cands.length < max, probed: cands.length, upgraded };
}
