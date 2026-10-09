// "Le mie creator" (09/10/2026) — API della vista d'insieme dello strumento "Revenue e chat":
// per ogni creator VISIBILE (assegnate; admin: tutte) la corsa del mese, i fan in attesa con i
// primi da scrivere, la latenza di oggi e chi è di turno. Legge le stesse cache di Revenue
// (15 min), Chat live (15 min) e turni (5 min): nessun numero nuovo, solo messi insieme.
// Contiene nomi utente dei fan → stesso gate di Chat (SCORES_VIEW team/all + creator assegnata).

export const runtime = "nodejs";
export const maxDuration = 120;

import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";
import { LIVE_CREATORS, seesCreator } from "@/lib/live-creators";
import { getRevenuePacing, getGoals, bigQueryConfigured } from "@/lib/revenue-pacing";
import { getChatMonitor } from "@/lib/chat-monitor";
import { getLiveShifts } from "@/lib/live-shifts";
import { prioritizeQueue, shiftStatus, creatorLight, suggestedGoal } from "@/lib/live-priority";

const safe = (p) => p.catch(() => null);

async function summarize(c) {
  const [rev, goals, chat, shifts] = await Promise.all([safe(getRevenuePacing(c)), safe(getGoals(c)), safe(getChatMonitor(c, "live")), safe(getLiveShifts(c))]);
  const rows = rev?.data || [];
  const first = rows[0] || {};
  const month = String(first.as_of_date || "").slice(0, 7);
  const sum = (f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
  // per paese: il traguardo messo a mano, se no la proposta (mese prima +10%)
  const perCountry = c.accounts.map((a) => {
    const set = goals?.goals?.[a.country]?.[month];
    return set != null ? { v: set, sugg: false } : { v: suggestedGoal(rev?.trend, [a.country], month), sugg: true };
  });
  const goal = perCountry.every((x) => x.v != null) ? perCountry.reduce((a, x) => a + x.v, 0) : null;
  const goalSuggested = goal != null && perCountry.some((x) => x.sugg);
  const mtd = sum("revenue_mtd"), proj = sum("revenue_proj_eom"), hist = sum("revenue_hist_avg");
  const shouldBe = goal && first.days_in_month ? (goal * first.day_of_month) / first.days_in_month : null;
  const paceRatio = shouldBe ? mtd / shouldBe : hist ? proj / hist : null;

  const now = Date.now();
  const countries = c.accounts.map((a) => {
    const cc = a.country;
    const q = prioritizeQueue((chat?.queue || []).filter((x) => x.country === cc), now);
    const t = (chat?.today || []).find((x) => x.country === cc) || {};
    return {
      country: cc,
      waiting: q.length,
      waitingSpenders: q.filter((x) => x.tier <= 1).length,
      waitingOld: q.filter((x) => x.wait_min > 120).length,
      latMin: t.lat_med_s != null ? t.lat_med_s / 60 : null,
      welcomePending: t.welcome_pending ?? null,
      revenueToday: t.revenue ?? null,
      top: q.slice(0, 3).map((x) => ({ user_id: x.user_id, username: x.username, reason: x.reason, tier: x.tier, wait_min: x.wait_min, last_fan_at: x.last_fan_at })),
      shift: shifts ? shiftStatus(shifts.byCountry?.[cc], now) : null,
    };
  });
  const agg = (f) => countries.reduce((a, x) => a + (x[f] || 0), 0);
  const lats = countries.map((x) => x.latMin).filter((v) => v != null);
  // il turno peggiore decide (un account scoperto basta)
  const worstShift = countries.map((x) => x.shift).find((s) => s?.unchecked) || countries.map((x) => x.shift).find((s) => s?.empty) || countries[0]?.shift || null;
  const light = creatorLight({ paceRatio, hasGoal: goal != null, waitingSpenders: agg("waitingSpenders"), waitingOld: agg("waitingOld"), latMin: lats.length ? Math.max(...lats) : null, shift: worstShift });

  return {
    slug: c.slug, name: c.name, countries,
    revenue: rev ? { month, mtd, proj, hist, goal, goalSuggested, shouldBe, paceRatio, day: first.day_of_month, days: first.days_in_month, updated_at: rev.updated_at } : null,
    chatUpdated: chat?.generated_at || null,
    light,
    missing: [!rev && "revenue", !chat && "chat", !shifts && "turni"].filter(Boolean),
  };
}

export async function GET() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const visible = LIVE_CREATORS.filter((c) => seesCreator(az.creatorScope, c));
  const creators = await Promise.all(visible.map(summarize));
  return Response.json({ creators, at: new Date().toISOString() });
}
