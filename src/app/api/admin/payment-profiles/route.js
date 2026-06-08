/**
 * /api/admin/payment-profiles
 *
 * Fetcha TUTTI i Payment Profiles da CP e li enrichia con i nomi dei
 * creator (groups) per il drill-down "quali creator usano questo profilo".
 *
 * Shape per profilo:
 *   { id, name, hourlyRate, cosellersCount, tag,
 *     paymentProfileThresholds: [{ id, threshold, percentage }],
 *     creatorPaymentProfiles: [...]  // shape esatta da validare a runtime }
 *
 * Aggregati ritornati:
 *   - by_cosellers: { 1: [...], 2: [...], 3+: [...] }
 *   - by_tag: { "Rebecca + Lau ESP": [...], ... }
 *   - by_creator: { groupId: [profili attivi su quel creator] }  (best-effort)
 *
 * Capability: SEED
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchAllPaymentProfiles, fetchGroups, fetchMembers } from "@/lib/creatorspro-api";

export const maxDuration = 60;

function detectGroupKey(cpp) {
  // creatorPaymentProfiles[] potrebbe avere uno tra: groupId, creatorId,
  // creator_id, group_id, groupID. Prendiamo il primo che troviamo.
  if (!cpp || typeof cpp !== "object") return null;
  return cpp.groupId || cpp.group_id || cpp.creatorId || cpp.creator_id || cpp.creatorGroupId || cpp.id || null;
}

function detectMemberKey(cpp) {
  if (!cpp || typeof cpp !== "object") return null;
  return cpp.memberId || cpp.member_id || cpp.sellerId || cpp.seller_id || cpp.userId || null;
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  try {
    const [profiles, groups, members] = await Promise.all([
      fetchAllPaymentProfiles(),
      fetchGroups().catch(() => []),
      fetchMembers().catch(() => []),
    ]);

    const groupMap = {};
    for (const g of groups) groupMap[g.id] = g;
    const memberMap = {};
    for (const m of members) memberMap[m.id] = m;

    // Enrich + sort thresholds
    const enriched = profiles.map((p) => {
      const thresholds = (p.paymentProfileThresholds || [])
        .map((t) => ({ id: t.id, threshold: t.threshold, percentage: t.percentage }))
        .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));

      const links = (p.creatorPaymentProfiles || []).map((cpp) => {
        const groupId = detectGroupKey(cpp);
        const memberId = detectMemberKey(cpp);
        return {
          raw_keys: Object.keys(cpp),
          groupId,
          memberId,
          group: groupId ? (groupMap[groupId] || null) : null,
          member: memberId ? (memberMap[memberId] || null) : null,
          raw: cpp,
        };
      });

      return {
        id: p.id,
        name: p.name,
        tag: p.tag,
        cosellersCount: p.cosellersCount,
        hourlyRate: p.hourlyRate,
        thresholds,
        thresholds_count: thresholds.length,
        links_count: links.length,
        links,
      };
    });

    // Aggregati
    const by_cosellers = {};
    for (const p of enriched) {
      const k = p.cosellersCount ?? "?";
      (by_cosellers[k] = by_cosellers[k] || []).push(p.id);
    }
    const by_tag = {};
    for (const p of enriched) {
      const k = p.tag || "(no tag)";
      (by_tag[k] = by_tag[k] || []).push(p.id);
    }
    const by_creator = {};
    for (const p of enriched) {
      for (const l of p.links) {
        if (l.groupId) {
          (by_creator[l.groupId] = by_creator[l.groupId] || []).push(p.id);
        }
      }
    }

    return Response.json({
      total: enriched.length,
      groups_loaded: groups.length,
      members_loaded: members.length,
      sample_first_profile_raw: profiles[0] || null, // per validare assunzioni
      counts: {
        by_cosellers: Object.fromEntries(Object.entries(by_cosellers).map(([k, v]) => [k, v.length])),
        by_tag_count: Object.keys(by_tag).length,
        by_creator_count: Object.keys(by_creator).length,
      },
      profiles: enriched,
    });
  } catch (e) {
    console.error("[payment-profiles] error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
