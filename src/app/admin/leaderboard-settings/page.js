"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

// Etichette KPI in italiano per UI (replicano il foglio Sheets)
const KPI_LABELS = {
  fan_cvr: "Fan CVR",
  unlock_rate: "Unlock Rate",
  avg_earnings_per_paying_fan: "Avg Earnings / Paying Fan",
  golden_ratio: "Golden Ratio",
  sales_per_hour: "Sales / Hour",
  avg_revenue_per_fan: "Avg Revenue / Fan",
  avg_length_of_conversation: "Avg Length of Conv.",
  input_per_message: "Input per Message",
  messages_sent_per_hour: "Messages / Hour",
};

// Ordine canonico dei KPI nella tabella
const KPI_ORDER = [
  "fan_cvr",
  "unlock_rate",
  "avg_earnings_per_paying_fan",
  "golden_ratio",
  "sales_per_hour",
  "avg_revenue_per_fan",
  "avg_length_of_conversation",
  "input_per_message",
  "messages_sent_per_hour",
];

// Quali KPI sono "clock-in only" (non presenti in withoutClockIn)
const CLOCK_IN_ONLY = new Set(["sales_per_hour", "messages_sent_per_hour"]);

export default function LeaderboardSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [weights, setWeights] = useState(null);
  const [thresholds, setThresholds] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [isCustom, setIsCustom] = useState({});

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/leaderboard-settings");
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Errore nel caricamento.");
        setLoading(false);
        return;
      }
      setWeights(deepCopy(data.weights));
      setThresholds(deepCopy(data.thresholds));
      setTiers(deepCopy(data.tiers));
      setIsCustom(data.isCustom || {});
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function sumOfWeights(modeObj) {
    return Object.values(modeObj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/leaderboard-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights, thresholds, tiers }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore nel salvataggio.");
      } else {
        setMessage("Settings salvati. La leaderboard userà i nuovi valori al prossimo refresh.");
        setIsCustom(data.isCustom || {});
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  async function resetAll() {
    if (!confirm("Ripristinare tutti i settings ai default da codice? L'azione cancella gli override salvati.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/leaderboard-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore nel reset.");
      } else {
        setMessage(data.message || "Settings ripristinati ai default.");
        await loadSettings();
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  /* =============== UI handlers =============== */

  function setWeight(mode, kpi, value) {
    setWeights((prev) => {
      const next = deepCopy(prev);
      const num = parseFloat(value);
      if (isNaN(num)) {
        delete next[mode][kpi];
      } else {
        next[mode][kpi] = num;
      }
      return next;
    });
  }

  function setThreshold(idx, key, value) {
    setThresholds((prev) => {
      const next = deepCopy(prev);
      const num = parseFloat(value);
      if (!isNaN(num)) next[idx][key] = num;
      return next;
    });
  }

  function setTier(idx, key, value) {
    setTiers((prev) => {
      const next = deepCopy(prev);
      if (key === "label" || key === "color") {
        next[idx][key] = value;
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) next[idx][key] = num;
      }
      return next;
    });
  }

  /* =============== Styles =============== */

  const styles = {
    page: {
      minHeight: "100vh",
      background: COLORS.obsidian,
      color: COLORS.alabaster,
      fontFamily: FONTS.body,
      padding: "32px 24px",
    },
    container: { maxWidth: 1200, margin: "0 auto" },
    backLink: {
      color: COLORS.fog, fontSize: 13, textDecoration: "none",
      display: "inline-block", marginBottom: 14,
    },
    title: {
      fontFamily: FONTS.display, fontSize: 30, margin: "0 0 6px 0",
      letterSpacing: "-0.01em", fontWeight: 500,
    },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 22, maxWidth: 900, lineHeight: 1.55 },
    section: {
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 14,
      padding: 22,
      marginBottom: 18,
    },
    h2: {
      fontFamily: FONTS.display, fontSize: 20, margin: "0 0 4px 0",
      letterSpacing: "-0.01em", fontWeight: 500,
    },
    sectionDesc: { color: COLORS.fog, fontSize: 13, marginBottom: 18, lineHeight: 1.5 },
    customBadge: {
      display: "inline-block",
      padding: "2px 9px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.06em",
      
      background: COLORS.champagne + "26",
      color: COLORS.champagne,
      border: `1px solid ${COLORS.champagne}55`,
      marginLeft: 8,
      verticalAlign: "middle",
    },
    table: {
      width: "100%", borderCollapse: "collapse", fontSize: 13,
    },
    th: {
      textAlign: "left", padding: "10px 12px",
      color: COLORS.fog, fontSize: 10,
      letterSpacing: "0.08em",
      fontWeight: 500,
      borderBottom: `1px solid ${COLORS.charcoal}`,
    },
    td: {
      padding: "10px 12px",
      borderBottom: `1px solid ${COLORS.charcoal}88`,
    },
    input: {
      padding: "7px 10px",
      background: COLORS.charcoal,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 7,
      color: COLORS.alabaster,
      fontSize: 13,
      fontFamily: FONTS.mono,
      width: 90,
      textAlign: "right",
    },
    inputText: {
      padding: "7px 10px",
      background: COLORS.charcoal,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 7,
      color: COLORS.alabaster,
      fontSize: 13,
      fontFamily: FONTS.body,
      width: 110,
    },
    inputColor: {
      width: 36, height: 30, padding: 0,
      background: COLORS.charcoal,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 6,
      cursor: "pointer",
    },
    sumRow: (ok) => ({
      padding: "10px 12px",
      background: ok ? "#3FB97E15" : "#D4454515",
      color: ok ? "#3FB97E" : "#D44545",
      fontFamily: FONTS.mono,
      fontSize: 13,
      fontWeight: 600,
      borderTop: `1px solid ${COLORS.charcoal}`,
      display: "flex",
      justifyContent: "space-between",
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
    alertError: {
      background: "#D4454520",
      color: "#D44545",
      padding: 12,
      borderRadius: 8,
      marginBottom: 14,
      fontSize: 13,
    },
    alertOk: {
      background: "#3FB97E20",
      color: "#3FB97E",
      padding: 12,
      borderRadius: 8,
      marginBottom: 14,
      fontSize: 13,
    },
    hint: {
      fontSize: 12,
      color: COLORS.mist,
      marginTop: 8,
      lineHeight: 1.5,
    },
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <p style={{ color: COLORS.fog }}>Caricamento settings…</p>
        </div>
      </div>
    );
  }

  // Validation hints
  const sumWith = sumOfWeights(weights?.withClockIn);
  const sumWithout = sumOfWeights(weights?.withoutClockIn);
  const sumWithOk = Math.abs(sumWith - 1) < 0.001;
  const sumWithoutOk = Math.abs(sumWithout - 1) < 0.001;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Settings Leaderboard</span>
            </div>
          }
          section="Data · Config"
          title="Settings Leaderboard Operativa"
          subtitle={'Pesi KPI, soglie di normalizzazione e cutoff tier — replica il foglio "Settings" dello Sheets HOC. Modifiche immediate. Ripristino default disponibile.'}
        />

        {error && <div style={styles.alertError}>{error}</div>}
        {message && <div style={styles.alertOk}>{message}</div>}

        {/* ============ PESI KPI ============ */}
        <div style={styles.section}>
          <h2 style={styles.h2}>
            Pesi KPI
            {isCustom.weights && <span style={styles.customBadge}>Custom</span>}
          </h2>
          <p style={styles.sectionDesc}>
            Quanto pesa ogni KPI nello Score finale (somma 1.00 per modalità). Modalità "with clock-in"
            include Sales/h e Messages/h (richiede Clocked Hours valido), "without" usa 7 KPI con pesi
            ribilanciati.
          </p>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>KPI</th>
                <th style={{ ...styles.th, textAlign: "right" }}>With clock-in</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Without clock-in</th>
              </tr>
            </thead>
            <tbody>
              {KPI_ORDER.map((kpi) => (
                <tr key={kpi}>
                  <td style={styles.td}>{KPI_LABELS[kpi] || kpi}</td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={weights?.withClockIn?.[kpi] ?? ""}
                      onChange={(e) => setWeight("withClockIn", kpi, e.target.value)}
                      style={styles.input}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {CLOCK_IN_ONLY.has(kpi) ? (
                      <span style={{ color: COLORS.mist, fontSize: 12 }}>—</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={weights?.withoutClockIn?.[kpi] ?? ""}
                        onChange={(e) => setWeight("withoutClockIn", kpi, e.target.value)}
                        style={styles.input}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.sumRow(sumWithOk)}>
            <span>Somma With clock-in</span>
            <span>{sumWith.toFixed(4)} / 1.0000 {sumWithOk ? "✓" : "⚠"}</span>
          </div>
          <div style={styles.sumRow(sumWithoutOk)}>
            <span>Somma Without clock-in</span>
            <span>{sumWithout.toFixed(4)} / 1.0000 {sumWithoutOk ? "✓" : "⚠"}</span>
          </div>
        </div>

        {/* ============ SOGLIE NORMALIZZAZIONE ============ */}
        <div style={styles.section}>
          <h2 style={styles.h2}>
            Soglie di normalizzazione
            {isCustom.thresholds && <span style={styles.customBadge}>Custom</span>}
          </h2>
          <p style={styles.sectionDesc}>
            Come trasformare un KPI grezzo in punti 0-100 in base allo scarto dalla media del Group
            (team modella). Ogni riga: se valore &lt; media × multiplier → assegna i punti. Sopra
            l'ultimo multiplier → 100 punti.
          </p>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Step</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Multiplier</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Punti</th>
                <th style={styles.th}>Significato</th>
              </tr>
            </thead>
            <tbody>
              {thresholds?.map((t, i) => (
                <tr key={i}>
                  <td style={styles.td}>#{i + 1}</td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <input
                      type="number"
                      step="0.01"
                      value={t.multiplier}
                      onChange={(e) => setThreshold(i, "multiplier", e.target.value)}
                      style={styles.input}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={t.score}
                      onChange={(e) => setThreshold(i, "score", e.target.value)}
                      style={styles.input}
                    />
                  </td>
                  <td style={{ ...styles.td, color: COLORS.mist, fontSize: 12 }}>
                    valore &lt; media × {t.multiplier?.toFixed(2)} → {t.score} punti
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={styles.hint}>
            Default: 0.75/0.90/1.00/1.10/1.25 → 0/20/40/60/80 punti, sopra → 100. Multiplier e punti
            devono essere strettamente crescenti.
          </div>
        </div>

        {/* ============ TIER CUTOFFS ============ */}
        <div style={styles.section}>
          <h2 style={styles.h2}>
            Soglie tier
            {isCustom.tiers && <span style={styles.customBadge}>Custom</span>}
          </h2>
          <p style={styles.sectionDesc}>
            Cutoff per assegnare il badge tier (Critical / Weak / Average / Good / Strong / Elite)
            in base allo Score finale. I range devono essere contigui e coprire 0-100.
          </p>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Label</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Min</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Max</th>
                <th style={styles.th}>Color</th>
              </tr>
            </thead>
            <tbody>
              {tiers?.map((t, i) => (
                <tr key={i}>
                  <td style={styles.td}>
                    <input
                      type="text"
                      value={t.label}
                      onChange={(e) => setTier(i, "label", e.target.value)}
                      style={styles.inputText}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={t.min}
                      onChange={(e) => setTier(i, "min", e.target.value)}
                      style={styles.input}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={t.max}
                      onChange={(e) => setTier(i, "max", e.target.value)}
                      style={styles.input}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="color"
                      value={t.color}
                      onChange={(e) => setTier(i, "color", e.target.value)}
                      style={styles.inputColor}
                    />
                    <span style={{ marginLeft: 8, fontFamily: FONTS.mono, fontSize: 11, color: COLORS.mist }}>
                      {t.color}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ============ ACTIONS ============ */}
        <div style={styles.actions}>
          <button
            style={styles.btnPrimary}
            onClick={saveAll}
            disabled={saving || !sumWithOk || !sumWithoutOk}
          >
            {saving ? "Salvataggio…" : "Salva tutti i settings"}
          </button>
          <button
            style={styles.btnGhost}
            onClick={loadSettings}
            disabled={saving}
          >
            Annulla modifiche
          </button>
          <div style={{ flex: 1 }} />
          <button
            style={styles.btnGhost}
            onClick={resetAll}
            disabled={saving}
          >
            Ripristina default
          </button>
        </div>

        <div style={styles.hint}>
          I valori salvati vengono applicati immediatamente al ricalcolo della Leaderboard Operativa
          (refresh della pagina). Il ripristino cancella gli override e torna ai default da codice.
        </div>
      </div>
    </div>
  );
}
