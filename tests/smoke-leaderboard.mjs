#!/usr/bin/env node
/**
 * Smoke test invarianti Leaderboard Operativa.
 *
 * Esegui dopo ogni deploy preview per verificare che le invarianti chiave
 * (vedi docs/PR_PREFLIGHT.md) tengano.
 *
 * Setup (una tantum):
 *   1. Apri il preview Vercel nel browser, fai login con Clerk
 *   2. DevTools > Application > Cookies > preview-domain
 *   3. Copia il valore del cookie `__session` (Clerk session token)
 *   4. Esporta come env vars:
 *
 *      export HOC_PREVIEW_URL="https://hoc-fan-agent-git-XXXX-...vercel.app"
 *      export HOC_CLERK_SESSION="eyJ...."
 *
 * Esecuzione:
 *   node tests/smoke-leaderboard.mjs
 *
 * Output: lista di test PASS / FAIL. Exit code 1 se almeno 1 FAIL.
 *
 * NB: lo script NON modifica dati. Solo GET, niente POST/DELETE.
 */

const BASE = process.env.HOC_PREVIEW_URL || "";
const COOKIE = process.env.HOC_CLERK_SESSION || "";

if (!BASE) {
  console.error("ERR: set HOC_PREVIEW_URL");
  process.exit(2);
}
if (!COOKIE) {
  console.error("ERR: set HOC_CLERK_SESSION (cookie value, no '__session=' prefix)");
  process.exit(2);
}

const headers = {
  "Cookie": `__session=${COOKIE}`,
  "Accept": "application/json",
};

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  const tag = ok ? "\x1b[32m PASS \x1b[0m" : "\x1b[31m FAIL \x1b[0m";
  console.log(`${tag} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

async function run() {
  console.log(`\n→ Smoke test against ${BASE}\n`);
  const periodId = currentMonthId();

  // Test 1: leaderboard endpoint base
  const lb = await fetchJson(`/api/leaderboard/operational?period_type=monthly&period_id=${periodId}`);
  check("operational endpoint returns 200 or 404 (no period yet)",
    lb.status === 200 || lb.status === 404,
    `got ${lb.status}`);

  if (lb.status !== 200) {
    console.log(`\n  Nessun dato per ${periodId} — skip restanti test invarianti dati.`);
    summary();
    return;
  }

  // Test 2: ranking non vuoto
  check("ranking is non-empty array",
    Array.isArray(lb.data.ranking) && lb.data.ranking.length > 0,
    `${lb.data.ranking?.length ?? 0} entries`);

  // Test 3: language counts sommano a eligible_total
  const lc = lb.data.language_counts || {};
  const lcSum = (lc.eng || 0) + (lc.ita || 0) + (lc.unknown || 0);
  check("language_counts sum == eligible_total",
    lcSum === lb.data.eligible_total,
    `${lcSum} vs ${lb.data.eligible_total}`);

  // Test 4: category counts sommano a eligible_total
  const cc = lb.data.category_counts || {};
  const ccSum = (cc.Big || 0) + (cc.Medium || 0) + (cc.Small || 0) + (cc.Uncategorized || 0);
  check("category_counts sum == eligible_total",
    ccSum === lb.data.eligible_total,
    `${ccSum} vs ${lb.data.eligible_total}`);

  // Test 5: filtra ITA, language_counts globali NON cambiano
  const lbIta = await fetchJson(`/api/leaderboard/operational?period_type=monthly&period_id=${periodId}&language=ita`);
  if (lbIta.status === 200) {
    const sameLang = JSON.stringify(lbIta.data.language_counts) === JSON.stringify(lb.data.language_counts);
    check("filter ita: language_counts globali stabili",
      sameLang,
      sameLang ? "" : `${JSON.stringify(lb.data.language_counts)} → ${JSON.stringify(lbIta.data.language_counts)}`);
    const sameCat = JSON.stringify(lbIta.data.category_counts) === JSON.stringify(lb.data.category_counts);
    check("filter ita: category_counts globali stabili",
      sameCat,
      sameCat ? "" : "categoria cambia col filtro lingua");
  }

  // Test 6: ranking filtrato ita contiene solo language=ita
  if (lbIta.status === 200) {
    const allIta = (lbIta.data.ranking || []).every((r) => r.language === "ita");
    check("filter ita: tutti i record hanno language='ita'", allIta);
  }

  // Test 7: health endpoint
  const health = await fetchJson(`/api/leaderboard/health?period_type=monthly&limit=6`);
  check("health endpoint returns 200",
    health.status === 200,
    `got ${health.status}`);
  if (health.status === 200) {
    check("health.history is array",
      Array.isArray(health.data.history),
      `${health.data.history?.length ?? 0} entries`);
  }

  // Test 8: whoami funziona
  const me = await fetchJson(`/api/whoami`);
  check("whoami returns authenticated user",
    me.status === 200 && me.data.authenticated,
    me.data.email || "no email");

  // Test 9: drill-down con un nome dal ranking
  const sampleName = lb.data.ranking[0]?.employee;
  if (sampleName) {
    const hist = await fetchJson(`/api/leaderboard/employee-history?employee=${encodeURIComponent(sampleName)}&period_type=monthly`);
    check("drill-down ritorna history per nome valido",
      hist.status === 200 && Array.isArray(hist.data.history),
      `${sampleName}: ${hist.data.history?.length ?? 0} periodi`);
  }

  // Test 10: underperformers richiede admin (skippa se non-admin)
  if (me.data?.capabilities?.seed === "all") {
    const up = await fetchJson(`/api/leaderboard/underperformers?period_type=monthly&period_id=${periodId}&limit=5`);
    check("underperformers returns 200 for admin",
      up.status === 200,
      `${up.data.count ?? 0} underperformers`);
  } else {
    console.log("\x1b[33m SKIP \x1b[0m underperformers (non-admin)");
  }

  summary();
}

function summary() {
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${passed}/${checks.length} passed${failed ? ` (${failed} failed)` : ""}\n`);
  if (failed) process.exit(1);
}

run().catch((err) => { console.error("CRASH:", err); process.exit(2); });
