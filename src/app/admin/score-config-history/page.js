"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { History, AlertTriangle, CheckCircle2, GitCompare, Sliders } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, PillTab } from "@/components/cp-style";

/**
 * /admin/score-config-history
 *
 * Storico versionato della formula dello score operativo Infloww congelata a ogni
 * import. Rileva il drift: con quale formula (pesi/soglie/tier) ciascun periodo è
 * stato scorato. Prerequisito della policy dispute/retroattività (CAREER_LADDER §8.2).
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const PERIOD_TYPES = [
  { key: "monthly", label: "Mensile" },
  { key: "weekly", label: "Settimanale" },
  { key: "quarterly", label: "Trimestrale" },
];

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Riepilogo compatto dei pesi withClockIn (i KPI più pesanti) per l'occhio.
function topWeights(weights) {
  const w = weights?.withClockIn || {};
  return Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${(v * 100).toFixed(0)}%`)
    .join(" · ");
}

export default function ScoreConfigHistoryPage() {
  const [periodType, setPeriodType] = useState("monthly");
  const [expanded, setExpanded] = useState(null);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/admin/score-config-history?period_type=${periodType}`,
    fetcher
  );

  const snapshots = data?.snapshots || [];
  const activeHash = data?.active_hash || null;
  const driftCount = useMemo(
    () => snapshots.filter((s) => s.drift_vs_prev).length,
    [snapshots]
  );

  const forbidden = data?.error && (String(data.error).toLowerCase().includes("permess") || String(data.error).toLowerCase().includes("forbidden") || String(data.error).toLowerCase().includes("unauthorized"));

  return (
    <div style={{ padding: "32px 32px 64px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <PageHeader
        section="Data & Integrations"
        title="Storico formula score"
        subtitle="Con quale formula (pesi KPI, soglie di normalizzazione, cutoff tier) è stato scorato ciascun periodo. La formula viene congelata automaticamente a ogni import CSV Infloww: se cambia tra un mese e l'altro, qui si vede il drift. È il prerequisito per correzioni e appelli difendibili (career ladder §8.2)."
        toolbar={
          <Link href="/admin/leaderboard-settings" style={{ textDecoration: "none" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, fontFamily: FONTS.body }}>
              <Sliders size={15} /> Modifica formula
            </span>
          </Link>
        }
      />

      {/* Selettore tipo periodo */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {PERIOD_TYPES.map((pt) => (
          <PillTab key={pt.key} active={periodType === pt.key} onClick={() => { setPeriodType(pt.key); setExpanded(null); }}>
            {pt.label}
          </PillTab>
        ))}
      </div>

      {forbidden && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textSecondary, fontSize: 14 }}>
            <AlertTriangle size={18} color={CP.accentRed} />
            Accesso riservato agli admin (capability SEED). {String(data.error)}
          </div>
        </CpCard>
      )}

      {error && !forbidden && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ color: CP.textSecondary, fontSize: 14 }}>Errore nel caricamento dello storico.</div>
        </CpCard>
      )}

      {/* Riepilogo */}
      {!isLoading && !forbidden && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <SummaryTile label="Periodi tracciati" value={snapshots.length} />
          <SummaryTile
            label="Cambi di formula"
            value={driftCount}
            accent={driftCount > 0 ? CP.accentBlue : CP.accentGreen}
            icon={driftCount > 0 ? <GitCompare size={15} /> : <CheckCircle2 size={15} />}
          />
          <SummaryTile label="Formula attiva ora" value={activeHash ? activeHash.slice(0, 8) : "—"} mono />
        </div>
      )}

      {isLoading && (
        <div style={{ color: CP.textMuted, fontSize: 14, padding: "24px 0" }}>Caricamento…</div>
      )}

      {/* Empty state */}
      {!isLoading && !forbidden && snapshots.length === 0 && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "28px 16px" }}>
            <History size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14, margin: "12px 0 4px 0" }}>
              Nessuno snapshot ancora per i periodi {PERIOD_TYPES.find((p) => p.key === periodType)?.label.toLowerCase()}.
            </p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0, lineHeight: 1.6, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
              La formula viene congelata automaticamente al prossimo import CSV Infloww. Per creare subito un riferimento baseline della formula corrente su un periodo già importato, usa <Link href="/admin/leaderboard-import" style={{ color: CP.accent }}>Import Infloww</Link>.
            </p>
          </div>
        </CpCard>
      )}

      {/* Lista snapshot */}
      {!isLoading && snapshots.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {snapshots.map((snap) => {
            const isOpen = expanded === snap.period_id;
            const isActive = activeHash && snap.hash === activeHash;
            return (
              <CpCard
                key={snap.period_id}
                accent={snap.drift_vs_prev ? CP.accentBlue : undefined}
                onClick={() => setExpanded(isOpen ? null : snap.period_id)}
                style={{ cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 96 }}>
                    <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{snap.period_id}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted }}>{fmtDate(snap.captured_at_iso)}</div>
                  </div>

                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: CP.textSecondary, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, borderRadius: 6, padding: "3px 8px" }}>
                    {snap.hash}
                  </span>

                  {snap.drift_vs_prev ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: CP.accentBlue, background: CP.accentBlue + "18", borderRadius: 999, padding: "3px 10px" }}>
                      <GitCompare size={13} /> formula cambiata vs {snap.prev_period_id}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: CP.textMuted }}>invariata</span>
                  )}

                  {isActive && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: CP.accentGreen, background: CP.accentGreen + "18", borderRadius: 999, padding: "3px 10px" }}>
                      = formula attiva
                    </span>
                  )}

                  <div style={{ marginLeft: "auto", fontSize: 12, color: CP.textMuted, maxWidth: 360, textAlign: "right", lineHeight: 1.4 }}>
                    {topWeights(snap.weights)}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${CP.borderSoft}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                    <ConfigBlock title="Pesi KPI · con clock-in" data={snap.weights?.withClockIn} pct />
                    <ConfigBlock title="Pesi KPI · senza clock-in" data={snap.weights?.withoutClockIn} pct />
                    <div>
                      <SectionLabel>Cutoff tier</SectionLabel>
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {(snap.tiers || []).map((t) => (
                          <div key={t.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary }}>
                            <span style={{ color: t.color || CP.textSecondary }}>{t.label}</span>
                            <span style={{ fontFamily: FONTS.mono }}>{t.min}–{t.max}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 12, fontSize: 12, color: CP.textMuted }}>
                        Sorgente: <span style={{ fontFamily: FONTS.mono }}>{snap.source || "import"}</span>
                        {snap.is_custom && (snap.is_custom.weights || snap.is_custom.thresholds || snap.is_custom.tiers) ? " · override attivo" : " · default"}
                      </div>
                    </div>
                  </div>
                )}
              </CpCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, accent, icon, mono }) {
  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "12px 18px", minWidth: 140 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono ? FONTS.mono : FONTS.display, fontSize: mono ? 16 : 22, fontWeight: 500, color: accent || CP.textPrimary }}>
        {icon}{value}
      </div>
    </div>
  );
}

function ConfigBlock({ title, data, pct }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary }}>
            <span>{k.replace(/_/g, " ")}</span>
            <span style={{ fontFamily: FONTS.mono }}>{pct ? `${(v * 100).toFixed(0)}%` : v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
