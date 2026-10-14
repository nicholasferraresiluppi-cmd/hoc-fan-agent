// Coaching vendite → scheda Squadra (14/10/2026).
// GATE: authorizeAllCreators(SCORES_VIEW), come il resto di Coaching vendite:
// nomi operatori + venduto + buste = dati denaro di tutte le creator.
//
// GET ?split=<id> → classifica della squadra dello split (chi fa almeno metà delle
//   ore sulle sue modelle) con presenza e partita IVA dal CRM persone e il contatto
//   per la partita IVA. Legge SOLO la cache notturna `squadra:data:*`; se manca,
//   calcola una volta (lock) — mai le wage CP a ogni apertura (incidente banda 4/10).
// POST { action: "contact", name, stato?, nota? } → salva il contatto P. IVA.
// POST { action: "recompute" } → ricalcola ora.

export const runtime = "nodejs";
export const maxDuration = 120;

import { authorizeAllCreators } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { listSplits } from "@/lib/sales-coaching";
import { listPeople } from "@/lib/hr-people";
import {
  getSquadraData, computeSquadraOnce, isSquadraComputing, isSquadraStale, listContacts, saveContact,
} from "@/lib/squadra";
import { matchName, nameKey, splitShare, rowFlags, SPLIT_SHARE } from "@/lib/squadra-core";

const STOP_DAYS = 21; // nessun turno da 3 settimane = probabilmente non lavora più

function presence(row, person, now) {
  if (person?.fase === "Uscita") return { key: "uscita", label: "Uscita" };
  const last = row.last_shift ? Date.parse(row.last_shift) : null;
  if (!last || now - last > STOP_DAYS * 86400000) return { key: "fermo", label: "Nessun turno da 3 settimane" };
  if (!person) return { key: "no_crm", label: "Non nel CRM" };
  return { key: person.fase === "Attiva" ? "attiva" : "altra", label: person.fase || "Senza fase" };
}

export async function GET(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const splitId = new URL(request.url).searchParams.get("split");
  try {
    let data = await getSquadraData();
    if (!data) {
      const done = await computeSquadraOnce();
      if (!done) return Response.json({ computing: true });
      data = done;
    }
    const [splits, people, contacts, computing] = await Promise.all([listSplits(), listPeople(), listContacts(), isSquadraComputing()]);
    const split = splitId ? splits.find((s) => s.id === splitId) || null : null;

    const persons = people.map((p) => ({
      id: p.id,
      name: `${p.fields?.firstName || ""} ${p.fields?.surname || ""}`.trim(),
      fase: p.fields?.collaborationStatus || null,
      piva: p.fields?.partitaIva === true ? "Sì" : p.fields?.partitaIva === false ? "No" : null,
    })).filter((p) => p.name);
    const personNames = persons.map((p) => p.name);
    const now = Date.now();

    const rows = [];
    for (const r of data.rows) {
      const share = split ? splitShare(r.crs, split.creator_ids) : 1;
      if (split && share < SPLIT_SHARE) continue;
      const pn = matchName(r.name, personNames);
      const person = pn ? persons.find((p) => p.name === pn) : null;
      const top = Object.entries(r.crs || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      rows.push({
        ...r,
        share,
        top,
        person: person ? { id: person.id, name: person.name, fase: person.fase, piva: person.piva } : null,
        presence: presence(r, person, now),
        contact: contacts[nameKey(r.name)] || null,
        flags: rowFlags(r),
      });
    }
    return Response.json({
      computing,
      stale: isSquadraStale(data, now),
      generated_at: data.generated_at,
      months: data.months,
      tenure_from: data.tenure_from,
      split: split ? { id: split.id, name: split.name, creator_ids: split.creator_ids } : null,
      rows,
    });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura fallita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  if (body?.action === "contact") {
    const res = await saveContact(String(body.name || ""), { stato: body.stato ?? null, nota: body.nota ?? null }, az.userId);
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }
  if (body?.action === "recompute") {
    const doc = await computeSquadraOnce();
    return Response.json(doc ? { ok: true, generated_at: doc.generated_at } : { computing: true });
  }
  return Response.json({ error: "Azione non prevista." }, { status: 400 });
}
