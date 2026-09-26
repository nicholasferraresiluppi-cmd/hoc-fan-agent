"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, Download } from "lucide-react";
import { CP, FONTS, creatorDotColor, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, DataTable, card, NUM } from "@/components/ds";
import { fmtInt } from "@/lib/format";

/**
 * /admin/attribution-drilldown — Recupero takes: la lista NOMINALE dei turni
 * senza vendite attribuite per una creator. Da girare al team lead per il
 * backfill in CP: chi, quando, quanto ha venduto il turno, quanto manca.
 */

const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 13) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " · in corso" : ""}` });
  }
  return out;
}
const fmtDay = (iso) => { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}`; };

export default function AttributionDrilldownPage() {
  const periods = useMemo(() => monthOpts(), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [alias, setAlias] = useState("");
  const [inflowwId, setInflowwId] = useState("");
  const [aliases, setAliases] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Preselect da query (?alias=&period_id=&infloww_id=) — arrivo dal Controllo dati CP
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("period_id")) setPeriodId(q.get("period_id"));
    if (q.get("alias")) setAlias(q.get("alias"));
    if (q.get("infloww_id")) setInflowwId(q.get("infloww_id") || "");
  }, []);

  // Alias disponibili per il mese (per il selettore)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/creator-aliases?period_id=${periodId}`);
        const j = await r.json();
        setAliases(j.aliases || []);
      } catch { setAliases([]); }
    })();
  }, [periodId]);

  async function load() {
    if (!alias) return;
    setLoading(true); setError(null); setData(null);
    try {
      const qs = new URLSearchParams({ period_id: periodId, alias });
      if (inflowwId) qs.set("infloww_id", inflowwId);
      const r = await fetch(`/api/admin/attribution-drilldown?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [alias, periodId, inflowwId]);

  const t = data?.totals;
  const maxDayVal = useMemo(() => Math.max(1, ...(data?.days || []).map((d) => Math.max(d.infloww_gross || 0, d.cp_mine || 0))), [data]);
  const csvHref = alias ? `/api/admin/attribution-drilldown?${new URLSearchParams({ period_id: periodId, alias, format: "csv", ...(inflowwId ? { infloww_id: inflowwId } : {}) })}` : null;

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/TL/UX): aperta dal menu la
  // pagina era bianca con due tendine; "takes" non spiegato; il flusso di recupero
  // (5 passi) sepolto nel "come si legge". Ora: scelta creator con un clic, il
  // numero principale è quanti turni sono da recuperare, il flusso è in vista,
  // filtro "da recuperare" sulla tabella turni.
  const [onlyMissing, setOnlyMissing] = useState(false);
  const periodLabel = periods.find((p) => p.value === periodId)?.label || periodId;
  const shiftRows = (data?.shifts || []).map((s, i) => ({ ...s, id: `${s.day}-${s.start}-${s.operator}-${i}` }));
  const shownShifts = onlyMissing ? shiftRows.filter((s) => s.no_takes) : shiftRows;
  const shiftCols = [
    { key: "day", label: "Data", render: (s) => fmtDay(s.day) },
    { key: "start", label: "Orario", muted: true, render: (s) => `${s.start}${s.end ? `–${s.end}` : ""}` },
    { key: "operator", label: "Operatore", render: (s) => (
      <span style={{ fontWeight: 500 }}>{s.operator}{s.no_takes && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: CP.accentRed }}>da recuperare</span>}</span>
    ) },
    { key: "team", label: "Team del turno", sortable: false, render: (s) => (
      <span style={{ fontSize: 12, color: CP.textMuted }}>
        {s.team.length === 0 ? "solo lei" : s.team.map((a) => (
          <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: creatorDotColor(a), display: "inline-block" }} />{a.replace(/\s*-\s*\w+$/, "")}
          </span>
        ))}
      </span>
    ) },
    { key: "total_shift", label: "Venduto turno", align: "right", render: (s) => fmt$(s.total_shift) },
    { key: "mine", label: "A lei", align: "right", render: (s) => <span style={{ fontWeight: 500, color: s.no_takes ? CP.accentRed : CP.textPrimary }}>{fmt$(s.mine)}</span> },
    { key: "others", label: "Ad altre", align: "right", muted: true, render: (s) => fmt$(s.others) },
    { key: "unattributed", label: "A nessuna", align: "right", muted: true, render: (s) => (s.unattributed > 0 ? fmt$(s.unattributed) : "—") },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Controllo dati CP", href: "/admin/infloww-reconcile" }, { label: "Recupero vendite non registrate" }]}
        title="Recupero vendite non registrate"
        subtitle="Per una creator e un mese: i turni in cui il team ha venduto ma in CP non risulta nessuna vendita a suo nome (takes). Scarichi la lista e la giri al team lead, che le registra in CP."
        actions={<>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...ctl, minWidth: 180, cursor: "pointer" }} aria-label="Mese">
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={alias} onChange={(e) => { setAlias(e.target.value); setInflowwId(""); }} style={{ ...ctl, minWidth: 220, cursor: "pointer" }} aria-label="Creator (nome nei turni CP)">
            <option value="">Scegli la creator…</option>
            {aliases.map((a) => <option key={a.alias} value={a.alias}>{a.alias} · {a.shifts} turni</option>)}
          </select>
          {csvHref && data && (
            <a href={csvHref} style={btnPrimary}><Download size={14} /> CSV per il team lead</a>
          )}
        </>}
      />

      {/* Il flusso, sempre in vista: cosa si fa con questa pagina */}
      <section style={{ ...card, padding: "12px 16px", marginBottom: 14 }}>
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", gap: "6px 28px", flexWrap: "wrap", fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
          <li>Scarica il CSV dei turni da recuperare</li>
          <li>Il team lead verifica e registra le vendite in CP (anche a mese chiuso)</li>
          <li>Risincronizza il mese da <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Sync &amp; Audit CP</Link></li>
          <li><Link href="/admin/infloww-reconcile" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Controllo dati CP</Link> misura il recupero</li>
        </ol>
      </section>

      {error && <Notice danger>Non riesco a caricare i turni: {error}</Notice>}

      {!alias && !error && (
        <section style={{ ...card, padding: "18px 18px", marginBottom: 14 }}>
          <SectionTitle aside={periodLabel}>Scegli una creator</SectionTitle>
          <div style={{ fontSize: 13, color: CP.textSecondary, margin: "-4px 0 12px" }}>Di solito si arriva qui dal Controllo dati CP, col link “Turni” sulla creator con un buco. Puoi anche sceglierla da qui (nome usato nei turni CP):</div>
          {aliases.length === 0 ? (
            <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna creator con turni in CP per questo mese.</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {aliases.map((a) => <FilterChip key={a.alias} label={`${a.alias} · ${a.shifts}`} onClick={() => { setAlias(a.alias); setInflowwId(""); }} />)}
            </div>
          )}
        </section>
      )}

      {alias && loading && !data && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 14, padding: "20px 0" }}>
          <Loader2 size={16} className="animate-spin" /> Carico i turni di {alias}…
        </div>
      )}

      {data && (
        <>
          <HeroMetric
            label={`Turni da recuperare · ${alias} · ${periodLabel}`}
            value={<span style={{ color: t.shifts_no_takes > 0 ? CP.accentRed : CP.accentGreen }}>{fmtInt(t.shifts_no_takes)}</span>}
            compare={t.shifts_no_takes > 0 ? `su ${fmtInt(t.shifts)} turni del mese: il turno ha venduto, ma a lei in CP risulta $0` : `su ${fmtInt(t.shifts)} turni del mese: tutte le vendite sono registrate`}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Incasso reale (Infloww)" value={fmt$(t.infloww_gross)} note={t.infloww_gross == null ? "profilo Infloww non collegato" : "lordo, giorni del mese"} />
              <Metric label="Registrato a lei in CP" value={fmt$(t.attributed_mine)} danger={!(t.attributed_mine > 0)} />
              <Metric label="Venduto a nessuna creator" value={fmt$(t.unattributed_pool)} note="nei suoi turni, senza vendite registrate a nessuno del team" />
            </div>
          </HeroMetric>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 18, alignItems: "start" }}>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Quando mancano le vendite</SectionTitle>
              <div style={{ fontSize: 12, color: CP.textMuted, margin: "-4px 0 12px" }}>Barra viola = registrato a lei in CP · fondo rosso = incasso reale Infloww · a destra quanto manca nel giorno.</div>
              {(data.days || []).length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13 }}>Nessun giorno nel mese.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 520, overflow: "auto" }}>
                  {data.days.map((d) => (
                    <div key={d.day} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: CP.textSecondary, ...NUM }}>{fmtDay(d.day)}</span>
                      <div style={{ position: "relative", height: 14, background: CP.surfaceAlt, borderRadius: 4, overflow: "hidden" }}
                        title={`${d.day}: reale ${fmt$(d.infloww_gross)} · attribuito ${fmt$(d.cp_mine)}${d.gap != null ? ` · gap ${fmt$(d.gap)}` : ""} · ${d.shifts} turni (${d.shifts_no_takes} senza takes)`}>
                        {d.infloww_gross != null && (
                          <div style={{ position: "absolute", inset: 0, width: `${(d.infloww_gross / maxDayVal) * 100}%`, background: alpha(CP.accentRed, "40"), borderRadius: 4 }} />
                        )}
                        <div style={{ position: "absolute", inset: 0, width: `${((d.cp_mine || 0) / maxDayVal) * 100}%`, background: CP.accent, borderRadius: 4 }} />
                      </div>
                      <span style={{ color: d.gap > 0 ? CP.accentRed : CP.textMuted, minWidth: 76, textAlign: "right", ...NUM }}>
                        {d.gap != null ? (d.gap > 0 ? `−${fmt$(d.gap).slice(1)}` : "ok") : `${d.shifts} turni`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Con chi parlare</SectionTitle>
              <div style={{ fontSize: 12, color: CP.textMuted, margin: "-4px 0 12px" }}>Operatori per turni senza vendite registrate: è una lista di conversazioni, non di colpe. Spesso è il processo del team, non la singola persona.</div>
              {(data.operators || []).length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun operatore.</div>}
              {(data.operators || []).map((o) => (
                <div key={o.operator} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 13 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.operator}</span>
                  <span style={{ whiteSpace: "nowrap", color: o.shifts_no_takes > 0 ? CP.accentRed : CP.textMuted, ...NUM }}>
                    {o.shifts_no_takes} su {o.shifts} turni
                  </span>
                </div>
              ))}
            </section>
          </div>

          <SectionTitle aside={csvHref ? <a href={csvHref} style={{ color: CP.accentSoftText, textDecoration: "none" }}><Download size={12} style={{ verticalAlign: "-2px" }} /> scarica CSV</a> : null}>Turni del mese</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Tutti (${shiftRows.length})`} active={!onlyMissing} onClick={() => setOnlyMissing(false)} />
            <FilterChip label={`Da recuperare (${shiftRows.filter((s) => s.no_takes).length})`} danger={t.shifts_no_takes > 0} active={onlyMissing} onClick={() => setOnlyMissing(true)} disabled={!t.shifts_no_takes} />
          </div>
          <DataTable columns={shiftCols} rows={shownShifts} minWidth={900} maxHeight={620} empty={onlyMissing ? "Nessun turno da recuperare." : "Nessun turno per questa creator nel mese."} />
        </>
      )}
    </div>
  );
}

const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, color: CP.accentInk, borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: "none" };
