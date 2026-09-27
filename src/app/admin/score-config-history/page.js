"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FlaskConical, History, Sliders } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, DataTable, FilterChip, NUM, card } from "@/components/ds";

/**
 * /admin/score-config-history
 *
 * Storico versionato della formula dello score operativo Infloww congelata a ogni
 * import. Rileva il drift: con quale formula (pesi/soglie/tier) ciascun periodo è
 * stato scorato. Prerequisito della policy dispute/retroattività (CAREER_LADDER §8.2).
 *
 * Ridisegno 26/09/2026 (design system): tabella ordinabile per mese; al posto del
 * solo codice della formula, "cosa è cambiato" rispetto al mese prima (pesi,
 * soglie, fasce, altro) calcolato confrontando le due fotografie; dettaglio del
 * mese scelto sotto la tabella. Nota esplicita: la formula attiva ricalcola
 * anche i mesi passati, la fotografia dice con quale formula era stato importato.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const PERIOD_TYPES = [
  { key: "monthly", label: "Mensile" },
  { key: "weekly", label: "Settimanale" },
  { key: "quarterly", label: "Trimestrale" },
];

const KPI_IT = {
  fan_cvr: "Conversione fan",
  unlock_rate: "Contenuti sbloccati",
  avg_earnings_per_paying_fan: "Incasso per fan pagante",
  golden_ratio: "Golden ratio",
  sales_per_hour: "Vendite all'ora",
  avg_revenue_per_fan: "Incasso per fan",
  avg_length_of_conversation: "Lunghezza conversazioni",
  input_per_message: "Input per messaggio",
  messages_sent_per_hour: "Messaggi all'ora",
};
const kpiName = (k) => KPI_IT[k] || k.replace(/_/g, " ");

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
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
    .map(([k, v]) => `${kpiName(k)} ${(v * 100).toFixed(0)}%`)
    .join(" · ");
}

// Cosa è cambiato rispetto alla fotografia del periodo prima (solo presentazione)
function whatChanged(snap, prev) {
  if (!snap.drift_vs_prev) return [];
  if (!prev) return ["formula diversa"];
  const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const out = [];
  if (!eq(snap.weights, prev.weights)) out.push("pesi");
  if (!eq(snap.thresholds, prev.thresholds)) out.push("soglie dei punti");
  if (!eq(snap.tiers, prev.tiers)) out.push("fasce");
  if (!out.length) out.push("altre regole (es. gruppi piccoli)");
  return out;
}

export default function ScoreConfigHistoryPage() {
  const [periodType, setPeriodType] = useState("monthly");
  const [expanded, setExpanded] = useState(null);

  const { data, error, isLoading } = useSWR(
    `/api/admin/score-config-history?period_type=${periodType}`,
    fetcher
  );

  const snapshots = data?.snapshots || [];
  const activeHash = data?.active_hash || null;
  const driftCount = useMemo(
    () => snapshots.filter((s) => s.drift_vs_prev).length,
    [snapshots]
  );
  const byPeriod = useMemo(() => Object.fromEntries(snapshots.map((s) => [s.period_id, s])), [snapshots]);
  const notActive = activeHash ? snapshots.filter((s) => s.hash !== activeHash).length : 0;

  const forbidden = data?.error && (String(data.error).toLowerCase().includes("permess") || String(data.error).toLowerCase().includes("forbidden") || String(data.error).toLowerCase().includes("unauthorized"));
  const sel = snapshots.find((s) => s.period_id === expanded) || null;

  const rows = snapshots.map((s) => ({ ...s, id: s.period_id, changes: whatChanged(s, byPeriod[s.prev_period_id]) }));
  const columns = [
    { key: "period_id", label: "Periodo", sort: (r) => r.period_id, render: (r) => <span style={{ color: CP.textPrimary, ...NUM }}>{r.period_id}</span> },
    { key: "captured", label: "Fotografata il", muted: true, sort: (r) => r.captured_at_iso || "", render: (r) => fmtDate(r.captured_at_iso) },
    {
      key: "hash", label: "Versione", sort: (r) => r.hash || "",
      render: (r) => (
        <span style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: CP.textSecondary, ...NUM }}>{r.hash}</span>
          {activeHash && r.hash === activeHash && <span style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px", borderRadius: 999, background: CP.accentSoft, color: CP.accentSoftText }}>attiva oggi</span>}
        </span>
      ),
    },
    {
      key: "changes", label: "Rispetto al periodo prima", sort: (r) => r.changes.length,
      render: (r) => r.drift_vs_prev
        ? <span style={{ color: CP.textPrimary }}>cambiati: {r.changes.join(", ")} <span style={{ color: CP.textMuted, fontSize: 12 }}>(vs {r.prev_period_id})</span></span>
        : <span style={{ color: CP.textMuted }}>invariata</span>,
    },
    { key: "top", label: "KPI che pesano di più", sortable: false, muted: true, render: (r) => <span style={{ fontSize: 12 }}>{topWeights(r.weights)}</span> },
  ];

  const lnk = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.body, textDecoration: "none" };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Storico formula" }]}
        title="Storico della formula score"
        subtitle="Con quale formula (pesi dei KPI, soglie dei punti, fasce) era calcolato lo score Mestiere quando ogni periodo è stato importato. Serve a rispondere a una contestazione: «a luglio contava questo»."
        actions={<>
          <Link href="/admin/score-config-drafts" style={lnk}><FlaskConical size={14} /> Bozze formula</Link>
          <Link href="/admin/leaderboard-settings" style={lnk}><Sliders size={14} /> Modifica formula</Link>
        </>}
      />

      {/* Selettore tipo periodo */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {PERIOD_TYPES.map((pt) => (
          <FilterChip key={pt.key} label={pt.label} active={periodType === pt.key} onClick={() => { setPeriodType(pt.key); setExpanded(null); }} />
        ))}
      </div>

      {forbidden && <Notice danger>Pagina riservata agli admin. {String(data.error)}</Notice>}
      {error && !forbidden && <Notice danger>Errore nel caricamento dello storico.</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && snapshots.length > 0 && (
        <HeroMetric
          label="Cambi di formula tra un periodo e il successivo"
          value={String(driftCount)}
          compare={`su ${snapshots.length} periodi fotografati`}
          hint={driftCount === 0 ? "La formula non è mai cambiata tra i periodi fotografati." : "Ogni cambio è una riga «cambiati: …» nella tabella."}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Metric label="Versione attiva oggi" value={activeHash ? activeHash.slice(0, 8) : "—"} />
            <Metric label="Periodi importati con un'altra versione" value={String(notActive)} note={notActive ? "oggi si vedono ricalcolati con quella attiva" : null} />
          </div>
        </HeroMetric>
      )}

      {!isLoading && !forbidden && snapshots.length > 0 && (
        <Notice>
          La formula attiva ricalcola anche i mesi passati: nelle classifiche di oggi ogni mese è calcolato con la versione attiva. Questa pagina dice con quale versione era stato importato, cioè cosa vedevano le persone in quel momento.
        </Notice>
      )}

      {/* Empty state */}
      {!isLoading && !forbidden && !error && snapshots.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "28px 16px" }}>
          <History size={28} color={CP.mutedIcons} />
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: "12px 0 4px 0" }}>
            Nessuna fotografia per i periodi {PERIOD_TYPES.find((p) => p.key === periodType)?.label.toLowerCase()}.
          </p>
          <p style={{ color: CP.textMuted, fontSize: 13, margin: "0 auto", lineHeight: 1.6, maxWidth: 560 }}>
            La formula si fotografa da sola a ogni import dell&apos;export Infloww. Per avere subito un riferimento su un periodo già importato, reimportalo da <Link href="/admin/leaderboard-import" style={{ color: CP.accentSoftText }}>Import Infloww</Link>.
          </p>
        </div>
      )}

      {!isLoading && snapshots.length > 0 && (
        <section>
          <SectionTitle aside="clic su una riga per il dettaglio">Periodi fotografati · {snapshots.length}</SectionTitle>
          <DataTable
            columns={columns}
            rows={rows}
            defaultSort={{ key: "period_id", dir: -1 }}
            onRowClick={(r) => setExpanded(expanded === r.period_id ? null : r.period_id)}
            selected={(r) => r.period_id === expanded}
            minWidth={820}
            maxHeight={520}
          />

          {sel && (
            <div style={{ ...card, padding: "14px 16px", marginTop: 12 }}>
              <SectionTitle aside={`fotografata il ${fmtDate(sel.captured_at_iso)} · da ${sel.source === "import" || !sel.source ? "import" : sel.source} · ${sel.is_custom && (sel.is_custom.weights || sel.is_custom.thresholds || sel.is_custom.tiers) ? "valori modificati rispetto al codice" : "valori di fabbrica"}`}>
                Formula di {sel.period_id} · versione {sel.hash}
              </SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                <ConfigBlock title="Pesi · con ore timbrate" data={sel.weights?.withClockIn} pct />
                <ConfigBlock title="Pesi · senza ore timbrate" data={sel.weights?.withoutClockIn} pct />
                <div>
                  <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 6 }}>Fasce</div>
                  {(sel.tiers || []).map((t) => (
                    <div key={t.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary, padding: "2px 0" }}>
                      <span>{t.label}</span>
                      <span style={NUM}>{t.min}–{t.max}</span>
                    </div>
                  ))}
                  {Array.isArray(sel.thresholds) && sel.thresholds.length > 0 && (
                    <>
                      <div style={{ fontSize: 13, color: CP.textPrimary, margin: "12px 0 6px" }}>Soglie dei punti</div>
                      {sel.thresholds.map((t, i) => (
                        <div key={i} style={{ fontSize: 13, color: CP.textSecondary, padding: "2px 0", ...NUM }}>sotto il {Math.round((Number(t.multiplier) || 0) * 100)}% della media → {t.score}</div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ConfigBlock({ title, data, pct }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 6 }}>{title}</div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary, padding: "2px 0" }}>
          <span>{kpiName(k)}</span>
          <span style={NUM}>{pct ? `${(v * 100).toFixed(0)}%` : v}</span>
        </div>
      ))}
    </div>
  );
}
