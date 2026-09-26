/**
 * GET /api/me/score?period_id=YYYY-MM
 *
 * "Il mio score, spiegato" — scope own (docs/VISIBILITY_POLICY.md).
 * L'identità è risolta SERVER-SIDE dall'utente Clerk (mai ?employee= dal client).
 * Ritorna SOLO i dati dell'operatore dell'utente + aggregati non nominativi
 * (percentile, conteggi): mai score altrui.
 *
 * Auth: utente loggato. Nessuna capability richiesta: per costruzione la route
 * non può esporre dati di altri (cfr policy, corollario b).
 */
import { kv } from "@vercel/kv";
import { resolveEmployeeForUser, normalizeName } from "@/lib/me";
import { buildLeaderboard } from "@/lib/leaderboard-calc";
import { listAvailablePeriods, loadHistoryForEmployee } from "@/lib/leaderboard-history";
import { loadSettings } from "@/app/api/admin/leaderboard-settings/route";

export async function GET(request) {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (!who.employee) {
    return Response.json({ linked: false, reason: who.reason || "no_match" });
  }
  const employee = who.employee;

  const { searchParams } = new URL(request.url);
  let periodId = searchParams.get("period_id");

  // listAvailablePeriods ordina per timestamp di IMPORT: qui serve l'ordine
  // di calendario (le etichette YYYY-MM sono confrontabili come stringhe).
  const periods = ((await listAvailablePeriods("monthly")) || [])
    .slice()
    .sort((a, b) => String(b).localeCompare(String(a)));
  if (!periodId) periodId = periods[0] || null;
  if (!periodId) {
    return Response.json({ linked: true, employee, period_id: null, reason: "no_periods" });
  }

  let records = [];
  try {
    records = (await kv.get(`ops_kpi:monthly:${periodId}`)) || [];
  } catch {}
  if (!records.length) {
    return Response.json({ linked: true, employee, period_id: periodId, reason: "no_data_for_period", available_periods: periods.slice(0, 12) });
  }

  const [settings, exclusions, snapshot, groupLanguages] = await Promise.all([
    loadSettings(),
    kv.get("leaderboard:exclusions").catch(() => ({})),
    kv.get(`ops_kpi:score_snapshot:monthly:${periodId}`).catch(() => null),
    kv.get("group_languages").catch(() => ({})),
  ]);

  // Stesso default della vista operational (?clock_in default "no"): la modalità
  // senza clock-in è quella pubblicata; teniamo la stessa per coerenza di numeri.
  const mode = "withoutClockIn";

  const { ranking } = buildLeaderboard(records, mode, { ...settings, group_languages: groupLanguages || {} }, exclusions || {});
  const scored = ranking.filter((r) => r.score !== null);

  const target = normalizeName(employee);
  const mineMatches = scored.filter((r) => normalizeName(r.employee) === target);
  if (mineMatches.length !== 1) {
    // Nessun match univoco nei dati Infloww del periodo: stato onesto, mai dati altrui.
    return Response.json({
      linked: true,
      employee,
      period_id: periodId,
      reason: mineMatches.length === 0 ? "not_in_period" : "ambiguous_in_period",
      available_periods: periods.slice(0, 12),
    });
  }
  const mine = mineMatches[0];

  // Posizione tra i COLLEGHI (decisione Nicholas 26/09): niente percentile su
  // tutta l'agenzia ("meglio del 12% di 326" dice ogni mese a metà persone che
  // sono in fondo). Si confronta col gruppo che l'operatore conosce — chi lavora
  // sulla stessa creator (~20); gruppi sotto 5 → stessa lingua, come lo score.
  // Metà alta: posizione ("4° su 21"). Metà bassa: il gradino successivo (punti
  // che mancano per entrare nella metà alta), mai la posizione in fondo.
  // Solo aggregati: nessun nome o score altrui esce da qui.
  const langOfGroup = (g) => (groupLanguages || {})[g] || null;
  let peers = scored.filter((r) => r.group && r.group === mine.group);
  let peerLabel = mine.group || null;
  if (peers.length < 5) {
    const lang = langOfGroup(mine.group);
    const byLang = lang ? scored.filter((r) => langOfGroup(r.group) === lang) : [];
    if (byLang.length >= 5) { peers = byLang; peerLabel = `operatori in ${lang.toUpperCase()}`; }
  }
  let peer_rank = null;
  if (peers.length >= 5) {
    const sortedPeers = [...peers].sort((a, b) => b.score - a.score);
    const position = sortedPeers.filter((r) => r.score > mine.score).length + 1;
    const half = Math.ceil(sortedPeers.length / 2);
    const top_half = position <= half;
    const halfScore = sortedPeers[half - 1]?.score;
    peer_rank = {
      size: sortedPeers.length,
      label: peerLabel,
      top_half,
      position: top_half ? position : null,
      gap_to_top_half: top_half || halfScore == null ? null : Number(Math.max(0.1, halfScore - mine.score + 0.1).toFixed(1)),
    };
  }

  // Storico own (via lib, non via route gated). La lib ritorna oldest-first:
  // qui lo teniamo così com'è (serve al grafico timeline sinistra→destra).
  let history = [];
  try {
    const h = await loadHistoryForEmployee({ employee: mine.employee, periodType: "monthly", limit: 12 });
    history = (h || [])
      // mese non lavorato (inattivo/escluso) = dato mancante, non uno 0 nel grafico (come /api/me/ladder)
      .map((x) => (x.inactive || x.excluded_reason
        ? { period_id: x.period_id, score: null, tier: null, no_data: true }
        : { period_id: x.period_id, score: x.score, tier: x.tier }))
      .sort((a, b) => String(a.period_id).localeCompare(String(b.period_id))); // cronologico per il grafico
  } catch {}

  const weights = settings.weights?.[mode] || {};
  const composition = Object.entries(mine.points_breakdown || {}).map(([kpi, points]) => ({
    kpi,
    points: typeof points === "number" ? Number(points.toFixed(1)) : points,
    weight: weights[kpi] ?? null,
    my_value: mine[kpi] ?? null,
    group_mean: mine.group_means?.[kpi] ?? null,
  }));

  return Response.json({
    linked: true,
    employee: mine.employee,
    group: mine.group || null,
    period_id: periodId,
    available_periods: periods.slice(0, 12),
    mode,
    score: Number(mine.score.toFixed(1)),
    tier: mine.tier,
    peer_rank,
    // Traguardo raggiungibile da tutti (26/09, comitato esperti): per la metà
    // bassa il riferimento è la FASCIA SUCCESSIVA (assoluta), non "la metà alta"
    // che per definizione metà del gruppo non può raggiungere.
    next_tier: (() => {
      const ts = (settings.tiers || []).slice().sort((a, b) => a.min - b.min);
      const nx = ts.find((t) => t.min > mine.score);
      return nx ? { tier: nx.label, gap: Number(Math.max(0.1, nx.min - mine.score).toFixed(1)) } : null;
    })(),
    comparison: mine.comparison === "language" ? "language" : "group", // v13: gruppo piccolo → media della lingua
    group_size: mine.group_size ?? mine.group_means?._count ?? null,
    composition,
    formula: snapshot ? { hash: snapshot.hash, captured_at_iso: snapshot.captured_at_iso } : null,
    history,
  });
}
