// Radar creator — carica (o aggiorna) i profili trovati da una ricerca nell'archivio KV.
// Uso: node --env-file=.env.local scripts/scouting-import.mjs <profili.json> [--dry]
// Il file è un array di profili { h, fol, medv, vf, sig, hl, hlLinks, nic, fmt, u, nota, ours, ag, g, src, url, bio, hist }.
// Il file NON va nel repo (dati di persone esterne): vive nello scratchpad della sessione che ha fatto la ricerca.
// Regole: un profilo già in archivio tiene storico e numeri del giro settimanale (si aggiornano solo
// giudizi e link della ricerca); gli handle cancellati su richiesta (scouting:forgotten) non rientrano.
import { readFileSync } from "node:fs";
import { getProfiles, saveProfiles, getForgotten } from "../src/lib/scouting-store.js";
import { normHandle } from "../src/lib/scouting-core.js";

const [file, flag] = process.argv.slice(2);
if (!file) { console.error("uso: scripts/scouting-import.mjs <profili.json> [--dry]"); process.exit(1); }
const incoming = JSON.parse(readFileSync(file, "utf8"));
const forgotten = await getForgotten();
const current = await getProfiles();
const by = new Map(current.map((p) => [p.h, p]));
let added = 0, updated = 0, skipped = 0;
for (const raw of incoming) {
  const h = normHandle(raw.h);
  if (!h || forgotten.has(h)) { skipped++; continue; }
  const old = by.get(h);
  if (old) {
    by.set(h, { ...old, ...raw, h, fol: old.fol ?? raw.fol, medv: old.medv ?? raw.medv, vf: old.vf ?? raw.vf, hist: old.hist?.length ? old.hist : raw.hist, firstSeen: old.firstSeen || raw.firstSeen });
    updated++;
  } else {
    by.set(h, { ...raw, h });
    added++;
  }
}
console.log(`nuovi ${added}, aggiornati ${updated}, saltati ${skipped} (cancellati o senza handle), totale ${by.size}`);
if (flag === "--dry") process.exit(0);
console.log(await saveProfiles([...by.values()]));
