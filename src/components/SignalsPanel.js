"use client";

// SignalsPanel — scheda deterministica dell'allineamento di un training ai
// comportamenti che monetizzano da noi (vedi src/lib/academy-signal-scoring.js).
// Solo presentazione: riceve l'oggetto `data` (score.signals) e lo rende.

import { CP, FONTS } from "@/lib/brand";

const VERDICT = {
  ok: { color: CP.accentGreen, label: "conduci bene" },
  watch: { color: CP.accentBlue, label: "attenzione" },
  off: { color: CP.accentRed, label: "intervisti troppo" },
};

function StatusTag({ s }) {
  if (s.status === "scored" && s.verdict) {
    const v = VERDICT[s.verdict] || VERDICT.watch;
    return (
      <span style={{ fontSize: 11, color: v.color, background: `${v.color}1f`, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
        {v.label}
      </span>
    );
  }
  if (s.status === "neutral") {
    return (
      <span style={{ fontSize: 11, color: CP.textMuted, background: CP.surfaceAlt, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
        nessun segnale
      </span>
    );
  }
  if (s.status === "insufficient") {
    return (
      <span style={{ fontSize: 11, color: CP.textMuted, background: CP.surfaceAlt, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
        dati insufficienti
      </span>
    );
  }
  if (s.status === "on_the_job") {
    return (
      <span style={{ fontSize: 11, color: CP.accentSoftText, background: CP.accentSoft, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
        sul vivo
      </span>
    );
  }
  return null;
}

export default function SignalsPanel({ data }) {
  if (!data || !Array.isArray(data.signals)) return null;

  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>
          Segnali — cosa monetizza da noi
        </div>
        {data.enough_data && data.alignment != null && (
          <div style={{ fontSize: 13, color: CP.textSecondary }}>
            allineamento <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{data.alignment}/100</span>
          </div>
        )}
      </div>

      <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, margin: "8px 0 14px" }}>{data.headline}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.signals.map((s) => (
          <div
            key={s.key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingBottom: 10,
              borderBottom: `1px solid ${CP.borderSoft}`,
              opacity: s.status === "scored" ? 1 : 0.82,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>{s.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {s.display && <span style={{ fontSize: 12, color: CP.textSecondary }}>{s.display}</span>}
                <StatusTag s={s} />
              </div>
            </div>
            <span style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.45 }}>{s.evidence}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 10 }}>
        Lente di coaching dai dati reali ({data.version}). Non entra nel punteggio né nella classifica.
      </div>
    </div>
  );
}
