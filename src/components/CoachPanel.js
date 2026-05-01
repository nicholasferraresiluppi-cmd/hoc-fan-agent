"use client";

/**
 * CoachPanel — V6.7
 *
 * Pannello live coach che si aggiorna mentre l'operatore digita una bozza.
 * Integra in /api/coach con throttling progressivo per ridurre i costi:
 *  - Prima call sulla bozza (mode="rich"): score + missing_markers + 3 alternative + skill breakdown
 *  - Call successive sulla stessa bozza (mode="light"): solo score + missing_markers
 *  - Trigger: debounced 2s dopo l'ultima keystroke
 *  - Pausa toggleable: l'operatore può fermare il coach (zero call) e riattivarlo
 *
 * Uso (in src/app/page.js, dentro screen "scenario-play"):
 *   <CoachPanel
 *     draft={inputText}
 *     scenarioId={selectedScenario?.id}
 *     creatorId={selectedCreator?.id}
 *     archetypeId={fanArchetype?.id}
 *     fanState={fanState}
 *     onApplyAlternative={(text) => setInputText(text)}
 *   />
 */
import { useEffect, useRef, useState } from "react";
import { COLORS, FONTS } from "@/lib/brand";

const DEBOUNCE_MS = 2000;
// Soglia di "novità" della bozza: se la bozza è cambiata oltre questa soglia
// di token diversi, scatta una nuova call "rich" (anche se ne avevamo già fatta una).
const RICH_REFRESH_TOKEN_DELTA = 5;

function tokenize(s) {
  return (s || "").toLowerCase().split(/\s+/).filter(Boolean);
}

function tokenDelta(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  let diff = 0;
  for (const t of ta) if (!tb.has(t)) diff++;
  for (const t of tb) if (!ta.has(t)) diff++;
  return diff;
}

const SKILL_LABELS = {
  naturalezza: "Naturalezza",
  esclusivita: "Esclusività",
  dipendenza: "Dipendenza",
  conversione: "Conversione",
  tono: "Tono",
  gestione_obiezioni: "Gestione obiezioni",
};

function scoreColor(value) {
  if (value === null || value === undefined) return COLORS.mist;
  if (value >= 70) return COLORS.verdant;
  if (value >= 50) return COLORS.champagne;
  if (value >= 30) return COLORS.ember;
  return COLORS.signal;
}

function ScoreCircle({ value }) {
  const color = scoreColor(value);
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: `${color}25`,
        border: `3px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.display,
        fontSize: 22,
        fontWeight: 700,
        color: color,
        flexShrink: 0,
      }}
    >
      {value ?? "—"}
    </div>
  );
}

function SkillBar({ label, value }) {
  if (value === undefined || value === null) return null;
  const color = scoreColor(value);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.fog, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: COLORS.alabaster, fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 4, background: COLORS.charcoal, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export default function CoachPanel({
  draft,
  scenarioId,
  creatorId,
  archetypeId,
  fanState,
  onApplyAlternative,
}) {
  const [paused, setPaused] = useState(false);
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAlts, setShowAlts] = useState(true);

  // Riferimenti per throttling
  const lastRichDraftRef = useRef(""); // bozza per cui abbiamo già fatto un rich
  const lastCallDraftRef = useRef("");  // ultima bozza valutata (qualunque mode)
  const debounceTimerRef = useRef(null);
  const inFlightRef = useRef(false);

  // Cleanup timer al unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Reset se l'operatore mette in pausa
    if (paused) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    // No call su bozza vuota o cortissima
    const trimmed = (draft || "").trim();
    if (trimmed.length < 5) {
      setOutput(null);
      setError(null);
      return;
    }

    // Se la bozza non è cambiata rispetto all'ultima call, non rilanciare
    if (trimmed === lastCallDraftRef.current) return;

    // Debounce
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      if (inFlightRef.current) return;

      // Decidi mode: rich se è una bozza nuova (delta significativo dal precedente rich), altrimenti light
      const delta = tokenDelta(trimmed, lastRichDraftRef.current);
      const mode = !lastRichDraftRef.current || delta > RICH_REFRESH_TOKEN_DELTA ? "rich" : "light";

      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft: trimmed,
            scenarioId,
            creatorId,
            archetypeId,
            fanState,
            mode,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          // In light mode preserviamo le alternative/skills della call rich precedente
          setOutput((prev) => {
            if (mode === "light" && prev) {
              return {
                ...prev,
                score: data.score,
                missing_markers: data.missing_markers,
                tip: data.tip,
                mode: "light",
              };
            }
            return data;
          });
          lastCallDraftRef.current = trimmed;
          if (mode === "rich") lastRichDraftRef.current = trimmed;
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    }, DEBOUNCE_MS);
  }, [draft, scenarioId, creatorId, archetypeId, fanState, paused]);

  // Niente bozza → niente pannello
  if (!draft || draft.trim().length < 5) {
    return null;
  }

  const styles = {
    panel: {
      marginTop: 12,
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 12,
      padding: 14,
      fontFamily: FONTS.body,
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    title: { fontSize: 12, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    pauseBtn: {
      background: paused ? COLORS.signal + "20" : COLORS.charcoal,
      color: paused ? COLORS.signal : COLORS.fog,
      border: `1px solid ${paused ? COLORS.signal : COLORS.charcoal}`,
      borderRadius: 6,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      fontFamily: FONTS.body,
    },
    row: { display: "flex", alignItems: "center", gap: 14 },
    markersList: { listStyle: "none", padding: 0, margin: 0 },
    marker: {
      fontSize: 13,
      color: COLORS.alabaster,
      padding: "4px 0",
      borderBottom: `1px solid ${COLORS.charcoal}`,
    },
    altCard: {
      background: COLORS.charcoal,
      borderRadius: 8,
      padding: 10,
      marginBottom: 6,
      cursor: "pointer",
      transition: "border-color 0.15s",
      border: `1px solid transparent`,
    },
    altLabel: { fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 },
    altText: { fontSize: 13, color: COLORS.alabaster, lineHeight: 1.45 },
    tip: {
      fontSize: 12,
      color: COLORS.alabaster,
      background: COLORS.charcoal,
      padding: 8,
      borderRadius: 6,
      borderLeft: `3px solid ${COLORS.champagne}`,
      fontStyle: "italic",
      marginTop: 8,
    },
    sectionLabel: { fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 12, marginBottom: 6 },
  };

  if (paused) {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>🎯 Coach in pausa</span>
          <button onClick={() => setPaused(false)} style={styles.pauseBtn}>
            Riattiva
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>🎯 Coach {loading ? "(valutando…)" : output ? `· ${output.benchmarkOperator || "spagnuolo"}` : ""}</span>
        <button onClick={() => setPaused(true)} style={styles.pauseBtn}>
          Pausa
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: COLORS.signal }}>
          {error}
        </div>
      )}

      {!output && !loading && !error && (
        <div style={{ fontSize: 12, color: COLORS.mist }}>Continua a digitare…</div>
      )}

      {output && (
        <>
          <div style={styles.row}>
            <ScoreCircle value={output.score} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: COLORS.alabaster, fontWeight: 600 }}>
                {output.score >= 70
                  ? "In stampo"
                  : output.score >= 50
                  ? "Quasi"
                  : output.score >= 30
                  ? "Da rivedere"
                  : "Fuori stampo"}
              </div>
              {output.tip && <div style={styles.tip}>💡 {output.tip}</div>}
            </div>
          </div>

          {output.missing_markers && output.missing_markers.length > 0 && (
            <div>
              <div style={styles.sectionLabel}>Cosa manca</div>
              <ul style={styles.markersList}>
                {output.missing_markers.map((m, i) => (
                  <li key={i} style={styles.marker}>• {m}</li>
                ))}
              </ul>
            </div>
          )}

          {output.skills && Object.keys(output.skills).length > 0 && (
            <div>
              <div style={styles.sectionLabel}>Skill breakdown (su questa bozza)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                {Object.entries(SKILL_LABELS).map(([key, label]) => (
                  <SkillBar key={key} label={label} value={output.skills[key]} />
                ))}
              </div>
            </div>
          )}

          {output.alternatives && output.alternatives.length > 0 && (
            <div>
              <div style={{ ...styles.sectionLabel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Alternative riformulate</span>
                <button
                  onClick={() => setShowAlts((v) => !v)}
                  style={{ ...styles.pauseBtn, fontSize: 10 }}
                >
                  {showAlts ? "Nascondi" : "Mostra"}
                </button>
              </div>
              {showAlts &&
                output.alternatives.map((alt, i) => (
                  <div
                    key={i}
                    style={styles.altCard}
                    onClick={() => onApplyAlternative && onApplyAlternative(alt.text)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = COLORS.champagne;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                    title="Click per usare questa versione"
                  >
                    <div style={styles.altLabel}>{alt.variant || `Alt ${i + 1}`}</div>
                    <div style={styles.altText}>{alt.text}</div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
