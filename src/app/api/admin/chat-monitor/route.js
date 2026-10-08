// Chat Monitor per creator — API. GET ?creator=slug&tab=live|daily|trend (cache: live 15 min,
// daily/trend 6 ore), &refresh=1 ricalcola. Contiene nomi utente e anteprime dei messaggi dei
// fan → stesso gate della Revenue (creator tra le assegnate; admin: tutte).

export const runtime = "nodejs"; // bigquery-api usa crypto nativo
export const maxDuration = 120;

import { authorizeLiveCreator } from "@/lib/laura-access";
import { getChatMonitor, bigQueryConfigured } from "@/lib/chat-monitor";

export async function GET(request) {
  const url = new URL(request.url);
  const az = await authorizeLiveCreator(url.searchParams.get("creator"));
  if (!az.ok) return Response.json({ error: az.message, creators: az.visible || [] }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const tab = url.searchParams.get("tab") || "live";
  if (!["live", "daily", "trend"].includes(tab)) return Response.json({ error: "Scheda non valida" }, { status: 400 });
  try {
    const out = await getChatMonitor(az.creator, tab, { force: url.searchParams.get("refresh") === "1" });
    return Response.json({ ...out, creator: az.creator.slug, creators: az.visible, countries: az.creator.accounts.map((a) => a.country) });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}
