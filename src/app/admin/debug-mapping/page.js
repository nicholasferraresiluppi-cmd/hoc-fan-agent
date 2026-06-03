"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search, AlertCircle, CheckCircle2, XCircle, Database, Link2, FileText, Compass,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /admin/debug-mapping
 *
 * Tool diagnostico per capire perché un operatore appare come "no CP data"
 * in Sales CP nonostante sia (apparentemente) mappato lato CP.
 *
 * Cerca per nome e mostra in cards visive:
 *   - Mapping CP → Infloww (con cp_member_id)
 *   - Wage records per quel cp_member_id nel periodo (= shift effettivi)
 *   - Record Infloww del periodo con nome simile
 *   - Confronto esatto stringa per scovare mismatch invisibili (spazi, case)
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

export default function DebugMappingPage() {
  const [employee, setEmployee] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Lista candidati "problema": operatori che oggi appaiono come no-CP in classifica.
  // La carichiamo dal feed leaderboard sales-cp così è sempre allineata.
  const [candidates, setCandidates] = useState(null); // null = loading, [] = nessuno
  const [candidatesErr, setCandidatesErr] = useState(null);

  const periodOptions = useMemo(() => monthOpts(), []);
  useEffect(() => { if (!periodId && periodOptions[0]) setPeriodId(periodOptions[0].value); }, [periodOptions, periodId]);

  // Leggi ?employee= dal query param e pre-popola (es. arrivo da /leaderboard/sales-cp)
  // Non triggera la search da solo: per evitare race con periodId, lasciamo che sia
  // l'effect sotto a farlo appena entrambi sono pronti.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const fromUrl = p.get("employee");
    if (fromUrl && !employee) setEmployee(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando l'URL ha ?employee= e periodId è impostato, fai partire una sola ricerca
  // automatica. Flag per evitare loop.
  const [autoSearched, setAutoSearched] = useState(false);
  useEffect(() => {
    if (autoSearched) return;
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const fromUrl = p.get("employee");
    if (fromUrl && employee === fromUrl && periodId) {
      setAutoSearched(true);
      // micro-delay per garantire render del campo prima della chiamata
      setTimeout(() => search(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, periodId]);

  // Carica candidati no-CP appena periodId è disponibile (e ricarica se cambi periodo)
  useEffect(() => {
    if (!periodId) return;
    let cancelled = false;
    setCandidates(null);
    setCandidatesErr(null);
    fetch(`/api/leaderboard/sales-cp?period_id=${periodId}&include_no_cp=1`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const noCp = (j.ranking || []).filter((r) => !r.has_cp_data);
        setCandidates(noCp);
      })
      .catch((e) => { if (!cancelled) setCandidatesErr(e.message); });
    return () => { cancelled = true; };
  }, [periodId]);

  function pickCandidate(name) {
    setEmployee(name);
    // passa il nome esplicitamente per evitare lo stale closure su `employee`
    search(name);
  }

  async function search(nameOverride) {
    const name = (nameOverride ?? employee).trim();
    if (!name || !periodId) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/admin/debug-mapping?employee=${encodeURIComponent(name)}&period_id=${periodId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Interpretazione automatica del risultato
  const diagnosis = useMemo(() => {
    if (!data) return null;
    const mapped = (data.mapping_matches || []).length > 0;
    const hasWages = (data.wages_for_mapped_ids || []).some((w) => w.total_shifts > 0);
    const inInfloww = (data.infloww_matches || []).length > 0;
    const exactMatchOk = (data.exact_match_checks || []).some((c) => c.found_in_infloww_exact);
    const cpWageByName = (data.cp_wages_by_name || []).filter((w) => !w.is_in_mapping);
    const liveCpHits = (data.live_cp_check || []).reduce((s, c) => s + (c.live_wages_count || 0), 0);
    const livePagination = (data.live_cp_check || []).reduce((s, c) => Math.max(s, c.live_total_via_pagination || 0), 0);

    // Caso CRITICO: live CP dice "esiste!" ma KV dice "no shifts" → sync broken/stale
    if (mapped && !hasWages && liveCpHits > 0) {
      return {
        tone: "error",
        title: `Sync KV stale: CP API ritorna ${liveCpHits} wage record live, ma il sync KV ne ha 0`,
        body: `Conferma definitiva: la wage di "${employee}" ESISTE in CP API (verificato live in questo momento) ma NON è nel cp:wages: del periodo. Significa che il sync precedente l'ha persa (probabilmente per errore transiente su una pagina, ora con il fix retry dovrebbe ripescare). SOLUZIONE: re-sync 2026-${data.query.period_id.split("-")[1]} da /admin/creatorspro-sync.`,
      };
    }
    if (mapped && !hasWages && liveCpHits === 0 && livePagination === 0) {
      return {
        tone: "warn",
        title: "Non ha lavorato in CP nel periodo",
        body: "L'operatore è mappato correttamente, ma anche interrogando CP API in tempo reale non risulta alcuna wage per lui in questo mese. Probabilmente non ha effettivamente lavorato in CP nel periodo (magari solo Infloww, o periodo cambiato).",
      };
    }
    if (!mapped && cpWageByName.length === 0 && !inInfloww) {
      return { tone: "error", title: "Nome non trovato", body: "Nessun match né in mapping CP, né in wage records, né in record Infloww del periodo. Controlla l'ortografia." };
    }
    if (mapped && !hasWages) {
      return { tone: "warn", title: "Mappato ma senza shift CP nel periodo", body: "L'operatore è correttamente mappato CP→Infloww, ma nel periodo selezionato non ha wage records / shift in CreatorsPro." };
    }
    if (mapped && hasWages && !exactMatchOk && inInfloww) {
      return { tone: "error", title: "Mismatch tra nome in mapping e nome in Infloww", body: "L'operatore ha shift in CP e c'è un record Infloww con nome simile, ma il nome scritto nel mapping NON corrisponde esattamente a quello nel CSV Infloww. Confronta i byte qui sotto." };
    }
    if (!mapped && cpWageByName.length > 0) {
      return { tone: "warn", title: "Esiste in CP ma non è mappato", body: "L'operatore ha wage records in CP ma il suo cp_member_id NON è in cp:member_mapping. Vai a /admin/creatorspro-sync e mappalo." };
    }
    if (mapped && hasWages && exactMatchOk) {
      return { tone: "ok", title: "Tutto in regola", body: "Mappato, ha shift in CP, e il match esatto con Infloww funziona." };
    }
    return { tone: "info", title: "Caso intermedio", body: "Controlla i dettagli sotto." };
  }, [data, employee]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1100, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/admin/creatorspro-sync" style={{ color: "inherit", textDecoration: "none" }}>Sync CP</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Debug Mapping</span>
          </div>
        }
        section="Data · Diagnostica"
        title="Debug mapping CP ↔ Infloww"
        subtitle="Investigazione per capire perché un operatore appare come 'no CP data' nella leaderboard Sales CP nonostante sia mappato. Cerca per nome e ottieni una diagnosi automatica."
      />

      {/* Form ricerca */}
      <CpCard padding="20px 24px" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={lbl}>Nome operatore (anche parziale)</label>
            <input
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="es. Francesco Casti"
              style={input}
            />
          </div>
          <div>
            <label style={lbl}>Periodo</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, minWidth: 180, cursor: "pointer" }}>
              {periodOptions.map((p) => <option key={p.value} value={p.value} style={{ background: CP.surface }}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={search} disabled={loading || !employee.trim()} style={primaryBtn(loading || !employee.trim())}>
            <Search size={14} /> {loading ? "Ricerca…" : "Cerca"}
          </button>
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 20 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {/* Empty state: nessuna ricerca ancora fatta */}
      {!data && !loading && !error && (
        <>
          <CpCard padding="24px 26px" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: CP.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Compass size={22} color={CP.accentGreen} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, color: CP.textPrimary, marginBottom: 6 }}>
                  Operatori senza dato CP nel periodo
                </div>
                <div style={{ color: CP.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                  Sotto trovi tutti gli operatori che oggi appaiono come <b>no-CP</b> in classifica per il periodo selezionato:
                  o non sono mappati a CreatorsPro, o il sync ha mancato la loro wage. Clicca un nome per partire con la diagnosi automatica.
                </div>
              </div>
            </div>
          </CpCard>

          {/* Lista candidati */}
          {candidatesErr && (
            <CpCard accent={CP.accentRed} padding="12px 16px" style={{ marginBottom: 12 }}>
              <div style={{ color: CP.accentRed, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={14} /> Impossibile caricare i candidati: {candidatesErr}
              </div>
            </CpCard>
          )}
          {candidates === null && !candidatesErr && (
            <Empty>Carico l'elenco operatori no-CP per {periodId}…</Empty>
          )}
          {candidates && candidates.length === 0 && (
            <CpCard accent={CP.accentGreen} padding="14px 18px">
              <div style={{ color: CP.accentGreen, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600 }}>
                <CheckCircle2 size={16} /> Nessun operatore no-CP in {periodId}. Tutto mappato.
              </div>
            </CpCard>
          )}
          {candidates && candidates.length > 0 && (
            <CpCard padding="14px 16px">
              <div style={{ fontSize: 11, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12, fontFamily: FONTS.mono, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Candidati da risolvere ({candidates.length})</span>
                <Link href="/leaderboard/sales-cp" style={{ color: CP.textSecondary, textDecoration: "none", fontSize: 10, textTransform: "none", letterSpacing: 0, fontFamily: FONTS.body }}>
                  Vedi in classifica →
                </Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                {candidates.map((op, i) => (
                  <button
                    key={`${op.employee}-${i}`}
                    onClick={() => pickCandidate(op.employee)}
                    title={`Diagnostica ${op.employee}${op.group ? ` (${op.group})` : ""}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px",
                      background: CP.surface,
                      border: `1px solid ${CP.border}`,
                      borderRadius: 8,
                      color: CP.textPrimary,
                      fontSize: 13,
                      fontFamily: FONTS.body,
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "border-color 0.12s, background 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = CP.accentGreen; e.currentTarget.style.background = CP.surfaceAlt; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = CP.border; e.currentTarget.style.background = CP.surface; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.employee}</div>
                      <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {op.group || "(no group)"}{op.language ? ` · ${op.language}` : ""}
                      </div>
                    </div>
                    <Search size={13} color={CP.textMuted} />
                  </button>
                ))}
              </div>
            </CpCard>
          )}
        </>
      )}

      {data && (
        <>
          {/* Diagnosi automatica */}
          {diagnosis && (
            <CpCard accent={diagnoseColor(diagnosis.tone)} padding="20px 24px" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {diagnosis.tone === "ok" ? <CheckCircle2 size={24} color={CP.accentGreen} />
                  : diagnosis.tone === "error" ? <XCircle size={24} color={CP.accentRed} />
                  : <AlertCircle size={24} color="#F59E0B" />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: diagnoseColor(diagnosis.tone), marginBottom: 4 }}>
                    {diagnosis.title}
                  </div>
                  <div style={{ color: CP.textSecondary, fontSize: 14, lineHeight: 1.55 }}>
                    {diagnosis.body}
                  </div>
                </div>
              </div>
            </CpCard>
          )}

          {/* Counts globali */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
            <MiniStat icon={Link2} label="Mapping totale" value={data.counts.mapping_total} />
            <MiniStat icon={Database} label="CP members" value={data.counts.cp_members_total} />
            <MiniStat icon={FileText} label={`Wages CP ${periodId}`} value={data.counts.wages_records} />
            <MiniStat icon={FileText} label={`Records Infloww ${periodId}`} value={data.counts.infloww_records} />
          </div>

          {/* 1) Mapping matches */}
          <Section title={`Mapping CP↔Infloww (${data.mapping_matches.length} match)`}>
            {data.mapping_matches.length === 0 && <Empty>Nessun cp_member_id mappato a un nome simile a &quot;{employee}&quot;.</Empty>}
            {data.mapping_matches.map((m, i) => (
              <CpCard key={i} padding="14px 18px" style={{ marginBottom: 8 }}>
                <Row k="CP member ID"        v={m.cp_member_id} mono />
                <Row k="Nome CP"             v={m.cp_member_name || "—"} />
                <Row k="Username CP"         v={m.cp_member_username || "—"} mono />
                <Row k="Mappato su Infloww"  v={m.infloww_name_in_mapping} highlight />
              </CpCard>
            ))}
          </Section>

          {/* 2) Wages per cp_member_id matchati */}
          <Section title={`Shift in CP del periodo per i cp_member_id matchati`}>
            {data.wages_for_mapped_ids.length === 0 && <Empty>Nessun cp_member_id matchato da analizzare.</Empty>}
            {data.wages_for_mapped_ids.map((w, i) => {
              const ok = w.total_shifts > 0;
              return (
                <CpCard key={i} accent={ok ? CP.accentGreen : CP.accentRed} padding="14px 18px" style={{ marginBottom: 8 }}>
                  <Row k="CP member ID"      v={w.cp_member_id} mono />
                  <Row k="Mappato a"          v={w.infloww_name_in_mapping} />
                  <Row k="Wage records nel periodo" v={w.wage_records} color={ok ? CP.accentGreen : CP.accentRed} />
                  <Row k="Shift totali"      v={w.total_shifts} color={ok ? CP.accentGreen : CP.accentRed} highlight />
                  {w.wage_member_names.length > 0 && <Row k="Nomi nei wage" v={w.wage_member_names.join(", ")} />}
                </CpCard>
              );
            })}
          </Section>

          {/* 3) Wages cercati direttamente per nome */}
          <Section title={`Wages CP con nome simile a "${employee}" (${data.cp_wages_by_name.length})`}>
            {data.cp_wages_by_name.length === 0 && <Empty>Nessun wage record CP con nome simile.</Empty>}
            {data.cp_wages_by_name.map((w, i) => (
              <CpCard key={i} accent={w.is_in_mapping ? CP.accentGreen : "#F59E0B"} padding="14px 18px" style={{ marginBottom: 8 }}>
                <Row k="Nome CP"      v={w.cp_member_name} highlight />
                <Row k="CP member ID" v={w.cp_member_id} mono />
                <Row k="Username"     v={w.member_username || "—"} mono />
                <Row k="Shift"        v={w.shifts} color={w.shifts > 0 ? CP.accentGreen : CP.textMuted} />
                <Row k="In mapping?"  v={w.is_in_mapping ? `✓ Sì → ${w.mapped_to}` : "✗ NO — manca mapping"} color={w.is_in_mapping ? CP.accentGreen : "#F59E0B"} />
              </CpCard>
            ))}
          </Section>

          {/* 4) Record Infloww */}
          <Section title={`Record Infloww del periodo con nome simile (${data.infloww_matches.length})`}>
            {data.infloww_matches.length === 0 && <Empty>Nessun record Infloww con nome simile a &quot;{employee}&quot; in {periodId}.</Empty>}
            {data.infloww_matches.map((r, i) => (
              <CpCard key={i} padding="14px 18px" style={{ marginBottom: 8 }}>
                <Row k="Nome employee (CSV)" v={`"${r.employee_name_in_csv}"`} mono highlight />
                <Row k="Group"               v={r.group || "—"} />
                <Row k="Lunghezza nome"       v={`${r.employee_name_in_csv.length} caratteri`} />
                <Row k="Tipo"                v={r.is_mass ? "Mass account" : "Chatter"} />
              </CpCard>
            ))}
          </Section>

          {/* 4.5) Live CP API check — il più importante */}
          <Section title="🛰 Live check vs CP API (verifica direttamente con CreatorsPro)">
            {(data.live_cp_check || []).length === 0 && <Empty>Nessuna verifica live disponibile (mapping vuoto).</Empty>}
            {(data.live_cp_check || []).map((c, i) => {
              if (c.live_error) {
                return (
                  <CpCard key={i} accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 8 }}>
                    <Row k="CP member ID" v={c.cp_member_id} mono />
                    <Row k="Errore live"  v={c.live_error} color={CP.accentRed} />
                  </CpCard>
                );
              }
              const ok = (c.live_wages_count || 0) > 0;
              return (
                <CpCard key={i} accent={ok ? CP.accentGreen : "#F59E0B"} padding="14px 18px" style={{ marginBottom: 8 }}>
                  <Row k="CP member ID"           v={c.cp_member_id} mono />
                  <Row k="Range chiesto"          v={`${c.live_query.startedAt} → ${c.live_query.endedAt}`} mono />
                  <Row k="Wages live in CP API"   v={c.live_wages_count} color={ok ? CP.accentGreen : "#F59E0B"} highlight />
                  <Row k="Totale via pagination"  v={c.live_total_via_pagination} />
                  {c.live_wage_ids?.length > 0 && (
                    <details style={{ marginTop: 8, fontSize: 12 }}>
                      <summary style={{ cursor: "pointer", color: CP.textSecondary }}>Wage IDs trovati live ({c.live_wage_ids.length})</summary>
                      <div style={{ marginTop: 6, padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 11, color: CP.textPrimary }}>
                        {c.live_wage_ids.map((w, j) => (
                          <div key={j} style={{ marginBottom: 4, fontFamily: FONTS.mono }}>
                            <b>{w.id}</b> · {w.member_name} · <span style={{ color: CP.textMuted }}>{w.status}</span> · {new Date(w.started_at).toLocaleDateString("it-IT")} → {new Date(w.ended_at).toLocaleDateString("it-IT")}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CpCard>
              );
            })}
          </Section>

          {/* 5) Exact match check */}
          <Section title="Confronto byte-per-byte (nome in mapping vs nome in Infloww)">
            {data.exact_match_checks.length === 0 && <Empty>Nessun check disponibile.</Empty>}
            {data.exact_match_checks.map((c, i) => (
              <CpCard key={i} accent={c.found_in_infloww_exact ? CP.accentGreen : CP.accentRed} padding="14px 18px" style={{ marginBottom: 8 }}>
                <Row k="Nome in mapping"      v={`"${c.mapping_says}"`} mono highlight />
                <Row k="Match esatto Infloww" v={c.found_in_infloww_exact ? "✓ Trovato" : "✗ NON trovato"} color={c.found_in_infloww_exact ? CP.accentGreen : CP.accentRed} />
                <Row k="N. record Infloww"   v={c.infloww_record_count_for_exact_name} />
                <details style={{ marginTop: 8, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: CP.textSecondary, fontFamily: FONTS.mono }}>Byte del nome (per debug invisible chars)</summary>
                  <div style={{ marginTop: 6, padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 6, fontFamily: FONTS.mono, fontSize: 11, color: CP.textMuted }}>
                    {c.mapping_bytes.map((b, j) => `${String.fromCharCode(b)}(${b})`).join(" ")}
                  </div>
                </details>
              </CpCard>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24, marginBottom: 16 }}>
      <SectionLabel style={{ display: "block", marginBottom: 10 }}>{title}</SectionLabel>
      {children}
    </div>
  );
}

function Row({ k, v, mono, highlight, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", gap: 14, fontSize: 13 }}>
      <span style={{ color: CP.textMuted, fontSize: 12, flexShrink: 0 }}>{k}</span>
      <span style={{
        color: color || CP.textPrimary,
        fontFamily: mono ? FONTS.mono : FONTS.body,
        fontWeight: highlight ? 700 : 500,
        textAlign: "right",
        overflow: "hidden", textOverflow: "ellipsis",
      }}>{v}</span>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div style={{ padding: "14px 16px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 11, marginBottom: 6 }}>
        <Icon size={13} /> {label}
      </div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 22, color: CP.textPrimary }}>{value}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: "12px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textMuted, fontSize: 13, fontStyle: "italic" }}>{children}</div>;
}

function diagnoseColor(tone) {
  if (tone === "ok") return CP.accentGreen;
  if (tone === "error") return CP.accentRed;
  if (tone === "warn") return "#F59E0B";
  return CP.textPrimary;
}

const lbl = { display: "block", fontSize: 11, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6, fontFamily: FONTS.mono };
const input = { width: "100%", padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "10px 18px",
  background: disabled ? CP.surfaceAlt : CP.accentGreen,
  color: disabled ? CP.textMuted : "#0a0a0a",
  border: "none",
  borderRadius: 8,
  fontSize: 13, fontWeight: 700, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
