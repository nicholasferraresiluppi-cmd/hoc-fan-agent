"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => r.json());

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return "—";
  }
}

function SkillBar({ label, value }) {
  if (value === undefined || value === null) return null;
  let bar = COLORS.signal;
  if (value >= 70) bar = COLORS.verdant;
  else if (value >= 50) bar = COLORS.champagne;
  else if (value >= 30) bar = COLORS.ember;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: COLORS.fog,
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ color: COLORS.alabaster, fontWeight: 600 }}>{value}</span>
      </div>
      <div
        style={{
          height: 6,
          background: COLORS.charcoal,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: "100%",
            background: bar,
          }}
        />
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isOperator = msg.role === "operator";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOperator ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          background: isOperator ? COLORS.champagne : COLORS.charcoal,
          color: isOperator ? COLORS.obsidian : COLORS.alabaster,
          padding: "10px 14px",
          borderRadius: 14,
          borderBottomRightRadius: isOperator ? 2 : 14,
          borderBottomLeftRadius: isOperator ? 14 : 2,
          fontSize: 14,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div
          style={{
            fontSize: 10,
            opacity: 0.7,
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginBottom: 3,
          }}
        >
          {isOperator ? "OPERATORE" : "FAN"}
        </div>
        {msg.content}
      </div>
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const id = params?.id;
  // Fetch da /api/admin/session-review/[id] (rotta nuova) — /api/admin/sessions/
  // ha un altro scopo nel codice esistente (eval feedback per /admin/review).
  const { data, error, isLoading } = useSWR(
    id ? `/api/admin/session-review/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const styles = {
    page: {
      minHeight: "100vh",
      background: COLORS.obsidian,
      color: COLORS.alabaster,
      fontFamily: FONTS.body,
      padding: "32px 24px",
    },
    container: { maxWidth: 1100, margin: "0 auto" },
    title: {
      fontFamily: FONTS.display,
      fontSize: 24,
      letterSpacing: "-0.01em",
      margin: 0,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr",
      gap: 20,
      marginTop: 20,
    },
    card: {
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 12,
      padding: 18,
    },
    label: {
      fontSize: 11,
      color: COLORS.fog,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      marginBottom: 4,
    },
    backLink: {
      color: COLORS.fog,
      fontSize: 13,
      textDecoration: "none",
      display: "inline-block",
      marginBottom: 14,
    },
    section: { marginBottom: 18 },
    h2: {
      fontFamily: FONTS.display,
      fontSize: 16,
      margin: "0 0 10px 0",
      color: COLORS.alabaster,
    },
    note: { fontSize: 13, color: COLORS.fog, marginBottom: 8 },
    feedback: { fontSize: 13, color: COLORS.alabaster, lineHeight: 1.55 },
  };

  if (isLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <p style={{ color: COLORS.fog }}>Caricamento sessione…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <p style={{ color: COLORS.signal }}>Errore di rete: {String(error)}</p>
        </div>
      </div>
    );
  }

  if (data?.error) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <Link href="/admin/sessions" style={styles.backLink}>
            ← Lista sessioni
          </Link>
          <p style={{ color: COLORS.signal }}>
            {data.error}. Probabilmente non hai i permessi per vedere questa sessione.
          </p>
        </div>
      </div>
    );
  }

  const session = data?.session;
  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <p style={{ color: COLORS.fog }}>Sessione non trovata.</p>
        </div>
      </div>
    );
  }

  const score = session.score || {};
  const skills = score.skills || {};
  const messages = session.messages || [];

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <Link href="/admin/sessions" style={{ color: "inherit", textDecoration: "none" }}>Sessioni</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Dettaglio</span>
            </div>
          }
          section="Training · Sessione"
          title={`Sessione di ${data.ownerDisplay || session.operatorName || "operatore"}`}
          subtitle={`${fmtDate(session.timestamp)} · scenario ${session.scenarioId || "—"} · fan ${session.fanName || session.fanProfileId || "—"} · ${session.mode} · ${session.messageCount || messages.length} msg`}
        />

        <div style={styles.grid}>
          {/* Conversazione */}
          <div style={styles.card}>
            <h2 style={styles.h2}>Conversazione</h2>
            {messages.length === 0 ? (
              <p style={styles.note}>Nessun messaggio salvato.</p>
            ) : (
              messages.map((m, i) => <MessageBubble key={i} msg={m} />)
            )}
          </div>

          {/* Score & feedback */}
          <div>
            <div style={styles.card}>
              <h2 style={styles.h2}>Punteggio</h2>
              <div style={styles.section}>
                <div style={styles.label}>Overall</div>
                <div
                  style={{
                    fontSize: 32,
                    fontFamily: FONTS.display,
                    color: COLORS.champagne,
                  }}
                >
                  {score.overall ?? "—"}%
                </div>
                <div style={{ fontSize: 12, color: COLORS.fog, marginTop: 4 }}>
                  {score.stars ?? "—"} stelle · {score.xp ?? 0} XP
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.label}>Skills</div>
                <SkillBar label="Naturalezza" value={skills.naturalezza} />
                <SkillBar label="Esclusività" value={skills.esclusivita} />
                <SkillBar label="Dipendenza" value={skills.dipendenza} />
                <SkillBar label="Conversione" value={skills.conversione} />
                <SkillBar label="Tono" value={skills.tono} />
                <SkillBar
                  label="Gestione obiezioni"
                  value={skills.gestione_obiezioni}
                />
              </div>
            </div>

            {(score.strengths?.length ||
              score.improvements?.length ||
              score.tip ||
              score.best_message ||
              score.worst_message) && (
              <div style={{ ...styles.card, marginTop: 14 }}>
                <h2 style={styles.h2}>Feedback</h2>

                {score.strengths?.length > 0 && (
                  <div style={styles.section}>
                    <div style={styles.label}>Punti di forza</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {score.strengths.map((s, i) => (
                        <li key={i} style={styles.feedback}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {score.improvements?.length > 0 && (
                  <div style={styles.section}>
                    <div style={styles.label}>Da migliorare</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {score.improvements.map((s, i) => (
                        <li key={i} style={styles.feedback}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {score.best_message && (
                  <div style={styles.section}>
                    <div style={styles.label}>Messaggio migliore</div>
                    <div style={styles.feedback}>{score.best_message}</div>
                  </div>
                )}

                {score.worst_message && (
                  <div style={styles.section}>
                    <div style={styles.label}>Messaggio più debole</div>
                    <div style={styles.feedback}>{score.worst_message}</div>
                  </div>
                )}

                {score.tip && (
                  <div style={styles.section}>
                    <div style={styles.label}>Tip</div>
                    <div
                      style={{
                        ...styles.feedback,
                        background: COLORS.charcoal,
                        padding: 10,
                        borderRadius: 8,
                        borderLeft: `3px solid ${COLORS.champagne}`,
                      }}
                    >
                      {score.tip}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ ...styles.card, marginTop: 14 }}>
              <h2 style={styles.h2}>Metadata</h2>
              <div style={styles.note}>userId: {session.userId}</div>
              <div style={styles.note}>fanProfile: {session.fanProfileId || "—"}</div>
              <div style={styles.note}>
                creator: {session.creatorName || score.creatorName || "—"}
              </div>
              <div style={styles.note}>
                benchmark: {score.benchmarkOperator || "spagnuolo (default)"}
              </div>
              <div style={styles.note}>durata: {session.duration || 0}s</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
