"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const CATEGORY_LABELS = {
  "le-basi-della-chat": "Basi della chat",
  "custom-e-upsell": "Custom & PPV",
  "script-avanzati": "Script avanzati",
  "recuperi-e-retention": "Recuperi & Retention",
};

const CREATOR_LABELS = {
  "elisa-esposito": "Elisa Esposito",
  "gaja-bertolin": "Gaja Bertolin",
  "giulia-vaneri": "Giulia Vaneri",
};

function MessageBubble({ msg }) {
  const isOperator = msg.role === "operator";
  return (
    <div style={{ display: "flex", justifyContent: isOperator ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div
        style={{
          maxWidth: "78%",
          background: isOperator ? COLORS.champagne : COLORS.charcoal,
          color: isOperator ? COLORS.obsidian : COLORS.alabaster,
          padding: "10px 14px",
          borderRadius: 14,
          borderBottomRightRadius: isOperator ? 2 : 14,
          borderBottomLeftRadius: isOperator ? 14 : 2,
          fontSize: 14,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.45,
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

export default function PlaybookEntryPage() {
  const params = useParams();
  const id = params?.id;
  const { data, error, isLoading } = useSWR(
    id ? `/api/playbook/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1100, margin: "0 auto" },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 12 },
    title: { fontFamily: FONTS.display, fontSize: 28, letterSpacing: "-0.01em", margin: "0 0 8px 0", lineHeight: 1.3 },
    badges: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18, fontSize: 12 },
    badge: { background: COLORS.charcoal, color: COLORS.fog, padding: "3px 10px", borderRadius: 10 },
    badgeAccent: { background: COLORS.champagne, color: COLORS.obsidian, padding: "3px 10px", borderRadius: 10, fontWeight: 600 },
    grid: { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 22, marginTop: 18 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 12, padding: 20 },
    h2: { fontFamily: FONTS.display, fontSize: 16, margin: "0 0 12px 0", color: COLORS.alabaster, fontWeight: 600 },
    label: { fontSize: 11, color: COLORS.fog, letterSpacing: "0.06em", marginBottom: 6 },
    body: { fontSize: 14, color: COLORS.alabaster, lineHeight: 1.6 },
    takeaway: {
      fontSize: 14,
      color: COLORS.alabaster,
      lineHeight: 1.6,
      background: COLORS.charcoal,
      padding: 14,
      borderRadius: 8,
      borderLeft: `3px solid ${COLORS.champagne}`,
      fontStyle: "italic",
    },
    stepsList: { paddingLeft: 20, margin: "8px 0 0 0", fontSize: 14, lineHeight: 1.6, color: COLORS.alabaster },
    note: { fontSize: 13, color: COLORS.fog, marginTop: 8, fontStyle: "italic" },
    metaRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.fog, marginBottom: 6 },
  };

  if (isLoading) return <div style={styles.page}><div style={styles.container}><p style={{ color: COLORS.fog }}>Caricamento…</p></div></div>;
  if (error) return <div style={styles.page}><div style={styles.container}><p style={{ color: COLORS.signal }}>Errore di rete.</p></div></div>;
  if (data?.error) return (
    <div style={styles.page}>
      <div style={styles.container}>
        <Link href="/playbook" style={styles.backLink}>← Playbook</Link>
        <p style={{ color: COLORS.signal }}>{data.error}</p>
      </div>
    </div>
  );

  const entry = data?.entry;
  if (!entry) return null;

  const isDedicated = entry.source === "dedicated";

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18, display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <Link href="/playbook" style={{ color: "inherit", textDecoration: "none" }}>Playbook</Link>
          <span style={{ color: CP.textMuted }}>›</span>
          <span style={{ color: CP.textPrimary }}>Dettaglio</span>
        </div>

        <h1 style={styles.title}>{entry.title}</h1>

        <div style={styles.badges}>
          <span style={isDedicated ? styles.badgeAccent : styles.badge}>
            {isDedicated ? "Curato per operatori" : "Pool di calibrazione AI"}
          </span>
          <span style={styles.badge}>{CATEGORY_LABELS[entry.category] || entry.category}</span>
          {entry.creator && <span style={styles.badge}>{CREATOR_LABELS[entry.creator] || entry.creator}</span>}
          {entry.benchmark && <span style={styles.badge}>benchmark: {entry.benchmark}</span>}
          {entry.difficulty && <span style={styles.badge}>{entry.difficulty}</span>}
          {entry.outcome === "failure" && (
            <span style={{ ...styles.badge, background: COLORS.signal + "20", color: COLORS.signal }}>
              esempio negativo (cosa NON funziona)
            </span>
          )}
        </div>

        {!isDedicated && (
          <div style={{ ...styles.card, background: COLORS.charcoal, marginBottom: 18, fontSize: 13, color: COLORS.fog }}>
            ⚠ Questa voce viene dal <strong>pool di calibrazione del giudice AI</strong>, non
            è stata curata specificamente per la formazione operatori. Il commentary tecnico è
            scritto per il giudice. Da studiare con un occhio critico, non da copiare verbatim.
          </div>
        )}

        <div style={styles.grid}>
          {/* Conversazione */}
          <div style={styles.card}>
            <h2 style={styles.h2}>Conversazione</h2>
            {entry.conversation && entry.conversation.length > 0 ? (
              entry.conversation.map((m, i) => <MessageBubble key={i} msg={m} />)
            ) : (
              <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessun messaggio salvato.</p>
            )}
          </div>

          {/* Pannello laterale */}
          <div>
            {entry.situation && (
              <div style={{ ...styles.card, marginBottom: 14 }}>
                <div style={styles.label}>Situazione</div>
                <div style={styles.body}>{entry.situation}</div>
              </div>
            )}

            <div style={{ ...styles.card, marginBottom: 14 }}>
              <div style={styles.label}>{isDedicated ? "Commentary didattico" : "Commentary del giudice AI"}</div>
              <div style={styles.body}>{entry.commentary}</div>
            </div>

            {entry.steps && entry.steps.length > 0 && (
              <div style={{ ...styles.card, marginBottom: 14 }}>
                <div style={styles.label}>Step concreti</div>
                <ol style={styles.stepsList}>
                  {entry.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}

            {entry.takeaway && (
              <div style={{ ...styles.card, marginBottom: 14 }}>
                <div style={styles.label}>Takeaway</div>
                <div style={styles.takeaway}>{entry.takeaway}</div>
              </div>
            )}

            <div style={styles.card}>
              <div style={styles.label}>Metadata</div>
              {entry.operatorId && <div style={styles.metaRow}><span>Operatore</span><span>{entry.operatorId}</span></div>}
              {entry.fanProfile && <div style={styles.metaRow}><span>Fan profile</span><span>{entry.fanProfile}</span></div>}
              <div style={styles.metaRow}><span>ID</span><span style={{ fontFamily: FONTS.mono, fontSize: 11 }}>{entry.id}</span></div>
              {entry.tags && entry.tags.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={styles.label}>Tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {entry.tags.map((t, i) => (
                      <span key={i} style={{ ...styles.badge, fontSize: 11 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
