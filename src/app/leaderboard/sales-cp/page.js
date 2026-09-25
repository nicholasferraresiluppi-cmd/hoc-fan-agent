"use client";

// Sales CP (redesign 25/09/2026, struttura del pilota Calendario compensi).
// Domanda della pagina: "chi sta andando bene e chi va rivisto questo mese?".
// Numero principale (score medio) col confronto → filtri rapidi (da rivedere,
// in calo, in crescita, pochi turni) + ricerca → tabella ordinabile con la
// variazione sul mese prima e la creator principale (la colonna Group era vuota
// per quasi tutti) → dietro sezioni richiudibili: senza dati CP, strumenti.
// Colonne Infloww mostrate solo se l'import del mese c'è (erano "—" ovunque).
// Lo score NON cambia: la pagina legge /api/leaderboard/sales-cp come prima.
import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { Info, Search, Loader2, CheckCircle2, XCircle, Wrench, ShieldCheck, Languages, Tags, RefreshCw, Link2, UserX } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import ScoreTutorialModal from "@/components/ScoreTutorialModal";
import { useSmartPeriod } from "@/lib/use-smart-period";
import { fmt$, fmtInt, fmtDelta, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Disclosure, DataTable, Notice, card, NUM } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};

const MIN_SHIFTS = 5;        // come il backend dell'Action Center
const REVIEW_SCORE = 25;     // soglia "da rivedere" (score ≤ 25 con ≥ 5 turni)
const MOVE_PTS = 10;         // variazione che conta come crescita/calo

// Fasce: il colore porta solo il segnale (verde = sopra, rosso = da guardare)
function tierColor(t) {
  if (t === "Elite" || t === "Strong") return CP.accentGreen;
  if (t === "Weak" || t === "Critical") return CP.accentRed;
  return CP.textSecondary;
}
const fmtScore = (v) => (v == null ? "—" : v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtPtsDelta = (d) => (d == null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("it-IT", { maximumFractionDigits: 1 })}`);

function monthOptions(n = 18) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` };
  });
}
function prevMonthId(pid) {
  if (!pid) return null;
  const [y, m] = pid.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalesCpLeaderboardPage() {
  const [periodId, setPeriodId] = useSmartPeriod();
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [noCpOpen, setNoCpOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [recheckState, setRecheckState] = useState({});
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0, recovered: 0, errors: 0 });

  const periodOptions = useMemo(() => monthOptions(), []);
  const prevId = prevMonthId(periodId);
  const qs = (pid) => {
    const p = new URLSearchParams({ period_id: pid });
    if (category) p.set("category", category);
    if (language) p.set("language", language);
    return p.toString();
  };
  const url = periodId ? `/api/leaderboard/sales-cp?${qs(periodId)}` : null;
  const { data, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: prev } = useSWR(prevId ? `/api/leaderboard/sales-cp?${qs(prevId)}` : null, fetcher, { revalidateOnFocus: false });
  const { data: infw } = useSWR(periodId ? `/api/leaderboard/operational?period_type=monthly&period_id=${periodId}` : null, fetcher, { revalidateOnFocus: false });

  const ranking = data?.ranking || [];
  const prevScore = useMemo(() => {
    const m = new Map();
    for (const r of prev?.ranking || []) if (r.score > 0) m.set(r.employee, r.score);
    return m;
  }, [prev]);
  const infwScore = useMemo(() => {
    const m = new Map();
    for (const r of infw?.ranking || []) if (r.employee && r.score != null) m.set(r.employee, r.score);
    return m;
  }, [infw]);

  const rows = useMemo(() => ranking.filter((r) => r.score > 0).map((r) => {
    const shifts = r.cp_aggregates?.total_shifts || 0;
    const p = prevScore.get(r.employee);
    return {
      ...r, id: r.employee, shifts,
      sales: r.cp_aggregates?.total_sales || 0,
      perShift: r._kpis_cp?.sales_per_shift ?? null,
      perHour: r._kpis_cp?.sales_per_hour ?? null,
      delta: p != null ? r.score - p : null,
      topCreator: r.cp_breakdown?.top_creator || null,
      otherCreators: Math.max(0, (r.cp_breakdown?.total_creators || 0) - 1),
      infw: infwScore.get(r.employee) ?? null,
      review: r.score <= REVIEW_SCORE && shifts >= MIN_SHIFTS,
      thin: shifts < MIN_SHIFTS,
    };
  }), [ranking, prevScore, infwScore]);
  const noCp = ranking.filter((r) => !r.has_cp_data || !(r.score > 0));

  const counts = {
    review: rows.filter((r) => r.review).length,
    down: rows.filter((r) => r.delta != null && r.delta <= -MOVE_PTS).length,
    up: rows.filter((r) => r.delta != null && r.delta >= MOVE_PTS).length,
    thin: rows.filter((r) => r.thin).length,
  };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (needle && !`${r.employee} ${r.topCreator || ""}`.toLowerCase().includes(needle)) return false;
    if (view === "review") return r.review;
    if (view === "down") return r.delta != null && r.delta <= -MOVE_PTS;
    if (view === "up") return r.delta != null && r.delta >= MOVE_PTS;
    if (view === "thin") return r.thin;
    return true;
  });
  const hasInfw = rows.some((r) => r.infw != null);

  async function recheck(employee) {
    setRecheckState((s) => ({ ...s, [employee]: { state: "loading" } }));
    try {
      const res = await fetch("/api/admin/wage-recheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period_id: periodId, employee }) });
      const j = await res.json();
      if (!res.ok || j.ok === false) {
        setRecheckState((s) => ({ ...s, [employee]: { state: "error", message: j.error || j.message || "Errore" } }));
        return { error: true };
      }
      setRecheckState((s) => ({ ...s, [employee]: { state: "success", message: j.message, added: j.added_to_kv } }));
      return { added: j.added_to_kv || 0 };
    } catch (e) {
      setRecheckState((s) => ({ ...s, [employee]: { state: "error", message: e.message } }));
      return { error: true };
    }
  }
  async function recheckAll() {
    if (bulk.running) return;
    const emps = noCp.map((o) => o.employee).filter((e) => e && recheckState[e]?.state !== "success");
    if (!emps.length || !confirm(`Cercare di nuovo in CreatorsPro ${emps.length} operatori?`)) return;
    let done = 0, recovered = 0, errors = 0;
    setBulk({ running: true, done, total: emps.length, recovered, errors });
    for (let i = 0; i < emps.length; i += 5) {
      const res = await Promise.all(emps.slice(i, i + 5).map(recheck));
      for (const r of res) { done++; if (r.error) errors++; else if (r.added > 0) recovered++; }
      setBulk({ running: true, done, total: emps.length, recovered, errors });
    }
    setBulk({ running: false, done, total: emps.length, recovered, errors });
    if (recovered > 0) setTimeout(() => mutate(url), 800);
  }

  const columns = [
    { key: "rank", label: "#", align: "right", sort: (r) => r.rank, muted: true, render: (r) => r.rank },
    { key: "employee", label: "Operatore", render: (r) => (
      <Link href={`/leaderboard/operational/${encodeURIComponent(r.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{r.employee}</Link>
    ) },
    { key: "topCreator", label: "Creator principale", muted: true, render: (r) => r.topCreator ? <span>{r.topCreator}{r.otherCreators > 0 && <span style={{ color: CP.textMuted }}> +{r.otherCreators}</span>}</span> : "—" },
    { key: "score", label: "Score", align: "right", render: (r) => (
      <span title={r.tier || ""} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: tierColor(r.tier) }} />
        <span style={{ fontWeight: 500 }}>{fmtScore(r.score)}</span>
      </span>
    ) },
    { key: "tier", label: "Fascia", muted: true, sort: (r) => r.score, render: (r) => <span style={{ color: tierColor(r.tier) === CP.textSecondary ? CP.textSecondary : tierColor(r.tier) }}>{r.tier || "—"}</span> },
    { key: "delta", label: "Sul mese prima", align: "right", render: (r) => (
      <span style={{ color: r.delta == null ? CP.textMuted : r.delta <= -MOVE_PTS ? CP.accentRed : r.delta >= MOVE_PTS ? CP.accentGreen : CP.textSecondary }}>{r.delta == null ? "nuovo" : fmtPtsDelta(r.delta)}</span>
    ) },
    { key: "sales", label: "Venduto", align: "right", render: (r) => fmt$(r.sales) },
    { key: "perShift", label: "Per turno", align: "right", render: (r) => fmt$(r.perShift) },
    { key: "shifts", label: "Turni", align: "right", render: (r) => <span style={{ color: r.thin ? CP.textMuted : CP.textPrimary }} title={r.thin ? "Meno di 5 turni: score poco affidabile" : ""}>{r.shifts}{r.thin ? " ·" : ""}</span> },
    { key: "perHour", label: "Per ora", align: "right", render: (r) => fmt$(r.perHour) },
    ...(hasInfw ? [{ key: "infw", label: "Score Infloww", align: "right", muted: true, render: (r) => fmtScore(r.infw) }] : []),
  ];

  const monthLabel = periodOptions.find((p) => p.value === periodId)?.label || periodId;
  const prevLabel = prevId ? MONTHS_IT[Number(prevId.slice(5)) - 1] : "";
  const agency = data?.agency;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Sales CP" }]}
        title="Sales CP"
        subtitle="Chi sta andando bene e chi va rivisto. Lo score (0-100) confronta il venduto reale di CreatorsPro di ogni operatore con chi lavora sulle stesse creator (70%) e con tutta l'agenzia (30%)."
        actions={<>
          <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese"
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body }}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => setTutorialOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, cursor: "pointer", fontFamily: FONTS.body }}>
            <Info size={14} /> Come si calcola
          </button>
        </>}
      />
      {tutorialOpen && <ScoreTutorialModal onClose={() => setTutorialOpen(false)} />}

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && (
        <Notice danger>{data.error} <Link href="/admin/creatorspro-sync" style={{ color: CP.accentSoftText }}>Vai al sync CP →</Link></Notice>
      )}

      {data && !data.error && (<>
        <HeroMetric
          label={`Score medio agenzia · ${monthLabel}`}
          value={fmtScore(data.avg_score)}
          compare={prev?.avg_score ? `${prevLabel}: ${fmtScore(prev.avg_score)} (${fmtPtsDelta(data.avg_score - prev.avg_score)} punti)` : null}
          hint="Media degli operatori in classifica. Lo score è relativo: la media resta vicina a 50 per costruzione, conta chi si sposta."
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="In classifica" value={fmtInt(data.eligible_total)} delta={fmtDelta(data.eligible_total, prev?.eligible_total)} />
            <Metric label="Venduto" value={fmt$(agency?.total_sales)} note={`${fmtInt(agency?.total_shifts)} turni`} />
            <Metric label="Venduto per turno" value={fmt$(agency?.avg_sales_per_shift)} delta={fmtDelta(agency?.avg_sales_per_shift, prev?.agency?.avg_sales_per_shift)} />
            <div>
              <Metric label="Da rivedere" value={fmtInt(counts.review)} danger={counts.review > 0} note={`score ≤ ${REVIEW_SCORE}, almeno ${MIN_SHIFTS} turni`} />
              {counts.review > 0 && <Link href={`/admin/action-center?period_id=${periodId}`} style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>Apri Action Center →</Link>}
            </div>
          </div>
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <FilterChip label={`Tutti (${rows.length})`} active={view === "all"} onClick={() => setView("all")} />
          <FilterChip label={`Da rivedere (${counts.review})`} danger={counts.review > 0} active={view === "review"} disabled={!counts.review} onClick={() => setView(view === "review" ? "all" : "review")} />
          <FilterChip label={`In calo (${counts.down})`} active={view === "down"} disabled={!counts.down} onClick={() => setView(view === "down" ? "all" : "down")} />
          <FilterChip label={`In crescita (${counts.up})`} active={view === "up"} disabled={!counts.up} onClick={() => setView(view === "up" ? "all" : "up")} />
          <FilterChip label={`Pochi turni (${counts.thin})`} active={view === "thin"} disabled={!counts.thin} onClick={() => setView(view === "thin" ? "all" : "thin")} />
          <span style={{ flex: 1 }} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria creator" style={selStyle}>
            <option value="">Tutte le categorie</option><option value="Big">Big</option><option value="Medium">Medium</option><option value="Small">Small</option><option value="Uncategorized">Senza categoria</option>
          </select>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Lingua" style={selStyle}>
            <option value="">Tutte le lingue</option><option value="ita">Italiano</option><option value="eng">Inglese</option><option value="none">Senza lingua</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", border: `1px solid ${CP.border}`, borderRadius: 8, background: CP.surface, width: 240 }}>
            <Search size={14} color={CP.textMuted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca operatore o creator" aria-label="Cerca operatore o creator"
              style={{ border: "none", outline: "none", background: "transparent", color: CP.textPrimary, fontSize: 14, width: "100%", fontFamily: FONTS.body }} />
          </label>
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
          “Sul mese prima” = punti di score rispetto a {prevLabel || "il mese precedente"}; in rosso/verde chi si è spostato di almeno {MOVE_PTS}. Il pallino indica la fascia. Clic sul nome per la scheda operatore.
        </div>

        <div style={{ marginBottom: 14 }}>
          <DataTable columns={columns} rows={shown} defaultSort={{ key: "rank", dir: 1 }} minWidth={980} maxHeight="calc(100vh - 120px)"
            empty={needle ? `Nessun operatore corrisponde a “${q}”.` : "Nessun operatore in questa vista."} />
        </div>

        {noCp.length > 0 && (
          <Disclosure open={noCpOpen} onToggle={() => setNoCpOpen((v) => !v)} icon={<UserX size={15} />}
            title={`${noCp.length} operatori senza score`} summary="non collegati a CreatorsPro o sotto i turni minimi su ogni creator">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10, fontSize: 13, color: CP.textSecondary }}>
              <span style={{ flex: 1, minWidth: 260 }}>Per chi non è collegato, “Cerca in CP” prova a recuperare i turni direttamente da CreatorsPro.</span>
              <button onClick={recheckAll} disabled={bulk.running}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: bulk.running ? "wait" : "pointer", fontFamily: FONTS.body }}>
                {bulk.running ? <><Loader2 size={13} className="animate-spin" /> {bulk.done}/{bulk.total} · {bulk.recovered} recuperati</> : <><Search size={13} /> Cerca tutti in CP</>}
              </button>
            </div>
            {!bulk.running && bulk.done > 0 && (
              <div style={{ fontSize: 13, color: bulk.recovered ? CP.accentGreen : CP.textSecondary, marginBottom: 10 }}>
                Fatto: {bulk.done} controllati, {bulk.recovered} recuperati, {bulk.errors} errori.
              </div>
            )}
            <div style={{ ...card, overflow: "hidden" }}>
              {noCp.map((op) => {
                const st = recheckState[op.employee];
                const reason = op._excluded_reason === "low_confidence_all_creators" ? `meno di 3 turni su ogni creator (${op.cp_aggregates?.total_shifts || 0} turni in tutto)` : "non collegato a CreatorsPro";
                return (
                  <div key={op.employee} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14, flexWrap: "wrap" }}>
                    <span style={{ flex: "1 1 200px", color: CP.textPrimary }}>{op.employee}</span>
                    <span style={{ flex: "2 1 260px", fontSize: 13, color: st?.state === "error" ? CP.accentRed : st?.state === "success" ? CP.accentGreen : CP.textMuted }}>{st?.message || reason}</span>
                    <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                      {st?.state === "loading" ? <Loader2 size={14} className="animate-spin" color={CP.textMuted} />
                        : st?.state === "success" ? <CheckCircle2 size={14} color={CP.accentGreen} />
                        : <button onClick={() => recheck(op.employee)} style={linkBtn}>{st?.state === "error" ? <><XCircle size={13} /> Riprova</> : "Cerca in CP"}</button>}
                      <Link href={`/admin/debug-mapping?employee=${encodeURIComponent(op.employee)}`} style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>Perché?</Link>
                    </span>
                  </div>
                );
              })}
            </div>
          </Disclosure>
        )}

        <Disclosure open={toolsOpen} onToggle={() => setToolsOpen((v) => !v)} icon={<Wrench size={15} />}
          title="Un dato non torna?" summary="sync CreatorsPro, collegamento operatori, categorie e lingue dei gruppi">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {[
              { href: "/admin/wage-audit", icon: ShieldCheck, label: "Sync e verifica CP", hint: "turni o paghe mancanti in un mese" },
              { href: "/admin/creatorspro-sync", icon: RefreshCw, label: "Sync CP", hint: "rifai il sync del venduto" },
              { href: "/admin/debug-mapping", icon: Link2, label: "Collegamento operatori", hint: "operatori senza match in CP" },
              { href: "/admin/group-categories", icon: Tags, label: "Categorie gruppi", hint: "Big / Medium / Small" },
              { href: "/admin/group-languages", icon: Languages, label: "Lingue gruppi", hint: "italiano / inglese" },
            ].map((it) => (
              <Link key={it.href + it.label} href={it.href} style={{ display: "flex", gap: 10, padding: "10px 12px", ...card, textDecoration: "none", color: CP.textPrimary }}>
                <it.icon size={15} color={CP.textMuted} style={{ marginTop: 2, flexShrink: 0 }} />
                <span><span style={{ fontSize: 14, display: "block" }}>{it.label}</span><span style={{ fontSize: 12, color: CP.textMuted }}>{it.hint}</span></span>
              </Link>
            ))}
          </div>
        </Disclosure>
        <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>
          {fmtInt(data.eligible_total)} operatori in classifica{data.no_cp_count ? ` · ${fmtInt(data.no_cp_count)} senza dati CP` : ""}. Aggiornamento dei dati: sync automatico notturno da CreatorsPro.
        </div>
      </>)}
    </div>
  );
}

const selStyle = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body };
const linkBtn = { display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
