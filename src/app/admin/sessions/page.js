"use client";

import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => r.json());

function fmtDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function ScoreBadge({ overall }) {
  if (overall === null || overall === undefined) {
    return <span style={{ color: COLORS.mist, fontSize: 13 }}>—</span>;
  }
  let bg = COLORS.signal;
  if (overall >= 70) bg = COLORS.verdant;
  else if (overall >= 50) bg = COLORS.champagne;
  else if (overall >= 30) bg = COLORS.ember;
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color: COLORS.obsidian,
        fontWeight: 600,
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 13,
      }}
    >
      {overall}%
    </span>
  );
}

export default function SessionsListPage() {
  // Fetch da /api/admin/session-review (rotta nuova) — /api/admin/sessions
  // esiste già con altro scopo (eval feedback per /admin/review).
  const { data, error, isLoading } = useSWR("/api/admin/session-review?limit=100", fetcher, {
    revalidateOnFocus: false,
  });

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
      fontSize: 28,
      letterSpacing: "-0.01em",
      margin: 0,
    },
    sub: { color: COLORS.fog, fontSize: 14, marginTop: 4, marginBottom: 24 },
    tableWrap: {
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 12,
      overflow: "hidden",
    },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
    th: {
      textAlign: "left",
      padding: "12px 16px",
      borderBottom: `1px solid ${COLORS.charcoal}`,
      color: COLORS.fog,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      fontWeight: 500,
    },
    td: {
      padding: "12px 16px",
      borderBottom: `1px solid ${COLORS.charcoal}`,
    },
    row: { transition: "background 0.15s" },
    link: {
      color: COLORS.champagne,
      textDecoration: "none",
      fontWeight: 500,
    },
    backLink: {
      color: COLORS.fog,
      fontSize: 13,
      textDecoration: "none",
      display: "inline-block",
      marginBottom: 14,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Sessioni</span>
            </div>
          }
          section="Training · Quality"
          title="Review chat — sessioni recenti"
          subtitle="Click su una sessione per leggere la conversazione completa con punteggio e feedback. La lista è filtrata in base ai tuoi permessi (own / team / all)."
        />

        {isLoading && <p style={{ color: COLORS.fog }}>Caricamento…</p>}

        {error && (
          <p style={{ color: COLORS.signal }}>Errore di rete: {String(error)}</p>
        )}

        {data?.error && (
          <p style={{ color: COLORS.signal }}>
            Errore: {data.error} — probabilmente il tuo ruolo non ha la
            capability "review".
          </p>
        )}

        {data?.sessions && data.sessions.length === 0 && (
          <p style={{ color: COLORS.fog }}>
            Nessuna sessione trovata nello scope visibile ({data.scope}).
          </p>
        )}

        {data?.sessions && data.sessions.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Data</th>
                  <th style={styles.th}>Operatore</th>
                  <th style={styles.th}>Fan</th>
                  <th style={styles.th}>Modalità</th>
                  <th style={styles.th}>Msg</th>
                  <th style={styles.th}>Durata</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.id} style={styles.row}>
                    <td style={styles.td}>{fmtDate(s.timestamp)}</td>
                    <td style={styles.td}>{s.operatorName || "—"}</td>
                    <td style={styles.td}>{s.fanName || s.fanProfileId || "—"}</td>
                    <td style={styles.td}>
                      <span style={{ color: COLORS.fog, fontSize: 12 }}>
                        {s.mode || "—"}
                      </span>
                    </td>
                    <td style={styles.td}>{s.messageCount}</td>
                    <td style={styles.td}>{fmtDuration(s.duration)}</td>
                    <td style={styles.td}>
                      <ScoreBadge overall={s.score?.overall} />
                    </td>
                    <td style={styles.td}>
                      <Link href={`/admin/sessions/${s.id}`} style={styles.link}>
                        Apri →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
