/**
 * /api/admin/sede — la Sede: gli uffici di HOC (persone, codice, AI), se hanno
 * lavorato davvero e dove mancano le quattro regole (compito, risultato,
 * controllore, responsabile). Vedi src/lib/sede.js.
 *
 * GET  → piani, uffici con stato/ultimo lavoro/buchi, flussi, code della direzione
 * POST {action:"owner", id, owner} → assegna il responsabile di un ufficio (solo admin)
 *
 * Gate: admin (SEED). Letture KV leggere: solo battiti e meta, mai i payload grandi.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { OFFICES, FLOORS, CADENCE, statusOf, gapsOf, lastWork, edges, officeById } from "@/lib/sede";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safe = (p) => p.catch(() => null);
const parse = (v) => { if (v == null) return null; if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v; };

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const now = Date.now();
  const keys = OFFICES.filter((o) => o.beat && !o.beat.startsWith("sede:proof:")).map((o) => o.beat);
  const [vals, imports, owners, roadmap, smaiDays] = await Promise.all([
    safe(kv.mget(...keys)),
    safe(kv.zrange("ops_kpi:imports", 0, 0, { rev: true, withScores: true })),
    safe(kv.get("sede:owners")),
    safe(kv.get("roadmap:items")),
    safe(kv.zrange("smai:fb:index", 0, 0, { rev: true })),
  ]);
  const beats = Object.fromEntries(keys.map((k, i) => [k, parse(vals?.[i])]));
  // prova derivata: il robot Infloww lascia traccia solo come import nel registro
  if (Array.isArray(imports) && imports.length >= 2) beats["sede:proof:infloww-import"] = { at: Number(imports[1]), last: imports[0] };

  // code della direzione
  const items = roadmap ? Object.values(roadmap) : [];
  const decisioni = items.filter((x) => /decidere/i.test(x.area || "") && !["done", "fatto"].includes(x.status)).length;
  let feedback = null;
  const day = smaiDays?.[0];
  if (day) {
    const job = await safe(kv.get(`smai:job:${day}`));
    const fbs = await Promise.all((job?.operators || []).map((o) => safe(kv.get(`smai:fb:${day}:${o.key}`))));
    feedback = { day, da_rivedere: fbs.filter((f) => f && ["in_revisione", "bloccato"].includes(f.status)).length };
  }

  const ctrlIds = OFFICES.filter((o) => o.ctrl).map((o) => o.id);
  const ctrlVals = ctrlIds.length ? await safe(kv.mget(...ctrlIds.map((id) => `sede:ctrl:${id}`))) : [];
  const ctrl = Object.fromEntries(ctrlIds.map((id, i) => [id, parse(ctrlVals?.[i])]));
  const own = owners || {};
  const offices = OFFICES.map((o) => {
    const beat = o.beat ? beats[o.beat] : null;
    const status = statusOf(o, beat, now);
    const owner = own[o.id] || o.responsabile_default || null;
    const controllo = ctrl[o.id] ? { at: ctrl[o.id].at, ok: ctrl[o.id].ok, problemi: ctrl[o.id].problemi || [] } : null;
    const coda = o.coda === "decisioni" ? { n: decisioni, label: "decisioni in attesa" } : o.coda === "feedback" && feedback ? { n: feedback.da_rivedere, label: `feedback da rivedere (${feedback.day})` } : null;
    return {
      id: o.id, piano: o.piano, nome: o.nome, tipo: o.tipo, compito: o.compito, risultato: o.risultato,
      controllore: o.controllore, cadenza: CADENCE[o.cadenza]?.label, link: o.link, esterno: o.esterno || null,
      owner, owner_confermato: !!own[o.id], passa_a: o.passa_a,
      stato: status.stato, at: status.at || null, ultimo: lastWork(o, beat),
      buchi: gapsOf(o, { owner, status, controllo }), coda, controllo,
    };
  });
  const totali = {
    uffici: offices.filter((o) => o.tipo !== "persona").length,
    lavorano: offices.filter((o) => o.stato === "lavora").length,
    buchi: offices.reduce((s, o) => s + o.buchi.length, 0),
    senza_controllore: offices.filter((o) => o.buchi.some((b) => b.tipo === "controllore")).length,
    senza_responsabile: offices.filter((o) => o.buchi.some((b) => b.tipo === "responsabile")).length,
    fermi: offices.filter((o) => ["in_ritardo", "mai", "errore"].includes(o.stato)).length,
    sospetti: offices.filter((o) => o.controllo && !o.controllo.ok).length,
  };
  return Response.json({ floors: FLOORS, offices, edges: edges(), totali, now });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  if (body.action !== "owner" || !officeById(body.id)) return Response.json({ error: "Richiesta non valida" }, { status: 400 });
  const owners = (await kv.get("sede:owners")) || {};
  const name = String(body.owner || "").trim().slice(0, 60);
  if (name) owners[body.id] = name; else delete owners[body.id];
  await kv.set("sede:owners", owners);
  return Response.json({ ok: true, owners });
}
