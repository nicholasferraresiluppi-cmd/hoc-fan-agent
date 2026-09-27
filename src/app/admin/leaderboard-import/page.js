"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Upload, Loader2, Check } from "lucide-react";
import { FONTS, CP } from "@/lib/brand";
import { PageHead, Metric, SectionTitle, Disclosure, Notice, DataTable, card, NUM } from "@/components/ds";
import { fmtInt, fmtAgo, MONTHS_IT } from "@/lib/format";

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
  const [fileName, setFileName] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

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

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/UX): la domanda di chi apre
  // la pagina è "i dati Infloww sono aggiornati?" — la risposta era in fondo, in
  // uno storico con chiavi tecniche (monthly:2026-09). Ora è in cima, con l'età
  // del dato; il caricamento resta in 3 passi con anteprima e conferma; i termini
  // dell'anteprima sono tradotti. Logica di lettura file, anteprima e salvataggio invariata.
  const latest = imports[0] || null;
  const curMonthKey = (() => { const d = new Date(); return `monthly:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const curMonth = imports.find((i) => i.period === curMonthKey);
  const curAgeDays = curMonth ? (Date.now() - new Date(curMonth.timestamp).getTime()) / 86400000 : null;
  const canPreview = !!csvText && !!periodId && !busy;
  const importRows = imports.slice(0, 10).map((imp) => ({ ...imp, id: imp.period }));
  const importCols = [
    { key: "period", label: "Periodo", render: (imp) => <span><span style={{ fontWeight: 500 }}>{periodLabel(imp.period)}</span> <span style={{ fontSize: 12, color: CP.textMuted }}>{imp.period}</span></span> },
    { key: "timestamp", label: "Caricato", align: "right", muted: true, sort: (imp) => new Date(imp.timestamp).getTime(), render: (imp) => `${new Date(imp.timestamp).toLocaleString("it-IT")} · ${fmtAgo(new Date(imp.timestamp).getTime())}` },
    { key: "del", label: "", align: "right", sortable: false, render: (imp) => (
      <button onClick={() => deleteImport(imp.period)} disabled={deletingPeriod === imp.period} title={`Elimina l'import ${imp.period} dal KV`}
        style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: deletingPeriod === imp.period ? CP.textMuted : CP.accentRed, cursor: deletingPeriod === imp.period ? "wait" : "pointer" }}>
        {deletingPeriod === imp.period ? "Elimino…" : "Elimina"}
      </button>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Import Infloww" }]}
        title="Import dati Infloww"
        subtitle="Carica il report “By time and employee” di Infloww per un periodo: alimenta lo score mestiere (quello Infloww, accanto alle vendite CP) e l'analisi dell'efficienza in chat."
      />

      {/* Stato: i dati sono aggiornati? */}
      <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <SectionTitle>Ultimo import</SectionTitle>
        {imports.length === 0 ? (
          <div style={{ fontSize: 14, color: CP.textSecondary }}>Nessun import ancora fatto: carica il primo file qui sotto.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <Metric label="Più recente" value={periodLabel(latest.period)} note={`${fmtAgo(new Date(latest.timestamp).getTime())} · ${new Date(latest.timestamp).toLocaleString("it-IT")}`} />
            <Metric label="Mese in corso" value={curMonth ? fmtAgo(new Date(curMonth.timestamp).getTime()) : "non caricato"} note={curMonth ? "ultimo aggiornamento" : "nessun file per questo mese"} danger={!curMonth || curAgeDays > 2} />
            <Metric label="Periodi in archivio" value={fmtInt(imports.length)} />
          </div>
        )}
      </section>
      {imports.length > 0 && (!curMonth || curAgeDays > 2) && (
        <Notice>
          {curMonth
            ? `Il mese in corso non si aggiorna da ${Math.floor(curAgeDays)} giorni: leaderboard e score mostrano i numeri di allora. Scarica un export aggiornato e caricalo qui sotto (sovrascrive quello vecchio).`
            : "Per il mese in corso non c'è ancora nessun file: leaderboard e score del mese restano vuoti finché non lo carichi."}
        </Notice>
      )}

      <Disclosure open={howOpen} onToggle={() => setHowOpen((v) => !v)} title="Come scaricare il file da Infloww" summary="Reports → Performance reports → By time and employee → Export">
        <ol style={{ margin: "0 0 12px 0", paddingLeft: 22, fontSize: 13, color: CP.textSecondary, lineHeight: 1.7 }}>
          <li>Vai su <a href="https://app.infloww.com" target="_blank" rel="noreferrer" style={{ color: CP.accentSoftText }}>app.infloww.com</a> → menu Reports → Performance reports</li>
          <li>Seleziona il report “By time and employee” (è tra i modelli predefiniti)</li>
          <li>Scegli il periodo: il mese intero per la leaderboard mensile, la settimana per quella settimanale</li>
          <li>Premi Export → CSV o Excel (.xlsx)</li>
          <li>Caricalo qui sotto e scegli lo stesso periodo</li>
        </ol>
        <div style={{ fontSize: 12, color: CP.textMuted }}>Per lo storico ripeti per ogni mese: Infloww non ha un export di più periodi insieme.</div>
      </Disclosure>

      {/* Caricamento in 3 passi */}
      <section style={{ ...card, padding: "18px 18px", marginBottom: 14 }}>
        <SectionTitle>Carica un file</SectionTitle>

        <div style={stepLabel}>1. Periodo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          <label style={fieldLabel}>
            Tipo di periodo
            <select style={field} value={periodType} onChange={(e) => { setPeriodType(e.target.value); setPeriodId(""); }}>
              {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label style={fieldLabel}>
            Periodo {periodType === "monthly" ? "(es. 2026-02)" : periodType === "weekly" ? "(es. 2026-W05)" : "(es. 2026-Q1)"}
            <input style={field} value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder={periodType === "monthly" ? "2026-02" : periodType === "weekly" ? "2026-W05" : "2026-Q1"} />
          </label>
        </div>

        <div style={stepLabel}>2. File CSV o Excel</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <label style={{ ...btnGhost, cursor: "pointer" }}>
            <Upload size={14} /> {fileName ? "Cambia file" : "Scegli file"}
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => { setFileName(e.target.files?.[0]?.name || ""); handleFileUpload(e); }}
              style={{ display: "none" }}
            />
          </label>
          <span style={{ fontSize: 13, color: csvText ? CP.textSecondary : CP.textMuted }}>
            {csvText ? <>{fileName && <span style={{ color: CP.textPrimary }}>{fileName}</span>} · {fmtInt(csvText.split(/\r?\n/).length)} righe · {(csvText.length / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} KB</> : "Nessun file scelto"}
          </span>
        </div>

        {error && <Notice danger>{error}</Notice>}

        <div style={stepLabel}>3. Controlla l&apos;anteprima e salva</div>
        {!preview && (
          <button style={{ ...btnPrimary, opacity: canPreview ? 1 : 0.5, cursor: canPreview ? "pointer" : "default" }} onClick={runPreview} disabled={!csvText || !periodId || busy}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Elaboro…</> : "Calcola anteprima"}
          </button>
        )}
        {!preview && !csvText && <span style={{ marginLeft: 10, fontSize: 12, color: CP.textMuted }}>Scegli prima il file.</span>}

        {preview && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 14 }}>
              <Metric label="Righe lette" value={fmtInt(preview.totalRecords)} />
              <Metric label="Valide per lo score" value={fmtInt(preview.eligibleCount)} />
              <Metric label="Account “Mass” esclusi" value={fmtInt(preview.massCount)} note="non entrano nello score" />
              <Metric label="Giorni nel file" value={preview.dateRange ? `${preview.dateRange.from} → ${preview.dateRange.to}` : "n/d"} />
              <Metric label="Gruppi (team per creator)" value={fmtInt(Object.keys(preview.byGroup).length)} />
              {preview.errors?.length > 0 && <Metric label="Righe non lette" value={fmtInt(preview.errors.length)} danger />}
            </div>
            <Disclosure open={groupsOpen} onToggle={() => setGroupsOpen((v) => !v)} title="Righe per gruppo" summary="i 15 gruppi più grandi">
              {Object.entries(preview.byGroup).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([g, c]) => (
                <div key={g} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: `1px solid ${CP.borderSoft}` }}>
                  <span style={{ color: CP.textSecondary }}>{g}</span><span style={NUM}>{fmtInt(c)} righe</span>
                </div>
              ))}
            </Disclosure>
            <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 10 }}>
              Salvando, i dati di {periodType}:{periodId} vengono sostituiti da questo file.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btnPrimary} onClick={runSave} disabled={busy}>
                {busy ? <><Loader2 size={14} className="animate-spin" /> Salvo…</> : <><Check size={14} /> Salva i dati</>}
              </button>
              <button style={btnGhost} onClick={() => { setPreview(null); setCsvText(""); setFileName(""); }}>Annulla</button>
            </div>
          </div>
        )}
      </section>

      <SectionTitle aside="ultimi 10">Storico import</SectionTitle>
      <DataTable columns={importCols} rows={importRows} minWidth={560} empty="Nessun import effettuato." />
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Eliminare un import cancella tutti i dati Infloww di quel periodo: per riaverli va ricaricato il file.</div>
    </div>
  );
}

// "monthly:2026-09" → "settembre 2026"; "weekly:2026-W05" → "settimana 5 del 2026"
function periodLabel(p) {
  const [type, id] = String(p || "").split(":");
  if (type === "monthly" && /^\d{4}-\d{2}$/.test(id || "")) { const [y, m] = id.split("-").map(Number); return `${MONTHS_IT[m - 1]} ${y}`; }
  if (type === "weekly" && /^\d{4}-W\d{2}$/.test(id || "")) return `settimana ${Number(id.slice(6))} del ${id.slice(0, 4)}`;
  if (type === "quarterly" && /^\d{4}-Q\d$/.test(id || "")) return `trimestre ${id.slice(6)} del ${id.slice(0, 4)}`;
  return String(p || "—");
}

const field = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const fieldLabel = { fontSize: 13, color: CP.textSecondary };
const stepLabel = { fontSize: 13, color: CP.textMuted, marginBottom: 8 };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 14, fontFamily: FONTS.body, cursor: "pointer" };
