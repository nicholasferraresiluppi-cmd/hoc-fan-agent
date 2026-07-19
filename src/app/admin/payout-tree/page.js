"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ListTree, Undo2, RefreshCw, ChevronDown, ChevronRight,
  Loader2, AlertTriangle, ArrowRight,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard, PillTab } from "@/components/cp-style";
import CompNav from "@/components/CompNav";

/**
 * /admin/payout-tree — Albero payout (trasparenza comp v2).
 *
 * Drill-down turno → take CP → transazione fan-level Infloww (dal ledger
 * sincronizzato) + refund impact report. L'abbinamento è direzionale, mai
 * contabile: ogni riga dichiara la sua confidenza (esatto / ambiguo / non
 * abbinato) — vedi src/lib/payout-match.js per le regole.
 */

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function monthOpts(n = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

const fetcher = (url) => fetch(url).then((r) => r.json());

const fmtUsd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT"));
const fmtPct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const dtRome = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtTime = (ms) => (ms ? dtRome.format(new Date(Number(ms))) : "—");
const fmtIso = (iso) => (iso ? dtRome.format(new Date(iso)) : "—");

const selectStyle = {
  background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`,
  borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: FONTS.body,
};

const TX_STATUS_IT = { loading: "in accredito", complete: "accreditata" };
const txStatus = (st) => TX_STATUS_IT[String(st || "").toLowerCase()] || st || "—";

function CoverageBadge({ value }) {
  if (value == null) return <span style={{ color: CP.textMuted, fontSize: 11 }}>—</span>;
  const color = value >= 0.85 ? CP.accentGreen : value >= 0.5 ? CP.textSecondary : CP.accentRed;
  return <span style={{ color, fontSize: 11, fontWeight: 500 }}>{fmtPct(value)}</span>;
}

function ConfidenceChip({ take }) {
  if (!take.match) {
    const label = take.reason === "no_creator_link" ? "alias non collegato"
      : take.reason === "no_ledger" ? "creator non nel ledger"
      : take.reason === "invalid_window" ? "finestra turno non valida"
      : "non abbinato";
    return <span style={{ color: CP.accentRed, fontSize: 11 }}>{label}</span>;
  }
  const label = take.match.share ? `esatto · quota 1/${take.match.share}` : "esatto";
  if (take.match.ambiguous) return <span style={{ color: CP.textSecondary, fontSize: 11 }}>{take.match.share ? `ambiguo · quota 1/${take.match.share}` : "ambiguo"}</span>;
  return <span style={{ background: CP.accentSoft, color: CP.accentSoftText, borderRadius: 6, fontSize: 11, padding: "2px 6px" }}>{label}</span>;
}

// ── Tab Sync ledger ──────────────────────────────────────────────────────────
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

  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 12 }}>Caricamento…</div>;
  if (netError) return <div style={{ color: CP.accentRed, fontSize: 12 }}>Errore di rete: riprova.</div>;
  if (data?.error) {
    return (
      <CpCard>
        <div style={{ color: CP.textSecondary, fontSize: 12 }}>
          {data.error} — la sincronizzazione del ledger è riservata agli admin.
        </div>
      </CpCard>
    );
  }

  async function resetJob() {
    await fetch("/api/admin/payout-ledger-sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    mutate();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <CpCard>
        <SectionLabel>Ledger transazioni — {periodId}</SectionLabel>
        {meta ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
            <StatCard label="Transazioni" value={fmtInt(meta.totals?.tx)} />
            <StatCard label="Lordo" value={fmtUsd((meta.totals?.gross_c || 0) / 100)} />
            <StatCard label="Refund registrati" value={fmtInt(meta.totals?.refunds)} />
            <StatCard label="Creator coperte" value={`${fmtInt(meta.creators_synced)}/${fmtInt(meta.creators_total)}`} />
          </div>
        ) : (
          <div style={{ color: CP.textMuted, fontSize: 12, marginTop: 8 }}>
            Questo mese non è ancora nel ledger. Avvia la sincronizzazione: scarica transazioni e refund
            di ogni creator del roster ({"~"}1-2 minuti).
          </div>
        )}
        {meta?.failed_creators?.length > 0 && (
          <div style={{ color: CP.accentRed, fontSize: 11, marginTop: 8 }}>
            <AlertTriangle size={11} style={{ verticalAlign: -1 }} aria-hidden="true" /> Creator fallite nell&apos;ultimo sync: {meta.failed_creators.join(", ")}
          </div>
        )}
        {meta?.truncated_creators > 0 && (
          <div style={{ color: CP.textMuted, fontSize: 11, marginTop: 6 }}>
            {meta.truncated_creators} creator troncate oltre 15k transazioni/mese: lordo sottostimato per quelle.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <button
            onClick={start}
            disabled={running || jobRunning}
            style={{
              background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 8,
              padding: "7px 14px", fontSize: 12, fontWeight: 500, fontFamily: FONTS.body,
              cursor: running || jobRunning ? "default" : "pointer", opacity: running || jobRunning ? 0.6 : 1,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {(running || jobRunning) ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
            {meta ? "Risincronizza mese" : "Sincronizza mese"}
          </button>
          {jobRunning && !running && (
            <>
              <button onClick={runLoop} style={{ background: CP.surfaceAlt, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontFamily: FONTS.body, cursor: "pointer" }}>
                Riprendi job interrotto
              </button>
              <button onClick={resetJob} style={{ background: "transparent", color: CP.textMuted, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontFamily: FONTS.body, cursor: "pointer" }}>
                Annulla job
              </button>
            </>
          )}
          {job && (
            <span style={{ color: CP.textMuted, fontSize: 12 }}>
              {jobRunning ? `In corso su ${job.period_id}: ${job.last_step}` : job.status === "done" ? `Ultimo job: ${job.period_id} completato` : null}
            </span>
          )}
        </div>
        {job?.error && !jobRunning && (
          <div style={{ color: CP.accentRed, fontSize: 12, marginTop: 8 }}>Avviso ultimo job: {job.error}</div>
        )}
        {err && <div style={{ color: CP.accentRed, fontSize: 12, marginTop: 8 }}>{err}</div>}
      </CpCard>
      <CpCard>
        <SectionLabel>Mesi nel ledger</SectionLabel>
        <div style={{ color: CP.textSecondary, fontSize: 12, marginTop: 8 }}>
          {data?.periods?.length ? data.periods.join(" · ") : "Nessun mese sincronizzato."}
        </div>
        <div style={{ color: CP.textMuted, fontSize: 11, marginTop: 6 }}>
          I refund si agganciano alla vendita originale via transactionId: per vederli sui mesi passati
          conviene risincronizzare periodicamente il mese corrente e l&apos;ultimo chiuso.
        </div>
      </CpCard>
    </div>
  );
}

// ── Tab Albero ───────────────────────────────────────────────────────────────
function TreeTab({ periodId, operator, setOperator, goSync }) {
  const url = `/api/admin/payout-tree?period_id=${periodId}${operator ? `&operator=${encodeURIComponent(operator)}` : ""}`;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(() => new Set());

  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 12 }}>Caricamento…</div>;
  if (error) return <div style={{ color: CP.accentRed, fontSize: 12 }}>Errore di rete: riprova.</div>;
  if (data?.error) return <div style={{ color: CP.accentRed, fontSize: 12 }}>{data.error}</div>;

  if (data?.needs_sync === "cp") {
    return (
      <CpCard>
        <div style={{ color: CP.textSecondary, fontSize: 12 }}>
          Le wage CP di {periodId} non sono in KV.{" "}
          <Link href="/admin/wage-audit" style={{ color: CP.accent }}>Sincronizza da Sync &amp; Audit CP <ArrowRight size={11} style={{ verticalAlign: -1 }} aria-hidden="true" /></Link>
        </div>
      </CpCard>
    );
  }
  if (data?.needs_sync === "ledger") {
    return (
      <CpCard>
        <div style={{ color: CP.textSecondary, fontSize: 12 }}>
          Il ledger transazioni di {periodId} non è ancora sincronizzato.{" "}
          <button onClick={goSync} style={{ background: "none", border: "none", color: CP.accent, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: FONTS.body }}>
            Vai al tab Sync ledger <ArrowRight size={11} style={{ verticalAlign: -1 }} aria-hidden="true" />
          </button>
        </div>
      </CpCard>
    );
  }

  // Elenco operatori
  if (!operator) {
    const ops = data?.operators || [];
    return (
      <CpCard padding="0">
        <div style={{ padding: "14px 16px 6px" }}>
          <SectionLabel>Operatori del mese — scegli chi drillare</SectionLabel>
        </div>
        {ops.length === 0 ? (
          <div style={{ color: CP.textMuted, fontSize: 12, padding: "8px 16px 16px" }}>Nessun operatore con wage nel mese.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: CP.textMuted, fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "6px 16px", fontWeight: 400 }}>Operatore</th>
                <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Turni</th>
                <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Take</th>
                <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Creator</th>
                <th style={{ padding: "6px 16px", fontWeight: 400, textAlign: "right" }}>Venduto</th>
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr
                  key={o.operator}
                  onClick={() => setOperator(o.operator)}
                  style={{ borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = CP.surfaceAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 16px", color: CP.textPrimary }}>{o.operator}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textSecondary }}>{fmtInt(o.shifts)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textSecondary }}>{fmtInt(o.takes)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textSecondary }}>{fmtInt(o.aliases)}</td>
                  <td style={{ padding: "8px 16px", textAlign: "right", color: CP.textPrimary }}>{fmtUsd(o.takes_gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CpCard>
    );
  }

  // Albero operatore
  const s = data?.summary;
  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setOperator("")} style={{ background: CP.surfaceAlt, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontFamily: FONTS.body, cursor: "pointer" }}>
          ← Tutti gli operatori
        </button>
        <span style={{ color: CP.textPrimary, fontSize: 14, fontWeight: 500 }}>{data?.operator}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <StatCard label="Copertura venduto" value={fmtPct(s?.coverage)} tooltip="Quota del venduto CP coperta da un match con una transazione Infloww nella finestra del turno (importo pieno o quota coseller)." />
        <StatCard
          label="Take abbinati"
          value={`${fmtInt(s?.matched_count)}/${fmtInt(s?.takes_count)}`}
          sub={[s?.share_count > 0 ? `${fmtInt(s.share_count)} in quota coseller` : null, s?.ambiguous_count > 0 ? `${fmtInt(s.ambiguous_count)} ambigui` : null].filter(Boolean).join(" · ") || null}
          tooltip="Nei turni a più coseller CP splitta la vendita (take = lordo/k): il match in quota è comunque un abbinamento esatto alla transazione."
        />
        <StatCard label="Venduto CP" value={fmtUsd(s?.takes_gross)} />
        <StatCard
          label="Take con refund"
          value={fmtInt(s?.refunded?.count)}
          sub={s?.refunded?.count > 0 ? fmtUsd(s.refunded.gross_usd) : null}
          color={s?.refunded?.count > 0 ? CP.accentRed : undefined}
        />
      </div>

      {(s?.unlinked_aliases?.length > 0 || s?.no_ledger_creators?.length > 0 || s?.invalid_window_shifts > 0) && (
        <CpCard>
          <div style={{ color: CP.textSecondary, fontSize: 12 }}>
            {s.unlinked_aliases?.length > 0 && (
              <div>
                Alias CP senza profilo Infloww collegato: {s.unlinked_aliases.join(", ")} —{" "}
                <Link href="/admin/infloww-reconcile" style={{ color: CP.accent }}>collega da Controllo dati CP</Link>
              </div>
            )}
            {s.no_ledger_creators?.length > 0 && (
              <div style={{ marginTop: 4 }}>Creator non presenti nel ledger del mese: {s.no_ledger_creators.join(", ")} — risincronizza il mese.</div>
            )}
            {s.invalid_window_shifts > 0 && (
              <div style={{ marginTop: 4 }}>
                {fmtInt(s.invalid_window_shifts)} turni senza orario valido in CP ({fmtUsd(s.invalid_window_gross)} di venduto): esclusi dalla copertura, non abbinabili.
              </div>
            )}
          </div>
        </CpCard>
      )}

      <CpCard padding="0">
        <div style={{ padding: "14px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <SectionLabel>Turni — click per aprire i take</SectionLabel>
          <span style={{ color: CP.textMuted, fontSize: 11 }}>
            finestra turno ±5 min · match su importo lordo pieno o quota coseller · &quot;extra&quot; = rinnovi/coseller, non anomalie
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: CP.textMuted, fontSize: 11, textAlign: "left" }}>
              <th style={{ padding: "6px 16px", fontWeight: 400 }}>Turno</th>
              <th style={{ padding: "6px 8px", fontWeight: 400 }}>Creator</th>
              <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Venduto</th>
              <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Take</th>
              <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Copertura</th>
              <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Refund</th>
              <th style={{ padding: "6px 16px", fontWeight: 400, textAlign: "right" }}>Extra finestra</th>
            </tr>
          </thead>
          <tbody>
            {(data?.shifts || []).map((sh) => {
              const isOpen = open.has(sh.shift_id);
              return [
                <tr
                  key={sh.shift_id}
                  onClick={() => toggle(sh.shift_id)}
                  style={{ borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer", background: isOpen ? CP.surfaceAlt : "transparent" }}
                >
                  <td style={{ padding: "8px 16px", color: CP.textPrimary, whiteSpace: "nowrap" }}>
                    {isOpen ? <ChevronDown size={12} style={{ verticalAlign: -2 }} aria-hidden="true" /> : <ChevronRight size={12} style={{ verticalAlign: -2 }} aria-hidden="true" />}
                    {" "}{fmtIso(sh.started_at)} → {sh.ended_at ? fmtIso(sh.ended_at).slice(-5) : "—"}
                  </td>
                  <td style={{ padding: "8px 8px", color: CP.textSecondary }}>{(sh.creator_aliases || []).join(", ") || "—"}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textPrimary }}>{fmtUsd(sh.takes_gross)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textSecondary }}>{fmtInt(sh.matched_count)}/{fmtInt(sh.takes_count)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right" }}><CoverageBadge value={sh.coverage} /></td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: sh.refunded_count > 0 ? CP.accentRed : CP.textMuted }}>{sh.refunded_count > 0 ? fmtInt(sh.refunded_count) : "—"}</td>
                  <td style={{ padding: "8px 16px", textAlign: "right", color: CP.textMuted }}>{sh.extra_txns?.count > 0 ? `${fmtInt(sh.extra_txns.count)} · ${fmtUsd(sh.extra_txns.gross_usd)}` : "—"}</td>
                </tr>,
                isOpen && (
                  <tr key={`${sh.shift_id}-d`}>
                    <td colSpan={7} style={{ padding: "0 16px 12px", background: CP.surfaceAlt }}>
                      {sh.takes.length === 0 ? (
                        <div style={{ color: CP.textMuted, fontSize: 11, padding: "8px 0" }}>Turno senza take registrati in CP.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead>
                            <tr style={{ color: CP.textMuted, textAlign: "left" }}>
                              <th style={{ padding: "6px 0", fontWeight: 400 }}>Take CP</th>
                              <th style={{ padding: "6px 6px", fontWeight: 400 }}>Creator</th>
                              <th style={{ padding: "6px 6px", fontWeight: 400 }}>Transazione</th>
                              <th style={{ padding: "6px 6px", fontWeight: 400 }}>Fan</th>
                              <th style={{ padding: "6px 6px", fontWeight: 400, textAlign: "right" }}>Lordo → netto</th>
                              <th style={{ padding: "6px 6px", fontWeight: 400 }}>Stato</th>
                              <th style={{ padding: "6px 0", fontWeight: 400 }}>Confidenza</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sh.takes.map((t, i) => (
                              <tr key={i} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                                <td style={{ padding: "6px 0", color: CP.textPrimary }}>{fmtUsd(t.amount)}{t.type ? ` · ${t.type.toLowerCase()}` : ""}</td>
                                <td style={{ padding: "6px 6px", color: CP.textSecondary }}>{t.alias}</td>
                                <td style={{ padding: "6px 6px", color: CP.textSecondary, whiteSpace: "nowrap" }}>
                                  {t.match ? `${fmtTime(t.match.t)} · ${t.match.ty || "?"}` : "—"}
                                </td>
                                <td style={{ padding: "6px 6px", color: CP.textSecondary }}>{t.match?.fn || "—"}</td>
                                <td style={{ padding: "6px 6px", textAlign: "right", color: CP.textSecondary, whiteSpace: "nowrap" }}>
                                  {t.match ? `${fmtUsd(t.match.gross_usd)} → ${fmtUsd(t.match.net_usd)}` : "—"}
                                </td>
                                <td style={{ padding: "6px 6px" }}>
                                  {t.match?.refund || t.match?.reversed ? (
                                    <span style={{ color: CP.accentRed }}>
                                      refund{t.match.refund ? ` ${fmtTime(t.match.refund.rt)}` : ""}
                                    </span>
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
        {(data?.shifts || []).length === 0 && (
          <div style={{ color: CP.textMuted, fontSize: 12, padding: "8px 16px 16px" }}>Nessun turno nel mese per questo operatore.</div>
        )}
      </CpCard>
    </div>
  );
}

// ── Tab Refund impact ────────────────────────────────────────────────────────
function RefundTab({ periodId, goSync }) {
  const { data, error, isLoading } = useSWR(`/api/admin/refund-impact?period_id=${periodId}`, fetcher, { revalidateOnFocus: false });

  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 12 }}>Caricamento…</div>;
  if (error) return <div style={{ color: CP.accentRed, fontSize: 12 }}>Errore di rete: riprova.</div>;
  if (data?.error) return <div style={{ color: CP.accentRed, fontSize: 12 }}>{data.error}</div>;
  if (data?.needs_sync === "ledger") {
    return (
      <CpCard>
        <div style={{ color: CP.textSecondary, fontSize: 12 }}>
          Il ledger di {periodId} non è ancora sincronizzato.{" "}
          <button onClick={goSync} style={{ background: "none", border: "none", color: CP.accent, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: FONTS.body }}>
            Vai al tab Sync ledger <ArrowRight size={11} style={{ verticalAlign: -1 }} aria-hidden="true" />
          </button>
        </div>
      </CpCard>
    );
  }

  const t = data?.totals;
  const STATUS_IT = { attributed: "attribuito", unattributed: "non attribuito", wages_missing: "wage CP mancanti" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <StatCard label="Refund nel mese" value={fmtInt(t?.refunds)} sub={fmtUsd(t?.refunded_usd)} />
        <StatCard label="Su vendite attribuite" value={fmtInt(t?.attributed)} sub={fmtUsd(t?.attributed_usd)} />
        <StatCard label="Comp pagata su refund" value={fmtUsd(t?.comp_leak_usd)} sub="~STIMA (ricalcolo scaglioni)" color={t?.comp_leak_usd > 0 ? CP.accentRed : undefined} tooltip="Stima marginale: il turno viene ricalcolato senza il venduto rimborsato e la comp risparmiata è la differenza — i dollari stornati escono dalla cima della scala scaglioni, dove l'aliquota è più alta." />
        <StatCard label="Non attribuiti" value={fmtInt(t?.unattributed)} tooltip="Refund su vendite senza operatore in CP: mass/auto message, turni non tracciati o creator fuori CP. Nessuna comp pagata su queste." />
        {t?.wages_missing > 0 && (
          <StatCard
            label="Wage CP mancanti"
            value={fmtInt(t.wages_missing)}
            tooltip="Refund su vendite pagate in mesi senza wage CP in KV: non attribuibili finché non sincronizzi quei mesi da Sync & Audit CP."
          />
        )}
      </div>

      {data?.wages_missing_periods?.length > 0 && (
        <CpCard>
          <div style={{ color: CP.textSecondary, fontSize: 12 }}>
            Vendite pagate in mesi senza wage CP in KV: {data.wages_missing_periods.join(", ")} —{" "}
            <Link href="/admin/wage-audit" style={{ color: CP.accent }}>sincronizzali</Link> per attribuirle.
          </div>
        </CpCard>
      )}

      {data?.by_operator?.length > 0 && (
        <CpCard padding="0">
          <div style={{ padding: "14px 16px 6px" }}><SectionLabel>Per operatore</SectionLabel></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: CP.textMuted, fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "6px 16px", fontWeight: 400 }}>Operatore</th>
                <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Refund</th>
                <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Rimborsato</th>
                <th style={{ padding: "6px 16px", fontWeight: 400, textAlign: "right" }}>Comp su refund ~STIMA</th>
              </tr>
            </thead>
            <tbody>
              {data.by_operator.map((o) => (
                <tr key={o.operator} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                  <td style={{ padding: "8px 16px", color: CP.textPrimary }}>{o.operator}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textSecondary }}>{fmtInt(o.count)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textSecondary }}>{fmtUsd(o.refunded_usd)}</td>
                  <td style={{ padding: "8px 16px", textAlign: "right", color: CP.accentRed }}>{fmtUsd(o.comp_leak_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CpCard>
      )}

      <CpCard padding="0">
        <div style={{ padding: "14px 16px 6px" }}><SectionLabel>Refund del mese</SectionLabel></div>
        {(data?.rows || []).length === 0 ? (
          <div style={{ color: CP.textMuted, fontSize: 12, padding: "8px 16px 16px" }}>Nessun refund registrato nel mese.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: CP.textMuted, fontSize: 11, textAlign: "left" }}>
                  <th style={{ padding: "6px 16px", fontWeight: 400 }}>Refund</th>
                  <th style={{ padding: "6px 8px", fontWeight: 400 }}>Creator</th>
                  <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Importo</th>
                  <th style={{ padding: "6px 8px", fontWeight: 400 }}>Pagata</th>
                  <th style={{ padding: "6px 8px", fontWeight: 400 }}>Esito</th>
                  <th style={{ padding: "6px 16px", fontWeight: 400, textAlign: "right" }}>Comp ~STIMA</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                    <td style={{ padding: "8px 16px", color: CP.textSecondary, whiteSpace: "nowrap" }}>{fmtTime(r.refunded_at)}</td>
                    <td style={{ padding: "8px 8px", color: CP.textPrimary }}>{r.creator_name}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: CP.textPrimary }}>{fmtUsd(r.amount_usd)}</td>
                    <td style={{ padding: "8px 8px", color: CP.textMuted, whiteSpace: "nowrap" }}>{fmtTime(r.paid_at)}{r.transaction_type ? ` · ${r.transaction_type}` : ""}</td>
                    <td style={{ padding: "8px 8px", color: r.status === "attributed" ? CP.textPrimary : CP.textMuted }}>
                      {r.status === "attributed"
                        ? <>
                            {r.shared_between ? (r.operators_all || [r.operator]).join(" + ") : r.operator}
                            {r.shared_between && <span style={{ color: CP.textMuted }}> (quote coseller)</span>}
                            {r.ambiguous_with?.length > 0 && <span style={{ color: CP.textMuted }}> (ambiguo con {r.ambiguous_with.join(", ")})</span>}
                          </>
                        : STATUS_IT[r.status] || r.status}
                    </td>
                    <td style={{ padding: "8px 16px", textAlign: "right", color: r.comp_leak_usd ? CP.accentRed : CP.textMuted }}>
                      {r.comp_leak_usd != null ? fmtUsd(r.comp_leak_usd) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CpCard>
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
    <div style={{ padding: "26px 30px", maxWidth: 1200 }}>
      <PageHeader
        section="Comp & Ben"
        title="Albero payout"
        subtitle="Dal turno al take CP alla transazione del singolo fan (ledger Infloww) — con stato refund. Abbinamento direzionale, mai contabile."
        toolbar={
          <select value={periodId} onChange={(e) => { setPeriodId(e.target.value); setOperator(""); }} style={selectStyle} aria-label="Periodo">
            {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        }
      />
      <CompNav />
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <PillTab active={tab === "tree"} onClick={() => setTab("tree")} icon={<ListTree size={13} aria-hidden="true" />}>Albero</PillTab>
        <PillTab active={tab === "refunds"} onClick={() => setTab("refunds")} icon={<Undo2 size={13} aria-hidden="true" />}>Refund impact</PillTab>
        <PillTab active={tab === "sync"} onClick={() => setTab("sync")} icon={<RefreshCw size={13} aria-hidden="true" />}>Sync ledger</PillTab>
      </div>
      {tab === "tree" && <TreeTab periodId={periodId} operator={operator} setOperator={setOperator} goSync={() => setTab("sync")} />}
      {tab === "refunds" && <RefundTab periodId={periodId} goSync={() => setTab("sync")} />}
      {tab === "sync" && <SyncTab periodId={periodId} />}
    </div>
  );
}
