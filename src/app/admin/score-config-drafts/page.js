"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FlaskConical, Play, Trash2, Plus, CheckCircle2, History, ChevronDown, ChevronRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, Disclosure, FilterChip, NUM, card } from "@/components/ds";

/**
 * /admin/score-config-drafts
 *
 * Bozze della formula score operativo: crea dalla formula attiva, modifica i pesi,
 * backtest sui periodi storici reali (formula attiva vs bozza), publish con
 * conferma esplicita. Il path di scoring live non cambia finché non pubblichi.
 *
 * Ridisegno 26/09/2026 (design system): i tre passi (modifica → prova sui mesi
 * veri → pubblica) numerati dentro ogni bozza; KPI e modalità in italiano;
 * backtest con intestazioni spiegate; bozze in prova in alto, archiviate in
 * fondo chiuse. Publish invariato: resta la parola "PUBBLICA" da scrivere.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const STATUS_META = {
  draft: { label: "in prova" },
  published: { label: "pubblicata" },
  archived: { label: "archiviata" },
};

// Nomi dei KPI in italiano (la chiave tecnica resta nei dati)
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
const MODE_IT = { withClockIn: "Con ore timbrate", withoutClockIn: "Senza ore timbrate" };
const kpiName = (k) => KPI_IT[k] || k.replace(/_/g, " ");
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const nf = (v, d = 1) => Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: d });

const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer", textDecoration: "none" });
const stepTitle = { fontSize: 14, fontWeight: 500, color: CP.textPrimary, margin: "0 0 6px" };

export default function ScoreConfigDraftsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/score-config-drafts", fetcher);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [archOpen, setArchOpen] = useState(false);

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

  const inTest = drafts.filter((d) => d.status === "draft");
  const published = drafts.filter((d) => d.status === "published").sort((a, b) => (b.published_at || b.updated_at || 0) - (a.published_at || a.updated_at || 0));
  const archived = drafts.filter((d) => d.status === "archived");
  const lastPub = published[0];

  const renderList = (list) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map((d) => (
        <DraftCard key={d.id} draft={d} open={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)} call={call} busy={busy} />
      ))}
    </div>
  );

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Bozze formula" }]}
        title="Bozze della formula score"
        subtitle="Prova un cambio della formula dello score Mestiere prima di renderlo vero: parti dalla formula attiva, cambia i pesi, guarda sui mesi già importati chi sale e chi scende, e pubblica solo se ti convince. Finché non pubblichi, score e classifiche non cambiano."
        actions={<>
          <Link href="/admin/score-config-history" style={btn(false)}><History size={14} /> Storico formula</Link>
          <button onClick={onCreate} disabled={busy} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>
            <Plus size={14} /> Nuova bozza dalla formula attiva
          </button>
        </>}
      />

      {forbidden && <Notice danger>Pagina riservata agli admin. {String(forbidden)}</Notice>}
      {pageError && <Notice danger>{pageError}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && drafts.length > 0 && (
        <div style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 16px", lineHeight: 1.55 }}>
          {lastPub ? <>Ultima pubblicata: <b style={{ fontWeight: 500, color: CP.textPrimary }}>{lastPub.name}</b>, il {fmtWhen(lastPub.published_at || lastPub.updated_at)}. </> : "Nessuna bozza pubblicata finora. "}
          {inTest.length} {inTest.length === 1 ? "bozza" : "bozze"} in prova.
        </div>
      )}

      {!isLoading && !forbidden && drafts.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "28px 16px" }}>
          <FlaskConical size={28} color={CP.mutedIcons} />
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: "12px 0 4px 0" }}>Nessuna bozza.</p>
          <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>
            Crea una bozza dalla formula attiva per provare un cambio di pesi senza toccare gli score veri.
          </p>
        </div>
      )}

      {inTest.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionTitle aside="clic su una bozza per aprirla">In prova · {inTest.length}</SectionTitle>
          {renderList(inTest)}
        </section>
      )}

      {published.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionTitle aside="con il backtest fatto prima di pubblicarle">Pubblicate · {published.length}</SectionTitle>
          {renderList(published)}
        </section>
      )}

      {archived.length > 0 && (
        <Disclosure open={archOpen} onToggle={() => setArchOpen((v) => !v)} title={`Archiviate · ${archived.length}`} summary="le formule che erano attive prima di ogni pubblicazione">
          {renderList(archived)}
        </Disclosure>
      )}
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

  const armed = confirmText === "PUBBLICA";

  return (
    <div style={{ ...card, borderColor: isDraft ? CP.accent : CP.border }}>
      <button onClick={onToggle} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: FONTS.body }}>
        {open ? <ChevronDown size={16} color={CP.textMuted} /> : <ChevronRight size={16} color={CP.textMuted} />}
        <div style={{ minWidth: 200, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{draft.name}</div>
          <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.45 }}>
            {fmtWhen(draft.updated_at)}{draft.note ? ` · ${draft.note}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 12, color: isDraft ? CP.accentSoftText : CP.textSecondary, background: isDraft ? CP.accentSoft : CP.surfaceAlt, borderRadius: 999, padding: "3px 10px" }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 12, color: CP.textMuted }}>
          {draft.backtest ? `provata su ${draft.backtest.periods.length} mesi` : "non ancora provata"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${CP.borderSoft}` }}>
          {/* 1. Cosa cambia */}
          <div style={{ marginTop: 14 }}>
            <div style={stepTitle}>{isDraft ? "1. Cambia la formula" : "La formula"}</div>
            {isDraft ? <WeightsEditor draft={draft} onSave={onSaveWeights} busy={busy} /> : <WeightsView weights={draft.weights} />}
            <SmallGroupEditor draft={draft} editable={isDraft} busy={busy}
              onSave={(small_group) => call("/api/admin/score-config-drafts", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: draft.id, small_group }) })} />
          </div>

          {/* 2. Backtest */}
          <div style={{ marginTop: 18 }}>
            <div style={stepTitle}>{isDraft ? "2. Provala sui mesi veri" : "Prova sui mesi veri"}</div>
            <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 8px", lineHeight: 1.5 }}>
              Ricalcola gli ultimi 6 mesi importati con la formula attiva e con questa bozza, e mostra la differenza. Non cambia niente di vero.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <FilterChip label="Senza ore timbrate" active={mode === "withoutClockIn"} onClick={() => setMode("withoutClockIn")} />
              <FilterChip label="Con ore timbrate" active={mode === "withClockIn"} onClick={() => setMode("withClockIn")} />
              <button onClick={onBacktest} disabled={busy} style={{ ...btn(false), opacity: busy ? 0.6 : 1 }}>
                <Play size={13} /> {draft.backtest ? "Rifai la prova" : "Fai la prova"}
              </button>
            </div>
            {draft.backtest && <BacktestResults bt={draft.backtest} />}
          </div>

          {/* 3. Publish + delete */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${CP.borderSoft}` }}>
            {isDraft && (
              <>
                <div style={stepTitle}>3. Pubblica</div>
                <Notice danger>
                  Pubblicare rende questa la formula attiva e ricalcola ANCHE i mesi passati (classifiche, pagine degli operatori, percorso di carriera). Lo storico registra con quale formula era stato importato ogni mese; la formula di prima viene archiviata qui.
                  {!draft.backtest && <> <b style={{ fontWeight: 500 }}>Questa bozza non è ancora stata provata sui mesi veri.</b></>}
                </Notice>
              </>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {isDraft && (
                <>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder='Scrivi PUBBLICA per confermare'
                    aria-label="Conferma pubblicazione: scrivi PUBBLICA"
                    style={{ background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.body, width: 240, maxWidth: "100%" }}
                  />
                  <button
                    onClick={onPublish}
                    disabled={busy || !armed}
                    style={{ ...btn(armed), background: armed ? CP.accent : CP.surfaceAlt, color: armed ? CP.accentInk : CP.textMuted, borderColor: armed ? CP.accent : CP.border, cursor: armed ? "pointer" : "not-allowed" }}
                  >
                    <CheckCircle2 size={14} /> Pubblica come formula attiva
                  </button>
                </>
              )}
              <button onClick={onDelete} disabled={busy} style={{ ...btn(false), marginLeft: "auto", color: CP.accentRed, fontWeight: 400 }}>
                <Trash2 size={13} /> Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// v13: regola "gruppi piccoli" (C1 approvata da Nicholas 25/09/2026)
function SmallGroupEditor({ draft, editable, busy, onSave }) {
  const on = !!draft.small_group?.min_size;
  const [n, setN] = useState(draft.small_group?.min_size || 5);
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid ${CP.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>Gruppi piccoli · <span style={{ color: on ? CP.textPrimary : CP.textMuted, fontWeight: 400 }}>{on ? "attiva" : "spenta"}</span></div>
      <div style={{ fontSize: 13, color: CP.textSecondary, margin: "6px 0 10px", lineHeight: 1.5 }}>
        Chi ha meno di <b style={{ fontWeight: 500 }}>{on ? draft.small_group.min_size : n}</b> operatori nel suo gruppo viene confrontato con la media di tutti gli operatori della sua lingua, invece che con 1-4 colleghi (confronto troppo rumoroso). Limite: per queste persone conta un po&apos; di più la creator su cui lavorano.
      </div>
      {editable ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: CP.textSecondary, display: "inline-flex", alignItems: "center", gap: 8 }}>
            Soglia (operatori)
            <input type="number" min={2} max={20} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Soglia gruppo piccolo"
              style={{ width: 70, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "6px 8px", color: CP.textPrimary, fontFamily: FONTS.body, ...NUM }} />
          </label>
          <button disabled={busy} onClick={() => onSave({ min_size: n })} style={btn(false)}>{on ? "Aggiorna soglia" : "Attiva"}</button>
          {on && <button disabled={busy} onClick={() => onSave(null)} style={btn(false)}>Spegni</button>}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: CP.textMuted }}>{on ? `Attiva (meno di ${draft.small_group.min_size} operatori)` : "Spenta"}</div>
      )}
    </div>
  );
}

function WeightsView({ weights }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
      {["withClockIn", "withoutClockIn"].map((m) => (
        <div key={m}>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>{MODE_IT[m]}</div>
          {Object.entries(weights?.[m] || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary, padding: "2px 0" }}>
              <span>{kpiName(k)}</span><span style={NUM}>{Math.round(v * 100)}%</span>
            </div>
          ))}
        </div>
      ))}
    </div>
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

  const sumsOk = Math.abs(sum("withClockIn") - 1) <= 0.001 && Math.abs(sum("withoutClockIn") - 1) <= 0.001;

  return (
    <div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 10 }}>Quanto pesa ogni KPI: in ogni colonna la somma deve fare 1,00.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {["withClockIn", "withoutClockIn"].map((m) => {
          const s = sum(m);
          const okSum = Math.abs(s - 1) <= 0.001;
          return (
            <div key={m}>
              <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{MODE_IT[m]}</span>
                <span style={{ ...NUM, color: okSum ? CP.textMuted : CP.accentRed }}>somma {nf(s, 3)} {okSum ? "✓" : "≠ 1"}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(weights[m] || {}).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13, color: CP.textSecondary }}>{kpiName(k)}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={v}
                      aria-label={`${kpiName(k)}, ${MODE_IT[m]}`}
                      onChange={(e) => setW(m, k, e.target.value)}
                      style={{ width: 80, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 13, color: CP.textPrimary, fontFamily: FONTS.body, textAlign: "right", ...NUM }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {dirty && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => { onSave(weights); setDirty(false); }}
            disabled={busy || !sumsOk}
            style={{ ...btn(true), opacity: busy || !sumsOk ? 0.6 : 1 }}
          >
            Salva i pesi nella bozza
          </button>
          <span style={{ fontSize: 12, color: sumsOk ? CP.accentSoftText : CP.accentRed }}>{sumsOk ? "Modifiche non salvate" : "Le somme devono fare 1,00"}</span>
        </div>
      )}
      <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0 0", lineHeight: 1.5 }}>
        Soglie dei punti e fasce vengono copiate dalla formula attiva. Per cambiarle usa <Link href="/admin/leaderboard-settings" style={{ color: CP.accentSoftText }}>Impostazioni leaderboard</Link> dopo la pubblicazione (lì il cambio è immediato, senza prova), oppure modifica la bozza via API.
      </p>
    </div>
  );
}

function BacktestResults({ bt }) {
  if (!bt.periods?.length) {
    return <p style={{ fontSize: 13, color: CP.textMuted, marginTop: 10 }}>Nessun mese con dati da confrontare.</p>;
  }
  const th = { textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${CP.border}`, color: CP.textMuted, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", background: CP.surface };
  const td = { padding: "8px 12px", borderTop: `1px solid ${CP.borderSoft}`, color: CP.textSecondary, fontSize: 13, verticalAlign: "top" };
  return (
    <div style={{ marginTop: 12 }}>
      {bt.same_as_active && (
        <p style={{ fontSize: 13, color: CP.textMuted, margin: "0 0 8px 0" }}>
          La bozza è uguale alla formula attiva ({bt.draft_hash}): le differenze sono zero per forza.
        </p>
      )}
      <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontFamily: FONTS.body }}>
          <thead>
            <tr>
              <th style={th}>Mese</th>
              <th style={{ ...th, textAlign: "right" }}>Operatori</th>
              <th style={{ ...th, textAlign: "right" }} title="Di quanto cambia in media lo score (punti su 100)">Score medio</th>
              <th style={{ ...th, textAlign: "right" }} title="Quante persone entrano o escono dai primi 10">Cambi nei primi 10</th>
              <th style={th}>Persone per fascia (attiva → bozza)</th>
              <th style={th}>Chi si muove di più</th>
            </tr>
          </thead>
          <tbody>
            {bt.periods.map((p) => (
              <tr key={p.period_id}>
                <td style={{ ...td, color: CP.textPrimary, ...NUM, whiteSpace: "nowrap" }}>{p.period_id}</td>
                <td style={{ ...td, textAlign: "right", ...NUM }}>{p.eligible}</td>
                <td style={{ ...td, textAlign: "right", ...NUM, color: Math.abs(p.mean_delta) < 0.5 ? CP.textSecondary : (p.mean_delta > 0 ? CP.accentGreen : CP.accentRed), whiteSpace: "nowrap" }}>
                  {p.mean_delta > 0 ? "+" : p.mean_delta < 0 ? "−" : ""}{nf(Math.abs(p.mean_delta))} punti
                </td>
                <td style={{ ...td, textAlign: "right", ...NUM, color: p.top10_changes > 0 ? CP.textPrimary : CP.textSecondary }}>{p.top10_changes}</td>
                <td style={{ ...td, fontSize: 12, ...NUM }}>
                  {Object.keys(p.tier_counts_current).map((t) => {
                    const a = p.tier_counts_current[t], b = p.tier_counts_proposed[t] ?? 0;
                    return <div key={t} style={{ whiteSpace: "nowrap", color: a !== b ? CP.textPrimary : CP.textMuted }}>{t} {a} → {b}</div>;
                  })}
                </td>
                <td style={{ ...td, fontSize: 12 }}>
                  {p.top_movers.length ? p.top_movers.map((m) => (
                    <div key={m.employee} style={{ whiteSpace: "nowrap" }}>{m.employee} <span style={NUM}>{m.delta > 0 ? "+" : m.delta < 0 ? "−" : ""}{nf(Math.abs(m.delta))}</span></div>
                  )) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>
        «Score medio»: di quanti punti (su 100) cambia in media lo score passando dalla formula attiva alla bozza. Nelle fasce, le righe evidenziate sono quelle dove il numero di persone cambia.
      </div>
    </div>
  );
}
