"use client";

/**
 * <InlineQA> — Mini Q&A inline contestuale.
 *
 * Usato nelle pagine tutorial (es. /welcome/score-friendly) per permettere
 * al lettore di fare domande in qualsiasi punto senza perdere il filo:
 *   - lista di "domande comuni" pre-scritte cliccabili (risposta hardcoded)
 *   - textarea per domanda libera → POST /api/score-help (Claude Haiku)
 *
 * Props:
 *   - sectionId: string usato come hint contestuale per l'AI
 *   - presets: [{ q: string, a: string }] — domande tipiche pre-scritte
 *
 * UI: pannello a tendina chiuso di default ("? Hai una domanda su questa parte?").
 * Quando aperto, mostra preset + textarea + cronologia Q&A della sessione.
 */
import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";

export default function InlineQA({ sectionId, presets = [] }) {
  const [open, setOpen] = useState(false);
  const [customQ, setCustomQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // [{ q, a, source: 'preset' | 'ai' }]
  const [error, setError] = useState(null);

  function askPreset(p) {
    setHistory((h) => [...h, { q: p.q, a: p.a, source: "preset" }]);
  }

  async function askCustom() {
    const q = customQ.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/score-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, section: sectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setHistory((h) => [...h, { q, a: data.answer, source: "ai" }]);
      setCustomQ("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrapper}>
      <button onClick={() => setOpen(!open)} style={triggerBtn(open)}>
        <HelpCircle size={14} color={CP.accentGreen} />
        <span style={{ flex: 1, textAlign: "left" }}>
          {open ? "Chiudi" : "Hai una domanda su questa parte?"}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Cronologia Q&A */}
          {history.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {history.map((item, i) => (
                <div key={i} style={qaItem}>
                  <div style={qBubble}>
                    <span style={qLabel}>D.</span>
                    {item.q}
                  </div>
                  <div style={aBubble}>
                    <span style={aLabel}>
                      {item.source === "ai" ? <><Sparkles size={10} /> R. AI</> : "R."}
                    </span>
                    <span style={{ whiteSpace: "pre-wrap" }}>{item.a}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Preset domande */}
          {presets.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={presetsLabel}>Domande frequenti</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => askPreset(p)}
                    disabled={history.some((h) => h.q === p.q)}
                    style={presetBtn(history.some((h) => h.q === p.q))}
                  >
                    {p.q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Domanda libera */}
          <div>
            <div style={presetsLabel}>Oppure scrivi la tua domanda</div>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <textarea
                value={customQ}
                onChange={(e) => setCustomQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askCustom(); }
                }}
                placeholder="Scrivi qui (Enter per inviare, Shift+Enter per andare a capo)"
                rows={2}
                maxLength={500}
                style={textareaStyle}
                disabled={loading}
              />
              <button onClick={askCustom} disabled={loading || !customQ.trim()} style={submitBtn(loading || !customQ.trim())}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : "Chiedi"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: CP.textMuted, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
              <span>{customQ.length} / 500</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Sparkles size={10} color={CP.accentGreen} /> Risposta generata da AI
              </span>
            </div>
          </div>

          {error && (
            <div style={errorBox}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const wrapper = { marginTop: 14 };
const triggerBtn = (open) => ({
  display: "flex", alignItems: "center", gap: 8,
  width: "100%", padding: "10px 14px",
  background: open ? CP.surface : CP.surface,
  border: `1px solid ${open ? CP.accentGreen + "55" : CP.border}`,
  borderRadius: 10,
  color: CP.textSecondary, fontSize: 13, fontFamily: FONTS.body,
  cursor: "pointer", transition: "border-color 0.15s",
});
const panelStyle = {
  marginTop: 8,
  padding: "16px 18px",
  background: CP.surface,
  border: `1px solid ${CP.border}`,
  borderRadius: 10,
};
const qaItem = { display: "flex", flexDirection: "column", gap: 6 };
const qBubble = {
  padding: "10px 12px",
  background: CP.surfaceAlt,
  border: `1px solid ${CP.border}`,
  borderRadius: 8,
  fontSize: 13,
  color: CP.textPrimary,
  display: "flex", alignItems: "flex-start", gap: 8,
  lineHeight: 1.5,
};
const aBubble = {
  padding: "10px 12px",
  background: CP.accentGreen + "10",
  border: `1px solid ${CP.accentGreen}33`,
  borderRadius: 8,
  fontSize: 13,
  color: CP.textPrimary,
  display: "flex", flexDirection: "column", gap: 6,
  lineHeight: 1.55,
};
const qLabel = { fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: CP.textMuted, letterSpacing: "0.08em" };
const aLabel = { fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: CP.accentGreen, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 4 };
const presetsLabel = { fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, fontFamily: FONTS.mono, marginBottom: 8 };
const presetBtn = (used) => ({
  padding: "6px 11px",
  background: used ? CP.surfaceAlt : "transparent",
  border: `1px solid ${used ? CP.border : CP.borderStrong}`,
  borderRadius: 999,
  color: used ? CP.textMuted : CP.textPrimary,
  fontSize: 11,
  fontFamily: FONTS.body,
  cursor: used ? "default" : "pointer",
  textAlign: "left",
});
const textareaStyle = {
  flex: 1,
  padding: "10px 12px",
  background: CP.bg,
  border: `1px solid ${CP.border}`,
  borderRadius: 8,
  color: CP.textPrimary,
  fontSize: 13,
  fontFamily: FONTS.body,
  resize: "vertical",
  outline: "none",
};
const submitBtn = (disabled) => ({
  padding: "0 18px",
  background: disabled ? CP.surfaceAlt : CP.accentGreen,
  color: disabled ? CP.textMuted : "#0a0a0a",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
  minWidth: 80, justifyContent: "center",
});
const errorBox = {
  marginTop: 10,
  padding: "10px 12px",
  background: CP.accentRed + "15",
  border: `1px solid ${CP.accentRed}55`,
  borderRadius: 8,
  fontSize: 12,
  color: CP.accentRed,
};
