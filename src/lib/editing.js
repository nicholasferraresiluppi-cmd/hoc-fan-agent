// Editing — dati delle scrivanie (6/11/2026). Logica in editing-core.js.
//
// Una scrivania unisce i profili di Regia social della stessa creator: Banco montaggi, giri della
// redazione e misure di «Cosa ha funzionato». Nessuna chiave nuova: legge quelle delle tre sezioni.
//   live: false  (la sala) solo ciò che è già in KV: niente Drive, niente magazzino dati
//   live: true   (la scrivania) il Banco si rilegge se vecchio, le misure si calcolano se mancano
import { listProfiles } from "@/lib/studio-social";
import { getBanco, getBancoCached } from "@/lib/studio-banco";
import { getEsitiData, getLinks } from "@/lib/studio-esiti";
import { buildOutcomes, byFormat, toLink } from "@/lib/studio-esiti-core";
import { getGiri } from "@/lib/studio-giri";
import { groupDesks, stages, adesso, tempi, rifare, lastGiro } from "@/lib/editing-core";

export async function listDesks() {
  return groupDesks(await listProfiles());
}

async function loadProfile(p, live) {
  const [banco, giri] = await Promise.all([
    (live ? getBanco(p.id) : getBancoCached(p.id)).catch(() => ({ folder: null, rows: [] })),
    getGiri(p.id),
  ]);
  let esiti = [];
  let pending = 0;
  if (p.platform === "instagram") {
    const [data, links] = await Promise.all([getEsitiData(p.id, p.handle, { cacheOnly: !live }).catch(() => ({ reels: [] })), getLinks(p.id)]);
    const bancoById = Object.fromEntries(banco.rows.map((r) => [r.id, { title: r.title, path: r.path }]));
    esiti = buildOutcomes({ reels: data.reels || [], accountDays: data.accountDays || {}, links, banco: bancoById, lastDay: data.lastDay });
    pending = banco.folder ? toLink(esiti, banco.folder.at) : 0;
  }
  return { ...p, folder: banco.folder ? { name: banco.folder.name, url: banco.folder.url } : null, banco: banco.rows, giri, esiti, toLink: pending };
}

/** Una scrivania con le sette tappe, la riga «Adesso», cosa rifare e i tempi. */
export async function loadDesk(desk, { live = false, now = Date.now() } = {}) {
  const profiles = await Promise.all(desk.profiles.map((p) => loadProfile(p, live)));
  const giri = profiles.flatMap((p) => p.giri);
  const banco = profiles.flatMap((p) => p.banco);
  const esiti = profiles.flatMap((p) => p.esiti);
  const st = stages({ giri, banco, esiti, now });
  const g = lastGiro(giri);
  return {
    slug: desk.slug, creator: desk.creator,
    profiles: profiles.map((p) => ({ id: p.id, handle: p.handle, platform: p.platform, folder: p.folder, banco: p.banco.length, giri: p.giri.length })),
    stages: st,
    adesso: adesso(st, { toLink: profiles.reduce((s, p) => s + p.toLink, 0), girato: g?.girato }),
    rifare: rifare(byFormat(esiti)),
    tempi: tempi({ banco, esiti }),
    lastGiro: g ? { n: g.n, titolo: g.titolo, day: g.day } : null,
  };
}
