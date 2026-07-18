/**
 * POST /api/admin/score-config-drafts/publish
 *
 * La bozza diventa la formula score ATTIVA. Azione deliberatamente frizionata
 * (pattern Ambition "I UNDERSTAND", cfr docs/BENCHMARK_DEEP_STUDY.md):
 *   - richiede confirm: "PUBBLICA" esatto nel body;
 *   - archivia automaticamente la formula attiva precedente nel registro (audit);
 *   - forward-only: i periodi già importati restano scorati con la formula del
 *     loro snapshot (ops_kpi:score_snapshot:*); il prossimo import congela la nuova.
 *
 * Body: { id, confirm: "PUBBLICA" }
 * Capability: SEED (admin only).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { publishDraft } from "@/lib/score-config-drafts";

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { id, confirm } = body || {};
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });
  if (confirm !== "PUBBLICA") {
    return Response.json(
      { error: 'Conferma mancante: scrivi "PUBBLICA" per rendere attiva questa formula. Da quel momento score, tier e classifiche dei NUOVI calcoli useranno la bozza.' },
      { status: 400 }
    );
  }

  try {
    const result = await publishDraft(id, { publishedBy: az.userId || "" });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
