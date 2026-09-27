"use client";

// Dettaglio di una sessione del simulatore (redesign DS 26/09/2026).
// Voto AI come numero principale, chat a sinistra, abilità e feedback a destra,
// dati tecnici in fondo su richiesta. SignalsPanel invariato (componente
// condiviso col simulatore). API e dati mostrati invariati.
import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, Disclosure, Notice, card } from "@/components/ds";
import SignalsPanel from "@/components/SignalsPanel";

const fetcher = (url) => fetch(url).then((r) => r.json());

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const Wrap = ({ children }) => (
  <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>{children}</div>
);

function SkillBar({ label, value }) {
  if (value === undefined || value === null) return null;
  const low = value < 50;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: low ? CP.accentRed : CP.textPrimary, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ height: 6, background: CP.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: low ? CP.accentRed : CP.textMuted }} />
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isOperator = msg.role === "operator";
  return (
    <div style={{ display: "flex", justifyContent: isOperator ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div
        style={{
          maxWidth: "80%",
          background: isOperator ? CP.accentSoft : CP.surfaceAlt,
          color: CP.textPrimary,
          padding: "9px 13px",
          borderRadius: 12,
          borderBottomRightRadius: isOperator ? 3 : 12,
          borderBottomLeftRadius: isOperator ? 12 : 3,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div style={{ fontSize: 11, color: isOperator ? CP.accentSoftText : CP.textMuted, marginBottom: 2 }}>
          {isOperator ? "Operatore" : "Fan"}
        </div>
        {msg.content}
      </div>
    </div>
  );
}

function FeedbackBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [techOpen, setTechOpen] = useState(false);
  // Fetch da /api/admin/session-review/[id] (rotta nuova) — /api/admin/sessions/
  // ha un altro scopo nel codice esistente (eval feedback per /admin/review).
  const { data, error, isLoading } = useSWR(
    id ? `/api/admin/session-review/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const crumbs = [{ label: "Hub", href: "/admin" }, { label: "Sessioni", href: "/admin/sessions" }, { label: "Dettaglio" }];

  if (isLoading) {
    return <Wrap><div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento sessione…</div></Wrap>;
  }

  if (error) {
    return <Wrap><PageHead crumbs={crumbs} title="Sessione" /><Notice danger>Errore di rete: {String(error)}</Notice></Wrap>;
  }

  if (data?.error) {
    return (
      <Wrap>
        <PageHead crumbs={crumbs} title="Sessione" />
        <Notice danger>{data.error}. Probabilmente non hai i permessi per vedere questa sessione.</Notice>
        <Link href="/admin/sessions" style={{ color: CP.accentSoftText, textDecoration: "none", fontSize: 14 }}>← Torna all'elenco delle sessioni</Link>
      </Wrap>
    );
  }

  const session = data?.session;
  if (!session) {
    return (
      <Wrap>
        <PageHead crumbs={crumbs} title="Sessione" />
        <Notice>Sessione non trovata: potrebbe essere stata cancellata o il link non è completo.</Notice>
        <Link href="/admin/sessions" style={{ color: CP.accentSoftText, textDecoration: "none", fontSize: 14 }}>← Torna all'elenco delle sessioni</Link>
      </Wrap>
    );
  }

  const score = session.score || {};
  const skills = score.skills || {};
  const messages = session.messages || [];
  const hasFeedback = score.strengths?.length || score.improvements?.length || score.tip || score.best_message || score.worst_message;
  const msgCount = session.messageCount || messages.length;

  return (
    <Wrap>
      <PageHead
        crumbs={crumbs}
        title={`Sessione di ${data.ownerDisplay || session.operatorName || "operatore"}`}
        subtitle={`${fmtDate(session.timestamp)} · scenario ${session.scenarioId || "—"} · fan ${session.fanName || session.fanProfileId || "—"} · ${session.mode || "—"} · ${fmtInt(msgCount)} messaggi`}
      />

      <HeroMetric
        label="Voto dell'AI"
        value={score.overall != null ? `${score.overall}%` : "—"}
        compare={`${score.stars ?? "—"} stelle · ${fmtInt(score.xp ?? 0)} punti esperienza`}
        hint="Il voto è una valutazione automatica della chat: leggila prima di usarla per il coaching."
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Metric label="Messaggi" value={fmtInt(msgCount)} />
          <Metric label="Durata" value={session.duration ? `${Math.floor(session.duration / 60)} min ${Math.round(session.duration % 60)} s` : "—"} />
        </div>
      </HeroMetric>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        {/* Conversazione */}
        <section style={{ ...card, padding: "16px 18px" }}>
          <SectionTitle aside={`${fmtInt(messages.length)} messaggi`}>La chat</SectionTitle>
          {messages.length === 0 ? (
            <p style={{ fontSize: 14, color: CP.textMuted, margin: 0 }}>Nessun messaggio salvato per questa sessione.</p>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} msg={m} />)
          )}
        </section>

        {/* Voto e feedback */}
        <div>
          <section style={{ ...card, padding: "16px 18px" }}>
            <SectionTitle aside="da 0 a 100">Voto per abilità</SectionTitle>
            <SkillBar label="Naturalezza" value={skills.naturalezza} />
            <SkillBar label="Esclusività" value={skills.esclusivita} />
            <SkillBar label="Dipendenza" value={skills.dipendenza} />
            <SkillBar label="Conversione" value={skills.conversione} />
            <SkillBar label="Tono" value={skills.tono} />
            <SkillBar label="Gestione obiezioni" value={skills.gestione_obiezioni} />
            {Object.keys(skills).length === 0 && <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>Nessun voto per abilità salvato.</p>}
          </section>

          {hasFeedback && (
            <section style={{ ...card, padding: "16px 18px", marginTop: 14 }}>
              <SectionTitle>Cosa dice l'AI</SectionTitle>

              {score.strengths?.length > 0 && (
                <FeedbackBlock title="Punti di forza">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {score.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </FeedbackBlock>
              )}

              {score.improvements?.length > 0 && (
                <FeedbackBlock title="Da migliorare">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {score.improvements.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </FeedbackBlock>
              )}

              {score.best_message && <FeedbackBlock title="Messaggio migliore">{score.best_message}</FeedbackBlock>}
              {score.worst_message && <FeedbackBlock title="Messaggio più debole">{score.worst_message}</FeedbackBlock>}

              {score.tip && (
                <FeedbackBlock title="Consiglio">
                  <div style={{ background: CP.bg, padding: "10px 12px", borderRadius: 8, borderLeft: `3px solid ${CP.accent}` }}>{score.tip}</div>
                </FeedbackBlock>
              )}
            </section>
          )}

          {score.signals && (
            <div style={{ marginTop: 14 }}>
              <SignalsPanel data={score.signals} />
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Disclosure open={techOpen} onToggle={() => setTechOpen((v) => !v)} title="Dati tecnici" summary="id utente, profilo fan, creator, riferimento del voto">
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13 }}>
                <span style={{ color: CP.textMuted }}>Id utente</span><span style={{ color: CP.textSecondary, wordBreak: "break-all" }}>{session.userId}</span>
                <span style={{ color: CP.textMuted }}>Profilo fan</span><span style={{ color: CP.textSecondary }}>{session.fanProfileId || "—"}</span>
                <span style={{ color: CP.textMuted }}>Creator</span><span style={{ color: CP.textSecondary }}>{session.creatorName || score.creatorName || "—"}</span>
                <span style={{ color: CP.textMuted }}>Operatore di riferimento del voto</span><span style={{ color: CP.textSecondary }}>{/* il voto AI confronta la chat con i modi di scrivere di un operatore modello (fan-profiles.js) */}{score.benchmarkOperator ? score.benchmarkOperator.charAt(0).toUpperCase() + score.benchmarkOperator.slice(1) : "Spagnuolo (predefinito)"}</span>
                <span style={{ color: CP.textMuted }}>Durata</span><span style={{ color: CP.textSecondary, fontVariantNumeric: "tabular-nums" }}>{session.duration || 0} s</span>
              </div>
            </Disclosure>
          </div>
        </div>
      </div>
    </Wrap>
  );
}
