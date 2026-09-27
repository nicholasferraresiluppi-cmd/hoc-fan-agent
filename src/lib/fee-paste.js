/**
 * Import fee da un foglio incollato (P&L Live) — logica PURA, testata.
 * Ogni riga: "<creator> <sep> <percentuale>", separatori tab ; , o spazi.
 * Percentuale: "50", "50%", "50,5", "0.5" (≤1 = frazione).
 * Il nome si abbina agli alias CP ignorando maiuscole, accenti e il suffisso
 * lingua ("- IT", "- EN"…): "Gaja Bertolin 40" vale per Gaja IT e Gaja EN,
 * perché il deal è della creator, non del profilo.
 */
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\s*-\s*(it|ita|en|eng|es|esp|de|fr)\b.*$/i, "").replace(/[^a-z0-9]+/g, " ").trim();

export function parsePercent(raw) {
  let t = String(raw || "").trim().replace("%", "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  let v = Number(t);
  if (v > 1) v = v / 100;
  return v >= 0 && v <= 1 ? Math.round(v * 10000) / 10000 : null;
}

export function parseFeePaste(text, aliases) {
  const byNorm = {};
  for (const a of aliases) (byNorm[norm(a)] ||= []).push(a);
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const m = l.match(/^(.*?)[\t;,\s]+(\d+(?:[.,]\d+)?\s*%?)\s*$/);
    if (!m) { out.push({ line: l, error: "manca la percentuale" }); continue; }
    const fee = parsePercent(m[2]);
    if (fee == null) { out.push({ line: l, error: "percentuale non valida" }); continue; }
    const n = norm(m[1]);
    let matched = byNorm[n] || [];
    if (!matched.length && n.length >= 4) matched = aliases.filter((a) => norm(a).startsWith(n) || n.startsWith(norm(a)));
    out.push(matched.length ? { line: l, name: m[1].trim(), fee_pct: fee, aliases: matched } : { line: l, name: m[1].trim(), fee_pct: fee, error: "creator non trovata" });
  }
  return out;
}
