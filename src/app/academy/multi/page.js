"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { TRAINING_SCENARIOS } from "@/lib/training-scenarios";
import { CREATOR_PERSONAS } from "@/lib/creator-personas";
import { FAN_ARCHETYPES } from "@/lib/fan-archetypes";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Metric, FilterChip, Notice, SectionTitle, card, NUM } from "@/components/ds";
import { analyzeConcurrentSession } from "@/lib/concurrent-sim";

/**
 * /academy/multi — Modalità multi-chat (sim a chat concorrenti).
 * L'operatore gestisce N fan in parallelo; alla fine ogni conversazione è
 * valutata con lo stesso scorer del single-sim e si misura il "punto di
 * degrado" (concurrent-sim.js). Riusa /api/chat e /api/score.
 * Redesign 26/09/2026 sul design system: PageHead in ogni fase, colonne che
 * vanno a capo su telefono, testo delle bolle più grande, niente arancio
 * scritto a mano (l'attesa lunga resta rossa, quella media prende il viola
 * tenue come negli avvisi), avatar con iniziale al posto dell'emoji.
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
  if (seconds >= 30) return CP.accentSoftText;
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

  const crumbs = [{ label: "Academy", href: "/" }, { label: "Chat in parallelo" }];

  // ---------------- SETUP ----------------
  if (phase === "setup") {
    return (
      <div style={wrap}>
        <PageHead
          crumbs={crumbs}
          title="Chat in parallelo"
          subtitle="Alleni la parte più difficile del mestiere: seguire più fan insieme senza che la qualità cali. Alla fine ogni conversazione viene valutata e vedi il tuo punto di degrado, cioè il punto in cui la qualità inizia a cedere."
        />
        <section style={{ ...card, padding: 20 }}>
          <SectionTitle>Con quanti fan vuoi allenarti?</SectionTitle>
          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            {[2, 3, 4].map((n) => (
              <FilterChip key={n} label={`${n} fan`} active={fanCount === n} onClick={() => setFanCount(n)} />
            ))}
          </div>
          {error && <Notice danger>{error}</Notice>}
          <button onClick={start} style={cta}>Inizia con {fanCount} fan</button>
        </section>
      </div>
    );
  }

  // ---------------- RESULTS ----------------
  if (phase === "results" && analysis) {
    const s = analysis.summary;
    const toneColor = (t) => (t === "good" ? CP.accentGreen : t === "warn" ? CP.accentSoftText : CP.accentRed);
    return (
      <div style={wrap}>
        <PageHead
          crumbs={crumbs}
          title="Il tuo punto di degrado"
          subtitle={`Com'è andata la qualità su ${analysis.results.length} chat gestite insieme: la media, la chat migliore, la peggiore e quanto sono distanti.`}
        />

        {s && (
          <section style={{ ...card, padding: "20px 22px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: toneColor(s.verdict.tone), flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 22, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.3 }}>{s.verdict.label}</p>
            </div>
            <p style={{ margin: "0 0 16px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.55 }}>{s.verdict.detail}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16 }}>
              <Metric label="Media" value={`${s.avg}%`} />
              <Metric label="Chat migliore" value={`${s.best}%`} />
              <Metric label="Chat peggiore" value={`${s.worst}%`} />
              <Metric label="Distanza" value={`${s.spread} punti`} note="tra migliore e peggiore" danger={s.verdict.tone === "bad"} />
            </div>
          </section>
        )}

        <SectionTitle>Chat per chat</SectionTitle>
        <div style={{ ...card, overflow: "hidden" }}>
          {analysis.results.map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", flexWrap: "wrap" }}>
              <Avatar name={r.name} />
              <span style={{ flex: "1 1 160px", color: CP.textPrimary, fontSize: 14 }}>{r.name}</span>
              {r.compliance_fail && <span style={{ fontSize: 12, color: CP.accentRed }}>Violazione compliance</span>}
              <span style={{ fontSize: 18, fontWeight: 500, ...NUM, color: r.overall == null ? CP.textMuted : r.compliance_fail ? CP.accentRed : r.overall >= 60 ? CP.accentGreen : CP.textPrimary }}>
                {r.overall == null ? (r.skipped ? "—" : "n/d") : `${r.overall}%`}
              </span>
            </div>
          ))}
        </div>
        {analysis.results.some((r) => r.skipped) && (
          <p style={{ fontSize: 13, color: CP.textMuted, margin: "8px 0 0" }}>«—» vuol dire che a quel fan non hai mai risposto: senza uno scambio non c'è niente da valutare.</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button onClick={() => { setPhase("setup"); setAnalysis(null); }} style={cta}>Riprova</button>
          <Link href="/" style={{ ...ctaGhost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Torna all'Academy</Link>
        </div>
      </div>
    );
  }

  // ---------------- PLAYING ----------------
  const active = fans.find((f) => f.id === activeId);
  return (
    <div style={{ ...wrap, maxWidth: 1180 }}>
      <PageHead
        crumbs={crumbs}
        title={`Chat in parallelo · ${fans.length} fan`}
        subtitle="Tocca una colonna per rispondere a quel fan. Il tempo d'attesa che cresce è la pressione del turno vero."
        actions={
          <button onClick={terminate} disabled={scoring} style={{ ...cta, opacity: scoring ? 0.6 : 1 }}>
            {scoring ? "Valutazione in corso…" : "Termina e valuta"}
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, alignItems: "start" }}>
        {fans.map((f) => {
          const waiting = Math.floor((now - f.lastReplyAt) / 1000);
          const isActive = f.id === activeId;
          return (
            <div
              key={f.id}
              onClick={() => { setActiveId(f.id); setTimeout(() => inputRef.current?.focus(), 30); }}
              style={{
                ...card,
                border: `2px solid ${isActive ? CP.accent : CP.border}`,
                display: "flex",
                flexDirection: "column",
                height: 460,
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${CP.borderSoft}`, background: isActive ? alpha(CP.accent, "14") : "transparent" }}>
                <Avatar name={f.name} />
                <span style={{ flex: 1, fontSize: 14, color: CP.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                <span style={{ fontSize: 12, color: waitTone(waiting), ...NUM }}>
                  {f.busy ? "scrive…" : `attesa ${waiting}s`}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {f.messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === "operator" ? "flex-end" : "flex-start",
                      maxWidth: "88%",
                      background: m.role === "operator" ? CP.accentSoft : CP.surfaceAlt,
                      color: CP.textPrimary,
                      borderRadius: 12,
                      padding: "7px 11px",
                      fontSize: 14,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
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
            minWidth: 0,
            padding: "12px 14px",
            background: CP.surface,
            border: `1px solid ${CP.border}`,
            borderRadius: 10,
            color: CP.textPrimary,
            fontSize: 15,
            fontFamily: FONTS.body,
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

// Avatar neutro con l'iniziale del profilo fan (al posto dell'emoji nel chrome).
function Avatar({ name }) {
  return (
    <span style={{ width: 26, height: 26, borderRadius: 999, background: CP.surfaceAlt, color: CP.textSecondary, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {String(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

// ---- stili ----
const wrap = { padding: "28px 24px 64px", maxWidth: 820, margin: "0 auto", fontFamily: FONTS.body };
const cta = { padding: "10px 20px", background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 10, fontWeight: 500, fontSize: 14, cursor: "pointer", fontFamily: FONTS.body };
const ctaGhost = { ...cta, background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}` };
