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

const DEFAULT_BASE = "https://api.creatorspro.com";

async function cpAuth() {
  const email = process.env.CREATORSPRO_BOT_EMAIL;
  const password = process.env.CREATORSPRO_BOT_PASSWORD;
  const baseUrl = process.env.CREATORSPRO_API_BASE_URL || DEFAULT_BASE;
  const res = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  return { token: j?.data?.access_token, baseUrl };
}

async function cpGet(path, auth) {
  try {
    const r = await fetch(`${auth.baseUrl}${path}`, {
      headers: { "Authorization": `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : null };
  } catch (e) {
    return { ok: false, status: null, error: String(e?.message || e) };
  }
}

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Auto-resolve groupId/memberId scanning ricorsivamente tutti i campi UUID
// del creatorPaymentProfile e verificando quali matchano i set di groups/members.
// Più robusto del naming-guessing: funziona con qualsiasi convenzione naming CP.
function resolveLinks(cpp, groupIdsSet, memberIdsSet) {
  let groupId = null, memberId = null;
  if (!cpp || typeof cpp !== "object") return { groupId, memberId };
  function scan(obj, depth = 0) {
    if (depth > 4 || !obj || typeof obj !== "object") return;
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && isUuid(v)) {
        if (!groupId && groupIdsSet.has(v)) groupId = v;
        else if (!memberId && memberIdsSet.has(v)) memberId = v;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        scan(v, depth + 1);
      } else if (Array.isArray(v)) {
        for (const item of v) scan(item, depth + 1);
      }
    }
  }
  scan(cpp);
  return { groupId, memberId };
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  try {
    const [profiles, groupsRaw, members] = await Promise.all([
      fetchAllPaymentProfiles(),
      fetchGroups().catch(() => []),
      fetchMembers().catch(() => []),
    ]);
    const groups = groupsRaw;

    // Groups arriva come tree (childrens nested) → flatten
    const flatGroups = [];
    function flattenGroups(arr) {
      for (const g of arr || []) {
        flatGroups.push(g);
        if (Array.isArray(g.childrens)) flattenGroups(g.childrens);
      }
    }
    flattenGroups(groups);

    const groupMap = {};
    for (const g of flatGroups) groupMap[g.id] = g;
    const memberMap = {};
    for (const m of members) memberMap[m.id] = m;
    const groupIdsSet = new Set(Object.keys(groupMap));
    const memberIdsSet = new Set(Object.keys(memberMap));

    // Enrich + sort thresholds
    const enriched = profiles.map((p) => {
      const thresholds = (p.paymentProfileThresholds || [])
        .map((t) => ({ id: t.id, threshold: t.threshold, percentage: t.percentage }))
        .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));

      const links = (p.creatorPaymentProfiles || []).map((cpp) => {
        const { groupId, memberId } = resolveLinks(cpp, groupIdsSet, memberIdsSet);
        return {
          raw_keys: Object.keys(cpp || {}),
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

    // DEBUG: prendiamo i primi 3 profili sample per confronto
    const debugSamples = profiles.slice(0, 3);

    // DEBUG: contiamo quanti profili hanno creatorPaymentProfiles non-vuoto
    const profilesWithLinks = profiles.filter((p) => Array.isArray(p.creatorPaymentProfiles) && p.creatorPaymentProfiles.length > 0).length;

    // DEBUG: proviamo a fetchare il primo profilo singolarmente per vedere se
    // l'endpoint /v1/payment-profiles/{id} espande di più
    let single_profile_probe = null;
    if (profiles[0]?.id) {
      const auth = await cpAuth();
      const tries = [
        `/v1/payment-profiles/${profiles[0].id}`,
        `/v1/payment-profiles/${profiles[0].id}?include=creatorPaymentProfiles`,
        `/v1/payment-profiles/${profiles[0].id}?include=creators,members,groups`,
        `/v1/payment-profiles?include=creatorPaymentProfiles&limit=1`,
        `/v1/payment-profiles?expand=creatorPaymentProfiles&limit=1`,
        `/v1/payment-profiles?with=creatorPaymentProfiles&limit=1`,
      ];
      single_profile_probe = [];
      for (const path of tries) {
        const r = await cpGet(path, auth);
        let sample = null;
        if (r.ok && r.body) {
          const item = Array.isArray(r.body?.data) ? r.body.data[0] : (r.body?.data || r.body);
          sample = {
            keys: item && typeof item === "object" ? Object.keys(item) : null,
            cpp_count: Array.isArray(item?.creatorPaymentProfiles) ? item.creatorPaymentProfiles.length : null,
            cpp_first: Array.isArray(item?.creatorPaymentProfiles) && item.creatorPaymentProfiles[0]
              ? item.creatorPaymentProfiles[0]
              : null,
          };
        }
        single_profile_probe.push({ path, status: r.status, ok: r.ok, sample });
      }
    }

    return Response.json({
      total: enriched.length,
      groups_loaded: groups.length,
      members_loaded: members.length,
      sample_first_profile_raw: profiles[0] || null, // per validare assunzioni
      sample_first_3_profiles_raw: debugSamples,
      debug: {
        profiles_with_creatorPaymentProfiles_populated: profilesWithLinks,
        profiles_with_empty_creatorPaymentProfiles: profiles.length - profilesWithLinks,
        single_profile_probe,
      },
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
