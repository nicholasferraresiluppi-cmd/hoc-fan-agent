"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const PERIOD_OPTIONS = [
  { value: "monthly", label: "Mensile" },
  { value: "weekly", label: "Settimanale" },
  { value: "quarterly", label: "Trimestrale" },
];

export default function LeaderboardImportPage() {
  const [csvText, setCsvText] = useState("");
  const [periodType, setPeriodType] = useState("monthly");
  const [periodId, setPeriodId] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState([]);
  const [deletingPeriod, setDeletingPeriod] = useState(null);

  async function deleteImport(period) {
    if (!confirm(`Eliminare l'import "${period}"?\n\nVerranno cancellati TUTTI i dati Infloww di quel periodo dal KV (non recuperabili senza ri-caricare il file).`)) return;
    setDeletingPeriod(period);
    try {
      const res = await fetch(`/api/admin/leaderboard-import?period=${encodeURIComponent(period)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore"); return; }
      // Reload list
      fetch("/api/admin/leaderboard-import")
        .then((r) => r.json())
        .then((d) => setImports(d.imports || []));
      alert(`✓ Rimosso "${period}" — ${j.records_deleted} record cancellati.`);
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingPeriod(null);
    }
  }
  const [savedAt, setSavedAt] = useState(null);

  // Carica lista import precedenti
  useEffect(() => {
    fetch("/api/admin/leaderboard-import")
      .then((r) => r.json())
      .then((d) => setImports(d.imports || []))
      .catch(() => {});
  }, [savedAt]);

  // Default period_id auto-suggerito (mese corrente)
  useEffect(() => {
    if (!periodId) {
      const now = new Date();
      if (periodType === "monthly") {
        setPeriodId(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      } else if (periodType === "weekly") {
        const target = new Date(now);
        const dayNum = (now.getUTCDay() + 6) % 7;
        target.setUTCDate(target.getUTCDate() - dayNum + 3);
        const firstThursday = target.valueOf();
        target.setUTCMonth(0, 1);
        if (target.getUTCDay() !== 4) {
          target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
        }
        const week = 1 + Math.ceil((firstThursday - target) / 604800000);
        setPeriodId(`${now.getFullYear()}-W${String(week).padStart(2, "0")}`);
      } else {
        const q = Math.floor(now.getMonth() / 3) + 1;
        setPeriodId(`${now.getFullYear()}-Q${q}`);
      }
    }
  }, [periodType]);

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          setError("Il file Excel non contiene fogli.");
          return;
        }
        const sheet = wb.Sheets[firstSheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, {
          blankrows: false,
          rawNumbers: false,
          dateNF: "yyyy-mm-dd",
        });
        setCsvText(csv);
      } else {
        const text = await file.text();
        setCsvText(text);
      }
      setPreview(null);
    } catch (err) {
      setError("Impossibile leggere il file: " + String(err));
    }
  }

  async function runPreview() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch("/api/admin/leaderboard-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          period_type: periodType,
          period_id: periodId,
          mode: "preview",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Errore nel preview");
        if (data.missing_headers) {
          setError(
            "Mancano colonne nel CSV: " + data.missing_headers.join(", ") +
            ". Verifica di aver esportato la scheda 'By time and employee' completa."
          );
        }
      } else {
        setPreview(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runSave() {
    if (!preview) return;
    if (!confirm(`Salvare ${preview.totalRecords} record per ${preview.period_type}:${preview.period_id}? Sovrascriverà eventuali dati esistenti.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/leaderboard-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          period_type: periodType,
          period_id: periodId,
          mode: "save",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Errore nel salvataggio");
      } else {
        setSavedAt(data.saved_at);
        alert(`Salvato! ${data.totalRecords} record in ${data.kv_key}`);
        setCsvText("");
        setPreview(null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1100, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 12 },
    title: { fontFamily: FONTS.display, fontSize: 28, margin: "0 0 6px 0" },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 24 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 12, padding: 18, marginBottom: 16 },
    h2: { fontFamily: FONTS.display, fontSize: 18, margin: "0 0 12px 0" },
    label: { fontSize: 12, color: COLORS.fog, letterSpacing: "0.06em", marginBottom: 6, display: "block" },
    input: { width: "100%", padding: "10px 14px", background: COLORS.charcoal, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 14, fontFamily: FONTS.body, outline: "none", marginBottom: 12 },
    select: { width: "100%", padding: "10px 14px", background: COLORS.charcoal, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 14, fontFamily: FONTS.body, marginBottom: 12 },
    btn: { padding: "10px 18px", background: COLORS.champagne, color: COLORS.obsidian, border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: FONTS.body },
    btnGhost: { padding: "10px 18px", background: "transparent", color: COLORS.alabaster, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: FONTS.body, marginRight: 8 },
    error: { background: COLORS.signal + "20", color: COLORS.signal, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    statRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.charcoal}`, fontSize: 14 },
    importItem: { display: "flex", justifyContent: "space-between", padding: "8px 12px", background: COLORS.charcoal, borderRadius: 6, marginBottom: 6, fontSize: 13 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Import Infloww</span>
            </div>
          }
          section="Data · Import"
          title="Import dati Infloww"
          subtitle={'Carica l\'export CSV o Excel "By time and employee" da Infloww. I dati alimentano lo score Sales CP (affianco Infloww) + l\'analisi efficienza chat.'}
        />

        {/* ISTRUZIONI INLINE: come scaricare da Infloww */}
        <div style={{
          padding: "16px 20px",
          background: CP.accentSoft,
          border: `1px solid ${CP.accentBlue}55`,
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: CP.textPrimary }}>Come scaricare il file da Infloww</div>
          </div>
          <ol style={{ margin: "0 0 12px 0", paddingLeft: 22, fontSize: 13, color: CP.textSecondary, lineHeight: 1.7 }}>
            <li>Vai su <a href="https://app.infloww.com" target="_blank" rel="noreferrer" style={{ color: CP.accentBlue, fontWeight: 600 }}>app.infloww.com</a> → menu <b>Reports</b> → <b>Performance reports</b></li>
            <li>Seleziona il report <b>&quot;By time and employee&quot;</b> (lo trovi nei modelli predefiniti)</li>
            <li>Scegli il <b>periodo</b> (mese intero per la leaderboard mensile, settimana per quella settimanale)</li>
            <li>Click su <b>Export → CSV</b> o <b>Excel (.xlsx)</b></li>
            <li>Carica il file qui sotto e scegli lo stesso periodo</li>
          </ol>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: CP.textMuted }}>
            <a href="https://app.infloww.com" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CP.accentBlue, fontWeight: 600, textDecoration: "none" }}>
              → Apri Infloww
            </a>
            <span style={{ color: CP.textMuted }}>·</span>
            <span>Storico: ripeti per ogni mese che vuoi popolare (Infloww non ha bulk export)</span>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.h2}>1. Periodo</h2>
          <label style={styles.label}>Tipo periodo</label>
          <select style={styles.select} value={periodType} onChange={(e) => { setPeriodType(e.target.value); setPeriodId(""); }}>
            {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <label style={styles.label}>
            Identificatore periodo {periodType === "monthly" ? "(es. 2026-02)" : periodType === "weekly" ? "(es. 2026-W05)" : "(es. 2026-Q1)"}
          </label>
          <input style={styles.input} value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder={periodType === "monthly" ? "2026-02" : periodType === "weekly" ? "2026-W05" : "2026-Q1"} />
        </div>

        <div style={styles.card}>
          <h2 style={styles.h2}>2. File CSV o Excel Infloww</h2>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileUpload}
            style={{ marginBottom: 12, color: COLORS.alabaster }}
          />
          {csvText && <p style={{ fontSize: 12, color: COLORS.fog }}>{csvText.split(/\r?\n/).length} righe caricate · {(csvText.length / 1024).toFixed(1)} KB</p>}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.card}>
          <h2 style={styles.h2}>3. Anteprima</h2>
          <button style={styles.btn} onClick={runPreview} disabled={!csvText || !periodId || busy}>
            {busy ? "Elaborazione..." : "Calcola anteprima"}
          </button>

          {preview && (
            <div style={{ marginTop: 18 }}>
              <div style={styles.statRow}><span>Record totali</span><b>{preview.totalRecords}</b></div>
              <div style={styles.statRow}><span>Account Mass esclusi</span><b style={{ color: COLORS.fog }}>{preview.massCount}</b></div>
              <div style={styles.statRow}><span>Eligible per Score</span><b style={{ color: COLORS.verdant }}>{preview.eligibleCount}</b></div>
              <div style={styles.statRow}><span>Periodo dati</span><b>{preview.dateRange ? `${preview.dateRange.from} → ${preview.dateRange.to}` : "n/a"}</b></div>
              <div style={styles.statRow}><span>Group (team modella)</span><b>{Object.keys(preview.byGroup).length}</b></div>
              {preview.errors?.length > 0 && (
                <div style={styles.statRow}><span>Errori parsing</span><b style={{ color: COLORS.signal }}>{preview.errors.length}</b></div>
              )}

              <div style={{ marginTop: 14 }}>
                <div style={styles.label}>Distribuzione per Group</div>
                {Object.entries(preview.byGroup).sort((a,b)=>b[1]-a[1]).slice(0, 15).map(([g, c]) => (
                  <div key={g} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: COLORS.fog }}>{g}</span><span>{c} record</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 18 }}>
                <button style={styles.btn} onClick={runSave} disabled={busy}>
                  {busy ? "Salvataggio..." : "✓ Salva nel database"}
                </button>
                <button style={styles.btnGhost} onClick={() => { setPreview(null); setCsvText(""); }}>Annulla</button>
              </div>
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.h2}>Storico import</h2>
          {imports.length === 0 ? (
            <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessun import effettuato.</p>
          ) : (
            imports.slice(0, 10).map((imp, i) => (
              <div key={i} style={{ ...styles.importItem, alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1 }}><b>{imp.period}</b></span>
                <span style={{ color: COLORS.fog }}>{new Date(imp.timestamp).toLocaleString("it-IT")}</span>
                <button
                  onClick={() => deleteImport(imp.period)}
                  disabled={deletingPeriod === imp.period}
                  title={`Elimina l'import ${imp.period} dal KV`}
                  style={{
                    padding: "4px 10px",
                    background: deletingPeriod === imp.period ? COLORS.charcoal : CP.accentRed + "18",
                    border: `1px solid ${deletingPeriod === imp.period ? COLORS.steel : CP.accentRed + "66"}`,
                    borderRadius: 5,
                    color: deletingPeriod === imp.period ? COLORS.fog : CP.accentRed,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: deletingPeriod === imp.period ? "wait" : "pointer",
                    fontFamily: FONTS.body,
                  }}
                >
                  {deletingPeriod === imp.period ? "Eliminando…" : "Elimina"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}