"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw, ChevronDown, ChevronRight, Loader2, AlertTriangle, ArrowRight, ArrowLeft, Search } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import CompNav from "@/components/CompNav";
import { MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, DataTable, card, NUM } from "@/components/ds";

/**
 * /admin/payout-tree — Albero payout (trasparenza comp v2).
 *
 * Drill-down turno → take CP → transazione fan-level Infloww (dal ledger
 * sincronizzato) + refund impact report. L'abbinamento è direzionale, mai
 * contabile: ogni riga dichiara la sua confidenza (esatto / ambiguo / non
 * abbinato) — vedi src/lib/payout-match.js per le regole.
 *
 * Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/SM/UX):
 * - sottotitolo che dice a cosa serve (rispondere alle contestazioni);
 * - gergo tradotto: "take" = vendita registrata in CreatorsPro, "ledger" =
 *   copia delle transazioni Infloww, "refund" = rimborso;
 * - elenco operatori cercabile e ordinabile (prima 100+ righe senza ricerca);
 * - mese in corso marcato "(in corso)": i numeri sono parziali;
 * - numero principale per operatore (quanta parte del venduto ritroviamo nelle
 *   transazioni) e per i rimborsi (compenso pagato su vendite poi rimborsate).
 * API, azioni di sincronizzazione e calcoli invariati.
 */

function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (in corso)" : ""}` });
  }
  return out;
}
const monthName = (pid) => (pid ? `${MONTHS_IT[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : "");

const fetcher = (url) => fetch(url).then((r) => r.json());

// Centesimi inclusi: qui si risponde alle contestazioni, i numeri devono tornare al centesimo.
const fmtUsd = (n) => (n == null ? "—" : `${Number(n) < 0 ? "−" : ""}$${Math.abs(Number(n)).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })}`);
const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { useGrouping: "always" }));
const fmtPct = (v) => (v == null ? "—" : `${(v * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const dtRome = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtTime = (ms) => (ms ? dtRome.format(new Date(Number(ms))) : "—");
const fmtIso = (iso) => (iso ? dtRome.format(new Date(iso)) : "—");

const selectStyle = {
  background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`,
  borderRadius: 8, padding: "8px 12px", fontSize: 14, fontFamily: FONTS.body, cursor: "pointer",
};
const btn = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" };
const linkBtn = { background: "none", border: "none", color: CP.accentSoftText, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: FONTS.body, display: "inline-flex", alignItems: "center", gap: 4 };
const th = { position: "sticky", top: 0, zIndex: 1, padding: "10px 12px", fontSize: 12, fontWeight: 500, color: CP.textMuted, whiteSpace: "nowrap", background: CP.surface, borderBottom: `1px solid ${CP.border}`, textAlign: "left" };
const td = { padding: "9px 12px", verticalAlign: "middle" };

const TX_STATUS_IT = { loading: "in accredito", complete: "accreditata" };
const txStatus = (st) => TX_STATUS_IT[String(st || "").toLowerCase()] || st || "—";

function Loading({ text = "Caricamento…" }) {
  return <div style={{ ...card, padding: "16px 18px", color: CP.textSecondary, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="animate-spin" /> {text}</div>;
}

function CoverageBadge({ value }) {
  if (value == null) return <span style={{ color: CP.textMuted }}>—</span>;
  const color = value >= 0.85 ? CP.accentGreen : value >= 0.5 ? CP.textSecondary : CP.accentRed;
  return <span style={{ color, fontWeight: 500 }}>{fmtPct(value)}</span>;
}

function ConfidenceChip({ take }) {
  if (!take.match) {
    const label = take.reason === "no_creator_link" ? "creator non collegata a Infloww"
      : take.reason === "no_ledger" ? "creator non sincronizzata"
      : take.reason === "invalid_window" ? "orario del turno non valido"
      : "non ritrovata";
    return <span style={{ color: CP.accentRed, fontSize: 12 }}>{label}</span>;
  }
  const label = take.match.share ? `certa · quota 1/${take.match.share}` : "certa";
  if (take.match.ambiguous) return <span style={{ color: CP.textSecondary, fontSize: 12 }}>{take.match.share ? `incerta · quota 1/${take.match.share}` : "incerta"}</span>;
  return <span style={{ background: CP.accentSoft, color: CP.accentSoftText, borderRadius: 6, fontSize: 12, padding: "2px 6px", whiteSpace: "nowrap" }}>{label}</span>;
}

// ── Tab Sincronizzazione ─────────────────────────────────────────────────────
function SyncTab({ periodId }) {
  const { data, error: netError, isLoading, mutate } = useSWR(`/api/admin/payout-ledger-sync?period_id=${periodId}`, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.job?.status === "running" ? 3000 : 0),
  });
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const stopRef = useRef(false);

  async function runLoop() {
    stopRef.current = false;
    setRunning(true);
    setErr(null);
    try {
      let guard = 0;
      while (!stopRef.current && guard < 200) {
        guard++;
        const res = await fetch("/api/admin/payout-ledger-sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        }).then((r) => r.json());
        mutate();
        if (res?.error && !res?.retry) { setErr(res.error); break; }
        if (!res?.has_more) break;
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setRunning(false);
      mutate();
    }
  }

  async function start() {
    setErr(null);
    const res = await fetch("/api/admin/payout-ledger-sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", period_id: periodId }),
    }).then((r) => r.json());
    if (res?.error) { setErr(res.error); return; }
    mutate();
    runLoop();
  }

  const job = data?.job;
  const meta = data?.period_meta;
  const jobRunning = job?.status === "running";

  if (isLoading) return <Loading />;
  if (netError) return <Notice danger>Errore di rete: riprova.</Notice>;
  if (data?.error) return <Notice>{data.error} — la sincronizzazione delle transazioni è riservata agli admin.</Notice>;

  async function resetJob() {
    await fetch("/api/admin/payout-ledger-sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    mutate();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={{ ...card, padding: "16px 18px" }}>
        <SectionTitle aside="copia delle transazioni e dei rimborsi di Infloww, usata per l'albero">Transazioni di {monthName(periodId)}</SectionTitle>
        {meta ? (
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 4 }}>
            <Metric label="Transazioni" value={fmtInt(meta.totals?.tx)} />
            <Metric label="Lordo" value={fmtUsd((meta.totals?.gross_c || 0) / 100)} />
            <Metric label="Rimborsi registrati" value={fmtInt(meta.totals?.refunds)} />
            <Metric label="Creator sincronizzate" value={`${fmtInt(meta.creators_synced)} su ${fmtInt(meta.creators_total)}`} />
          </div>
        ) : (
          <div style={{ color: CP.textSecondary, fontSize: 14 }}>
            Questo mese non è ancora stato sincronizzato. Avvia la sincronizzazione: scarica transazioni e rimborsi
            di ogni creator (circa 1-2 minuti). Senza, l'albero e i rimborsi di questo mese restano vuoti.
          </div>
        )}
        {meta?.failed_creators?.length > 0 && (
          <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 10, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <AlertTriangle size={13} style={{ marginTop: 3, flexShrink: 0 }} aria-hidden="true" /> Creator non riuscite nell'ultima sincronizzazione: {meta.failed_creators.join(", ")}
          </div>
        )}
        {meta?.truncated_creators > 0 && (
          <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 6 }}>
            {meta.truncated_creators} creator oltre 15.000 transazioni nel mese: per quelle il lordo è sottostimato.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button
            onClick={start}
            disabled={running || jobRunning}
            style={{
              background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8,
              padding: "8px 14px", fontSize: 13, fontWeight: 500, fontFamily: FONTS.body,
              cursor: running || jobRunning ? "default" : "pointer", opacity: running || jobRunning ? 0.6 : 1,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {(running || jobRunning) ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
            {meta ? "Risincronizza il mese" : "Sincronizza il mese"}
          </button>
          {jobRunning && !running && (
            <>
              <button onClick={runLoop} style={btn}>Riprendi la sincronizzazione interrotta</button>
              <button onClick={resetJob} style={{ ...btn, color: CP.textMuted, background: "transparent" }}>Annulla</button>
            </>
          )}
          {job && (
            <span style={{ color: CP.textMuted, fontSize: 13 }}>
              {jobRunning ? `In corso su ${monthName(job.period_id)}: ${job.last_step}` : job.status === "done" ? `Ultima sincronizzazione: ${monthName(job.period_id)} completata` : null}
            </span>
          )}
        </div>
        {job?.error && !jobRunning && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 8 }}>Avviso dall'ultima sincronizzazione: {job.error}</div>}
        {err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 8 }}>{err}</div>}
      </section>
      <section style={{ ...card, padding: "16px 18px" }}>
        <SectionTitle>Mesi già sincronizzati</SectionTitle>
        <div style={{ color: CP.textSecondary, fontSize: 14 }}>
          {data?.periods?.length ? data.periods.map(monthName).join(" · ") : "Nessun mese sincronizzato."}
        </div>
        <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 6 }}>
          I rimborsi si agganciano alla vendita originale anche mesi dopo: per vederli conviene risincronizzare
          ogni tanto il mese in corso e l'ultimo chiuso (lo fa anche il controllo notturno).
        </div>
      </section>
    </div>
  );
}

// ── Tab Albero ───────────────────────────────────────────────────────────────
function TreeTab({ periodId, operator, setOperator, goSync }) {
  const url = `/api/admin/payout-tree?period_id=${periodId}${operator ? `&operator=${encodeURIComponent(operator)}` : ""}`;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(() => new Set());
  const [q, setQ] = useState("");

  if (isLoading) return <Loading text={operator ? `Carico i turni di ${operator}…` : "Carico gli operatori del mese…"} />;
  if (error) return <Notice danger>Errore di rete: riprova.</Notice>;
  if (data?.error) return <Notice danger>{data.error}</Notice>;

  if (data?.needs_sync === "cp") {
    return (
      <Notice>
        I compensi di CreatorsPro di {monthName(periodId)} non sono ancora stati scaricati: senza, l'albero non si può costruire.{" "}
        <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>Scaricali da Sync e controllo CP →</Link>
      </Notice>
    );
  }
  if (data?.needs_sync === "ledger") {
    return (
      <Notice>
        Le transazioni Infloww di {monthName(periodId)} non sono ancora state sincronizzate: senza, le vendite non si possono ritrovare.{" "}
        <button onClick={goSync} style={linkBtn}>Vai a Sincronizzazione dati <ArrowRight size={12} aria-hidden="true" /></button>
      </Notice>
    );
  }

  // Elenco operatori
  if (!operator) {
    const ops = data?.operators || [];
    const needle = q.trim().toLowerCase();
    const rows = ops.filter((o) => !needle || o.operator.toLowerCase().includes(needle)).map((o) => ({ ...o, id: o.operator }));
    const columns = [
      { key: "operator", label: "Operatore" },
      { key: "shifts", label: "Turni", align: "right", muted: true, render: (o) => fmtInt(o.shifts) },
      { key: "takes", label: "Vendite registrate", align: "right", muted: true, render: (o) => fmtInt(o.takes) },
      { key: "aliases", label: "Creator", align: "right", muted: true, render: (o) => fmtInt(o.aliases) },
      { key: "takes_gross", label: "Venduto", align: "right", render: (o) => fmtUsd(o.takes_gross) },
    ];
    return (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <SectionTitle aside={`${fmtInt(ops.length)} operatori con compensi a ${monthName(periodId)} · clicca una riga per aprire i suoi turni`}>Scegli l'operatore</SectionTitle>
          <div style={{ position: "relative", marginLeft: "auto", minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: CP.textMuted }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca operatore" aria-label="Cerca operatore"
              style={{ ...selectStyle, cursor: "text", width: "100%", paddingLeft: 32, boxSizing: "border-box" }} />
          </div>
        </div>
        <DataTable columns={columns} rows={rows} defaultSort={{ key: "takes_gross", dir: -1 }} minWidth={560} maxHeight={640}
          onRowClick={(o) => setOperator(o.operator)}
          empty={ops.length ? "Nessun operatore con questo nome." : `Nessun operatore con compensi a ${monthName(periodId)}.`} />
      </>
    );
  }

  // Albero operatore
  const s = data?.summary;
  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const shifts = data?.shifts || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setOperator("")} style={btn}><ArrowLeft size={13} /> Tutti gli operatori</button>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{data?.operator}</span>
        <span style={{ fontSize: 13, color: CP.textMuted }}>{monthName(periodId)}</span>
      </div>

      <HeroMetric
        label="Venduto ritrovato nelle transazioni Infloww"
        value={fmtPct(s?.coverage)}
        compare={`${fmtInt(s?.matched_count)} vendite su ${fmtInt(s?.takes_count)} abbinate a una transazione del fan`}
        hint={[s?.share_count > 0 ? `${fmtInt(s.share_count)} in quota tra più operatori nello stesso turno` : null, s?.ambiguous_count > 0 ? `${fmtInt(s.ambiguous_count)} incerte` : null, "sopra l'85% l'albero è affidabile per rispondere a una contestazione"].filter(Boolean).join(" · ")}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Metric label="Venduto in CreatorsPro" value={fmtUsd(s?.takes_gross)} />
          <Metric label="Vendite poi rimborsate" value={fmtInt(s?.refunded?.count)} note={s?.refunded?.count > 0 ? fmtUsd(s.refunded.gross_usd) : null} danger={s?.refunded?.count > 0} />
        </div>
      </HeroMetric>

      {(s?.unlinked_aliases?.length > 0 || s?.no_ledger_creators?.length > 0 || s?.invalid_window_shifts > 0) && (
        <Notice>
          {s.unlinked_aliases?.length > 0 && (
            <div>
              Creator di CreatorsPro non collegate a Infloww (le loro vendite non si possono ritrovare): {s.unlinked_aliases.join(", ")} —{" "}
              <Link href="/admin/infloww-reconcile" style={{ color: CP.accentSoftText }}>collegale da Controllo dati CP</Link>
            </div>
          )}
          {s.no_ledger_creators?.length > 0 && (
            <div style={{ marginTop: 4 }}>Creator non sincronizzate per questo mese: {s.no_ledger_creators.join(", ")} — risincronizza il mese.</div>
          )}
          {s.invalid_window_shifts > 0 && (
            <div style={{ marginTop: 4 }}>
              {fmtInt(s.invalid_window_shifts)} turni senza orario valido in CreatorsPro ({fmtUsd(s.invalid_window_gross)} di venduto): esclusi dal calcolo, non si possono abbinare.
            </div>
          )}
        </Notice>
      )}

      <SectionTitle aside="clicca un turno per le sue vendite · finestra del turno ±5 minuti · “altre transazioni” = rinnovi o vendite di colleghi nello stesso orario, non anomalie">Turni</SectionTitle>
      {shifts.length === 0 ? (
        <div style={{ ...card, padding: "16px 18px", color: CP.textSecondary, fontSize: 14 }}>Nessun turno di {data?.operator} a {monthName(periodId)}.</div>
      ) : (
        <div style={{ ...card, overflow: "auto", maxHeight: 720 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 820 }}>
            <thead>
              <tr>
                <th style={th}>Turno</th>
                <th style={th}>Creator</th>
                <th style={{ ...th, textAlign: "right" }}>Venduto</th>
                <th style={{ ...th, textAlign: "right" }}>Vendite ritrovate</th>
                <th style={{ ...th, textAlign: "right" }}>Copertura</th>
                <th style={{ ...th, textAlign: "right" }}>Rimborsi</th>
                <th style={{ ...th, textAlign: "right" }}>Altre transazioni</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((sh) => {
                const isOpen = open.has(sh.shift_id);
                return [
                  <tr key={sh.shift_id} onClick={() => toggle(sh.shift_id)}
                    style={{ borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer", background: isOpen ? CP.surfaceAlt : "transparent" }}>
                    <td style={{ ...td, whiteSpace: "nowrap", ...NUM }}>
                      {isOpen ? <ChevronDown size={13} style={{ verticalAlign: -2 }} aria-hidden="true" /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} aria-hidden="true" />}
                      {" "}{fmtIso(sh.started_at)} → {sh.ended_at ? fmtIso(sh.ended_at).slice(-5) : "—"}
                    </td>
                    <td style={{ ...td, color: CP.textSecondary }}>{(sh.creator_aliases || []).join(", ") || "—"}</td>
                    <td style={{ ...td, textAlign: "right", ...NUM }}>{fmtUsd(sh.takes_gross)}</td>
                    <td style={{ ...td, textAlign: "right", color: CP.textSecondary, ...NUM }}>{fmtInt(sh.matched_count)} su {fmtInt(sh.takes_count)}</td>
                    <td style={{ ...td, textAlign: "right", ...NUM }}><CoverageBadge value={sh.coverage} /></td>
                    <td style={{ ...td, textAlign: "right", color: sh.refunded_count > 0 ? CP.accentRed : CP.textMuted, ...NUM }}>{sh.refunded_count > 0 ? fmtInt(sh.refunded_count) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", color: CP.textMuted, ...NUM }}>{sh.extra_txns?.count > 0 ? `${fmtInt(sh.extra_txns.count)} · ${fmtUsd(sh.extra_txns.gross_usd)}` : "—"}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${sh.shift_id}-d`}>
                      <td colSpan={7} style={{ padding: "0 12px 12px", background: CP.surfaceAlt }}>
                        {sh.takes.length === 0 ? (
                          <div style={{ color: CP.textMuted, fontSize: 13, padding: "8px 0" }}>Turno senza vendite registrate in CreatorsPro.</div>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr style={{ color: CP.textMuted, textAlign: "left" }}>
                                <th style={{ padding: "6px 6px 6px 0", fontWeight: 500, fontSize: 12 }}>Vendita in CreatorsPro</th>
                                <th style={{ padding: "6px", fontWeight: 500, fontSize: 12 }}>Creator</th>
                                <th style={{ padding: "6px", fontWeight: 500, fontSize: 12 }}>Transazione Infloww</th>
                                <th style={{ padding: "6px", fontWeight: 500, fontSize: 12 }}>Fan</th>
                                <th style={{ padding: "6px", fontWeight: 500, fontSize: 12, textAlign: "right" }}>Lordo → netto</th>
                                <th style={{ padding: "6px", fontWeight: 500, fontSize: 12 }}>Stato</th>
                                <th style={{ padding: "6px 0", fontWeight: 500, fontSize: 12 }}>Abbinamento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sh.takes.map((t, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                                  <td style={{ padding: "6px 6px 6px 0", ...NUM }}>{fmtUsd(t.amount)}{t.type ? ` · ${t.type.toLowerCase()}` : ""}</td>
                                  <td style={{ padding: "6px", color: CP.textSecondary }}>{t.alias}</td>
                                  <td style={{ padding: "6px", color: CP.textSecondary, whiteSpace: "nowrap", ...NUM }}>{t.match ? `${fmtTime(t.match.t)} · ${t.match.ty || "?"}` : "—"}</td>
                                  <td style={{ padding: "6px", color: CP.textSecondary }}>{t.match?.fn || "—"}</td>
                                  <td style={{ padding: "6px", textAlign: "right", color: CP.textSecondary, whiteSpace: "nowrap", ...NUM }}>{t.match ? `${fmtUsd(t.match.gross_usd)} → ${fmtUsd(t.match.net_usd)}` : "—"}</td>
                                  <td style={{ padding: "6px" }}>
                                    {t.match?.refund || t.match?.reversed ? (
                                      <span style={{ color: CP.accentRed }}>rimborsata{t.match.refund ? ` ${fmtTime(t.match.refund.rt)}` : ""}</span>
                                    ) : (
                                      <span style={{ color: CP.textMuted }}>{t.match ? txStatus(t.match.st) : "—"}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "6px 0" }}><ConfidenceChip take={t} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab Rimborsi ─────────────────────────────────────────────────────────────
function RefundTab({ periodId, goSync }) {
  const { data, error, isLoading } = useSWR(`/api/admin/refund-impact?period_id=${periodId}`, fetcher, { revalidateOnFocus: false });

  if (isLoading) return <Loading text="Carico i rimborsi del mese…" />;
  if (error) return <Notice danger>Errore di rete: riprova.</Notice>;
  if (data?.error) return <Notice danger>{data.error}</Notice>;
  if (data?.needs_sync === "ledger") {
    return (
      <Notice>
        Le transazioni Infloww di {monthName(periodId)} non sono ancora state sincronizzate: senza, i rimborsi non si vedono.{" "}
        <button onClick={goSync} style={linkBtn}>Vai a Sincronizzazione dati <ArrowRight size={12} aria-hidden="true" /></button>
      </Notice>
    );
  }

  const t = data?.totals;
  const STATUS_IT = { attributed: "attribuito", unattributed: "nessun operatore", wages_missing: "compensi CP mancanti" };

  const opCols = [
    { key: "operator", label: "Operatore" },
    { key: "count", label: "Rimborsi", align: "right", muted: true, render: (o) => fmtInt(o.count) },
    { key: "refunded_usd", label: "Rimborsato", align: "right", muted: true, render: (o) => fmtUsd(o.refunded_usd) },
    { key: "comp_leak_usd", label: "Compenso su rimborsi (stima)", align: "right", render: (o) => <span style={{ color: o.comp_leak_usd > 0 ? CP.accentRed : CP.textMuted }}>{fmtUsd(o.comp_leak_usd)}</span> },
  ];
  const rowCols = [
    { key: "refunded_at", label: "Rimborso", muted: true, render: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmtTime(r.refunded_at)}</span> },
    { key: "creator_name", label: "Creator" },
    { key: "amount_usd", label: "Importo", align: "right", render: (r) => fmtUsd(r.amount_usd) },
    { key: "paid_at", label: "Pagata il", muted: true, render: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmtTime(r.paid_at)}{r.transaction_type ? ` · ${r.transaction_type}` : ""}</span> },
    { key: "operator", label: "Operatore", sort: (r) => (r.status === "attributed" ? r.operator || "" : `~${r.status}`), render: (r) => (
      r.status === "attributed" ? (
        <span>
          {r.shared_between ? (r.operators_all || [r.operator]).join(" + ") : r.operator}
          {r.shared_between && <span style={{ color: CP.textMuted }}> (in quota)</span>}
          {r.ambiguous_with?.length > 0 && <span style={{ color: CP.textMuted }}> (incerto con {r.ambiguous_with.join(", ")})</span>}
        </span>
      ) : <span style={{ color: CP.textMuted }}>{STATUS_IT[r.status] || r.status}</span>
    ) },
    { key: "comp_leak_usd", label: "Compenso (stima)", align: "right", render: (r) => <span style={{ color: r.comp_leak_usd ? CP.accentRed : CP.textMuted }}>{r.comp_leak_usd != null ? fmtUsd(r.comp_leak_usd) : "—"}</span> },
  ];

  return (
    <div>
      <HeroMetric
        label={`Compenso pagato su vendite poi rimborsate · stima · ${monthName(periodId)}`}
        value={fmtUsd(t?.comp_leak_usd)}
        compare={`${fmtInt(t?.refunds)} rimborsi per ${fmtUsd(t?.refunded_usd)} nel mese`}
        hint="Stima: si ricalcola il turno senza la vendita rimborsata; la differenza di compenso è quanto è stato pagato in più. I dollari rimborsati escono dallo scaglione più alto, dove la percentuale è maggiore."
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Metric label="Su vendite con operatore" value={fmtInt(t?.attributed)} note={fmtUsd(t?.attributed_usd)} />
          <Metric label="Senza operatore" value={fmtInt(t?.unattributed)} note="messaggi di massa, turni non tracciati: nessun compenso pagato" />
          {t?.wages_missing > 0 && <Metric label="Compensi CP mancanti" value={fmtInt(t.wages_missing)} note="mesi da scaricare" />}
        </div>
      </HeroMetric>

      {data?.wages_missing_periods?.length > 0 && (
        <Notice>
          Alcune vendite rimborsate sono state pagate in mesi di cui non abbiamo i compensi CreatorsPro: {data.wages_missing_periods.map(monthName).join(", ")} —{" "}
          <Link href="/admin/wage-audit" style={{ color: CP.accentSoftText }}>scaricali</Link> per attribuirle a un operatore.
        </Notice>
      )}

      {data?.by_operator?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle aside="chi ha ricevuto compenso su vendite poi rimborsate">Per operatore</SectionTitle>
          <DataTable columns={opCols} rows={data.by_operator.map((o) => ({ ...o, id: o.operator }))} defaultSort={{ key: "comp_leak_usd", dir: -1 }} minWidth={560} maxHeight={420} />
        </div>
      )}

      <SectionTitle aside={data?.rows?.length ? `${fmtInt(data.rows.length)} rimborsi` : null}>Rimborsi del mese</SectionTitle>
      <DataTable columns={rowCols} rows={(data?.rows || []).map((r, i) => ({ ...r, id: i }))} minWidth={860} maxHeight={560}
        empty={`Nessun rimborso registrato a ${monthName(periodId)}.`} />
    </div>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────
export default function PayoutTreePage() {
  const periods = useMemo(() => monthOpts(12), []);
  const [periodId, setPeriodId] = useState(periods[0]?.value || "");
  const [tab, setTab] = useState("tree");
  const [operator, setOperator] = useState("");

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Albero payout" }]}
        title="Albero payout"
        subtitle="Per rispondere a una contestazione sul compenso: da un turno alle singole vendite registrate in CreatorsPro, fino alla transazione del fan in Infloww, con i rimborsi. L'abbinamento è un'indicazione, non un conto contabile."
        actions={
          <select value={periodId} onChange={(e) => { setPeriodId(e.target.value); setOperator(""); }} style={selectStyle} aria-label="Mese">
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        }
      />
      <CompNav />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterChip label="Albero per operatore" active={tab === "tree"} onClick={() => setTab("tree")} />
        <FilterChip label="Rimborsi e compensi" active={tab === "refunds"} onClick={() => setTab("refunds")} />
        <FilterChip label="Sincronizzazione dati" active={tab === "sync"} onClick={() => setTab("sync")} />
      </div>
      {tab === "tree" && <TreeTab periodId={periodId} operator={operator} setOperator={setOperator} goSync={() => setTab("sync")} />}
      {tab === "refunds" && <RefundTab periodId={periodId} goSync={() => setTab("sync")} />}
      {tab === "sync" && <SyncTab periodId={periodId} />}
    </div>
  );
}
