/**
 * GET /api/admin/infloww-probe
 *
 * Verifica end-to-end della connessione Infloww API (beta) con i path e i
 * parametri CORRETTI (mappati dalla doc Stoplight). Catena self-contained:
 *   1. /v1/creators  → prende i creator reali, sceglie il primo (creatorId)
 *   2. /v1/employees → prende il primo employeeId
 *   3. con quel creatorId interroga transactions/refunds/messaggi/links
 *   4. con quell'employeeId interroga assigned-creators
 *
 * Report per endpoint: status, ok, count, campi (item_keys). Per transactions
 * aggrega anche il NET reale (prova che la revenue live arriva). Nessun dato
 * personale dei fan viene restituito: solo nomi-campo e numeri aggregati.
 * Read-only, finestra 30 giorni, limit basso.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { inflowwGet, centsToUsd } from "@/lib/infloww-api";

export const maxDuration = 60;

// Riassume la shape senza dumpare valori (no PII fan).
function shapeOf(json) {
  const d = json?.data ?? {};
  const list = Array.isArray(d.list) ? d.list : (Array.isArray(d) ? d : null);
  if (list) return { count: list.length, has_more: json?.hasMore ?? d?.hasMore ?? null, item_keys: list[0] ? Object.keys(list[0]) : [] };
  return { keys: d && typeof d === "object" ? Object.keys(d).slice(0, 20) : [] };
}

async function tryGet(label, path, query) {
  try {
    const json = await inflowwGet(path, { query, timeoutMs: 18000 });
    return { label, path, ok: true, status: 200, ...shapeOf(json), _json: json };
  } catch (e) {
    const m = String(e?.message || e);
    const status = Number((m.match(/\((\d{3})\)/) || [])[1]) || 0;
    return { label, path, ok: false, status, error: m };
  }
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const missing = [];
  if (!process.env.INFLOWW_API_KEY) missing.push("INFLOWW_API_KEY");
  if (!process.env.INFLOWW_OID) missing.push("INFLOWW_OID");
  if (missing.length) {
    return Response.json({
      error: `Env mancanti: ${missing.join(", ")}. Aggiungili in Vercel e ri-deploya.`,
      base_url: "https://openapi.infloww.com",
    }, { status: 428 });
  }

  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const results = [];

  // 1. Creator connessi → creatorId di riferimento
  const creators = await tryGet("Connected creators", "/v1/creators", { limit: 5, platformCode: "OnlyFans" });
  results.push(pub(creators));
  const firstCreator = creators._json?.data?.list?.[0];
  const creatorId = firstCreator?.id;

  // 2. Employees → employeeId di riferimento
  const employees = await tryGet("Employees", "/v1/employees", { limit: 5 });
  results.push(pub(employees));
  const employeeId = employees._json?.data?.list?.[0]?.employeeId;

  // 3. Endpoint per-creator (serve creatorId)
  if (creatorId != null) {
    const tx = await tryGet("Transactions (revenue live)", "/v1/transactions", { creatorId, startTime, endTime, limit: 100, platformCode: "OnlyFans" });
    // aggrega revenue reale (net, centesimi → $) come prova
    const txList = tx._json?.data?.list || [];
    tx.revenue_sample = {
      transactions: txList.length,
      net_usd: Math.round(txList.reduce((s, t) => s + centsToUsd(t.net), 0) * 100) / 100,
      gross_usd: Math.round(txList.reduce((s, t) => s + centsToUsd(t.amount), 0) * 100) / 100,
      types: [...new Set(txList.map((t) => t.type))],
      window: "ultimi 30 giorni",
    };
    results.push(pub(tx));

    results.push(pub(await tryGet("Refunds", "/v1/refunds", { creatorId, startTime, endTime, limit: 50 })));
    results.push(pub(await tryGet("Automated messages", "/v1/automated-messages", { creatorId, startTime, endTime, limit: 20 })));
    results.push(pub(await tryGet("Priority mass messages", "/v1/priority-mass-messages", { creatorId, startTime, endTime, limit: 20 })));
    results.push(pub(await tryGet("Links (CAMPAIGN)", "/v1/links", { creatorId, linkType: "CAMPAIGN", startTime, endTime, limit: 20 })));
  } else {
    results.push({ label: "Endpoint per-creator", ok: false, note: "Nessun creator connesso restituito: impossibile testare transactions/refunds/messaggi/links." });
  }

  // 4. Assigned creators (serve employeeId)
  if (employeeId != null) {
    results.push(pub(await tryGet("Employee's assigned creators", "/v1/employees/assigned-creators", { employeeId, limit: 50 })));
  } else {
    results.push({ label: "Assigned creators", ok: false, note: "Nessun employee restituito: impossibile testare assigned-creators." });
  }

  const hits = results.filter((r) => r.ok).length;
  return Response.json({
    base_url: "https://openapi.infloww.com",
    ref: { creatorId: creatorId ?? null, creatorName: firstCreator?.name ?? firstCreator?.userName ?? null, employeeId: employeeId ?? null },
    summary: `${hits}/${results.length} endpoint OK (path + parametri corretti).`,
    results,
  });
}

// Rimuove _json (contiene dati grezzi/PII) prima di serializzare la risposta.
function pub(r) { const { _json, ...rest } = r; return rest; }
