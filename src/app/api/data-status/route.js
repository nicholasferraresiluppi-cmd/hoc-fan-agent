/**
 * GET /api/data-status — "quanto sono freschi i dati" per il chip Stato dati
 * dello stile v3 (anteprima, 26/09/2026).
 *
 * Solo utente loggato (nessuna capability): restituisce ESCLUSIVAMENTE orari e
 * stato delle fonti, mai dati (niente importi, nomi, conteggi). Letture KV
 * leggere: meta + heartbeat, mai i payload (es. cp:wages può pesare MB).
 *
 * Stato "ok" se l'ultimo aggiornamento è entro 30h, "fermo" altrimenti,
 * "sconosciuto" se non c'è traccia (o il KV non risponde).
 */
import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

const FRESH_MS = 30 * 3600 * 1000;

const tsOf = (v) => {
  const n = typeof v === "number" ? v : Number(v?.at ?? v?.last_sync_at ?? v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const statusOf = (at, now) => (at == null ? "unknown" : now - at <= FRESH_MS ? "ok" : "stale");
const safe = (p) => p.catch(() => null);

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const [inflMeta, lastImport, cpBeat, cpMeta, payoutBeat] = await Promise.all([
    safe(kv.get("infloww:sync:meta")),
    safe(kv.zrange("ops_kpi:imports", 0, 0, { rev: true, withScores: true })),
    safe(kv.get("cron:heartbeat:cp-wages")),
    safe(kv.get("cp:_meta")),
    safe(kv.get("cron:heartbeat:payout-ledger")),
  ]);

  const now = Date.now();
  // zrange withScores → [member, score]; score = timestamp import (ms)
  const importAt = Array.isArray(lastImport) && lastImport.length >= 2 ? tsOf(lastImport[1]) : null;
  // 27/10/2026: prima era UN solo "Infloww" = il più recente tra sync API e export del robot →
  // segnava ✓ ogni notte grazie alla sync API mentre l'export (che alimenta bravura, Squadra e
  // Fasce) era fermo dal 9/10. Ora sono due fonti, e la sync API dice se ha saltato delle creator.
  const inflAt = tsOf(inflMeta?.last_sync_at);
  const failedN = Array.isArray(inflMeta?.failed_creators) ? inflMeta.failed_creators.length : 0;
  const okN = Number(inflMeta?.ok_creators);
  // CreatorsPro: conta il dato (fine sync paghe), il battito del cron solo se manca il dato
  const cpDataAt = tsOf(cpMeta?.last_sync_at);
  const cpAt = cpDataAt ?? tsOf(cpBeat);
  const payoutAt = tsOf(payoutBeat);

  const sources = [
    { id: "infloww", label: "Infloww", feeds: "Transazioni dall'API ufficiale: incassi Infloww, albero payout", at: inflAt, status: statusOf(inflAt, now),
      note: failedN ? `Ultimo giro parziale: ${failedN} creator non lette${Number.isFinite(okN) ? ` (${okN} lette)` : ""}` : null },
    { id: "infloww-export", label: "Export Infloww", feeds: "Vendite e KPI per operatore (robot del mattino): bravura, Squadra, Fasce, classifica operativa", at: importAt, status: statusOf(importAt, now) },
    { id: "creatorspro", label: "CreatorsPro", feeds: "Paghe e scaglioni: classifica vendite, compensi", at: cpAt, checked_at: tsOf(cpBeat), status: statusOf(cpAt, now) },
    { id: "payout", label: "Albero payout", feeds: "Transazioni e rimborsi per l'albero payout", at: payoutAt, status: statusOf(payoutAt, now) },
  ];

  return Response.json(
    { now, fresh_hours: 30, sources },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
