// Manuale vendite — documenti e prove in KV.
// I documenti contengono estratti di chat reali (nomi oscurati): stanno SOLO nel
// KV, mai nel repo, e si leggono solo da /api/admin/manuale (direzione vendite).
import { kv } from "@vercel/kv";
import { bqQuery } from "@/lib/bigquery-api";
import { provaMetricsSQL, shapeMetrics, weekWindows } from "@/lib/manuale/prova-sql";

const DOCS = "manuale:docs";            // [{slug,title,kind,order,updated_at}]
const DOC = (s) => `manuale:doc:${s}`;  // html
const PROVE = "manuale:prove";          // [id]
const PROVA = (id) => `manuale:prova:${id}`;

export async function listDocs() { return ((await kv.get(DOCS)) || []).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); }
export async function getDocHtml(slug) { return kv.get(DOC(slug)); }
export async function putDoc({ slug, title, kind, order, html }) {
  if (!/^[a-z0-9-]{3,60}$/.test(slug || "")) throw new Error("slug non valido");
  await kv.set(DOC(slug), html);
  const docs = (await kv.get(DOCS)) || [];
  const rest = docs.filter((d) => d.slug !== slug);
  rest.push({ slug, title, kind, order, updated_at: Date.now(), bytes: html.length });
  await kv.set(DOCS, rest);
}

export async function listProve() {
  const ids = (await kv.get(PROVE)) || [];
  const all = await Promise.all(ids.map((id) => kv.get(PROVA(id))));
  return all.filter(Boolean);
}
export async function getProva(id) { return kv.get(PROVA(id)); }

export async function createProva({ creatorId, nome, startMs, by }) {
  const id = `${creatorId}-${new Date(startMs).toISOString().slice(0, 10)}`;
  const prova = { id, creatorId: String(creatorId), nome, start: startMs, created_at: Date.now(), created_by: by || null, baseline: null, settimane: [], ultima_misura: null, errore: null };
  await kv.set(PROVA(id), prova);
  const ids = (await kv.get(PROVE)) || [];
  if (!ids.includes(id)) await kv.set(PROVE, [...ids, id]);
  return prova;
}

async function measure(creatorId, from, to) {
  const dataProject = process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
  const { rows, totalBytesProcessed } = await bqQuery(provaMetricsSQL({ dataProject, creatorId, from, to }), { maxBytesBilled: 20 * 1e9, timeoutMs: 50_000 });
  return { from, to, metriche: shapeMetrics(rows[0]), bytes: totalBytesProcessed };
}

/** Misura la base (4 settimane prima dell'avvio) se manca, e le settimane complete non ancora misurate. */
export async function measureProva(id, now = Date.now()) {
  const p = await getProva(id);
  if (!p) throw new Error("prova non trovata");
  try {
    if (!p.baseline) p.baseline = await measure(p.creatorId, p.start - 28 * 86400e3, p.start);
    const done = new Set((p.settimane || []).map((w) => w.i));
    for (const w of weekWindows(p.start, now)) {
      if (done.has(w.i)) continue;
      const r = await measure(p.creatorId, w.from, w.to);
      p.settimane = [...(p.settimane || []), { i: w.i, ...r }];
    }
    p.errore = null;
  } catch (e) {
    p.errore = String(e?.message || e).slice(0, 300);
  }
  p.ultima_misura = Date.now();
  await kv.set(PROVA(id), p);
  return p;
}
