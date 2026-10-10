/**
 * /api/admin/hr/people/[id]/contract/pdf — anteprima del contratto (SEED, 10/10/2026).
 * È lo stesso PDF che parte all'invio; i dati mancanti compaiono come [segnaposto].
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { buildContractPdf } from "@/lib/hr-contract-drafts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const built = await buildContractPdf(id);
  if (!built) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  const name = built.title.replace(/[^A-Za-z0-9 ._-]+/g, "").trim().slice(0, 90) || "contratto";
  return new Response(built.pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name} (anteprima).pdf"`, "Cache-Control": "private, no-store" } });
}
