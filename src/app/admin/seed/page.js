"use client";

import { useState } from "react";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  green: "#10B981",
  red: "#EF4444",
  white: "#F9FAFB",
  gray: "#9CA3AF",
};

export default function SeedAdminPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async (action) => {
    if (action === "clear" && !confirm("Sicuro di voler cancellare tutti i dati seed?")) return;
    if (action === "reseed" && !confirm("Questo cancella i seed esistenti e li ricrea. Confermi?")) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/admin/seed-leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || "Errore");
      else setResult(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const btn = (bg) => ({
    padding: "0.75rem 1.5rem",
    background: bg,
    color: C.white,
    border: "none",
    borderRadius: "0.5rem",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.6 : 1,
  });

  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
          <h1 style={{ margin: 0 }}>🌱 Seed Demo Data</h1>
          <a href="/" style={{ color: C.orange, textDecoration: "none" }}>← Home</a>
        </div>

        <p style={{ color: C.gray, lineHeight: 1.6, marginBottom: "1.5rem" }}>
          Popola la leaderboard con <strong>10 operatori fittizi</strong> e <strong>~60 giorni di sessioni</strong> con profili skill differenziati.
          Crea anche 3 snapshot storici per la Hall of Fame.
        </p>

        <div style={{ background: `${C.purple}15`, border: `1px solid ${C.purple}40`, borderRadius: "0.75rem", padding: "1rem", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
          <div style={{ color: C.purple, fontWeight: 700, marginBottom: "0.5rem" }}>📋 Profilo operatori:</div>
          <div style={{ color: C.gray, lineHeight: 1.8 }}>
            Giorgia (top: esclusività+dipendenza) · Martina (top: conversione) · Alessia (top: naturalezza) · Sara (top: dipendenza) · Elena · Chiara · Federica · Valentina · Ilaria · Roberta (meno attiva)
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button onClick={() => run("seed")} disabled={loading} style={btn(C.green)}>
            🌱 Seed (crea dati)
          </button>
          <button onClick={() => run("reseed")} disabled={loading} style={btn(C.orange)}>
            🔄 Reseed (clear + crea)
          </button>
          <button onClick={() => run("clear")} disabled={loading} style={btn(C.red)}>
            🗑️ Clear seed
          </button>
        </div>

        {loading && <div style={{ marginTop: "1.5rem", color: C.gray }}>Esecuzione in corso... (può richiedere 10-30s)</div>}

        {result && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: `${C.green}15`, border: `1px solid ${C.green}`, borderRadius: "0.5rem" }}>
            <div style={{ color: C.green, fontWeight: 700, marginBottom: "0.5rem" }}>✓ OK — action: {result.action}</div>
            <pre style={{ color: C.white, fontSize: "0.8rem", margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "1rem" }}>
              <a href="/leaderboard" style={{ color: C.orange }}>→ Classifica</a>
              <a href="/leaderboard/storico" style={{ color: C.orange }}>→ Hall of Fame</a>
              <a href="/admin/dashboard" style={{ color: C.orange }}>→ Dashboard SM</a>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: `${C.red}15`, border: `1px solid ${C.red}`, borderRadius: "0.5rem", color: C.red }}>
            ✗ {error}
          </div>
        )}
      </div>
    </div>
  );
}
