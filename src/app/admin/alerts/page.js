"use client";

/**
 * Alert operativi — fonte di verità dei check automatici.
 * ADR: docs/ALERT_OPERATIVI.md. Dati da /api/admin/ops-alerts (SCORES_VIEW all).
 * Stati: open → ack (manuale, globale di team) → resolved (SOLO automatico).
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2, ArrowUpRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, PillTab } from "@/components/cp-style";

const fetcher = async (url) => {
  const r = await fetch(url);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
};

function fmtRelativeTime(timestamp) {
  if (!timestamp) return "—";
  const ms = Date.now() - timestamp;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  return `${d}g fa`;
}

function SeverityBadge({ severity, resolved }) {
  const color = resolved ? CP.accentGreen : severity === "critical" ? CP.accentRed : CP.accentSoftText;
  const label = resolved ? "Risolto" : severity === "critical" ? "Critico" : "Avviso";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function StatusPill({ alert }) {
  if (alert.status === "resolved") {
    return (
      <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${CP.accentGreen}44`, color: CP.accentGreen, whiteSpace: "nowrap" }}>
        Auto-risolto {alert.resolvedAt ? fmtRelativeTime(alert.resolvedAt) : ""}
      </span>
    );
  }
  if (alert.status === "ack") {
    return (
      <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${CP.accentDim}`, color: CP.accentSoftText, whiteSpace: "nowrap" }}>
        In carico · {alert.ackBy || "?"}
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${CP.accentRed}55`, color: CP.accentRed, whiteSpace: "nowrap" }}>
      Aperto
    </span>
  );
}

export default function OpsAlertsPage() {
  const { user } = useUser();
  const { data, error, isLoading, mutate } = useSWR("/api/admin/ops-alerts", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [filter, setFilter] = useState("open");
  const [running, setRunning] = useState(false);
  const [ackBusy, setAckBusy] = useState(null);

  const alerts = data?.alerts || [];
  const lastRun = data?.last_run;
  const openAlerts = alerts.filter((a) => a.status !== "resolved");
  const critOpen = openAlerts.filter((a) => a.severity === "critical");

  const visible = filter === "all" ? alerts
    : filter === "crit" ? alerts.filter((a) => a.severity === "critical" && a.status !== "resolved")
    : openAlerts;

  async function runNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/admin/ops-alerts/run", { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        alert(d?.error || `Errore run (${r.status})`);
      }
      await mutate();
    } finally {
      setRunning(false);
    }
  }

  async function takeCharge(fingerprint) {
    setAckBusy(fingerprint);
    try {
      const r = await fetch("/api/admin/ops-alerts/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, name: user?.firstName || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        alert(d?.error || `Errore (${r.status})`);
      }
      await mutate();
    } finally {
      setAckBusy(null);
    }
  }

  const th = { fontFamily: FONTS.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, textAlign: "left", padding: "10px 14px", background: CP.surface, borderBottom: `1px solid ${CP.border}`, fontWeight: 600 };
  const td = { padding: "13px 14px", borderBottom: `1px solid ${CP.borderSoft}`, verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "32px 32px 64px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        breadcrumb={<><Link href="/admin" style={{ color: CP.textSecondary }}>Hub</Link> › Alert operativi</>}
        section="Sistema · Salute operativa"
        title="Alert operativi"
        subtitle="Check automatici sullo stato dei dati e delle azioni aperte. Il cron gira ogni lunedì alle 8:00; ogni alert si chiude da solo quando la condizione rientra."
        toolbar={
          <>
            <span style={{ fontSize: 12, color: CP.textMuted }}>
              Ultimo run: {lastRun ? `${fmtRelativeTime(lastRun.at)} (${lastRun.trigger === "manual" ? "manuale" : "cron"})` : "mai"}
            </span>
            <button
              onClick={runNow}
              disabled={running}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 8, border: "none", cursor: running ? "default" : "pointer",
                background: CP.accent, color: CP.accentInk, fontSize: 13, fontWeight: 600, fontFamily: FONTS.body,
                opacity: running ? 0.6 : 1,
              }}
            >
              {running ? <Loader2 size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
              Aggiorna ora
            </button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <PillTab active={filter === "open"} onClick={() => setFilter("open")}>Aperti · {openAlerts.length}</PillTab>
        <PillTab active={filter === "all"} onClick={() => setFilter("all")}>Tutti · {alerts.length}</PillTab>
        <PillTab active={filter === "crit"} onClick={() => setFilter("crit")}>Solo critici · {critOpen.length}</PillTab>
      </div>

      {error && (
        <CpCard>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.accentRed, fontSize: 13 }}>
            <AlertCircle size={16} /> {String(error.message || error)}
          </div>
        </CpCard>
      )}

      {!error && (
        <CpCard padding="0">
          {isLoading && !data ? (
            <div style={{ padding: 32, display: "flex", alignItems: "center", gap: 10, color: CP.textMuted, fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Carico gli alert…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 36, display: "flex", alignItems: "center", gap: 10, color: CP.accentGreen, fontSize: 14 }}>
              <CheckCircle2 size={18} />
              {filter === "all" ? "Nessun alert registrato. Lancia \"Aggiorna ora\" per il primo run." : "Nessun alert aperto — tutto in ordine."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={th}>Severità</th>
                    <th style={th}>Alert</th>
                    <th style={th}>Valore</th>
                    <th style={th}>Da quando</th>
                    <th style={th}>Stato</th>
                    <th style={{ ...th, textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const resolved = a.status === "resolved";
                    return (
                      <tr key={a.fingerprint} style={{ opacity: resolved ? 0.55 : 1 }}>
                        <td style={td}><SeverityBadge severity={a.severity} resolved={resolved} /></td>
                        <td style={td}>
                          <div style={{ fontWeight: 600, color: CP.textPrimary }}>{a.title}</div>
                          {a.detail && <div style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 2 }}>{a.detail}</div>}
                        </td>
                        <td style={{ ...td, fontFamily: FONTS.mono, fontSize: 12.5, whiteSpace: "nowrap" }}>{a.value || "—"}</td>
                        <td style={{ ...td, color: CP.textMuted, fontSize: 12, whiteSpace: "nowrap" }} title={`Visto in ${a.runCount || 1} run`}>
                          {fmtRelativeTime(a.firstSeen)}
                        </td>
                        <td style={td}><StatusPill alert={a} /></td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                          {a.status === "open" && (
                            <button
                              onClick={() => takeCharge(a.fingerprint)}
                              disabled={ackBusy === a.fingerprint}
                              style={{
                                padding: "6px 11px", marginRight: 8, borderRadius: 7, cursor: "pointer",
                                background: "transparent", border: `1px solid ${CP.accentDim}`,
                                color: CP.accentSoftText, fontSize: 12, fontWeight: 600, fontFamily: FONTS.body,
                                opacity: ackBusy === a.fingerprint ? 0.6 : 1,
                              }}
                            >
                              Prendi in carico
                            </button>
                          )}
                          {!resolved && a.cta?.href && (
                            <Link
                              href={a.cta.href}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "6px 11px", borderRadius: 7,
                                background: CP.accent, color: CP.accentInk,
                                fontSize: 12, fontWeight: 600, textDecoration: "none",
                              }}
                            >
                              {a.cta.label || "Apri"} <ArrowUpRight size={12} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CpCard>
      )}

      <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 16, lineHeight: 1.6, maxWidth: 720 }}>
        Gli alert sono deduplicati per fingerprint (un run che ritrova la stessa condizione aggiorna la riga,
        non ne crea una nuova) e si auto-risolvono quando il check ripassa. "Prendi in carico" è visibile a
        tutto il team. I risolti restano nello storico 90 giorni.
      </p>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
