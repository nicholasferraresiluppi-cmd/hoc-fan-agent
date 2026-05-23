/**
 * GET /api/admin/_debug-mapping?employee=Francesco Casti&period_id=2026-05
 *
 * Endpoint diagnostico: per un dato nome employee, restituisce tutto quello
 * che serve a capire perché NON viene matchato nel merge CP↔Infloww.
 *
 * Mostra:
 *   - mapping_for_query: ricerca fuzzy nel cp:member_mapping per nome simile
 *   - wages_for_mapped_ids: per ciascun cp_member_id matchato, quanti wage
 *     records nel periodo (e quanti shift in totale)
 *   - infloww_matching: nomi simili presenti come employee nei record Infloww
 *     del periodo
 *   - exact_match_check: confronto esatto stringa tra nome in mapping e nome
 *     in record Infloww (caratteri invisibili, spazi extra, case, ecc)
 *
 * Capability: SEED (admin-only).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

function norm(s) { return String(s || "").trim().toLowerCase(); }
function containsCI(haystack, needle) {
  return norm(haystack).includes(norm(needle));
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  const period_id = url.searchParams.get("period_id");
  if (!employee) return Response.json({ error: "?employee=NAME richiesto" }, { status: 400 });
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) return Response.json({ error: "?period_id=YYYY-MM richiesto" }, { status: 400 });

  const [mapping, members, wages, infloww] = await Promise.all([
    kv.get("cp:member_mapping"),
    kv.get("cp:members"),
    kv.get(`cp:wages:${period_id}`),
    kv.get(`ops_kpi:monthly:${period_id}`),
  ]);
  const mappingObj = mapping || {};
  const membersObj = members || {};
  const wagesArr = Array.isArray(wages) ? wages : [];
  const inflowwArr = Array.isArray(infloww) ? infloww : [];

  // === Step 1: cerca nel mapping ===
  // mapping format: { cp_member_id: "Infloww Name" }
  // Cerco sia per nome che per cp_member_id (in caso lui passi un id)
  const mappingMatches = [];
  for (const [cpId, inflowwName] of Object.entries(mappingObj)) {
    const cpMember = membersObj[cpId];
    const cpName = cpMember ? `${cpMember.firstName || ""} ${cpMember.lastName || ""}`.trim() : null;
    if (containsCI(inflowwName, employee) || (cpName && containsCI(cpName, employee))) {
      mappingMatches.push({
        cp_member_id: cpId,
        cp_member_name: cpName,
        cp_member_username: cpMember?.username || null,
        infloww_name_in_mapping: inflowwName,
        infloww_name_bytes: Array.from(inflowwName).map((c) => c.charCodeAt(0)),
      });
    }
  }

  // === Step 2: per ogni cp_member_id matchato, conta wage records nel periodo ===
  const wagesForMappedIds = [];
  for (const m of mappingMatches) {
    const wagesForThisMember = wagesArr.filter((w) => w.member_id === m.cp_member_id);
    const shifts = wagesForThisMember.reduce((s, w) => s + (w.shifts?.length || 0), 0);
    wagesForMappedIds.push({
      cp_member_id: m.cp_member_id,
      infloww_name_in_mapping: m.infloww_name_in_mapping,
      wage_records: wagesForThisMember.length,
      total_shifts: shifts,
      wage_member_names: wagesForThisMember.map((w) => w.member_name),
    });
  }

  // === Step 3: cerca direttamente nei wage records (es. mapping vuoto ma wage esiste) ===
  // Match per member_name CP (case-insensitive, contains)
  const wagesByName = wagesArr
    .filter((w) => w.member_name && containsCI(w.member_name, employee))
    .map((w) => ({
      cp_member_id: w.member_id,
      cp_member_name: w.member_name,
      member_username: w.member_username,
      shifts: w.shifts?.length || 0,
      is_in_mapping: !!mappingObj[w.member_id],
      mapped_to: mappingObj[w.member_id] || null,
    }));

  // === Step 4: cerca nei record Infloww del periodo (case-insensitive contains) ===
  const inflowwMatches = [];
  const seen = new Set();
  for (const r of inflowwArr) {
    if (!r.employee) continue;
    if (!containsCI(r.employee, employee)) continue;
    if (seen.has(r.employee)) continue;
    seen.add(r.employee);
    inflowwMatches.push({
      employee_name_in_csv: r.employee,
      group: r.group,
      employee_name_bytes: Array.from(r.employee).map((c) => c.charCodeAt(0)),
      is_mass: !!r.is_mass,
    });
  }

  // === Step 5: exact match check tra mapping e Infloww ===
  // Verifica se il nome nel mapping corrisponde ESATTAMENTE a uno presente in Infloww
  const exactMatchChecks = [];
  for (const m of mappingMatches) {
    const exactInfloww = inflowwArr.find((r) => r.employee === m.infloww_name_in_mapping);
    exactMatchChecks.push({
      mapping_says: m.infloww_name_in_mapping,
      mapping_bytes: Array.from(m.infloww_name_in_mapping).map((c) => c.charCodeAt(0)),
      found_in_infloww_exact: !!exactInfloww,
      infloww_record_count_for_exact_name: inflowwArr.filter((r) => r.employee === m.infloww_name_in_mapping).length,
    });
  }

  return Response.json({
    query: { employee, period_id },
    counts: {
      mapping_total: Object.keys(mappingObj).length,
      cp_members_total: Object.keys(membersObj).length,
      wages_records: wagesArr.length,
      infloww_records: inflowwArr.length,
    },
    mapping_matches: mappingMatches,
    wages_for_mapped_ids: wagesForMappedIds,
    cp_wages_by_name: wagesByName,
    infloww_matches: inflowwMatches,
    exact_match_checks: exactMatchChecks,
    interpretation_hints: [
      "Se mapping_matches è vuoto → l'operatore non è ancora mappato lato CP.",
      "Se mapping_matches OK ma wages_for_mapped_ids ha total_shifts=0 → il cp_member_id non ha lavorato in CP nel periodo (anche se ha lavorato in Infloww).",
      "Se exact_match_checks ha found_in_infloww_exact=false → il nome scritto nel mapping NON corrisponde a nessun record Infloww del periodo (mismatch di stringa).",
      "Confronta i byte (mapping_bytes vs employee_name_bytes Infloww) per scovare spazi invisibili o caratteri unicode.",
    ],
  });
}
