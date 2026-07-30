// Transfer measurement (Kirkpatrick 3-4) — API (SEED). GET = cache, POST = ricalcolo.
// Traiettoria comportamentale per operatore dai turni singoli reali, mese per mese,
// con gli eventi di coaching sovrapposti. Osservazionale, non causale. Coaching,
// fuori da score/comp.
//
// GATE: SEED = admin-only. Espone PII di performance del dipendente (nome operatore
// reale + segnali comportamentali nel tempo). Stessa classe di operator-signals.

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getTransferTrajectories } from "@/lib/transfer-measurement";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const data = await getTransferTrajectories();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e?.message || "Errore nel calcolo del transfer." }, { status: 500 });
  }
}

export async function POST() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const data = await getTransferTrajectories({ force: true });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e?.message || "Errore nel ricalcolo del transfer." }, { status: 500 });
  }
}
