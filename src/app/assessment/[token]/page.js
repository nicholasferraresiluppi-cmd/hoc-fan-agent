"use client";

/**
 * /assessment/[token] — superficie CANDIDATO dell'assessment pre-assunzione.
 *
 * Full-screen, senza chrome interno (AppShell.isBareRoute). Il candidato non è
 * un utente Clerk: tutto passa dalle API pubbliche /api/candidate/[token]/*,
 * che si difendono col token. Il report (score) NON viene mostrato al candidato
 * — è materiale per HR. Qui il candidato vede solo: informativa+consenso, la
 * chat scenario per scenario, e un ringraziamento finale neutro.
 *
 * Redesign 26/09/2026 sul design system: testata DS in ogni stato, firma
 * "House of Creators" in sentence case (prima etichette MAIUSCOLE spaziate),
 * consenso esplicito accanto al pulsante, suggerimento Invio/Maiusc+Invio,
 * "sta scrivendo…" al posto dei tre puntini. Flusso, consenso e chiamate invariati.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, NUM } from "@/components/ds";

const SEED_CUE =
  "[Inizia la conversazione con il tuo primo messaggio da fan, come descritto nel tuo personaggio.]";

export default function AssessmentPage() {
  const { token } = useParams();

  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState([]);
  const [fanState, setFanState] = useState(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [opCount, setOpCount] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const seededForStep = useRef(-1);

  const scenarios = ctx?.scenarios || [];
  const currentScenario = scenarios[stepIndex] || null;

  const api = useCallback(
    async (suffix, opts = {}) => {
      const res = await fetch(`/api/candidate/${token}${suffix}`, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    },
    [token]
  );

  // Carica il contesto
  useEffect(() => {
    let alive = true;
    (async () => {
      const { ok, data } = await api("");
      if (!alive) return;
      if (!ok || !data?.ok) {
        setError(data?.error || "Link non valido.");
      } else {
        setCtx(data);
        setStepIndex(data.progress?.index || 0);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [api]);

  // Auto-scroll in fondo
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const seedOpening = useCallback(
    async (scenario) => {
      if (!scenario) return;
      setIsTyping(true);
      setMessages([]);
      setOpCount(0);
      setFanState(null);
      try {
        const { data } = await api(`/chat`, {
          method: "POST",
          body: JSON.stringify({
            scenarioId: scenario.id,
            messages: [{ role: "operator", content: SEED_CUE }],
          }),
        });
        if (Array.isArray(data?.transcript) && data.transcript.length) {
          // scenario già iniziato (pagina ricaricata): riprende dal server
          setMessages(data.transcript);
          setOpCount(data.transcript.filter((m) => m.role === "operator").length);
          if (data.fanState) setFanState(data.fanState);
        } else if (data?.reply) {
          setMessages([{ role: "fan", content: data.reply }]);
          if (data.fanState) setFanState(data.fanState);
        } else {
          setMessages([]);
        }
      } catch {
        setMessages([]);
      } finally {
        setIsTyping(false);
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    },
    [api]
  );

  // Avvia lo scenario corrente quando siamo in "play" e non è ancora seedato
  const canPlay = ctx && !ctx.consentRequired && !ctx.done && !ctx.expired && !error;
  useEffect(() => {
    if (!canPlay || !currentScenario) return;
    if (seededForStep.current === stepIndex) return;
    seededForStep.current = stepIndex;
    seedOpening(currentScenario);
  }, [canPlay, currentScenario, stepIndex, seedOpening]);

  const acceptConsent = async () => {
    setAccepting(true);
    const { ok, data, status } = await api("", { method: "POST", body: "{}" });
    setAccepting(false);
    if (!ok || !data?.ok) {
      setError(data?.error || (status === 410 ? "Questo link è scaduto." : "Errore."));
      return;
    }
    setCtx(data);
    setStepIndex(data.progress?.index || 0);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isTyping || scoring || !currentScenario) return;
    const max = currentScenario.maxMessages || 8;
    if (opCount >= max) return;

    const next = [...messages, { role: "operator", content: text }];
    setMessages(next);
    setInput("");
    setOpCount((c) => c + 1);
    setIsTyping(true);
    try {
      const { data } = await api(`/chat`, {
        method: "POST",
        body: JSON.stringify({ scenarioId: currentScenario.id, messages: next, fanState }),
      });
      if (data?.reply) {
        setMessages((prev) => [...prev, { role: "fan", content: data.reply }]);
        if (data.fanState) setFanState(data.fanState);
      } else {
        setMessages((prev) => [...prev, { role: "fan", content: "…" }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "fan", content: "…" }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const finishScenario = async () => {
    if (!currentScenario || scoring) return;
    setScoring(true);
    const { ok, data, status } = await api(`/score`, {
      method: "POST",
      body: JSON.stringify({ scenarioId: currentScenario.id, messages }),
    });
    setScoring(false);
    if (!ok || !data?.ok) {
      setError(data?.error || (status === 410 ? "Sessione scaduta." : "Errore nel salvataggio."));
      return;
    }
    if (data.done) {
      setCtx((c) => ({ ...c, done: true, status: "completed" }));
    } else {
      seededForStep.current = -1; // forza il seed del prossimo
      setStepIndex(data.progress.index);
    }
  };

  // ---- Render ----

  if (loading) {
    return (
      <Shell>
        <div style={{ color: CP.textMuted, textAlign: "center", paddingTop: 80, width: "100%" }}>Caricamento…</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <Card>
          <Brand />
          <PageHead title="Link non disponibile" subtitle={error} />
          <p style={{ color: CP.textSecondary, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Se pensi sia un errore, scrivi alla persona di House of Creators che ti ha mandato il link: te ne può preparare uno nuovo.
          </p>
        </Card>
      </Shell>
    );
  }

  if (ctx?.done) {
    return (
      <Shell>
        <Card>
          <Brand>Esercizio completato</Brand>
          <PageHead title="Grazie, abbiamo ricevuto le tue risposte" />
          <p style={{ color: CP.textSecondary, lineHeight: 1.6, margin: 0, fontSize: 15 }}>
            Il team di House of Creators leggerà l&apos;esercizio insieme al resto della tua
            candidatura e ti ricontatterà per i prossimi passi. Puoi chiudere questa finestra.
          </p>
        </Card>
      </Shell>
    );
  }

  if (ctx?.consentRequired) {
    return (
      <Shell>
        <Card>
          <Brand>Esercizio di selezione</Brand>
          <PageHead
            title="Una breve simulazione di chat"
            subtitle={`${scenarios.length} situazioni, circa ${ctx.estMinutes || 20} minuti in tutto.`}
          />
          <p style={{ color: CP.textSecondary, lineHeight: 1.6, margin: 0, fontSize: 15 }}>
            Ti chiediamo di gestire alcune conversazioni simulate con dei &ldquo;fan&rdquo;
            interpretati da un&apos;intelligenza artificiale. Rispondi come faresti davvero: non ci sono
            risposte &ldquo;perfette&rdquo;, ci interessa il tuo modo di gestire la relazione.
          </p>
          <div style={notice}>
            <div style={{ color: CP.textPrimary, fontWeight: 500, fontSize: 15 }}>Come vengono usate le tue risposte</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: CP.textSecondary, lineHeight: 1.6, fontSize: 14 }}>
              <li>Le conversazioni sono simulate: l&apos;interlocutore è un&apos;AI, non una persona reale.</li>
              <li>
                Un&apos;AI analizza le tue risposte e produce una valutazione (qualità della
                conversazione e rispetto delle regole di piattaforma).
              </li>
              <li>
                La valutazione è <span style={{ color: CP.textPrimary, fontWeight: 500 }}>uno degli elementi</span> che
                una persona del team considererà: la decisione sulla candidatura è sempre umana.
              </li>
              <li>Usiamo i dati solo per questa selezione; puoi chiedere accesso o cancellazione scrivendo a HOC.</li>
            </ul>
          </div>
          <p style={{ color: CP.textMuted, fontSize: 13, lineHeight: 1.55, margin: "14px 0 0" }}>
            Premendo il pulsante dai il consenso a questo uso e inizi l&apos;esercizio.
          </p>
          <button onClick={acceptConsent} disabled={accepting} style={{ ...primaryBtn, marginTop: 14, opacity: accepting ? 0.6 : 1 }}>
            {accepting ? "Avvio…" : "Ho capito, iniziamo"}
          </button>
        </Card>
      </Shell>
    );
  }

  // Play
  const max = currentScenario?.maxMessages || 8;
  const reachedMax = opCount >= max;
  const isLast = stepIndex + 1 >= scenarios.length;
  return (
    <Shell wide>
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Testata: dove sei nell'esercizio + la situazione da gestire */}
        <div style={{ padding: "16px 4px 4px", borderBottom: `1px solid ${CP.borderSoft}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Brand inline>Esercizio di selezione</Brand>
            <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>
              Situazione {stepIndex + 1} di {scenarios.length}
            </span>
          </div>
          <div style={{ height: 4, background: CP.surfaceAlt, borderRadius: 2, overflow: "hidden", marginBottom: 14 }} aria-hidden="true">
            <div style={{ width: `${(stepIndex / Math.max(1, scenarios.length)) * 100}%`, height: "100%", background: CP.accent, transition: "width .3s" }} />
          </div>
          {currentScenario && <PageHead title={currentScenario.title} subtitle={currentScenario.description} />}
        </div>

        {/* Chat */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} content={m.content} />
          ))}
          {isTyping && <Bubble role="fan" content="sta scrivendo…" muted />}
        </div>

        {/* Risposta */}
        <div style={{ padding: "12px 4px 20px", borderTop: `1px solid ${CP.borderSoft}` }}>
          {reachedMax && (
            <div style={{ color: CP.textSecondary, fontSize: 13.5, marginBottom: 8 }}>
              Hai usato tutti i messaggi per questa situazione. Quando vuoi, premi &ldquo;{isLast ? "Concludi l'esercizio" : "Concludi e prosegui"}&rdquo;.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              maxLength={1200}
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={reachedMax ? "Concludi la situazione →" : "Scrivi come risponderesti…"}
              aria-label="La tua risposta"
              rows={2}
              disabled={isTyping || scoring || reachedMax}
              style={textarea}
            />
            <button onClick={send} disabled={isTyping || scoring || reachedMax || !input.trim()} style={{ ...sendBtn, opacity: isTyping || scoring || reachedMax || !input.trim() ? 0.5 : 1 }}>
              Invia
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ fontSize: 12.5, color: CP.textMuted, ...NUM }}>
              {opCount} di {max} messaggi · Invio per mandare, Maiusc+Invio per andare a capo
            </span>
            <button onClick={finishScenario} disabled={scoring || opCount === 0} style={{ ...ghostBtn, opacity: scoring || opCount === 0 ? 0.5 : 1 }}>
              {scoring ? "Salvataggio…" : isLast ? "Concludi l'esercizio →" : "Concludi e prosegui →"}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ---- presentational ---- */

function Shell({ children, wide }) {
  return (
    <div style={{ minHeight: "100vh", background: CP.bg, color: CP.textPrimary, fontFamily: FONTS.body, display: "flex", justifyContent: "center", padding: wide ? "0 16px" : "24px 16px" }}>
      {wide ? children : <div style={{ width: "100%", maxWidth: 580, display: "flex", alignItems: "center" }}>{children}</div>}
    </div>
  );
}

/** Firma discreta: chi ti scrive e perché (sentence case, niente maiuscolo spaziato). */
function Brand({ children, inline }) {
  return (
    <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: inline ? 0 : 14 }}>
      House of Creators{children ? <span style={{ color: CP.textMuted }}> · {children}</span> : null}
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{ width: "100%", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: "26px 24px" }}>
      {children}
    </div>
  );
}

function Bubble({ role, content, muted }) {
  const isOp = role === "operator";
  return (
    <div style={{ display: "flex", justifyContent: isOp ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "80%",
          padding: "9px 13px",
          borderRadius: 14,
          borderBottomRightRadius: isOp ? 4 : 14,
          borderBottomLeftRadius: isOp ? 14 : 4,
          background: isOp ? CP.accent : CP.surfaceAlt,
          color: isOp ? CP.accentInk : muted ? CP.textMuted : CP.textPrimary,
          fontStyle: muted ? "italic" : "normal",
          fontSize: 15,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}

const notice = { marginTop: 18, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 16 };
const primaryBtn = {
  width: "100%", padding: "12px 16px", background: CP.accent, color: CP.accentInk,
  border: "none", borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body,
};
const textarea = {
  flex: 1, minWidth: 0, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10,
  color: CP.textPrimary, padding: "10px 12px", fontSize: 15, resize: "none",
  fontFamily: "inherit", lineHeight: 1.4,
};
const sendBtn = {
  padding: "0 18px", background: CP.accent, color: CP.accentInk, border: "none",
  borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body,
};
const ghostBtn = {
  padding: "8px 14px", background: CP.surface, color: CP.textPrimary,
  border: `1px solid ${CP.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body,
};
