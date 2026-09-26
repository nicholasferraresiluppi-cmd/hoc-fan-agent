"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Search, AlertCircle, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, SectionTitle, Notice, DataTable, card, NUM } from "@/components/ds";
import { fmt$, fmtInt } from "@/lib/format";

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

  // Interpretazione automatica del risultato (stesse regole; testi riscritti in
  // italiano semplice il 26/09/2026 — prima: "Sync KV stale", "cp:member_mapping").
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
        title: `L'ultimo sync ha perso le sue buste: in CreatorsPro ce ne sono ${liveCpHits}, in HOC Pro 0`,
        body: `Ho appena chiesto a CreatorsPro: le buste di "${employee}" per questo mese esistono, ma non sono arrivate in HOC Pro (probabile errore temporaneo durante il sync). Cosa fare: risincronizza ${data.query.period_id} da Sync CreatorsPro.`,
        action: { href: "/admin/creatorspro-sync", label: "Vai a Sync CreatorsPro" },
      };
    }
    if (mapped && !hasWages && liveCpHits === 0 && livePagination === 0) {
      return {
        tone: "warn",
        title: "Non ha lavorato in CreatorsPro questo mese",
        body: "È collegato correttamente, ma nemmeno chiedendo a CreatorsPro adesso risultano buste per questo mese. Probabilmente non ha lavorato su CP nel periodo (magari solo su Infloww, o ha cambiato periodo).",
      };
    }
    if (!mapped && cpWageByName.length === 0 && !inInfloww) {
      return { tone: "error", title: "Nome non trovato", body: "Nessuna corrispondenza né nei collegamenti CP, né nelle buste CP, né nei dati Infloww del mese. Controlla come è scritto il nome." };
    }
    if (mapped && !hasWages) {
      return { tone: "warn", title: "Collegato, ma senza turni in CP questo mese", body: "Il collegamento CP → operatore è corretto, ma nel mese scelto non ha buste né turni in CreatorsPro." };
    }
    if (mapped && hasWages && !exactMatchOk && inInfloww) {
      return { tone: "error", title: "Il nome collegato non è identico a quello in Infloww", body: "Ha turni in CP e in Infloww c'è un nome simile, ma il nome scritto nel collegamento non è identico a quello del file Infloww (spazi, maiuscole o caratteri invisibili). Confronta i caratteri nel dettaglio qui sotto e correggi il collegamento.",
        action: { href: "/admin/creatorspro-sync", label: "Correggi in Sync CreatorsPro" } };
    }
    if (!mapped && cpWageByName.length > 0) {
      return { tone: "warn", title: "Esiste in CreatorsPro ma non è collegato", body: "Ha buste in CP ma la sua persona CP non è collegata a nessun operatore. Collegala nella sezione “Persone da collegare”.", action: { href: "/admin/creatorspro-sync#collega", label: "Collega in Sync CreatorsPro" } };
    }
    if (mapped && hasWages && exactMatchOk) {
      return { tone: "ok", title: "Tutto in regola", body: "Collegato, ha turni in CP e il nome corrisponde esattamente a quello in Infloww." };
    }
    return { tone: "info", title: "Caso intermedio", body: "Controlla i dettagli qui sotto." };
  }, [data, employee]);

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/UX): 111 schede tutte uguali
  // senza ordine né peso (in mezzo anche account non-operatori: HR, audit, agenzie);
  // diagnosi in gergo (KV, wage, cp:member_mapping) senza il passo successivo.
  // Ora: tabella ordinabile per venduto Infloww (chi pesa in classifica in cima),
  // diagnosi in italiano con il link dove si risolve, prove tecniche sotto.
  const periodLabel = periodOptions.find((p) => p.value === periodId)?.label || periodId;
  const candRows = (candidates || []).map((op, i) => ({ ...op, id: `${op.employee}-${i}` }));
  const hasSalesCol = candRows.some((r) => r.infloww_sales != null);
  const candCols = [
    { key: "employee", label: "Operatore", render: (op) => <span style={{ fontWeight: 500 }}>{op.employee}</span> },
    { key: "group", label: "Gruppo", muted: true, render: (op) => `${op.group || "(nessun gruppo)"}${op.language ? ` · ${op.language}` : ""}` },
    ...(hasSalesCol ? [{ key: "infloww_sales", label: "Venduto su Infloww", align: "right", render: (op) => (op.infloww_sales ? fmt$(op.infloww_sales) : "—") }] : []),
    { key: "go", label: "", sortable: false, render: () => <span style={{ fontSize: 13, color: CP.accentSoftText, whiteSpace: "nowrap" }}>Diagnosi →</span> },
  ];
  const toneColor = diagnosis ? diagnoseColor(diagnosis.tone) : CP.textPrimary;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Sync CP", href: "/admin/creatorspro-sync" }, { label: "Debug mapping" }]}
        title="Perché un operatore non ha dati CP"
        subtitle="Per chi in Sales CP compare senza dati CreatorsPro: cerca il nome e ottieni la causa (non collegato, sync incompleto, nome scritto diverso) e dove si risolve."
      />

      {/* Ricerca */}
      <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 240px", fontSize: 13, color: CP.textSecondary }}>
            Nome operatore (anche solo una parte)
            <input
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="es. Francesco Casti"
              style={{ ...input, marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, color: CP.textSecondary }}>
            Mese
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...input, marginTop: 6, minWidth: 180, cursor: "pointer" }}>
              {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <button onClick={() => search()} disabled={loading || !employee.trim()} style={primaryBtn(loading || !employee.trim())}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {loading ? "Cerco…" : "Cerca"}
          </button>
        </div>
      </section>

      {error && <Notice danger>La ricerca non è andata a buon fine: {error}</Notice>}

      {/* Nessuna ricerca ancora: i candidati */}
      {!data && !loading && !error && (
        <>
          {candidatesErr && <Notice danger>Non riesco a caricare gli operatori senza dati CP: {candidatesErr}</Notice>}
          {candidates === null && !candidatesErr && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 14 }}><Loader2 size={15} className="animate-spin" /> Carico gli operatori senza dati CP di {periodLabel}…</div>
          )}
          {candidates && candidates.length === 0 && (
            <section style={{ ...card, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: CP.textSecondary }}>
              <CheckCircle2 size={16} color={CP.accentGreen} /> Nessun operatore senza dati CP in {periodLabel}: sono tutti collegati.
            </section>
          )}
          {candidates && candidates.length > 0 && (
            <>
              <SectionTitle aside={<Link href="/leaderboard/sales-cp" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Vedi in Sales CP →</Link>}>
                {candidates.length} operatori senza dati CP · {periodLabel}
              </SectionTitle>
              <div style={{ fontSize: 13, color: CP.textSecondary, margin: "-4px 0 10px", lineHeight: 1.5 }}>
                In Sales CP compaiono senza score: o non sono collegati a una persona CreatorsPro, o il sync ha perso le loro buste. Clicca una riga per la diagnosi.
                {" "}Il modo più veloce per collegarli è la sezione <Link href="/admin/creatorspro-sync#collega" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Persone da collegare</Link> in Sync CreatorsPro.
              </div>
              <DataTable columns={candCols} rows={candRows} onRowClick={(op) => pickCandidate(op.employee)}
                defaultSort={hasSalesCol ? { key: "infloww_sales", dir: -1 } : undefined} minWidth={560} maxHeight={620} />
              {hasSalesCol && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>In cima chi vende di più: sono quelli che pesano in classifica. Chi ha “—” spesso non è un operatore di chat (HR, audit, agenzie).</div>}
            </>
          )}
        </>
      )}

      {data && (
        <>
          {/* Diagnosi automatica */}
          {diagnosis && (
            <section style={{ ...card, padding: "18px 20px", marginBottom: 14, borderLeft: `3px solid ${toneColor}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {diagnosis.tone === "ok" ? <CheckCircle2 size={22} color={CP.accentGreen} style={{ flexShrink: 0 }} />
                  : diagnosis.tone === "error" ? <XCircle size={22} color={CP.accentRed} style={{ flexShrink: 0 }} />
                  : <AlertCircle size={22} color={toneColor} style={{ flexShrink: 0 }} />}
                <div>
                  <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 2 }}>Diagnosi per “{employee}” · {periodLabel}</div>
                  <div style={{ fontWeight: 500, fontSize: 17, color: CP.textPrimary, marginBottom: 6 }}>{diagnosis.title}</div>
                  <div style={{ color: CP.textSecondary, fontSize: 14, lineHeight: 1.55 }}>{diagnosis.body}</div>
                  {diagnosis.action && (
                    <Link href={diagnosis.action.href} style={{ ...primaryBtn(false), marginTop: 12, textDecoration: "none" }}>{diagnosis.action.label} <ArrowRight size={14} /></Link>
                  )}
                </div>
              </div>
            </section>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
            <button onClick={() => { setData(null); setEmployee(""); }} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>← Torna all&apos;elenco</button>
          </div>

          <SectionTitle aside="le prove su cui si basa la diagnosi">Dettaglio</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 8 }}>
            <Metric label="Persone collegate in totale" value={fmtInt(data.counts.mapping_total)} />
            <Metric label="Persone in CreatorsPro" value={fmtInt(data.counts.cp_members_total)} />
            <Metric label={`Buste CP · ${periodLabel}`} value={fmtInt(data.counts.wages_records)} />
            <Metric label={`Righe Infloww · ${periodLabel}`} value={fmtInt(data.counts.infloww_records)} />
          </div>

          {/* 1) Mapping matches */}
          <Section title={`Collegamenti CP → operatore con nome simile (${data.mapping_matches.length})`}>
            {data.mapping_matches.length === 0 && <Empty>Nessuna persona CP collegata a un nome simile a “{employee}”.</Empty>}
            {data.mapping_matches.map((m, i) => (
              <Box key={i}>
                <Row k="Codice persona CP" v={m.cp_member_id} mono />
                <Row k="Nome CP" v={m.cp_member_name || "—"} />
                <Row k="Username CP" v={m.cp_member_username || "—"} mono />
                <Row k="Collegato all'operatore" v={m.infloww_name_in_mapping} highlight />
              </Box>
            ))}
          </Section>

          {/* 2) Wages per cp_member_id matchati */}
          <Section title="Turni in CP del mese per le persone collegate">
            {data.wages_for_mapped_ids.length === 0 && <Empty>Nessuna persona collegata da controllare.</Empty>}
            {data.wages_for_mapped_ids.map((w, i) => {
              const ok = w.total_shifts > 0;
              return (
                <Box key={i} tone={ok ? CP.accentGreen : CP.accentRed}>
                  <Row k="Codice persona CP" v={w.cp_member_id} mono />
                  <Row k="Collegato a" v={w.infloww_name_in_mapping} />
                  <Row k="Buste nel mese" v={w.wage_records} color={ok ? CP.accentGreen : CP.accentRed} />
                  <Row k="Turni totali" v={w.total_shifts} color={ok ? CP.accentGreen : CP.accentRed} highlight />
                  {w.wage_member_names.length > 0 && <Row k="Nomi nelle buste" v={w.wage_member_names.join(", ")} />}
                </Box>
              );
            })}
          </Section>

          {/* 3) Wages cercati direttamente per nome */}
          <Section title={`Buste CP con nome simile a “${employee}” (${data.cp_wages_by_name.length})`}>
            {data.cp_wages_by_name.length === 0 && <Empty>Nessuna busta CP con nome simile.</Empty>}
            {data.cp_wages_by_name.map((w, i) => (
              <Box key={i} tone={w.is_in_mapping ? CP.accentGreen : WARN}>
                <Row k="Nome CP" v={w.cp_member_name} highlight />
                <Row k="Codice persona CP" v={w.cp_member_id} mono />
                <Row k="Username" v={w.member_username || "—"} mono />
                <Row k="Turni" v={w.shifts} color={w.shifts > 0 ? CP.accentGreen : CP.textMuted} />
                <Row k="Collegata?" v={w.is_in_mapping ? `Sì → ${w.mapped_to}` : "No, manca il collegamento"} color={w.is_in_mapping ? CP.accentGreen : WARN} />
              </Box>
            ))}
          </Section>

          {/* 4) Record Infloww */}
          <Section title={`Righe Infloww del mese con nome simile (${data.infloww_matches.length})`}>
            {data.infloww_matches.length === 0 && <Empty>Nessuna riga Infloww con nome simile a “{employee}” in {periodLabel}.</Empty>}
            {data.infloww_matches.map((r, i) => (
              <Box key={i}>
                <Row k="Nome nel file Infloww" v={`"${r.employee_name_in_csv}"`} mono highlight />
                <Row k="Gruppo" v={r.group || "—"} />
                <Row k="Lunghezza nome" v={`${r.employee_name_in_csv.length} caratteri`} />
                <Row k="Tipo" v={r.is_mass ? "Account “Mass”" : "Chatter"} />
              </Box>
            ))}
          </Section>

          {/* 4.5) Live CP API check — il più importante */}
          <Section title="Verifica in tempo reale su CreatorsPro">
            {(data.live_cp_check || []).length === 0 && <Empty>Nessuna verifica possibile: nessuna persona collegata.</Empty>}
            {(data.live_cp_check || []).map((c, i) => {
              if (c.live_error) {
                return (
                  <Box key={i} tone={CP.accentRed}>
                    <Row k="Codice persona CP" v={c.cp_member_id} mono />
                    <Row k="Errore" v={c.live_error} color={CP.accentRed} />
                  </Box>
                );
              }
              const ok = (c.live_wages_count || 0) > 0;
              return (
                <Box key={i} tone={ok ? CP.accentGreen : WARN}>
                  <Row k="Codice persona CP" v={c.cp_member_id} mono />
                  <Row k="Date chieste" v={`${c.live_query.startedAt} → ${c.live_query.endedAt}`} mono />
                  <Row k="Buste trovate adesso in CP" v={c.live_wages_count} color={ok ? CP.accentGreen : WARN} highlight />
                  <Row k="Totale dichiarato da CP" v={c.live_total_via_pagination} />
                  {c.live_wage_ids?.length > 0 && (
                    <details style={{ marginTop: 8, fontSize: 12 }}>
                      <summary style={{ cursor: "pointer", color: CP.textSecondary }}>Buste trovate ({c.live_wage_ids.length})</summary>
                      <div style={{ marginTop: 6, padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 12, color: CP.textPrimary }}>
                        {c.live_wage_ids.map((w, j) => (
                          <div key={j} style={{ marginBottom: 4, ...CODE }}>
                            <span style={{ fontWeight: 500 }}>{w.id}</span> · {w.member_name} · <span style={{ color: CP.textMuted }}>{w.status}</span> · {new Date(w.started_at).toLocaleDateString("it-IT")} → {new Date(w.ended_at).toLocaleDateString("it-IT")}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </Box>
              );
            })}
          </Section>

          {/* 5) Exact match check */}
          <Section title="Il nome collegato è identico a quello in Infloww?">
            {data.exact_match_checks.length === 0 && <Empty>Nessun controllo disponibile.</Empty>}
            {data.exact_match_checks.map((c, i) => (
              <Box key={i} tone={c.found_in_infloww_exact ? CP.accentGreen : CP.accentRed}>
                <Row k="Nome nel collegamento" v={`"${c.mapping_says}"`} mono highlight />
                <Row k="Identico in Infloww" v={c.found_in_infloww_exact ? "Sì" : "No"} color={c.found_in_infloww_exact ? CP.accentGreen : CP.accentRed} />
                <Row k="Righe Infloww con quel nome" v={c.infloww_record_count_for_exact_name} />
                <details style={{ marginTop: 8, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: CP.textSecondary }}>Carattere per carattere (per scovare spazi o caratteri invisibili)</summary>
                  <div style={{ marginTop: 6, padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 6, color: CP.textMuted, wordBreak: "break-all", ...CODE }}>
                    {c.mapping_bytes.map((b) => `${String.fromCharCode(b)}(${b})`).join(" ")}
                  </div>
                </details>
              </Box>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 20, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Box({ tone, children }) {
  return <div style={{ ...card, padding: "10px 16px", marginBottom: 8, ...(tone ? { borderLeft: `3px solid ${tone}` } : {}) }}>{children}</div>;
}

function Row({ k, v, mono, highlight, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", gap: 14, fontSize: 13, flexWrap: "wrap" }}>
      <span style={{ color: CP.textMuted, fontSize: 13, flexShrink: 0 }}>{k}</span>
      <span style={{
        color: color || CP.textPrimary,
        fontWeight: highlight ? 500 : 400,
        textAlign: "right",
        overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-all",
        ...(mono ? CODE : NUM),
      }}>{v}</span>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ ...card, padding: "10px 14px", color: CP.textMuted, fontSize: 13 }}>{children}</div>;
}

// Avviso (né ok né errore): stesso colore dell'avviso di ActionRow nel DS.
const WARN = CP.accentSoftText;
function diagnoseColor(tone) {
  if (tone === "ok") return CP.accentGreen;
  if (tone === "error") return CP.accentRed;
  if (tone === "warn") return WARN;
  return CP.textPrimary;
}

// Codici e ID (non numeri da confrontare): monospazio di sistema per leggerli carattere per carattere.
const CODE = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };
const input = { display: "block", width: "100%", boxSizing: "border-box", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "9px 16px",
  background: disabled ? CP.surfaceAlt : CP.accent,
  color: disabled ? CP.textMuted : CP.accentInk,
  border: "none",
  borderRadius: 8,
  fontSize: 14, fontWeight: 500, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
});
