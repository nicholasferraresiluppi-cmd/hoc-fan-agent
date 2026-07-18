"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FlaskConical, Play, Trash2, Plus, AlertTriangle, CheckCircle2, GitCompare, History } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, PillTab } from "@/components/cp-style";

/**
 * /admin/score-config-drafts
 *
 * Bozze della formula score operativo: crea dalla formula attiva, modifica i pesi,
 * backtest sui periodi storici reali (formula attiva vs bozza), publish con
 * conferma esplicita. Il path di scoring live non cambia finché non pubblichi.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const STATUS_META = {
  draft: { label: "bozza", color: CP.accentBlue },
  published: { label: "pubblicata", color: CP.accentGreen },
  archived: { label: "archiviata", color: CP.textMuted },
};

export default function ScoreConfigDraftsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/score-config-drafts", fetcher);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState(null);

  const drafts = data?.drafts || [];
  const forbidden = data?.error;

  async function call(url, opts) {
    setBusy(true);
    setPageError(null);
    try {
      const r = await fetch(url, opts);
      const j = await r.json();
      if (!r.ok) setPageError(j.error || "Errore.");
      await mutate();
      return j;
    } catch (e) {
      setPageError(String(e?.message || e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    const j = await call("/api/admin/score-config-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (j?.draft?.id) setExpanded(j.draft.id);
  }

  return (
    <div style={{ padding: "32px 32px 64px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <PageHeader
        section="Data & Integrations"
        title="Bozze formula score"
        subtitle="Prova un cambio di formula PRIMA di renderlo attivo: crea una bozza dalla formula corrente, modifica i pesi, fai il backtest sui mesi reali già importati (chi sale, chi scende, come cambiano i tier) e pubblica solo con conferma esplicita. Finché non pubblichi, score e classifiche live non cambiano."
        toolbar={
          <>
            <Link href="/admin/score-config-history" style={{ textDecoration: "none" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, fontFamily: FONTS.body }}>
                <History size={15} /> Storico formula
              </span>
            </Link>
            <button
              onClick={onCreate}
              disabled={busy}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, color: CP.accentInk, fontFamily: FONTS.body, fontWeight: 500, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
            >
              <Plus size={15} /> Nuova bozza dalla formula attiva
            </button>
          </>
        }
      />

      {forbidden && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textSecondary, fontSize: 14 }}>
            <AlertTriangle size={18} color={CP.accentRed} /> Accesso riservato agli admin (capability SEED). {String(forbidden)}
          </div>
        </CpCard>
      )}

      {pageError && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ color: CP.textSecondary, fontSize: 14 }}>{pageError}</div>
        </CpCard>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14, padding: "24px 0" }}>Caricamento…</div>}

      {!isLoading && !forbidden && drafts.length === 0 && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "28px 16px" }}>
            <FlaskConical size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14, margin: "12px 0 4px 0" }}>Nessuna bozza.</p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>
              Crea una bozza dalla formula attiva per sperimentare un cambio di pesi in sicurezza.
            </p>
          </div>
        </CpCard>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            open={expanded === d.id}
            onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
            call={call}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

function DraftCard({ draft, open, onToggle, call, busy }) {
  const meta = STATUS_META[draft.status] || STATUS_META.draft;
  const isDraft = draft.status === "draft";
  const [confirmText, setConfirmText] = useState("");
  const [mode, setMode] = useState("withoutClockIn");

  async function onSaveWeights(weights) {
    await call("/api/admin/score-config-drafts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draft.id, weights }),
    });
  }
  async function onBacktest() {
    await call("/api/admin/score-config-drafts/backtest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draft.id, period_type: "monthly", mode, limit: 6 }),
    });
  }
  async function onPublish() {
    await call("/api/admin/score-config-drafts/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draft.id, confirm: confirmText }),
    });
    setConfirmText("");
  }
  async function onDelete() {
    if (!window.confirm(`Eliminare la bozza "${draft.name}"?`)) return;
    await call(`/api/admin/score-config-drafts?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" });
  }

  return (
    <CpCard accent={isDraft ? CP.accentBlue : undefined}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ minWidth: 200, flex: 1 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{draft.name}</div>
          <div style={{ fontSize: 12, color: CP.textMuted }}>
            {new Date(draft.updated_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            {draft.note ? ` · ${draft.note}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, background: meta.color + "18", borderRadius: 999, padding: "3px 10px" }}>
          {meta.label}
        </span>
        {draft.backtest && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: CP.textSecondary }}>
            <GitCompare size={13} /> backtest su {draft.backtest.periods.length} periodi
          </span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${CP.borderSoft}` }}>
          {isDraft && (
            <WeightsEditor draft={draft} onSave={onSaveWeights} busy={busy} />
          )}

          {/* Backtest */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <SectionLabel>Backtest sui mesi reali (ultimi 6)</SectionLabel>
              <div style={{ display: "flex", gap: 6 }}>
                <PillTab active={mode === "withoutClockIn"} onClick={() => setMode("withoutClockIn")}>senza clock-in</PillTab>
                <PillTab active={mode === "withClockIn"} onClick={() => setMode("withClockIn")}>con clock-in</PillTab>
              </div>
              <button
                onClick={onBacktest}
                disabled={busy}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12.5, color: CP.textPrimary, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
              >
                <Play size={13} /> Esegui backtest
              </button>
            </div>
            {draft.backtest && <BacktestResults bt={draft.backtest} />}
          </div>

          {/* Publish + delete */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${CP.borderSoft}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {isDraft && (
              <>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Scrivi "PUBBLICA" per attivare'
                  style={{ background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.body, width: 220 }}
                />
                <button
                  onClick={onPublish}
                  disabled={busy || confirmText !== "PUBBLICA"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: confirmText === "PUBBLICA" ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: confirmText === "PUBBLICA" ? CP.accentInk : CP.textMuted, cursor: confirmText === "PUBBLICA" ? "pointer" : "not-allowed" }}
                >
                  <CheckCircle2 size={14} /> Pubblica come formula attiva
                </button>
                <span style={{ fontSize: 12, color: CP.textMuted, maxWidth: 380, lineHeight: 1.4 }}>
                  Forward-only: i mesi già importati restano scorati con la formula del loro snapshot; la precedente viene archiviata qui.
                </span>
              </>
            )}
            <button
              onClick={onDelete}
              disabled={busy}
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12.5, color: CP.accentRed, cursor: "pointer" }}
            >
              <Trash2 size={13} /> Elimina
            </button>
          </div>
        </div>
      )}
    </CpCard>
  );
}

function WeightsEditor({ draft, onSave, busy }) {
  const [weights, setWeights] = useState(draft.weights);
  const [dirty, setDirty] = useState(false);

  const sum = (m) => Object.values(weights[m] || {}).reduce((a, b) => a + Number(b || 0), 0);

  function setW(m, k, v) {
    const num = Number(v);
    setWeights((w) => ({ ...w, [m]: { ...w[m], [k]: Number.isFinite(num) ? num : 0 } }));
    setDirty(true);
  }

  return (
    <div>
      <SectionLabel>Pesi KPI (somma deve fare 1.00 per modalità)</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginTop: 10 }}>
        {["withClockIn", "withoutClockIn"].map((m) => {
          const s = sum(m);
          const okSum = Math.abs(s - 1) <= 0.001;
          return (
            <div key={m}>
              <div style={{ fontSize: 12, color: okSum ? CP.textMuted : CP.accentRed, marginBottom: 6, fontFamily: FONTS.mono }}>
                {m} · somma {s.toFixed(3)} {okSum ? "✓" : "≠ 1.000"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(weights[m] || {}).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13, color: CP.textSecondary }}>{k.replace(/_/g, " ")}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={v}
                      onChange={(e) => setW(m, k, e.target.value)}
                      style={{ width: 76, background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.mono, textAlign: "right" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {dirty && (
        <button
          onClick={() => { onSave(weights); setDirty(false); }}
          disabled={busy || Math.abs(sum("withClockIn") - 1) > 0.001 || Math.abs(sum("withoutClockIn") - 1) > 0.001}
          style={{ marginTop: 12, padding: "7px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer" }}
        >
          Salva pesi nella bozza
        </button>
      )}
      <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0 0" }}>
        Soglie di normalizzazione e cutoff tier vengono copiati dalla formula attiva; per modificarli usa <Link href="/admin/leaderboard-settings" style={{ color: CP.accent }}>Settings ladder</Link> dopo il publish, o modifica la bozza via API.
      </p>
    </div>
  );
}

function BacktestResults({ bt }) {
  if (!bt.periods?.length) {
    return <p style={{ fontSize: 13, color: CP.textMuted, marginTop: 10 }}>Nessun periodo con dati nel backtest.</p>;
  }
  return (
    <div style={{ marginTop: 12 }}>
      {bt.same_as_active && (
        <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "0 0 8px 0" }}>
          La bozza è identica alla formula attiva ({bt.draft_hash}): i delta sono zero per costruzione.
        </p>
      )}
      <div style={{ overflowX: "auto", border: `1px solid ${CP.borderSoft}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720, fontSize: 12.5, fontFamily: FONTS.body }}>
          <thead>
            <tr>
              {["Periodo", "Operatori", "Δ medio score", "Cambi in top 10", "Tier (attiva → bozza)", "Top movers"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textMuted, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bt.periods.map((p) => (
              <tr key={p.period_id}>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, fontFamily: FONTS.mono, color: CP.textPrimary }}>{p.period_id}</td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, fontFamily: FONTS.mono, color: CP.textSecondary }}>{p.eligible}</td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, fontFamily: FONTS.mono, color: Math.abs(p.mean_delta) < 0.5 ? CP.textSecondary : (p.mean_delta > 0 ? CP.accentGreen : CP.accentRed) }}>
                  {p.mean_delta > 0 ? "+" : ""}{p.mean_delta}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, fontFamily: FONTS.mono, color: p.top10_changes > 0 ? CP.accentBlue : CP.textSecondary }}>{p.top10_changes}</td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textSecondary, fontSize: 12 }}>
                  {Object.keys(p.tier_counts_current).map((t) => `${t} ${p.tier_counts_current[t]}→${p.tier_counts_proposed[t] ?? 0}`).join(" · ")}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textSecondary, fontSize: 12 }}>
                  {p.top_movers.map((m) => `${m.employee} ${m.delta > 0 ? "+" : ""}${m.delta}`).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
