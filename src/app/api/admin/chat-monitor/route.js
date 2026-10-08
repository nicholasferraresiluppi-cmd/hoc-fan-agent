// Laura Chat Monitor — API. GET ?tab=live|daily|trend (cache: live 15 min,
// daily/trend 6 ore), &refresh=1 ricalcola. Contiene nomi utente e anteprime dei
// messaggi dei fan → stesso gate di Revenue Laura (Laura tra le creator assegnate).

export const runtime = "nodejs"; // bigquery-api usa crypto nativo
export const maxDuration = 120;

import { authorizeLaura } from "@/lib/laura-access";
import { getChatMonitor, bigQueryConfigured } from "@/lib/chat-monitor";

export async function GET(request) {
  const az = await authorizeLaura();
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "live";
  if (!["live", "daily", "trend"].includes(tab)) return Response.json({ error: "Scheda non valida" }, { status: 400 });
  try {
    return Response.json(await getChatMonitor(tab, { force: url.searchParams.get("refresh") === "1" }));
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}
