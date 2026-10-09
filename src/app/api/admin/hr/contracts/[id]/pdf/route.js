/**
 * /api/admin/hr/contracts/[id]/pdf — apre il PDF del contratto (SEED, 09/10/2026).
 * Passa da Dropbox Sign al volo: in HOC Pro non resta nessuna copia del file.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { downloadContractPdf } from "@/lib/dropbox-sign";
import { getStore } from "@/lib/hr-contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  // solo contratti che conosciamo (niente proxy aperto verso qualunque id)
  const store = await getStore();
  const c = (store.contracts || []).find((x) => x.id === id);
  if (!c) return Response.json({ error: "Contratto non trovato." }, { status: 404 });
  try {
    const bytes = await downloadContractPdf(id);
    if (!bytes) return Response.json({ error: "Il PDF non è disponibile su Dropbox Sign (contratto non ancora firmato?)." }, { status: 404 });
    const name = (c.title || "contratto").replace(/[^A-Za-z0-9 ._-]+/g, "").trim().slice(0, 80) || "contratto";
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e?.status === 429 ? 429 : 502 });
  }
}
