"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { COLORS, FONTS } from "@/lib/brand";

const CATEGORIES = ["Big", "Medium", "Small"];

const CATEGORY_COLORS = {
  Big: "#4F8CCB",
  Medium: "#D4AF7A",
  Small: "#8F8A82",
};

function fmtNum(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("it-IT");
}
function fmtCurrency(v) {
  if (v == null) return "—";
  return "$" + Math.round(v).toLocaleString("it-IT");
}

export default function GroupCategoriesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [assignments, setAssignments] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [stats, setStats] = useState({});
  const [referencePeriod, setReferencePeriod] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/group-categories");
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Errore nel caricamento.");
        setLoading(false);
        return;
      }
      setAssignments(data.assignments || {});
      setSuggestions(data.suggestions || {});
      setStats(data.stats || {});
      setReferencePeriod(data.reference_period);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function setCategory(group, category) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (category === "" || category == null) {
        delete next[group];
      } else {
        next[group] = category;
      }
      return next;
    });
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/group-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore nel salvataggio.");
      } else {
        setMessage("Categorie salvate.");
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  async function applySuggested() {
    if (!confirm("Applicare i suggerimenti automatici a TUTTI i Group? Sovrascrive eventuali override manuali.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/group-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_suggestions" }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore.");
      } else {
        setMessage(data.message || "Suggerimenti applicati.");
        setAssignments(data.assignments || {});
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  async function resetAll() {
    if (!confirm("Cancellare TUTTE le assegnazioni? I Group resteranno senza categoria fino a nuovo override manuale o applicazione suggeriti.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/group-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore.");
      } else {
        setMessage(data.message || "Categorie resettate.");
        setAssignments({});
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  // Lista Group ordinata per paying_fans desc
  const groupList = useMemo(() => {
    const all = new Set([...Object.keys(stats), ...Object.keys(assignments), ...Object.keys(suggestions)]);
    return Array.from(all).sort((a, b) => {
      const af = stats[a]?.paying_fans || 0;
      const bf = stats[b]?.paying_fans || 0;
      return bf - af;
    });
  }, [stats, assignments, suggestions]);

  // Conteggio per categoria
  const counts = useMemo(() => {
    const c = { Big: 0, Medium: 0, Small: 0, none: 0 };
    for (const g of groupList) {
      const cat = assignments[g];
      if (cat) c[cat] += 1;
      else c.none += 1;
    }
    return c;
  }, [assignments, groupList]);

  const styles = {
    page: {
      minHeight: "100vh",
      background: COLORS.obsidian,
      color: COLORS.alabaster,
      fontFamily: FONTS.body,
      padding: "32px 24px",
    },
    container: { maxWidth: 1200, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 14 },
    title: {
      fontFamily: FONTS.display, fontSize: 30, margin: "0 0 6px 0",
      letterSpacing: "-0.01em", fontWeight: 500,
    },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    card: {
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 14,
      padding: 22,
      marginBottom: 18,
    },
    summary: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
      marginBottom: 18,
    },
    statCard: (color) => ({
      background: COLORS.graphite,
      border: `1px solid ${color || COLORS.charcoal}55`,
      borderRadius: 12,
      padding: "14px 16px",
    }),
    statLabel: { fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 },
    statValue: (color) => ({
      fontFamily: FONTS.mono, fontWeight: 700, fontSize: 22,
      color: color || COLORS.alabaster,
    }),
    table: {
      width: "100%", borderCollapse: "collapse", fontSize: 13,
    },
    th: {
      textAlign: "left", padding: "10px 12px",
      color: COLORS.fog, fontSize: 10,
      textTransform: "uppercase", letterSpacing: "0.08em",
      fontWeight: 500,
      borderBottom: `1px solid ${COLORS.charcoal}`,
    },
    td: {
      padding: "10px 12px",
      borderBottom: `1px solid ${COLORS.charcoal}88`,
    },
    select: {
      padding: "6px 10px",
      background: COLORS.charcoal,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 7,
      color: COLORS.alabaster,
      fontSize: 13,
      fontFamily: FONTS.body,
      minWidth: 110,
    },
    badge: (color) => ({
      display: "inline-block",
      padding: "2px 9px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      background: color + "26",
      color: color,
      border: `1px solid ${color}55`,
    }),
    actions: {
      display: "flex", gap: 10, marginTop: 18,
      paddingTop: 18, borderTop: `1px solid ${COLORS.charcoal}`,
      flexWrap: "wrap",
    },
    btnPrimary: {
      padding: "11px 20px",
      background: COLORS.champagne,
      color: COLORS.obsidian,
      border: "none",
      borderRadius: 8,
      fontFamily: FONTS.body,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
    },
    btnGhost: {
      padding: "11px 20px",
      background: "transparent",
      color: COLORS.alabaster,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 8,
      fontFamily: FONTS.body,
      fontSize: 13,
      cursor: "pointer",
    },
    alertError: { background: "#D4454520", color: "#D44545", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 },
    alertOk: { background: "#3FB97E20", color: "#3FB97E", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 },
    info: { background: "#4F8CCB15", color: COLORS.alabaster, padding: 14, borderRadius: 10, marginBottom: 18, fontSize: 13, lineHeight: 1.5, border: "1px solid #4F8CCB33" },
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <p style={{ color: COLORS.fog }}>Caricamento Group e statistiche…</p>
        </div>
      </div>
    );
  }

  if (groupList.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <Link href="/admin" style={styles.backLink}>← Admin</Link>
          <h1 style={styles.title}>Categorie Group</h1>
          <div style={styles.info}>
            Nessun dato disponibile. Importa prima un CSV su <Link href="/admin/leaderboard-import" style={{ color: COLORS.champagne }}>Import KPI Infloww</Link> per popolare i Group e calcolare i suggerimenti automatici.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <Link href="/admin" style={styles.backLink}>← Admin</Link>
        <h1 style={styles.title}>Categorie Group</h1>
        <p style={styles.sub}>
          Classifica ogni Group (team modella) come <b>Big</b>, <b>Medium</b> o <b>Small</b>.
          Usato come filtro nella Leaderboard Operativa. Lo Score di ogni operatore resta calcolato
          sulla media del proprio Group specifico — la categoria è solo una vista per confrontare
          performer di scala simile.
        </p>

        {error && <div style={styles.alertError}>{error}</div>}
        {message && <div style={styles.alertOk}>{message}</div>}

        <div style={styles.info}>
          Suggerimenti automatici basati su <b>paying fans totali</b> nell'ultimo periodo importato
          {referencePeriod ? ` (${referencePeriod})` : ""}: top 33% → Big, mid 33% → Medium, bottom 33% → Small.
          Puoi override manualmente caso per caso.
        </div>

        <div style={styles.summary}>
          <div style={styles.statCard()}>
            <div style={styles.statLabel}>Group totali</div>
            <div style={styles.statValue()}>{groupList.length}</div>
          </div>
          <div style={styles.statCard(CATEGORY_COLORS.Big)}>
            <div style={styles.statLabel}>Big</div>
            <div style={styles.statValue(CATEGORY_COLORS.Big)}>{counts.Big}</div>
          </div>
          <div style={styles.statCard(CATEGORY_COLORS.Medium)}>
            <div style={styles.statLabel}>Medium</div>
            <div style={styles.statValue(CATEGORY_COLORS.Medium)}>{counts.Medium}</div>
          </div>
          <div style={styles.statCard(CATEGORY_COLORS.Small)}>
            <div style={styles.statLabel}>Small</div>
            <div style={styles.statValue(CATEGORY_COLORS.Small)}>{counts.Small}</div>
          </div>
        </div>

        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Group</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Paying fans</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Sales</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Operatori</th>
                <th style={styles.th}>Suggerito</th>
                <th style={styles.th}>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {groupList.map((g) => {
                const s = stats[g] || {};
                const sug = suggestions[g];
                const cur = assignments[g] || "";
                return (
                  <tr key={g}>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{g}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontFamily: FONTS.mono }}>{fmtNum(s.paying_fans)}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontFamily: FONTS.mono }}>{fmtCurrency(s.sales)}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontFamily: FONTS.mono }}>{fmtNum(s.operators_count)}</td>
                    <td style={styles.td}>
                      {sug ? (
                        <span style={styles.badge(CATEGORY_COLORS[sug])}>{sug}</span>
                      ) : (
                        <span style={{ color: COLORS.mist, fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <select
                        value={cur}
                        onChange={(e) => setCategory(g, e.target.value)}
                        style={{
                          ...styles.select,
                          color: cur ? CATEGORY_COLORS[cur] : COLORS.fog,
                          borderColor: cur ? CATEGORY_COLORS[cur] + "55" : COLORS.charcoal,
                        }}
                      >
                        <option value="">Nessuna</option>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.actions}>
          <button style={styles.btnPrimary} onClick={saveAll} disabled={saving}>
            {saving ? "Salvataggio…" : "Salva categorie"}
          </button>
          <button style={styles.btnGhost} onClick={loadData} disabled={saving}>
            Annulla modifiche
          </button>
          <div style={{ flex: 1 }} />
          <button style={styles.btnGhost} onClick={applySuggested} disabled={saving}>
            Applica suggerimenti automatici
          </button>
          <button style={styles.btnGhost} onClick={resetAll} disabled={saving}>
            Cancella tutte
          </button>
        </div>
      </div>
    </div>
  );
}
