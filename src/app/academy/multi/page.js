"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";
import { CREATOR_PERSONAS } from "@/lib/creator-personas";
import { FAN_ARCHETYPES } from "@/lib/fan-archetypes";
import { CP, FONTS } from "@/lib/brand";
import { analyzeConcurrentSession } from "@/lib/concurrent-sim";

/**
 * /academy/multi — Modalità multi-chat (sim a chat concorrenti).
 * L'operatore gestisce N fan in parallelo; alla fine ogni conversazione è
 * valutata con lo stesso scorer del single-sim e si misura il "punto di
 * degrado" (concurrent-sim.js). Riusa /api/chat e /api/score.
 */

const OPENERS = [
  "Ciao 👀 appena entrato, mi piace un sacco quello che posti",
  "Hey... è da un po' che ti seguo ma non avevo mai scritto",
  "Ciao bella, ho appena rinnovato l'abbonamento 🔥 come stai?",
  "Ehi, sei sempre così perfetta nelle foto o è solo fortuna? 😏",
];

function pickDefaults(n) {
  const scenario = TRAINING_SCENARIOS[0]?.scenarios?.[0] || null;
  const creator = CREATOR_PERSONAS[0] || null;
  const archetypes = FAN_ARCHETYPES.slice(0, n);
  return { scenario, creator, archetypes };
}

function waitTone(seconds) {
  if (seconds >= 60) return CP.accentRed;
  if (seconds >= 30) return "#d9a44a";
  return CP.textMuted;
}

export default function MultiChatPage() {
  const [phase, setPhase] = useState("setup"); // setup | playing | results
  const [fanCount, setFanCount] = useState(3);
  const [fans, setFans] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [now, setNow] = useState(Date.now());
  const [scoring, setScoring] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const cfgRef = useRef(null);
  const inputRef = useRef(null);

  // Tick al secondo per i timer di attesa (solo in gioco).
  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function start() {
    const cfg = pickDefaults(fanCount);
    if (!cfg.scenario || !cfg.creator || cfg.archetypes.length < fanCount) {
      setError("Configurazione simulatore non disponibile.");
      return;
    }
    cfgRef.current = cfg;
    const seeded = cfg.archetypes.map((a, i) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji || "🙂",
      messages: [{ role: "fan", content: OPENERS[i % OPENERS.length] }],
      fanState: null,
      lastReplyAt: Date.now(),
      busy: false,
    }));
    setFans(seeded);
    setActiveId(seeded[0].id);
    setError(null);
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send() {
    const text = input.trim();
    const fan = fans.find((f) => f.id === activeId);
    if (!text || !fan || fan.busy) return;
    setInput("");

    const withOp = {
      ...fan,
      messages: [...fan.messages, { role: "operator", content: text }],
      busy: true,
      lastReplyAt: Date.now(),
    };
    setFans((prev) => prev.map((f) => (f.id === fan.id ? withOp : f)));

    try {
      const cfg = cfgRef.current;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: withOp.messages,
          scenarioId: cfg.scenario.id,
          creatorId: cfg.creator.id,
          archetypeId: fan.id,
          fanState: withOp.fanState,
        }),
      });
      const data = await res.json();
      setFans((prev) =>
        prev.map((f) =>
          f.id === fan.id
            ? {
                ...f,
                messages: data.reply
                  ? [...f.messages, { role: "fan", content: data.reply }]
                  : f.messages,
                fanState: data.fanState || f.fanState,
                busy: false,
              }
            : f
        )
      );
    } catch {
      setFans((prev) => prev.map((f) => (f.id === fan.id ? { ...f, busy: false } : f)));
    }
  }

  async function terminate() {
    setScoring(true);
    const cfg = cfgRef.current;
    const results = await Promise.all(
      fans.map(async (f) => {
        // Serve almeno uno scambio per valutare.
        const hasOperator = f.messages.some((m) => m.role === "operator");
        if (!hasOperator) {
          return { id: f.id, name: f.name, emoji: f.emoji, overall: null, skipped: true };
        }
        try {
          const res = await fetch("/api/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: f.messages,
              scenarioId: cfg.scenario.id,
              creatorId: cfg.creator.id,
              archetypeId: f.id,
            }),
          });
          const data = await res.json();
          const s = data.score || {};
          return {
            id: f.id,
            name: f.name,
            emoji: f.emoji,
            overall: typeof s.overall === "number" ? s.overall : null,
            compliance_fail: !!s.compliance_fail,
            messageCount: f.messages.length,
          };
        } catch {
          return { id: f.id, name: f.name, emoji: f.emoji, overall: null };
        }
      })
    );
    setAnalysis({ results, summary: analyzeConcurrentSession(results) });
    setScoring(false);
    setPhase("results");
  }

  // ---------------- SETUP ----------------
  if (phase === "setup") {
    return (
      <div style={wrap}>
        <p style={eyebrow}>Academy · modalità avanzata</p>
        <h1 style={h1}>Sim a chat concorrenti</h1>
        <p style={{ ...lede, marginBottom: 26 }}>
          La skill vera del mestiere: reggere più fan insieme senza che la qualità crolli.
          Gestisci le conversazioni in parallelo — alla fine ognuna viene valutata e si misura
          il tuo <b style={{ color: CP.textPrimary }}>punto di degrado</b>: dove la qualità inizia a cedere.
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setFanCount(n)}
              style={{
                ...pill,
                background: fanCount === n ? CP.accent : CP.surface,
                color: fanCount === n ? CP.accentInk : CP.textSecondary,
                borderColor: fanCount === n ? CP.accent : CP.border,
              }}
            >
              {n} fan
            </button>
          ))}
        </div>
        {error && <p style={{ color: CP.accentRed, fontSize: 13 }}>{error}</p>}
        <button onClick={start} style={{ ...cta, marginTop: 4 }}>Inizia con {fanCount} fan</button>
        <p style={{ marginTop: 22, fontSize: 13 }}>
          <Link href="/" style={{ color: CP.accent }}>← Torna all'Academy</Link>
        </p>
      </div>
    );
  }

  // ---------------- RESULTS ----------------
  if (phase === "results" && analysis) {
    const s = analysis.summary;
    const toneColor = (t) => (t === "good" ? CP.accentGreen : t === "warn" ? "#d9a44a" : CP.accentRed);
    return (
      <div style={wrap}>
        <p style={eyebrow}>Risultati · {analysis.results.length} chat concorrenti</p>
        <h1 style={h1}>Il tuo punto di degrado</h1>

        {s && (
          <div
            style={{
              background: CP.surface,
              border: `2px solid ${toneColor(s.verdict.tone)}`,
              borderRadius: 14,
              padding: "18px 22px",
              margin: "6px 0 24px",
            }}
          >
            <p style={{ margin: "0 0 6px", fontFamily: FONTS.display, fontSize: 21, fontWeight: 700, color: toneColor(s.verdict.tone) }}>
              {s.verdict.label}
            </p>
            <p style={{ margin: "0 0 12px", color: CP.textSecondary, fontSize: 14 }}>{s.verdict.detail}</p>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, color: CP.textMuted }}>
              <span>media <b style={{ color: CP.textPrimary }}>{s.avg}%</b></span>
              <span>migliore <b style={{ color: CP.textPrimary }}>{s.best}%</b></span>
              <span>peggiore <b style={{ color: CP.textPrimary }}>{s.worst}%</b></span>
              <span>divario <b style={{ color: toneColor(s.verdict.tone) }}>{s.spread} punti</b></span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {analysis.results.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, background: CP.surface, border: `1px solid ${r.compliance_fail ? CP.accentRed : CP.border}`, borderRadius: 10, padding: "12px 16px" }}>
              <span style={{ fontSize: 20 }}>{r.emoji}</span>
              <span style={{ flex: 1, color: CP.textSecondary, fontSize: 14 }}>{r.name}</span>
              {r.compliance_fail && <span style={{ fontSize: 11.5, color: CP.accentRed, fontWeight: 700 }}>violazione compliance</span>}
              <span style={{ fontFamily: FONTS.mono, fontSize: 18, fontWeight: 700, color: r.overall == null ? CP.textMuted : r.compliance_fail ? CP.accentRed : r.overall >= 60 ? CP.accentGreen : "#d9a44a" }}>
                {r.overall == null ? (r.skipped ? "—" : "n/d") : `${r.overall}%`}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
          <button onClick={() => { setPhase("setup"); setAnalysis(null); }} style={cta}>Riprova</button>
          <Link href="/" style={{ ...cta, background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Academy</Link>
        </div>
      </div>
    );
  }

  // ---------------- PLAYING ----------------
  const active = fans.find((f) => f.id === activeId);
  return (
    <div style={{ ...wrap, maxWidth: 1120 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ ...eyebrow, margin: "0 0 2px" }}>Modalità multi-chat · {fans.length} fan</p>
          <p style={{ margin: 0, color: CP.textMuted, fontSize: 13 }}>Clicca una colonna per rispondere a quel fan. L'attesa che cresce è la pressione.</p>
        </div>
        <button onClick={terminate} disabled={scoring} style={{ ...cta, opacity: scoring ? 0.6 : 1 }}>
          {scoring ? "Valutazione…" : "Termina e valuta"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${fans.length}, 1fr)`, gap: 12, alignItems: "start" }}>
        {fans.map((f) => {
          const waiting = Math.floor((now - f.lastReplyAt) / 1000);
          const isActive = f.id === activeId;
          return (
            <div
              key={f.id}
              onClick={() => { setActiveId(f.id); setTimeout(() => inputRef.current?.focus(), 30); }}
              style={{
                background: CP.surface,
                border: `2px solid ${isActive ? CP.accent : CP.border}`,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                height: 460,
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${CP.borderSoft}` }}>
                <span style={{ fontSize: 17 }}>{f.emoji}</span>
                <span style={{ flex: 1, fontSize: 13, color: CP.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: waitTone(waiting) }}>
                  {f.busy ? "scrive…" : `attesa ${waiting}s`}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {f.messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === "operator" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      background: m.role === "operator" ? CP.accentSoft : CP.surfaceAlt,
                      color: m.role === "operator" ? CP.accentSoftText : CP.textSecondary,
                      borderRadius: 10,
                      padding: "6px 10px",
                      fontSize: 12.5,
                      lineHeight: 1.4,
                    }}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder={active ? `Rispondi a ${active.name}…` : "Scegli un fan"}
          style={{
            flex: 1,
            padding: "12px 14px",
            background: CP.surface,
            border: `1px solid ${CP.border}`,
            borderRadius: 10,
            color: CP.textPrimary,
            fontSize: 14,
            outline: "none",
          }}
        />
        <button onClick={send} disabled={!input.trim() || active?.busy} style={{ ...cta, opacity: !input.trim() || active?.busy ? 0.55 : 1 }}>
          Invia
        </button>
      </div>
    </div>
  );
}

// ---- stili ----
const wrap = { maxWidth: 760, margin: "0 auto", padding: "32px 22px 60px" };
const eyebrow = { font: `500 12px ${FONTS.mono}`, textTransform: "uppercase", letterSpacing: ".12em", color: CP.accentSoftText, margin: "0 0 10px" };
const h1 = { fontFamily: FONTS.display, fontSize: "clamp(26px,4vw,38px)", fontWeight: 600, color: CP.textPrimary, letterSpacing: "-.02em", margin: "0 0 14px" };
const lede = { fontSize: 16, color: CP.textSecondary, lineHeight: 1.6, maxWidth: "62ch" };
const pill = { padding: "8px 18px", borderRadius: 999, border: "1px solid", font: "500 14px inherit", cursor: "pointer" };
const cta = { padding: "11px 22px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" };
