/**
 * GET /api/admin/infloww-reconcile?period_id=YYYY-MM
 *
 * Reconciliation Infloww ↔ CreatorsPro: usa la revenue reale di Infloww come
 * fonte INDIPENDENTE per capire se il "venduto" registrato in CP è completo.
 *
 *   - CP: somma dei takes (venduto attribuito agli operatori) per creator, dal
 *     KV wages del mese.
 *   - Infloww: lordo/netto per creator del mese, dagli aggregati KV (sync).
 *   - Match dei creator per nome+lingua, conservativo (mai fondere team
 *     diversi). Tie-break: nome Infloww SENZA sigla lingua = profilo ITA
 *     (pattern verificato sul roster: "Laura Sommaruga" vs "Laura ENG/ESP").
 *
 * CALIBRAZIONE (lug 2026, dati veri): il "venduto" CP = LORDO pagato dai fan
 * → si confronta col lordo Infloww. Baseline sano ratio ≈ 1.0 (Ottorini 0.98,
 * Iri 1.01, Fishball 0.95). Ratio ≪ 1 = buco CP (Elisa 0.63, Gaja 0.61).
 * Gli abbonamenti (~1-2% del lordo) non passano dagli operatori: tolleranza
 * fisiologica di qualche punto. Confronto DIREZIONALE, non contabile.
 *
 * COPERTURA (post-review adversariale): la finestra confrontabile è DERIVATA
 * DAI DATI Infloww presenti in KV (primo/ultimo giorno del mese, unione su
 * tutte le creator) e applicata a ENTRAMBE le fonti — gli shift CP fuori da
 * [day_min, day_max] sono esclusi. Se il mese non ha alcun giorno Infloww
 * (fuori finestra sync), la risposta è un esplicito needs_sync, MAI un
 * verdetto verde su dati inesistenti.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { readMonthlyByCreator } from "@/lib/infloww-sync-job";
import { fetchSocialTalentRevenue } from "@/lib/creatorspro-api";

export const maxDuration = 30;
const r2 = (x) => Math.round(x * 100) / 100;

// Abbinamenti MANUALI (persistenti): { [inflowwCreatorId]: cpAlias }.
// Per i casi che il matching automatico non può risolvere (nomi d'arte:
// "Eva Fischietto" ↔ "Eva Rizzoli - SILO_1", confermato da Nicholas lug 2026).
const OVERRIDES_KEY = "infloww:reconcile:overrides";

const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
function romeDay(x) {
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? null : romeDayFmt.format(d);
}

function normName(s) {
  // NFD scompone gli accenti (é → e + segno); il replace successivo toglie i segni.
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normLang(s) {
  const u = String(s || "").toUpperCase();
  if (/^(ESP|SPA|ES)$/.test(u)) return "ESP";
  if (/^(ENG|EN)$/.test(u)) return "EN";
  if (/^(ITA|IT)$/.test(u)) return "IT";
  return "";
}
// Infloww: "Laura ESP" → {tokens:["laura"], lang:"ESP"}; "Giulia ottorini" → {tokens, lang:""}
function parseInfloww(name) {
  const raw = String(name || "");
  const m = raw.match(/\b(ESP|ENG|ITA|EN|IT|ES|SPA)\s*$/i);
  let lang = "", base = raw;
  if (m) { lang = normLang(m[1]); base = raw.slice(0, m.index); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang };
}
// CP: "Giulia Ottorini - IT" → {tokens, lang:"IT"}; "Eva Rizzoli - SILO_1" →
// {tokens:["eva","rizzoli"], lang:"", tag:"SILO_1"} — il suffisso "- XXX" è
// SEMPRE un tag di team, mai parte del nome (i token spuri creavano fusioni).
function parseCp(alias) {
  const m = String(alias || "").match(/^(.*?)\s*[-–]\s*([A-Za-z0-9_]{2,12})\s*$/);
  let base = alias, lang = "", tag = "";
  if (m) { base = m[1]; tag = m[2]; lang = normLang(m[2]); }
  return { tokens: normName(base).split(" ").filter(Boolean), lang, tag };
}
// Primo nome compatibile anche con grafie unite/staccate ("Anna Rita" ↔
// "Annarita"): se i primi DUE token di un lato, uniti, combaciano col primo
// dell'altro, normalizza. Ritorna [tokensInf, tokensCp] o null.
function firstCompat(a, b) {
  if (a[0] === b[0]) return [a, b];
  if (a.length >= 2 && a[0] + a[1] === b[0]) return [[a[0] + a[1], ...a.slice(2)], b];
  if (b.length >= 2 && b[0] + b[1] === a[0]) return [a, [b[0] + b[1], ...b.slice(2)]];
  return null;
}
/**
 * Punteggio match Infloww↔CP. 0 = incompatibile. Regole (post-review):
 *  - primo nome DEVE combaciare (anche unito: "Anna Rita" ↔ "Annarita");
 *  - lingue esplicite diverse → MAI (0);
 *  - Infloww dichiara una lingua ma il CP no → 0 (niente fusioni alla cieca);
 *  - Infloww senza sigla → bonus al profilo IT (0.75) sopra le altre (0.5);
 *  - cognomi in conflitto ("Elisa Esposito" vs "Elisa Vimercati") → 0.
 */
function matchScore(inf, cp) {
  if (!inf.tokens.length || !cp.tokens.length) return 0;
  const fc = firstCompat(inf.tokens, cp.tokens);
  if (!fc) return 0;
  const [ti, tc] = fc;
  let score = 1;
  if (inf.lang && cp.lang) {
    if (inf.lang !== cp.lang) return 0;
    score += 1;
  } else if (inf.lang && !cp.lang) {
    return 0;
  } else if (!inf.lang && cp.lang === "IT") {
    score += 0.75;
  } else {
    score += 0.5;
  }
  const allInfInCp = ti.every((t) => tc.includes(t));
  const allCpInInf = tc.every((t) => ti.includes(t));
  if (!allInfInCp && !allCpInInf) return 0;
  if (allInfInCp) score += 1;
  return score;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });

  // ── Infloww: lordo/netto per creator del mese (da KV sync) ─────────
  const inf = await readMonthlyByCreator(periodId);
  if (inf.needs_sync) {
    return Response.json({ period_id: periodId, needs_sync: "infloww", reason: "never_synced" });
  }
  if (!inf.day_min) {
    // Mese senza alcun giorno Infloww in KV: fuori finestra di sync.
    return Response.json({
      period_id: periodId, needs_sync: "infloww", reason: "month_out_of_coverage",
      last_sync_at: inf.last_sync_at,
    });
  }

  // Finestra confrontabile = giorni Infloww realmente presenti per il mese.
  const coverageFrom = inf.day_min;
  const coverageTo = inf.day_max;
  const monthStart = `${periodId}-01`;
  const [y, m] = periodId.split("-").map(Number);
  const monthEnd = `${periodId}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const today = romeDay(Date.now());
  const expectedEnd = monthEnd < today ? monthEnd : today;
  const coveragePartial = coverageFrom > monthStart || coverageTo < expectedEnd;

  // ── CP: venduto per alias, SOLO shift dentro [coverageFrom, coverageTo] ──
  const wages = await kv.get(`cp:wages:${periodId}`);
  const cpAvailable = Array.isArray(wages) && wages.length > 0;
  if (!cpAvailable) {
    return Response.json({ period_id: periodId, needs_sync: "cp", coverage_from: coverageFrom, coverage_to: coverageTo, last_sync_at: inf.last_sync_at });
  }
  const cpByAlias = new Map();
  const aliasShifts = new Map(); // presenza nei turni (anche SENZA vendite attribuite)
  let cpUnattributed = 0; // venduto che non sappiamo attribuire a una creator
  // SENTINELLA PARSER (lezione del bug schema-takes, lug 2026): se i takes
  // GREZZI esistono (takes_count) ma il parser ne riconosce pochi, CP ha
  // probabilmente cambiato schema di nuovo → i numeri CP diventano inaffidabili
  // IN SILENZIO. Qui lo misuriamo e lo urliamo, invece di scoprirlo a valle.
  let takesRaw = 0, takesParsed = 0;
  for (const w of wages) {
    for (const s of w.shifts || []) {
      takesRaw += Number.isFinite(Number(s.takes_count)) ? Number(s.takes_count) : (s.takes || []).length;
      takesParsed += (s.takes || []).length;
      const day = s.started_at ? romeDay(s.started_at) : null;
      if (day && (day < coverageFrom || day > coverageTo)) continue; // stessi giorni su entrambe le fonti
      const aliases = s.creator_aliases || [];
      for (const a of aliases) aliasShifts.set(a, (aliasShifts.get(a) || 0) + 1);
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const isMono = aliases.length <= 1;
      const salesByAlias = new Map();
      for (const t of takes) {
        const amt = Number(t.amount) || 0;
        if (!t.creator_alias) { cpUnattributed += amt; continue; }
        salesByAlias.set(t.creator_alias, (salesByAlias.get(t.creator_alias) || 0) + amt);
      }
      if (salesByAlias.size === 0) {
        if (isMono && aliases[0]) salesByAlias.set(aliases[0], salesTotal);
        else if (salesTotal > 0) cpUnattributed += salesTotal; // multi-creator senza takes: non inventiamo attribuzioni
      }
      for (const [alias, sales] of salesByAlias.entries()) {
        cpByAlias.set(alias, (cpByAlias.get(alias) || 0) + sales);
      }
    }
  }
  // Pool di matching = TUTTI gli alias presenti nel mese (nei turni O nei
  // takes), con le vendite attribuite (anche $0). L'IDENTITÀ di una creator
  // non dipende dall'avere vendite: separare "chi è" da "quanto le è stato
  // attribuito" è ciò che permette di abbinare anche i casi 'takes mai
  // registrati' (Martina Scavo: 35 turni, $0) invece di nasconderli.
  const cpList = [...aliasShifts.entries()].map(([alias, n]) => ({
    alias, shifts: n, sales: r2(cpByAlias.get(alias) || 0), p: parseCp(alias),
  }));
  for (const [alias, sales] of cpByAlias.entries()) {
    if (!aliasShifts.has(alias)) cpList.push({ alias, shifts: 0, sales: r2(sales), p: parseCp(alias) });
  }
  const cpTotal = cpList.reduce((s, c) => s + c.sales, 0);

  // Solo creator Infloww attivi nel mese
  const infList = inf.creators
    .filter((c) => c.tx > 0)
    .map((c) => ({ ...c, p: parseInfloww(c.name) }));
  const infGrossTotal = infList.reduce((s, c) => s + c.gross, 0);
  const infNetTotal = infList.reduce((s, c) => s + c.net, 0);

  const usedInf = new Set(), usedCp = new Set();
  const matched = [];

  // ── 1. Abbinamenti MANUALI prima di tutto (vincono sull'automatico) ──
  const overrides = (await kv.get(OVERRIDES_KEY)) || {};
  for (const ic of infList) {
    const forced = overrides[ic.id];
    if (!forced) continue;
    usedInf.add(ic.id);
    const cc = cpList.find((c) => c.alias === forced);
    const sales = cc ? cc.sales : (aliasShifts.has(forced) ? 0 : null);
    if (sales === null) { usedInf.delete(ic.id); continue; } // alias non presente nel mese: torna al flusso normale
    usedCp.add(forced);
    matched.push({
      infloww_id: ic.id, infloww_name: ic.name, cp_alias: forced,
      cp_sales: sales, cp_shifts: aliasShifts.get(forced) || 0,
      infloww_gross: ic.gross, infloww_net: ic.net,
      ratio_cp_over_gross: ic.gross > 0 ? r2(sales / ic.gross) : null,
      gap_gross: r2(ic.gross - sales),
      truncated: ic.truncated || undefined,
      manual: true, score: null,
    });
  }

  // ── 2. Assegnazione GLOBALE per score (poi per volume): il punteggio più
  // alto vince l'alias, non il fatturato più grosso. Tie per lo stesso
  // profilo Infloww → non abbinare (conservativo).
  const pairs = [];
  for (const ic of infList) {
    if (usedInf.has(ic.id)) continue;
    for (const cc of cpList) {
      if (usedCp.has(cc.alias)) continue;
      const sc = matchScore(ic.p, cc.p);
      if (sc >= 1.5) pairs.push({ ic, cc, sc });
    }
  }
  pairs.sort((a, b) => b.sc - a.sc || b.ic.gross - a.ic.gross);
  for (const p of pairs) {
    if (usedInf.has(p.ic.id) || usedCp.has(p.cc.alias)) continue;
    const tie = pairs.some((q) => q !== p && q.ic.id === p.ic.id && q.sc === p.sc && !usedCp.has(q.cc.alias) && q.cc.alias !== p.cc.alias);
    usedInf.add(p.ic.id);
    if (tie) continue; // ambiguo: resta nei non abbinati
    usedCp.add(p.cc.alias);
    matched.push({
      infloww_id: p.ic.id,
      infloww_name: p.ic.name,
      cp_alias: p.cc.alias,
      cp_sales: p.cc.sales,
      cp_shifts: p.cc.shifts || 0,
      infloww_gross: p.ic.gross,
      infloww_net: p.ic.net,
      ratio_cp_over_gross: p.ic.gross > 0 ? r2(p.cc.sales / p.ic.gross) : null,
      gap_gross: r2(p.ic.gross - p.cc.sales),
      truncated: p.ic.truncated || undefined,
      score: p.sc,
    });
  }
  matched.sort((a, b) => b.infloww_gross - a.infloww_gross);

  // Con il pool unificato (identità ≠ vendite), i profili Infloww rimasti
  // qui sono SENZA ALCUNA traccia CP nel mese: né turni né takes. Gli ultimi
  // si chiudono a mano col "collega a…" (override persistente).
  const unmatchedInf = infList.filter((c) => !matched.some((mm) => mm.infloww_id === c.id))
    .map((c) => ({ id: c.id, name: c.name, userName: c.userName, gross: c.gross, truncated: c.truncated || undefined }))
    .sort((a, b) => b.gross - a.gross);
  const unmatchedCp = cpList.filter((c) => !usedCp.has(c.alias))
    .map((c) => ({ alias: c.alias, sales: c.sales, shifts: c.shifts })).sort((a, b) => b.sales - a.sales || b.shifts - a.shifts);

  // ── TERZA FONTE: Social Analytics CP (best-effort, mai bloccante) ────
  // fansites[].alias è l'alias buste ESATTO → mapping autoritativo per-account.
  // La revenue analytics è NETTA (post-OF 20%, calibrato lug 2026: totale
  // social $500k vs Infloww netto $523k ≈ 0.96): l'API la converte in LORDO
  // equivalente (÷0.8) per confrontarla con venduto CP e lordo Infloww.
  let thirdSource = { available: false };
  const socialByAlias = new Map();
  const socialTalents = [];
  // Confini in ORA DI ROMA (le altre due fonti contano i giorni Rome-day):
  // mezzanotte di coverageFrom → mezzanotte del giorno dopo coverageTo − 1s.
  const romeMidnightIso = (dayStr) => {
    let d = new Date(`${dayStr}T00:00:00+02:00`);
    if (romeDay(d) !== dayStr) d = new Date(`${dayStr}T00:00:00+01:00`);
    return d;
  };
  const dayAfterTo = new Date(Date.parse(`${coverageTo}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  try {
    const soc = await fetchSocialTalentRevenue({
      startDate: romeMidnightIso(coverageFrom).toISOString(),
      endDate: new Date(romeMidnightIso(dayAfterTo).getTime() - 1000).toISOString(),
      limit: 100,
    });
    const talents = soc?.data?.talents ?? soc?.talents ?? [];
    let totNet = 0;
    for (const t of talents) {
      const tNet = t?.metrics?.["onlyfans-revenue"]?.value;
      if (Number.isFinite(tNet)) totNet += tNet;
      socialTalents.push({ name: t.name, net: Number.isFinite(tNet) ? r2(tNet) : null, p: parseInfloww(t.name || "") });
      for (const f of t.fansites || []) {
        const fNet = f?.metrics?.["onlyfans-revenue"]?.value;
        if (f.alias) socialByAlias.set(f.alias, { talent: t.name, net: Number.isFinite(fNet) ? r2(fNet) : null });
      }
    }
    thirdSource = { available: true, total_net: r2(totNet), total_gross_eq: r2(totNet / 0.8), talents: talents.length };
  } catch (e) {
    thirdSource = { available: false, error: String(e?.message || e).slice(0, 120) };
  }

  // Arricchisci le righe abbinate: lordo-equivalente analytics per alias +
  // concordanza con Infloww (le due fonti INDIPENDENTI: se concordano e i
  // turni no, il buco è certificato due volte; se analytics ≫ Infloww, è
  // INFLOWW a perdere dati — caso "account scollegato").
  if (thirdSource.available) {
    for (const mm of matched) {
      const s = socialByAlias.get(mm.cp_alias);
      if (s && s.net != null) {
        mm.social_gross_eq = r2(s.net / 0.8);
        mm.social_talent = s.talent;
        // Righe troncate: il gross Infloww è dichiaratamente sottostimato →
        // il confronto gonfierebbe "analytics > Infloww". Niente verdetto.
        mm.social_vs_infloww = (!mm.truncated && mm.infloww_gross > 0) ? r2(mm.social_gross_eq / mm.infloww_gross) : null;
      }
    }
    // Anche i profili senza abbinamento: l'analytics li vede? I nomi TALENT
    // aggregano tutte le lingue e non hanno mai sigla → il confronto qui è
    // SENZA regole-lingua ("Elisa ENG" deve poter trovare "Elisa Esposito"):
    // solo primo nome compatibile + cognomi non in conflitto. Best-score con
    // tie-guard (mai il primo che capita).
    const talentNameScore = (infP, talP) => {
      if (!infP.tokens.length || !talP.tokens.length) return 0;
      const fc = firstCompat(infP.tokens, talP.tokens);
      if (!fc) return 0;
      const [ti, tt] = fc;
      const a = ti.every((t) => tt.includes(t));
      const b = tt.every((t) => ti.includes(t));
      if (!a && !b) return 0;
      return 1 + (a ? 1 : 0);
    };
    for (const u of unmatchedInf) {
      const up = parseInfloww(u.name);
      let best = null, bestScore = 0, tie = false;
      for (const st of socialTalents) {
        if (st.net == null) continue;
        const sc = talentNameScore(up, st.p);
        if (sc > bestScore) { best = st; bestScore = sc; tie = false; }
        else if (sc === bestScore && sc > 0 && best && st.name !== best.name) tie = true;
      }
      if (best && bestScore >= 1 && !tie) {
        // NB: valore a livello PERSONA (tutti gli account del talent), non
        // per-account: la UI lo dichiara. Serve solo come conferma di esistenza.
        u.social = { talent: best.name, gross_eq: r2(best.net / 0.8), level: "talent" };
      }
    }
    for (const c of unmatchedCp) {
      const s = socialByAlias.get(c.alias);
      if (s) c.talent = s.talent;
    }
  }

  const matchedCpSales = matched.reduce((s, mm) => s + mm.cp_sales, 0);
  const matchedInfGross = matched.reduce((s, mm) => s + mm.infloww_gross, 0);
  const compared = matched.filter((mm) => mm.social_vs_infloww != null);
  if (thirdSource.available) {
    thirdSource.compared = compared.length;
    thirdSource.agree = compared.filter((mm) => mm.social_vs_infloww >= 0.85 && mm.social_vs_infloww <= 1.15).length;
  }

  return Response.json({
    period_id: periodId,
    last_sync_at: inf.last_sync_at,
    failed_creators: inf.failed_creators || [],
    coverage_from: coverageFrom,
    coverage_to: coverageTo,
    coverage_partial: coveragePartial,
    agency: {
      cp_sales_total: r2(cpTotal),
      cp_unattributed: r2(cpUnattributed),
      infloww_gross_total: r2(infGrossTotal),
      infloww_net_total: r2(infNetTotal),
      // rapporti sui soli abbinati (confronto pulito)
      matched_cp_sales: r2(matchedCpSales),
      matched_infloww_gross: r2(matchedInfGross),
      ratio_cp_over_infgross_matched: matchedInfGross > 0 ? r2(matchedCpSales / matchedInfGross) : null,
    },
    counts: { infloww_active: infList.length, cp_aliases: cpList.length, matched: matched.length, unmatched_infloww: unmatchedInf.length, unmatched_cp: unmatchedCp.length },
    // Copertura abbinamenti: quota di profili e di lordo reale che ha una casa. Obiettivo: 100%.
    match_coverage: {
      profiles: infList.length > 0 ? r2(matched.length / infList.length) : null,
      gross_share: infGrossTotal > 0 ? r2(matchedInfGross / infGrossTotal) : null,
    },
    third_source: thirdSource,
    // Salute della pipeline: quota di takes grezzi che il parser riconosce.
    // REJECTED/senza-creator fanno scendere un po' sotto 1.0: sano ≥ 0.7.
    data_quality: {
      takes_raw: takesRaw,
      takes_parsed: takesParsed,
      parse_rate: takesRaw > 0 ? r2(takesParsed / takesRaw) : null,
      parser_warning: takesRaw >= 100 && takesParsed / takesRaw < 0.7,
    },
    matched,
    unmatched_infloww: unmatchedInf,
    unmatched_cp: unmatchedCp,
  });
}

/**
 * PUT body { infloww_id, infloww_name?, cp_alias }
 *   cp_alias stringa → salva l'abbinamento manuale; null → lo rimuove.
 * Persistente (niente TTL), audit-logged.
 */
export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const inflowwId = String(body?.infloww_id || "").trim();
  const cpAlias = body?.cp_alias === null ? null : String(body?.cp_alias || "").trim();
  if (!inflowwId) return Response.json({ error: "infloww_id richiesto" }, { status: 400 });
  if (cpAlias === "") return Response.json({ error: "cp_alias stringa non vuota, oppure null per rimuovere" }, { status: 400 });

  const overrides = (await kv.get(OVERRIDES_KEY)) || {};
  const prev = overrides[inflowwId] || null;
  if (cpAlias) overrides[inflowwId] = cpAlias;
  else delete overrides[inflowwId];
  await kv.set(OVERRIDES_KEY, overrides);

  await logAuditAction({
    action: cpAlias ? "infloww.reconcile.override.set" : "infloww.reconcile.override.remove",
    target: body?.infloww_name || inflowwId,
    by: az.userId,
    meta: { infloww_id: inflowwId, prev, next: cpAlias },
  });
  return Response.json({ ok: true, overrides_count: Object.keys(overrides).length });
}
