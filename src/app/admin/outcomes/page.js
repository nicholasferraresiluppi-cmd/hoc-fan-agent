"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import AdminNav from "@/components/AdminNav";

const HOC_COLORS = {
  bgDark: "#0B0B0F",
  white: "#FFFFFF",
  gray: "#9CA3AF",
  orange: "#F59E0B",
  gradient: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
};

function currentISOWeek() {
  const d = new Date();
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((d - start) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export default function OutcomesPage() {
  const { isLoaded } = useUser();
  const [outcomes, setOutcomes] = useState([]);
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

  const input = (label, key, type = "text") => (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={{ display: "block", fontSize: "0.85rem", color: HOC_COLORS.gray, marginBottom: "0.25rem" }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        style={{ width: "100%", padding: "0.5rem", background: `${HOC_COLORS.white}05`, border: `1px solid ${HOC_COLORS.white}30`, borderRadius: "0.5rem", color: HOC_COLORS.white }}
      />
    </div>
  );

  return (
    <div style={{ background: HOC_COLORS.bgDark, minHeight: "100vh", color: HOC_COLORS.white, padding: "2rem" }}>
      <AdminNav />
      <h1 style={{ background: HOC_COLORS.gradient, backgroundClip: "text", color: "transparent", fontWeight: 900 }}>
        Outcome Tracking
      </h1>
      <p style={{ color: HOC_COLORS.gray }}>
        Inserisci i risultati reali settimanali degli operatori. Questi dati chiudono il ciclo: confrontiamo il punteggio AI con la performance vera.
      </p>

      {error && <p style={{ color: "#EF4444" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "2rem", marginTop: "2rem" }}>
        <form onSubmit={submit} style={{ background: `${HOC_COLORS.white}05`, padding: "1.5rem", borderRadius: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Nuovo record</h2>
          {input("Operator ID (es. user_abc123 o alias)", "operatorId")}
          {input("Settimana ISO (es. 2026-W15)", "week")}
          {input("Revenue ($)", "revenue", "number")}
          {input("N. PPV venduti", "ppvCount", "number")}
          {input("N. custom venduti", "customCount", "number")}
          {input("Retention rate %", "retentionRate", "number")}
          {input("Churn count", "churnCount", "number")}
          <div style={{ marginBottom: "0.75rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", color: HOC_COLORS.gray, marginBottom: "0.25rem" }}>Note</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{ width: "100%", minHeight: "60px", padding: "0.5rem", background: `${HOC_COLORS.white}05`, border: `1px solid ${HOC_COLORS.white}30`, borderRadius: "0.5rem", color: HOC_COLORS.white }}
            />
          </div>
          <button type="submit" style={{ padding: "0.6rem 1.5rem", background: HOC_COLORS.gradient, border: "none", color: HOC_COLORS.bgDark, borderRadius: "0.5rem", fontWeight: 700, cursor: "pointer" }}>
            Salva outcome
          </button>
          {saved && <p style={{ color: "#10B981", marginTop: "0.5rem" }}>✅ Salvato</p>}
        </form>

        <div>
          <h2 style={{ fontSize: "1rem" }}>Storico ({outcomes.length})</h2>
          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {outcomes.map((o) => (
              <div key={`${o.operatorId}-${o.week}`} style={{ background: `${HOC_COLORS.white}05`, padding: "0.75rem", borderRadius: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ fontWeight: 700 }}>{o.operatorId} — {o.week}</div>
                <div style={{ fontSize: "0.85rem", color: HOC_COLORS.gray }}>
                  ${o.revenue} • {o.ppvCount} PPV • {o.customCount} custom • retention {o.retentionRate}% • churn {o.churnCount}
                </div>
                {o.notes && <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>{o.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
