"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { FONTS, CP } from "@/lib/brand";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import HowToRead from "@/components/HowToRead";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, DataTable, card } from "@/components/ds";

// Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/UX): gergo
// tradotto (KV / CP live / wage / gap → scaricati da noi / dichiarati da
// CreatorsPro / compensi / mancanti), mese in corso marcato come tale (prima
// "6 mancanti" in arancione sembrava un guasto), "Compensi mancanti" separa i
// mesi mai scaricati dai buchi veri, bottoni di riga neutri (un solo accento:
// l'azione "tutto"). Sync, job e API invariati.

// Fetcher robusto: se il GET va in timeout Vercel risponde testo non-JSON
// → messaggio leggibile invece di "Unexpected token 'A'".
const fetcher = async (url) => {
  const res = await fetch(url);
  const text = await res.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch {
    throw new Error("Il controllo è andato in timeout (troppi mesi in una volta). Scegli “Ultimi 6 mesi” e riprova.");
  }
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
  return j;
};

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const ctl = { padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const ghostBtn = { padding: "7px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, display: "inline-flex", alignItems: "center", gap: 6 };
function periodLabel(pid) {
  const m = pid?.match?.(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTH_IT[parseInt(m[2]) - 1]} ${m[1]}`;
  return pid;
}

export default function WageAuditPage() {
  const [lastN, setLastN] = useState(12);
  const [recovering, setRecovering] = useState({});  // periodId → "running"|"done"|"error"
  const [results, setResults] = useState({}); // periodId → message

  const url = `/api/admin/wage-audit?last_n=${lastN}`;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  // POST allo step di sync con parsing robusto (timeout server → non-JSON).
  async function postSync(body) {
    const res = await fetch("/api/admin/creatorspro-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch {
      throw new Error("timeout su uno step — riprova fra poco (CP lento)");
    }
    if (!res.ok) throw new Error(j?.error || j?.reason || `HTTP ${res.status}`);
    return j;
  }

  // Re-sync CHUNKATO inline: stessa sequenza della pagina Sync CP storico
  // (refdata → prepare 5 pagine/volta → batch 30/volta → finalize). Ogni step
  // è una richiesta separata < 60s, quindi NON va mai in timeout anche con CP
  // lento — risolve il "mese troppo grande in una sola richiesta". Re-pesca
  // l'intero mese (completo) e riscrive il gap-check.
  async function chunkedResync(periodId, onPhase) {
    await postSync({ action: "refdata" });
    let pageOffset = 1, prepareDone = false, total = 0, guard = 0;
    while (!prepareDone && guard++ < 200) {
      onPhase?.(`prep pag ${pageOffset}`);
      const prep = await postSync({ action: "prepare", period_id: periodId, page_offset: pageOffset, pages_limit: 5 });
      total = prep.total || 0;
      prepareDone = !!prep.done;
      pageOffset = prep.next_page || pageOffset + 5;
    }
    if (total > 0) {
      let offset = 0; guard = 0;
      while (offset < total && guard++ < 500) {
        onPhase?.(`batch ${Math.floor(offset / 30) + 1}/${Math.ceil(total / 30)}`);
        const r = await postSync({ action: "batch", period_id: periodId, offset, batch_size: 30 });
        offset = r.next_offset;
        if (r.done) break;
      }
    }
    onPhase?.("finalize");
    const fin = await postSync({ action: "finalize", period_id: periodId });
    return fin;
  }

  async function recover(periodId) {
    if (recovering[periodId] === "running") return;
    setRecovering((s) => ({ ...s, [periodId]: "running" }));
    setResults((s) => ({ ...s, [periodId]: "" }));
    try {
      await chunkedResync(periodId, (ph) => setResults((s) => ({ ...s, [periodId]: ph })));
      setRecovering((s) => ({ ...s, [periodId]: "done" }));
      setResults((s) => ({ ...s, [periodId]: "Mese scaricato per intero" }));
      setTimeout(() => mutate(url), 800);
    } catch (e) {
      setRecovering((s) => ({ ...s, [periodId]: "error" }));
      setResults((s) => ({ ...s, [periodId]: String(e?.message || e) }));
    }
  }

  const months = data?.months || [];
  const totalMissing = data?.total_missing ?? 0;
  const monthsWithGap = data?.months_with_gap ?? 0;
  const monthsNeverSynced = months.filter((m) => m.status === "not_synced").length;
  const monthsTodo = months.filter((m) => m.status === "missing" || m.status === "not_synced").length;
  const [bulkState, setBulkState] = useState({ running: false, message: "" });

  // Il sync gira nel browser su QUESTA pagina: se la chiudi/ricarichi a metà
  // si interrompe. Avviso (beforeunload) + banner mentre è in corso.
  const anyRunning = bulkState.running || Object.values(recovering).some((v) => v === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [anyRunning]);

  // BULK via JOB server-side (Fase 1): lo stato vive in KV, il client guida
  // il worker chiamando "step" in loop. Al RELOAD la pagina riprende il job
  // (resume effect sotto) invece di ricominciare. Phase 2 (QStash) sostituirà
  // il driver client con uno server-side che gira anche a tab chiuso.
  async function driveJob() {
    let guard = 0;
    while (guard++ < 3000) {
      let res, j = null;
      try {
        res = await fetch("/api/admin/cp-sync-job", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        });
        const text = await res.text();
        try { j = text ? JSON.parse(text) : null; } catch { j = null; }
      } catch { j = null; }
      if (!j) { await new Promise((r) => setTimeout(r, 2500)); continue; } // step lento/timeout → ritenta
      const p = j.progress;
      if (p) {
        setBulkState({ running: j.has_more, message: `${(p.month_index ?? 0) + 1}/${p.months_total} · ${p.last_step || p.phase || ""}${j.retry ? " (ritento…)" : ""}` });
        for (const dm of p.done_months || []) setRecovering((s) => (s[dm] === "done" ? s : { ...s, [dm]: "done" }));
      }
      if (!j.has_more) { await mutate(url); break; }
      if (j.retry) await new Promise((r) => setTimeout(r, 2000)); // chunk fallito → pausa breve
    }
  }

  async function recoverAll() {
    if (bulkState.running) return;
    const gapMonths = months.filter((m) => m.status === "missing" || m.status === "not_synced").map((m) => m.period_id);
    if (gapMonths.length === 0) { setBulkState({ running: false, message: "Tutti i mesi sono già completi." }); return; }
    if (!confirm(`Scaricare e completare ${gapMonths.length} mesi?\nPuoi ricaricare la pagina: riprende da solo. Se chiudi la scheda si mette in pausa.`)) return;
    setBulkState({ running: true, message: "Avvio…" });
    try {
      await fetch("/api/admin/cp-sync-job", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", months: gapMonths }),
      });
      await driveJob();
    } catch (e) {
      setBulkState({ running: false, message: `Non sono riuscito ad avviare: ${String(e?.message || e)}` });
    }
  }

  // RESUME al reload: se in KV c'è un job "running", riattacca il driver.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/cp-sync-job");
        const j = await res.json().catch(() => null);
        if (j?.progress?.status === "running") {
          setBulkState({ running: true, message: "ripreso dopo il ricaricamento" });
          driveJob();
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const currentPid = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const missingNeverSynced = months.filter((m) => m.status === "not_synced").reduce((s, m) => s + (m.gap || 0), 0);
  const curRow = months.find((m) => m.period_id === currentPid);

  const statusView = (m) => {
    const s = m.status;
    if (s === "ok") return { label: "Completo", color: CP.textMuted };
    if (s === "missing") return { label: `${fmtInt(m.gap)} mancanti${m.period_id === currentPid ? " · mese in corso" : ""}`, color: m.period_id === currentPid ? CP.textSecondary : CP.accentRed };
    if (s === "not_synced") return { label: "Mai scaricato", color: CP.textSecondary };
    if (s === "unknown") return { label: "Da verificare", color: CP.textSecondary };
    return { label: "CreatorsPro non risponde", color: CP.accentRed };
  };

  const columns = [
    { key: "period_id", label: "Mese", render: (m) => (
      <span>{periodLabel(m.period_id)}{m.period_id === currentPid && <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: 6 }}>in corso</span>}</span>
    ) },
    { key: "kv_count", label: "Scaricati da noi", align: "right", render: (m) => fmtInt(m.kv_count) },
    { key: "live_count", label: "Dichiarati da CreatorsPro", align: "right", render: (m) => (m.live_count == null ? "—" : fmtInt(m.live_count)) },
    { key: "gap", label: "Mancanti", align: "right", render: (m) => (m.gap == null ? "—" : <span style={{ fontWeight: m.gap > 0 ? 500 : 400, color: m.gap > 0 ? CP.textPrimary : CP.textMuted }}>{fmtInt(m.gap)}</span>) },
    { key: "status", label: "Stato", sortable: false, render: (m) => { const v = statusView(m); return <span style={{ color: v.color, fontSize: 13 }}>{v.label}</span>; } },
    { key: "action", label: "", sortable: false, render: (m) => {
      const recState = recovering[m.period_id];
      const recMsg = results[m.period_id];
      if (m.status === "ok") return <span style={{ fontSize: 13, color: CP.textMuted, display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={13} /> niente da fare</span>;
      return (
        <div>
          {/* missing / not_synced / unknown → stessa azione: re-sync a pezzi */}
          <button onClick={() => recover(m.period_id)} disabled={recState === "running"}
            style={{ ...ghostBtn, cursor: recState === "running" ? "wait" : "pointer", color: recState === "error" ? CP.accentRed : CP.textPrimary, borderColor: recState === "error" ? CP.accentRed : CP.border }}>
            {recState === "running" ? <><Loader2 size={13} className="animate-spin" /> In corso…</>
              : recState === "done" ? <><CheckCircle2 size={13} /> Fatto</>
              : recState === "error" ? <><AlertCircle size={13} /> Riprova</>
              : <><RefreshCw size={13} /> {m.status === "not_synced" ? "Scarica" : m.status === "missing" ? "Completa" : "Verifica"}</>}
          </button>
          {recMsg && <div style={{ fontSize: 12, color: recState === "error" ? CP.accentRed : CP.textMuted, marginTop: 4 }}>{recMsg}</div>}
        </div>
      );
    } },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Sync e controllo CP" }]}
        title="Sync e controllo CreatorsPro"
        subtitle="Controlla che ogni mese sia scaricato per intero da CreatorsPro e, se mancano dei compensi, li scarica. Compensi, P&L e soglie in tutta l'app sono affidabili solo sui mesi completi."
        actions={<>
          <select value={lastN} onChange={(e) => setLastN(parseInt(e.target.value))} aria-label="Mesi da controllare" style={ctl}>
            <option value={6}>Ultimi 6 mesi</option>
            <option value={12}>Ultimi 12 mesi</option>
            <option value={18}>Ultimi 18 mesi</option>
            <option value={24}>Ultimi 24 mesi</option>
          </select>
          <button onClick={() => mutate(url)} style={{ ...ctl, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <RefreshCw size={13} /> Ricontrolla
          </button>
        </>}
      />

      <HowToRead items={[
        "Per ogni mese: quanti compensi (uno per turno) abbiamo scaricato noi e quanti ne dichiara CreatorsPro adesso. Se i nostri sono meno, mancano dei dati.",
        "Stato: “Completo” = mese intero · “N mancanti” = scaricato a metà, da completare · “Mai scaricato” = mese che non abbiamo mai preso.",
        "Il bottone su ogni riga (Scarica / Completa) scarica il mese a pezzi, 5 pagine alla volta: non va in timeout anche se CreatorsPro è lento.",
        "Il numero da tenere a zero: i compensi mancanti nei mesi che usi. Un mese mai scaricato va preso solo se ti serve.",
        "Il mese in corso è normale che risulti incompleto: scaricalo quando vuoi i dati aggiornati a oggi (lo fa anche la sincronizzazione notturna).",
      ]} />

      {isLoading && !data && <div style={{ ...card, padding: "18px 20px", color: CP.textSecondary, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={15} className="animate-spin" /> Confronto i mesi con CreatorsPro…</div>}
      {error && <Notice danger>{String(error?.message || error)}</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.error && (
        <>
          <HeroMetric
            label="Mesi da completare o scaricare"
            value={fmtInt(monthsTodo)}
            compare={`su ${fmtInt(months.length)} mesi controllati`}
            hint={curRow && curRow.status === "missing" ? "Il mese in corso risulta incompleto per definizione: non è un errore." : null}
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Metric label="Scaricati a metà" value={fmtInt(monthsWithGap)} danger={months.some((m) => m.status === "missing" && m.period_id !== currentPid)} />
              <Metric label="Mai scaricati" value={fmtInt(monthsNeverSynced)} />
              <Metric label="Compensi mancanti" value={fmtInt(totalMissing)} note={missingNeverSynced > 0 ? `${fmtInt(missingNeverSynced)} nei mesi mai scaricati` : null} />
            </div>
          </HeroMetric>

          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <SectionTitle aside="i numeri sono letti da CreatorsPro adesso">Mese per mese</SectionTitle>
            {monthsTodo > 0 && (
              <button onClick={recoverAll} disabled={bulkState.running}
                style={{ marginLeft: "auto", padding: "8px 14px", background: bulkState.running ? CP.surfaceAlt : CP.accent, color: bulkState.running ? CP.textMuted : CP.accentInk, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: bulkState.running ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {bulkState.running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {bulkState.running ? "In corso…" : `Scarica e completa tutto (${monthsTodo} mesi)`}
              </button>
            )}
          </div>
          {anyRunning && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderLeft: `3px solid ${CP.accent}`, borderRadius: 10, fontSize: 13, color: CP.textSecondary, display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 size={14} className="animate-spin" />
              {bulkState.running
                ? <span>Scaricamento in corso ({bulkState.message}). Puoi ricaricare la pagina: riprende da solo. Se chiudi la scheda si mette in pausa e riparte quando la riapri.</span>
                : <span>Scaricamento di un mese in corso: resta su questa pagina finché non finisce.</span>}
            </div>
          )}
          {bulkState.message && !anyRunning && <Notice>{bulkState.message}</Notice>}

          <DataTable columns={columns} rows={months.map((m) => ({ ...m, id: m.period_id }))} minWidth={760}
            empty="Nessun mese da controllare." />
        </>
      )}
    </div>
  );
}
