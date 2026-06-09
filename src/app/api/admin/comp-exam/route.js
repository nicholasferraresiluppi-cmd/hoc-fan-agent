/**
 * GET /api/admin/comp-exam?creator=Giulia%20Ottorini&months=3
 *
 * Esame compensation per UN creator specifico, ultimi N mesi chiusi.
 *
 * Pipeline:
 *  1. Trova group_id del creator in CP (fuzzy match)
 *  2. Per ognuno degli ultimi N mesi chiusi: buildCreatorMatrix → aggrega cell
 *     dove creator alias match (case-insensitive)
 *  3. Raccoglie payment profiles + risolve link auto via UUID scan
 *  4. Per ogni operatore identifica profilo attivo (linka creator AND member),
 *     calcola % vincente dalla soglia thresholds, stima guadagno
 *  5. Verdetto: OK / REVIEW / OUT_OF_SCALE / UNKNOWN
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchAllPaymentProfiles, fetchGroups, fetchMembers, fetchWages, fetchWageDetail } from "@/lib/creatorspro-api";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";

function monthBoundsIso(periodId) {
  // YYYY-MM → { startedAt: "YYYY-MM-01T00:00:00.000Z", endedAt: "...next month..."}
  const [y, m] = periodId.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

export const maxDuration = 60;

function lastClosedMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function resolveLinks(cpp, groupIdsSet, memberIdsSet) {
  let groupId = null, memberId = null;
  if (!cpp || typeof cpp !== "object") return { groupId, memberId };
  function scan(obj, depth = 0) {
    if (depth > 4 || !obj || typeof obj !== "object") return;
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && isUuid(v)) {
        if (!groupId && groupIdsSet.has(v)) groupId = v;
        else if (!memberId && memberIdsSet.has(v)) memberId = v;
      } else if (v && typeof v === "object" && !Array.isArray(v)) scan(v, depth + 1);
      else if (Array.isArray(v)) for (const it of v) scan(it, depth + 1);
    }
  }
  scan(cpp);
  return { groupId, memberId };
}

// Calcolo CUMULATIVO degli scaglioni — confermato da CP UI:
//   "Base 10% · >350$ 12% · >700$ 15%"
// significa: 0-350 al 10%, 350-700 al 12% sul delta, >700 al 15% sul delta.
// Restituisce { earning, effective_pct } dove effective_pct = earning/sales
function calcCumulativeEarning(sales, thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length === 0 || sales <= 0) {
    return { earning: 0, effective_pct: null, breakdown: [] };
  }
  const sorted = [...thresholds].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  let earning = 0;
  const breakdown = [];
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const from = t.threshold ?? 0;
    const to = i < sorted.length - 1 ? (sorted[i + 1].threshold ?? Infinity) : Infinity;
    if (sales <= from) break;
    const tierSales = Math.min(sales, to) - from;
    if (tierSales <= 0) continue;
    const pct = t.percentage ?? 0;
    const tierEarn = tierSales * pct;
    earning += tierEarn;
    breakdown.push({ from, to: to === Infinity ? null : to, tier_sales: tierSales, pct, tier_earning: tierEarn });
  }
  return { earning, effective_pct: sales > 0 ? earning / sales : null, breakdown };
}

function isOldProfile(name) {
  return /\bold\b|\bdismesso\b|\btest\b/i.test(name || "");
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const creatorName = (url.searchParams.get("creator") || "").trim();
  const monthsN = Math.max(1, Math.min(12, parseInt(url.searchParams.get("months") || "3", 10)));
  if (!creatorName) return Response.json({ error: "creator name required" }, { status: 400 });

  try {
    const [groupsRaw, members, profiles] = await Promise.all([
      fetchGroups().catch(() => []),
      fetchMembers().catch(() => []),
      fetchAllPaymentProfiles().catch(() => []),
    ]);

    // Flatten groups tree
    const allGroups = [];
    (function flatten(arr) {
      for (const g of arr || []) {
        allGroups.push(g);
        if (Array.isArray(g.childrens)) flatten(g.childrens);
      }
    })(groupsRaw);

    // Trova target creator nei CP groups (exact > startsWith > substring > token match)
    // ATTENZIONE: i nomi CP groups e gli alias Infloww sono DIVERSI! Es. CP ha
    // "Laura 🇮🇹" / "Laura ENG 🇬🇧" mentre Infloww ha "Laura Sommaruga - IT" / "- EN".
    // Quindi il match CP può fallire — non è bloccante, procediamo cmq con alias.
    const q = creatorName.toLowerCase().trim();
    const qTokens = q.split(/[\s_\-,]+/).filter((t) => t.length >= 3 && !/^(it|en|es|uk|us|ita|eng|esp)$/i.test(t));
    let target =
      allGroups.find((g) => (g.name || "").toLowerCase() === q) ||
      allGroups.find((g) => (g.name || "").toLowerCase().startsWith(q)) ||
      allGroups.find((g) => (g.name || "").toLowerCase().includes(q));
    if (!target && qTokens.length > 0) {
      // Token match: il group name contiene TUTTI i token significativi
      target = allGroups.find((g) => {
        const n = (g.name || "").toLowerCase();
        return qTokens.every((t) => n.includes(t));
      });
    }

    const groupIdsSet = new Set(allGroups.map((g) => g.id));
    const memberIdsSet = new Set(members.map((m) => m.id));
    const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
    const groupMap = Object.fromEntries(allGroups.map((g) => [g.id, g]));

    // Step 2: ultimi N mesi chiusi → matrix per ognuno
    const periods = lastClosedMonths(monthsN);
    const monthDataResults = await Promise.allSettled(periods.map((pid) => buildCreatorMatrix(pid)));
    const monthData = periods.map((pid, i) => {
      const r = monthDataResults[i];
      return r.status === "fulfilled" ? { period_id: pid, ...r.value } : { period_id: pid, error: String(r.reason?.message || r.reason) };
    });

    // Identifica alias Infloww che corrispondono al creator richiesto.
    // Strategia multi-fallback (più tollerante possibile):
    //  1. Exact match q vs alias lowercase
    //  2. Alias contiene q
    //  3. q contiene alias
    //  4. Tutti i token significativi di q sono nell'alias
    //  5. Se abbiamo trovato target CP: alias contiene il nome target o suoi token
    const aliasSet = new Set();
    const allAliasesInMatrix = new Set();
    for (const m of monthData) {
      if (m.error) continue;
      for (const cr of Object.keys(m.creators || {})) {
        allAliasesInMatrix.add(cr);
        const cl = cr.toLowerCase();
        const norm = (s) => s.replace(/[\s_\-,]/g, "");
        let matched = false;
        if (cl === q) matched = true;
        else if (cl.includes(q)) matched = true;
        else if (q.includes(cl)) matched = true;
        else if (norm(cl) === norm(q) || norm(cl).includes(norm(q)) || norm(q).includes(norm(cl))) matched = true;
        else if (qTokens.length > 0 && qTokens.every((t) => cl.includes(t))) matched = true;
        else if (target?.name) {
          const tName = target.name.toLowerCase();
          const tTokens = tName.split(/\s+/).filter((t) => t.length >= 3);
          if (cl.includes(tName) || tTokens.some((t) => cl.includes(t))) matched = true;
        }
        if (matched) aliasSet.add(cr);
      }
    }

    // Se non abbiamo né target CP né alias match → 404 con suggestion utili
    if (!target && aliasSet.size === 0) {
      return Response.json({
        error: `Creator "${creatorName}" non trovato né nei group CP né negli alias Infloww.`,
        suggestions_cp_groups: allGroups
          .filter((g) => qTokens.some((t) => (g.name || "").toLowerCase().includes(t)))
          .slice(0, 10).map((g) => g.name),
        suggestions_infloww_aliases: [...allAliasesInMatrix]
          .filter((a) => qTokens.some((t) => a.toLowerCase().includes(t)))
          .slice(0, 10),
      }, { status: 404 });
    }

    // Se target CP non trovato, costruisco target "virtuale" usando il primo alias
    if (!target) {
      target = { id: null, name: [...aliasSet][0] || creatorName, parentId: null };
    }

    // Aggrega per operatore — include cell.earnings (= guadagno REALE per quel creator,
    // calcolato da distributeShift come quota di shift.total_earnings proporzionale al
    // sales). NO stima con scaglioni: questa è la verità che CP ci dà.
    const opAgg = {};
    for (const m of monthData) {
      if (m.error) continue;
      const matrix = m.matrix || {};
      for (const [opName, byCreator] of Object.entries(matrix)) {
        for (const alias of aliasSet) {
          const cell = byCreator[alias];
          if (!cell) continue;
          if (!opAgg[opName]) opAgg[opName] = {
            operator: opName, totalShifts: 0, totalSales: 0, totalHours: 0, totalEarnings: 0,
            mono_shifts: 0, split_shifts: 0, exact_shifts: 0, months: {}, aliases_seen: new Set(),
            pct_distribution: {}, // bucket: count su TUTTI gli shift dell'operatore su questo creator
          };
          const a = opAgg[opName];
          a.totalShifts += cell.shifts || 0;
          a.totalSales += cell.sales || 0;
          a.totalHours += cell.hours || 0;
          a.totalEarnings += cell.earnings || 0;
          a.mono_shifts += cell.shift_mono_count || 0;
          a.split_shifts += cell.shift_split_count || 0;
          a.exact_shifts += cell.shift_exact_count || 0;
          a.aliases_seen.add(alias);
          // Merge pct_distribution dei vari mesi
          if (cell.pct_distribution) {
            for (const [bucket, count] of Object.entries(cell.pct_distribution)) {
              a.pct_distribution[bucket] = (a.pct_distribution[bucket] || 0) + count;
            }
          }
          if (!a.months[m.period_id]) a.months[m.period_id] = { shifts: 0, sales: 0, earnings: 0 };
          a.months[m.period_id].shifts += cell.shifts || 0;
          a.months[m.period_id].sales += cell.sales || 0;
          a.months[m.period_id].earnings += cell.earnings || 0;
        }
      }
    }

    // Risolvi payment profile links
    const profilesEnriched = profiles.map((p) => {
      const links = (p.creatorPaymentProfiles || []).map((cpp) => {
        const { groupId, memberId } = resolveLinks(cpp, groupIdsSet, memberIdsSet);
        return { groupId, memberId, group: groupId ? groupMap[groupId] : null, member: memberId ? memberMap[memberId] : null };
      });
      return {
        id: p.id,
        name: p.name,
        tag: p.tag,
        cosellersCount: p.cosellersCount,
        hourlyRate: p.hourlyRate,
        thresholds: (p.paymentProfileThresholds || [])
          .map((t) => ({ threshold: t.threshold, percentage: t.percentage }))
          .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0)),
        links,
        isOld: isOldProfile(p.name),
      };
    });

    const targetGroupId = target.id;
    // Profili che linkano questo creator (tutti, anche solo via groupId senza member)
    const profilesOnCreator = profilesEnriched.filter((pp) =>
      pp.links.some((l) => l.groupId === targetGroupId)
    );

    // Build operator list with profile match
    const operators = [];
    for (const [opName, agg] of Object.entries(opAgg)) {
      // Match CP member per nome (firstName + lastName)
      let opMemberId = null;
      const opLow = opName.toLowerCase().trim();
      for (const m of members) {
        const full = `${m.firstName || ""} ${m.lastName || ""}`.trim().toLowerCase();
        const inv = `${m.lastName || ""} ${m.firstName || ""}`.trim().toLowerCase();
        if (full === opLow || inv === opLow) { opMemberId = m.id; break; }
      }

      // Profili attivi: linkano creator + member
      const matchingProfiles = profilesOnCreator.filter((pp) =>
        pp.links.some((l) => l.groupId === targetGroupId && (opMemberId ? l.memberId === opMemberId : false))
      );

      // Profili "candidato" (linkano creator ma member non match)
      const candidatesNoMember = matchingProfiles.length === 0
        ? profilesOnCreator.filter((pp) => pp.links.some((l) => l.groupId === targetGroupId && !l.memberId))
        : [];

      const chosenProfile = matchingProfiles[0] || candidatesNoMember[0] || null;

      const sales = agg.totalSales;
      const realEarnings = Math.round(agg.totalEarnings);
      // % REALE incassata = guadagno effettivo / sales (no stima, è il dato di CP)
      const pctReal = sales > 0 ? agg.totalEarnings / sales : null;

      const totalEvents = agg.mono_shifts + agg.split_shifts + agg.exact_shifts;
      const mix_solo_pct = totalEvents > 0 ? Math.round((agg.mono_shifts / totalEvents) * 100) : null;

      operators.push({
        operator: opName,
        cp_member_id: opMemberId,
        member_matched: !!opMemberId,
        totalShifts: Math.round(agg.totalShifts * 10) / 10,
        totalSales: Math.round(agg.totalSales),
        totalHours: Math.round(agg.totalHours * 10) / 10,
        totalEarnings: realEarnings, // guadagno REALE che l'operatore ha incassato su questa creator
        sales_per_shift: agg.totalShifts > 0 ? Math.round((agg.totalSales / agg.totalShifts) * 100) / 100 : 0,
        earnings_per_shift: agg.totalShifts > 0 ? Math.round((agg.totalEarnings / agg.totalShifts) * 100) / 100 : 0,
        mix_solo_pct,
        months_breakdown: Object.fromEntries(
          Object.entries(agg.months).map(([k, v]) => [k, {
            shifts: Math.round(v.shifts * 10) / 10,
            sales: Math.round(v.sales),
            earnings: Math.round(v.earnings),
          }])
        ),
        // Profilo "candidato attivo" (lookup per compatibilità + member match)
        // Fase A: lo manteniamo solo come info di contesto; Fase B avrà profilo per-shift
        active_profile: chosenProfile ? {
          id: chosenProfile.id,
          name: chosenProfile.name,
          tag: chosenProfile.tag,
          cosellersCount: chosenProfile.cosellersCount,
          isOld: chosenProfile.isOld,
          thresholds: chosenProfile.thresholds,
          matched_via_member: matchingProfiles.length > 0,
        } : null,
        candidates_without_member_match: candidatesNoMember.length,
        pct_effective: pctReal, // % REALE (CP data), non stimata
        // Distribuzione di % per shift: bucket → count, ordinato per bucket asc
        // Es. { "0.08": 5, "0.10": 12, "0.12": 8 } = 5 shift al 8%, 12 al 10%, 8 al 12%
        pct_distribution: Object.fromEntries(
          Object.entries(agg.pct_distribution)
            .filter(([, c]) => c > 0)
            .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
        ),
      });
    }

    operators.sort((a, b) => b.totalSales - a.totalSales);

    // Team avg % REALE = somma earnings team / somma sales team (weighted, non flat avg)
    const totalTeamSales = operators.reduce((s, o) => s + o.totalSales, 0);
    const totalTeamEarnings = operators.reduce((s, o) => s + o.totalEarnings, 0);
    const teamAvgPct = totalTeamSales > 0 ? totalTeamEarnings / totalTeamSales : null;

    // Verdetto basato su % REALE incassata vs team avg
    for (const o of operators) {
      if (o.pct_effective == null || o.totalSales === 0) {
        o.verdict = "UNKNOWN";
        o.verdict_note = "Nessuna vendita registrata su questa creator nel periodo";
      } else if (teamAvgPct == null) {
        o.verdict = "OK";
      } else {
        const delta = (o.pct_effective - teamAvgPct) / teamAvgPct;
        if (Math.abs(delta) < 0.15) { o.verdict = "OK"; o.verdict_note = null; }
        else if (Math.abs(delta) < 0.35) {
          o.verdict = "REVIEW";
          o.verdict_note = `Incassa ${(o.pct_effective * 100).toFixed(1)}% vs team ${(teamAvgPct * 100).toFixed(1)}% (${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}%)`;
        } else {
          o.verdict = "OUT_OF_SCALE";
          o.verdict_note = `Incassa ${(o.pct_effective * 100).toFixed(1)}% vs team ${(teamAvgPct * 100).toFixed(1)}% — gap di ${(delta * 100).toFixed(0)}%`;
        }
      }
      // Side note se ha un profilo OLD candidato (anche se la % è OK)
      if (o.active_profile?.isOld) {
        o.verdict_note = (o.verdict_note ? o.verdict_note + " · " : "") +
          `Profilo candidato "${o.active_profile.name}" è OLD/DISMESSO/TEST`;
        if (o.verdict === "OK") o.verdict = "REVIEW";
      }
    }

    // DEBUG: probe /v1/creators e variants — CP UI mostra "32 creators active"
    // separati dai groups. Forse creatorPaymentProfiles[].xId punta a Creator entity, non Group.
    let creatorsEndpointProbe = null;
    try {
      const tokenRes = await fetch(`${process.env.CREATORSPRO_API_BASE_URL || "https://api.houseofcreators.com"}/v1/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: process.env.CREATORSPRO_BOT_EMAIL, password: process.env.CREATORSPRO_BOT_PASSWORD }),
      });
      const tok = (await tokenRes.json())?.data?.access_token;
      const baseUrl = process.env.CREATORSPRO_API_BASE_URL || "https://api.houseofcreators.com";
      const candidates = [
        "/v1/creators",
        "/v1/sellers-wage/creators",
        "/v1/talents",
        "/v1/manage-talents",
        "/v1/sales-analytics/creators",
      ];
      creatorsEndpointProbe = [];
      for (const p of candidates) {
        try {
          const r = await fetch(`${baseUrl}${p}?limit=1`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(6000) });
          const txt = await r.text();
          let parsed = null; try { parsed = JSON.parse(txt); } catch {}
          const item = Array.isArray(parsed?.data) ? parsed.data[0] : (parsed?.data || parsed);
          creatorsEndpointProbe.push({
            path: p, status: r.status, ok: r.ok,
            data_count: Array.isArray(parsed?.data) ? parsed.data.length : null,
            first_keys: item && typeof item === "object" ? Object.keys(item).slice(0, 12) : null,
            first_id_is_groupId: item?.id && groupIdsSet.has(item.id) ? true : (item?.id ? false : null),
          });
        } catch (e) { creatorsEndpointProbe.push({ path: p, error: String(e?.message || e) }); }
      }
    } catch (e) {
      creatorsEndpointProbe = { _err: String(e?.message || e) };
    }

    // DEBUG: fetch live un wage detail su questo creator per vedere come si chiama
    // il campo "payment profile" nel raw shift. CP UI Timeline mostra "Payment Profile: X"
    // a livello shift, quindi il campo è lì dentro — non in creatorPaymentProfiles del profilo.
    let liveWageDebug = null;
    try {
      const mostRecent = periods[0];
      const { startedAt, endedAt } = monthBoundsIso(mostRecent);
      const wagesResp = await fetchWages({ startedAt, endedAt, page: 1, limit: 3, groupId: target.id });
      const stubs = wagesResp?.data || [];
      const details = [];
      for (const stub of stubs.slice(0, 2)) {
        const id = stub?.info?.id || stub?.id;
        if (!id) continue;
        try {
          const d = await fetchWageDetail(id);
          details.push(d);
        } catch (e) { details.push({ _error: String(e?.message || e), id }); }
      }
      liveWageDebug = {
        attempted_period: mostRecent,
        startedAt, endedAt,
        wages_found: stubs.length,
        sample_wage_info_keys: details[0]?.info ? Object.keys(details[0].info) : null,
        sample_first_shift: details[0]?.shifts?.[0] || null,
        sample_first_shift_keys: details[0]?.shifts?.[0] ? Object.keys(details[0].shifts[0]) : null,
        // estrai qualsiasi campo che contenga "payment" nel name
        payment_related_fields_in_shift: details[0]?.shifts?.[0]
          ? Object.fromEntries(Object.entries(details[0].shifts[0]).filter(([k]) => /payment|profile|tier|wage/i.test(k)))
          : null,
        payment_related_fields_in_info: details[0]?.info
          ? Object.fromEntries(Object.entries(details[0].info).filter(([k]) => /payment|profile|tier|wage/i.test(k)))
          : null,
      };
    } catch (e) {
      liveWageDebug = { _error: String(e?.message || e) };
    }

    const oldProfilesOnCreator = profilesOnCreator.filter((pp) => pp.isOld).map((pp) => ({
      id: pp.id, name: pp.name, tag: pp.tag,
      members_linked: pp.links.filter((l) => l.groupId === targetGroupId).map((l) => l.member?.firstName ? `${l.member.firstName} ${l.member.lastName || ""}`.trim() : (l.memberId || "?")),
    }));

    return Response.json({
      creator: {
        id: target.id,
        name: target.name,
        parentId: target.parentId,
        matched_aliases: [...aliasSet],
        cp_group_matched: !!target.id, // false se creator non c'è in CP groups (= match solo via alias Infloww)
      },
      months_analyzed: periods,
      months_errors: monthData.filter((m) => m.error).map((m) => ({ period_id: m.period_id, error: m.error })),
      operators_count: operators.length,
      team_avg_pct: teamAvgPct,
      total_team_sales: totalTeamSales,
      total_team_earnings: totalTeamEarnings,
      operators,
      old_profiles_on_creator: oldProfilesOnCreator,
      total_profiles_on_creator: profilesOnCreator.length,
      diagnostics: {
        live_wage_debug: liveWageDebug,
        creators_endpoint_probe: creatorsEndpointProbe,
        groups_total: allGroups.length,
        members_total: members.length,
        profiles_total: profiles.length,
        profiles_with_resolved_group: profilesEnriched.filter((p) => p.links.some((l) => l.groupId)).length,
        profiles_with_resolved_member: profilesEnriched.filter((p) => p.links.some((l) => l.memberId)).length,
        target_group_id: target.id,
        target_group_parent_id: target.parentId,
        target_group_children_count: Array.isArray(target.childrens) ? target.childrens.length : 0,
        // Dump dei primi 3 creatorPaymentProfiles raw dei primi 3 profili,
        // per capire cosa c'è davvero dentro
        sample_raw_creatorPaymentProfiles: profiles.slice(0, 3).map((p) => ({
          profile_name: p.name,
          profile_id: p.id,
          creatorPaymentProfiles_count: Array.isArray(p.creatorPaymentProfiles) ? p.creatorPaymentProfiles.length : 0,
          first_cpp_raw: p.creatorPaymentProfiles?.[0] || null,
        })),
        // Dump dei primi 3 profili che CONTENGONO un UUID matching nei wage shifts
        // (forse il link è per shift/wage non per group)
        sample_first_3_profiles_all_uuids: profiles.slice(0, 3).map((p) => {
          const uuids = [];
          function scanForUuids(obj, path = "") {
            if (!obj || typeof obj !== "object") return;
            for (const [k, v] of Object.entries(obj)) {
              const np = path ? `${path}.${k}` : k;
              if (typeof v === "string" && isUuid(v)) {
                uuids.push({
                  path: np, value: v,
                  in_groups: groupIdsSet.has(v),
                  in_members: memberIdsSet.has(v),
                });
              } else if (v && typeof v === "object") scanForUuids(v, np);
            }
          }
          scanForUuids(p.creatorPaymentProfiles?.[0] || {});
          return { profile_name: p.name, uuids };
        }),
      },
    });
  } catch (e) {
    console.error("[comp-exam] error:", e);
    return Response.json({ error: String(e?.message || e), stack: String(e?.stack || "").slice(0, 800) }, { status: 500 });
  }
}
