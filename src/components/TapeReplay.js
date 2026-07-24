"use client";

// Replay di un game tape: la conversazione reale con i momenti di acquisto in
// evidenza. Usato dalla libreria operatore (/academy/tapes) e dalla curatela
// admin (/admin/academy-tapes). Solo presentazione: nessuna fetch qui dentro.

import { CP, FONTS } from "@/lib/brand";

const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString("it-IT")}`;

function Chip({ children, tone }) {
  const tones = {
    accent: { background: CP.accentSoft, color: CP.accentSoftText },
    green: { background: `${CP.accentGreen}1f`, color: CP.accentGreen },
    plain: { background: CP.surfaceAlt, color: CP.textSecondary },
  };
  return (
    <span
      style={{
        ...(tones[tone] || tones.plain),
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function TapeReplay({ tape }) {
  if (!tape) return null;

  // fonde messaggi e acquisti in un'unica timeline ordinata
  const events = [
    ...(tape.messages || []).map((m) => ({ ...m, kind: "msg" })),
    ...(tape.buys || []).map((b) => ({ at: b.at, amount: b.amount, kind: "buy" })),
  ].sort((a, b) => a.at - b.at || ((a.kind === "buy" ? 1 : 0) - (b.kind === "buy" ? 1 : 0)));

  const opLabel =
    tape.attribution === "singolo"
      ? tape.operators?.[0]
      : tape.attribution === "duo"
        ? `Coppia in turno: ${(tape.operators || []).join(" + ")}`
        : "Turno non attribuito";

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Chip tone="accent">{usd(tape.total)} in {tape.buys?.length || 1} {tape.buys?.length === 1 ? "acquisto" : "acquisti"}</Chip>
        <Chip>{opLabel}</Chip>
        <Chip>
          {tape.fan}
          {tape.stats?.new_fan === true ? " · nuovo" : tape.stats?.new_fan === false ? " · abituale" : ""}
          {tape.stats?.fan_ltv != null ? ` · LTV ${usd(tape.stats.fan_ltv)}` : ""}
        </Chip>
        <Chip>Build-up {tape.stats?.buildup_min ?? "?"} min · {(tape.stats?.msgs_op ?? 0) + (tape.stats?.msgs_fan ?? 0)} messaggi</Chip>
        <Chip>{fmtDate(events[0]?.at || tape.extracted_at)}</Chip>
      </div>

      {tape.stats?.truncated && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 10 }}>
          Conversazione lunga: il replay parte dagli ultimi {tape.messages.length} messaggi prima della chiusura.
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 520,
          overflowY: "auto",
          padding: "14px 12px",
          background: CP.bgSunken,
          border: `1px solid ${CP.borderSoft}`,
          borderRadius: 12,
        }}
      >
        {events.map((e, i) =>
          e.kind === "buy" ? (
            <div key={i} style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
              <span
                style={{
                  background: `${CP.accentGreen}1f`,
                  color: CP.accentGreen,
                  border: `1px solid ${CP.accentGreen}55`,
                  padding: "4px 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                Sbloccato · {usd(e.amount)} · {fmtTime(e.at)}
              </span>
            </div>
          ) : (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: e.who === "op" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "78%",
                  background: e.who === "op" ? CP.accentSoft : CP.surfaceAlt,
                  color: e.who === "op" ? CP.textPrimary : CP.textSecondary,
                  border: `1px solid ${e.who === "op" ? CP.accentDim : CP.borderSoft}`,
                  borderRadius: 12,
                  padding: "8px 12px",
                }}
              >
                {e.price > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        background: CP.accent,
                        color: CP.accentInk,
                        padding: "1px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      PPV {usd(e.price)}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {e.text || <span style={{ color: CP.textMuted }}>(media senza testo)</span>}
                </div>
                <div style={{ fontSize: 10.5, color: CP.textMuted, marginTop: 3, textAlign: e.who === "op" ? "right" : "left" }}>
                  {e.who === "op" ? "operatore" : tape.fan} · {fmtTime(e.at)}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {tape.coach_notes && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            background: CP.surface,
            border: `1px solid ${CP.border}`,
            borderLeft: `3px solid ${CP.accent}`,
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 6, fontFamily: FONTS.display }}>
            Note del coach
          </div>
          <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {tape.coach_notes}
          </div>
        </div>
      )}
    </div>
  );
}
