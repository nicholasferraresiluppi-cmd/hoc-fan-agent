/**
 * Percentuali a scaglioni scritte come nei fogli di Nicholas — logica pura (15/10/2026).
 * Usata dal conto dello split (split-core.js) per gli accordi creator e persona.
 *
 * Le percentuali arrivano dal foglio di Nicholas in forma di testo
 * ("30% <= 25k; 35% <= 50k; 45% > 65k;", "60% flat"): `parseDealText` le legge.
 *
 * Scaglioni: la percentuale dello scaglione raggiunto vale su TUTTA la revenue
 * (confermato da Nicholas 15/10/2026, come la gamification dei compensi e le wage CP).
 * Il modo "progressivo" (fasce tipo IRPEF) resta nel calcolo ma non è usato.
 * "P% > X" come primo pezzo è letterale: sotto X la percentuale è zero.
 *
 */
import { normalizeTiers, tierFor, toNumber } from "./compensi-core.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** "25k" / "1,5k" / "130.000" / "65000" → dollari. */
function amount(s) {
  const m = String(s).trim().match(/^([\d.,]+)\s*(k)?$/i);
  if (!m) return null;
  let v = m[2] ? Number(m[1].replace(",", ".")) * 1000 : toNumber(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Testo del foglio → { tiers:[{fromUsd,pct}], warnings:[] }.
 * Ogni pezzo è "P% <= X" (fino a X), "P% > X" / "P% >= X" (sopra X) o "P% flat".
 * La soglia di partenza di un pezzo "fino a X" è il tetto del pezzo prima.
 */
export function parseDealText(text) {
  const warnings = [];
  const parts = String(text || "").split(/[;\n]+/).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
  const segs = [];
  for (const p of parts) {
    const m = p.match(/^([\d.,]+)\s*%\s*(flat|<=|≤|<|>=|≥|>)?\s*([\d.,]+\s*k?)?$/i);
    if (!m) { warnings.push(`non capito: «${p}»`); continue; }
    const pct = toNumber(m[1]) / 100;
    const op = (m[2] || "flat").toLowerCase();
    const amt = m[3] ? amount(m[3]) : null;
    if (op !== "flat" && amt === null) { warnings.push(`soglia mancante: «${p}»`); continue; }
    segs.push({ pct, op, amt });
  }
  const tiers = [];
  let prevUpper = 0;
  for (const s of segs) {
    if (s.op === "flat") { tiers.push({ fromUsd: 0, pct: s.pct }); continue; }
    if (s.op === "<=" || s.op === "≤" || s.op === "<") {
      tiers.push({ fromUsd: prevUpper, pct: s.pct });
      prevUpper = s.amt;
    } else {
      // "sopra X" letterale: sotto X non si prende nulla (per i sales manager vale il minimo garantito)
      tiers.push({ fromUsd: s.amt, pct: s.pct });
      prevUpper = s.amt;
    }
  }
  if (segs.length > 1 && segs.some((s) => s.op === "flat")) warnings.push("«flat» insieme ad altri scaglioni");
  return { tiers: normalizeTiers(tiers), warnings };
}

/** Testo leggibile degli scaglioni: "30% fino a 25.000$ · 35% sopra 25.000$". */
export function describeTiers(tiers) {
  const t = normalizeTiers(tiers);
  const p = (x) => `${(Math.round(x * 10000) / 100).toLocaleString("it-IT")}%`;
  const d = (x) => `${Math.round(x).toLocaleString("it-IT")}$`;
  if (t.length === 1 && t[0].fromUsd === 0) return `${p(t[0].pct)} flat`;
  if (t[0]?.fromUsd > 0) return t.map((x) => `${p(x.pct)} sopra ${d(x.fromUsd)}`).join(" · "); // sotto la prima soglia: zero
  return t.map((x, i) => {
    const next = t[i + 1];
    if (next) return x.fromUsd === 0 ? `${p(x.pct)} fino a ${d(next.fromUsd)}` : `${p(x.pct)} da ${d(x.fromUsd)} a ${d(next.fromUsd)}`;
    return `${p(x.pct)} sopra ${d(x.fromUsd)}`;
  }).join(" · ");
}

/** Quota HOC in dollari su una revenue. */
export function shareUsd(tiers, revenueUsd, mode = "raggiunto") {
  const rev = Math.max(0, Number(revenueUsd) || 0);
  const t = normalizeTiers(tiers);
  if (!rev || !t.length) return { usd: 0, pct: 0 };
  if (mode === "progressivo") {
    let usd = 0;
    t.forEach((x, i) => {
      const top = t[i + 1] ? t[i + 1].fromUsd : Infinity;
      const slice = Math.min(rev, top) - x.fromUsd;
      if (slice > 0) usd += slice * x.pct;
    });
    return { usd: round2(usd), pct: Math.round((usd / rev) * 1e6) / 1e6 };
  }
  // raggiunto: lo scaglione più alto con revenue > soglia, su tutto (tierFor dei compensi)
  const hit = tierFor(t, rev);
  return { usd: round2(rev * (hit?.pct || 0)), pct: hit?.pct || 0 };
}
