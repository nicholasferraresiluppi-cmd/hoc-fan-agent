/**
 * /api/contabilita/crm — le persone del CRM (Centro HR) per l'incrocio coi
 * compensi: chi lavora su chi (Progetto), con che mansione, in che fase.
 * Esclusi gli operatori (mansione Chatter) e le persone uscite: in contabilità
 * vanno tutti TRANNE gli operatori. Solo nome/mansione/progetto/fase: nessun dato
 * anagrafico o fiscale esce da qui.
 */
import { requireAccounting } from "@/lib/compensi-access";
import { listPeople } from "@/lib/hr-people";
import { fullName } from "@/lib/hr-people-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String);

export async function GET() {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const people = await listPeople();
  const out = [];
  for (const p of people) {
    const f = p.fields || {};
    const mansioni = arr(f.mansioni);
    const fase = f.collaborationStatus || null;
    if (fase === "Uscita") continue;
    if (mansioni.length && mansioni.every((m) => m === "Chatter")) continue;
    out.push({ id: p.id, name: fullName(f) || "Senza nome", mansioni, progetto: arr(f.progetto), fase, noMansione: mansioni.length === 0 });
  }
  return Response.json({ people: out }, { headers: { "Cache-Control": "no-store" } });
}
