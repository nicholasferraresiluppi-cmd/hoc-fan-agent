"use client";

// Risultati reali settimanali (redesign DS 26/09/2026). Inserimento a mano dei
// risultati veri di un operatore in una settimana, per confrontarli un domani
// col voto del simulatore. Etichette in italiano, modulo compatto a griglia,
// storico in tabella ordinabile. API e campi inviati invariati.
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { CP, FONTS } from "@/lib/brand";
import { fmt$, fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, SectionTitle, Notice, DataTable, card } from "@/components/ds";

function currentISOWeek() {
  const d = new Date();
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((d - start) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 };
const inp = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };
const n = (v) => (v === "" || v == null ? null : Number(v));

export default function OutcomesPage() {
  const { isLoaded } = useUser();
  const [outcomes, setOutcomes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({
    operatorId: "",
    week: currentISOWeek(),
    revenue: "",
    ppvCount: "",
    customCount: "",
    retentionRate: "",
    churnCount: "",
    notes: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  async function loadOutcomes() {
    const r = await fetch("/api/admin/outcomes?limit=100");
    const d = await r.json();
    setOutcomes(d.outcomes || []);
    if (d.error) setError(d.error);
    setLoaded(true);
  }

  useEffect(() => {
    if (!isLoaded) return;
    loadOutcomes();
  }, [isLoaded]);

  async function submit(e) {
    e.preventDefault();
    setSaved(false);
    try {
      const res = await fetch("/api/admin/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        setForm({ ...form, revenue: "", ppvCount: "", customCount: "", retentionRate: "", churnCount: "", notes: "" });
        loadOutcomes();
      } else {
        alert(data.error || "Errore");
      }
    } catch (e) {
      alert(e.message);
    }
  }

  const field = (label, key, type = "text", placeholder = "") => (
    <div>
      <label style={lbl} htmlFor={`oc-${key}`}>{label}</label>
      <input id={`oc-${key}`} type={type} value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={inp} />
    </div>
  );

  const operators = new Set(outcomes.map((o) => o.operatorId)).size;

  const columns = [
    { key: "operatorId", label: "Operatore" },
    { key: "week", label: "Settimana", render: (o) => <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{o.week}</span> },
    { key: "revenue", label: "Venduto", align: "right", sort: (o) => n(o.revenue), render: (o) => fmt$(n(o.revenue)) },
    { key: "ppvCount", label: "PPV", align: "right", sort: (o) => n(o.ppvCount), render: (o) => fmtInt(n(o.ppvCount)) },
    { key: "customCount", label: "Custom", align: "right", sort: (o) => n(o.customCount), render: (o) => fmtInt(n(o.customCount)) },
    { key: "retentionRate", label: "Fan trattenuti", align: "right", sort: (o) => n(o.retentionRate), render: (o) => (n(o.retentionRate) == null ? "—" : `${o.retentionRate}%`) },
    { key: "churnCount", label: "Fan persi", align: "right", sort: (o) => n(o.churnCount), render: (o) => fmtInt(n(o.churnCount)) },
    { key: "notes", label: "Note", muted: true, sortable: false, render: (o) => <span style={{ fontSize: 13 }}>{o.notes || "—"}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "Risultati reali" }]}
        title="Risultati reali degli operatori"
        subtitle="Scrivi qui i risultati veri di un operatore in una settimana. Servono a verificare, più avanti, se chi prende voti alti nel simulatore vende davvero di più."
      />

      {error && <Notice danger>{String(error)}</Notice>}

      {loaded && !error && (
        <HeroMetric
          label="Settimane registrate"
          value={fmtInt(outcomes.length)}
          compare={outcomes.length ? `${fmtInt(operators)} operatori diversi, tra le ultime 100 registrazioni.` : "Nessuna registrazione ancora."}
          hint="Il confronto con il voto del simulatore ha senso solo con molte settimane per più operatori: finché sono poche, è un archivio."
        />
      )}

      <section style={{ ...card, padding: "18px 20px", marginBottom: 24 }}>
        <SectionTitle>Nuova settimana</SectionTitle>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
            {field("Operatore (id utente o nome)", "operatorId", "text", "Es. user_abc123 o Nome Cognome")}
            {field("Settimana (anno-W-numero)", "week", "text", "Es. 2026-W15")}
            {field("Venduto ($)", "revenue", "number")}
            {field("PPV venduti", "ppvCount", "number")}
            {field("Contenuti custom venduti", "customCount", "number")}
            {field("Fan trattenuti (%)", "retentionRate", "number")}
            {field("Fan persi (disdette)", "churnCount", "number")}
          </div>
          <label style={lbl} htmlFor="oc-notes">Note</label>
          <textarea id="oc-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button type="submit" style={{ padding: "8px 16px", background: CP.accent, border: `1px solid ${CP.accent}`, color: CP.accentInk, borderRadius: 8, fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
              Salva la settimana
            </button>
            {saved && <span style={{ color: CP.textSecondary, fontSize: 13 }}>Salvata.</span>}
          </div>
        </form>
      </section>

      <SectionTitle aside={outcomes.length ? `${fmtInt(outcomes.length)} righe` : null}>Storico</SectionTitle>
      <DataTable
        columns={columns}
        rows={outcomes.map((o) => ({ ...o, id: `${o.operatorId}-${o.week}` }))}
        minWidth={860}
        maxHeight={600}
        empty={loaded ? "Nessuna settimana registrata ancora: la prima la inserisci nel modulo qui sopra." : "Caricamento…"}
      />
    </div>
  );
}
