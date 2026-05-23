"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock, Play, Pause, Square,
  Calendar, Database,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, SectionLabel, CpCard, StatCard } from "@/components/cp-style";

/**
 * /admin/creatorspro-sync-history
 *
 * Wizard per orchestrare il sync di MESI MULTIPLI in sequenza, in modo da
 * popolare lo storico CP della webapp senza dover cliccare 4 step × N mesi
 * manualmente.
 *
 * Pipeline per ogni mese:
 *   refdata (1×, condivisa) → prepare (incrementale, 3-5 chiamate) →
 *   batch loop (cicli da ~50 wages × N) → finalize.
 *
 * UI:
 *   - Lista mesi ultimi 24 con stato (synced/never/in-progress)
 *   - Bottone "Sync mese" per ognuno
 *   - Bottone "🚀 Sync TUTTI i mesi mancanti" che cicla automaticamente
 *   - Progress live (mese corrente, step corrente, batch x/N)
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const MONTH_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_IT[d.getMonth()]} ${d.getFullYear()}`,
      monthIndex: d.getMonth(),
      year: d.getFullYear(),
    });
  }
  return out;
}

async function postSyncOnce(body) {
  const res = await fetch("/api/admin/creatorspro-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get("content-type") || "";
  // Vercel/Edge restituiscono HTML quando 504/timeout o 401 redirect → niente JSON.parse a caso
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    const snippet = txt.slice(0, 80).replace(/\s+/g, " ");
    if (res.status === 504 || /gateway.*timeout|timed?\s*out/i.test(txt)) {
      throw new Error(`Timeout Vercel (60s) — il sync di questa pagina ha superato il limite. Snippet: ${snippet}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Sessione scaduta (HTTP ${res.status}). Ricarica la pagina e rifai login.`);
    }
    throw new Error(`Risposta non-JSON (HTTP ${res.status}, ${ct || "no content-type"}). Snippet: ${snippet}`);
  }
  const j = await res.json();
  if (!res.ok) throw new Error(j?.reason || j?.error || `HTTP ${res.status}`);
  return j;
}

async function postSync(body) {
  // Un retry automatico su errori transienti (timeout / 5xx)
  try {
    return await postSyncOnce(body);
  } catch (e) {
    const transient = /timeout|HTTP 5\d\d|non-JSON/i.test(String(e?.message || ""));
    if (!transient) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return await postSyncOnce(body);
  }
}

export default function SyncHistoryPage() {
  const [months] = useState(() => lastMonths(24));
  const [progress, setProgress] = useState({ running: false, current: null, step: "", batchInfo: "", error: null, completed: [], total: 0 });
  const [monthStates, setMonthStates] = useState({}); // periodId → { synced, wages_count, shifts_count, last_sync_at }
  const [stopRequested, setStopRequested] = useState(false);

  // Carica meta sync corrente
  const { data: syncStatus, mutate: refetchStatus } = useSWR("/api/admin/creatorspro-sync", fetcher);

  // Carica conteggi per ogni mese da KV (chiamata batch ai dati)
  const { data: historyData, mutate: refetchHistory } = useSWR(
    `/api/admin/creatorspro-history?last_n=24`,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (historyData?.months) {
      const m = {};
      for (const item of historyData.months) m[item.period_id] = item;
      setMonthStates(m);
    }
  }, [historyData]);

  // Sync di UN solo mese (con i 4 step in sequenza)
  async function syncSingleMonth(periodId, onStep) {
    onStep?.("refdata");
    await postSync({ action: "refdata" });

    // Prepare incrementale: cicla finché done=true
    let prepDone = false;
    let pageOffset = 1;
    const PAGES_PER_CALL = 8;
    let prepRound = 0;
    while (!prepDone) {
      if (stopRequested) throw new Error("STOPPED");
      prepRound++;
      onStep?.(`prepare round ${prepRound}`);
      const r = await postSync({ action: "prepare", period_id: periodId, page_offset: pageOffset, pages_limit: PAGES_PER_CALL });
      prepDone = r.done;
      pageOffset = r.next_page || (pageOffset + PAGES_PER_CALL);
      if (prepRound > 30) throw new Error("Prepare bloccato dopo 30 round");
    }

    // Batch loop dei wage detail
    let offset = 0;
    let total = 0;
    let batchRound = 0;
    while (true) {
      if (stopRequested) throw new Error("STOPPED");
      batchRound++;
      const r = await postSync({ action: "batch", period_id: periodId, offset, batch_size: 50 });
      total = r.total;
      offset = r.next_offset;
      onStep?.(`batch ${offset}/${total}`);
      if (r.done) break;
      if (batchRound > 100) throw new Error("Batch loop bloccato dopo 100 round");
    }

    // Finalize
    onStep?.("finalize");
    const fin = await postSync({ action: "finalize", period_id: periodId });
    return fin;
  }

  // Sync di tutti i mesi specificati (in sequenza)
  async function syncBatch(periodIds, options = { onlyMissing: true }) {
    if (progress.running) return;
    setStopRequested(false);
    const toSync = options.onlyMissing
      ? periodIds.filter((p) => !monthStates[p]?.synced)
      : periodIds;
    if (toSync.length === 0) {
      alert("Nessun mese da syncare con i criteri scelti.");
      return;
    }
    if (!confirm(`Sync di ${toSync.length} mese${toSync.length > 1 ? "i" : ""}? Operazione lunga (~1-3 min per mese). Puoi fermare in qualsiasi momento.`)) return;

    // Ping immediato per verificare/rinfrescare la sessione PRIMA di iniziare:
    // se è scaduta meglio scoprirlo subito che dopo 1 min di sync sprecato.
    try {
      const r = await fetch("/api/auth/ping");
      if (r.status === 401) {
        alert("Sessione scaduta. Ricarica la pagina (Cmd+R) e riprova.");
        return;
      }
      if (!r.ok) {
        alert(`Ping auth fallito (HTTP ${r.status}). Ricarica la pagina e riprova.`);
        return;
      }
    } catch (e) {
      alert(`Errore di rete sul ping auth: ${e.message}. Verifica la connessione.`);
      return;
    }

    setProgress({ running: true, current: null, step: "", batchInfo: "", error: null, completed: [], total: toSync.length });
    // Keep-alive ping ogni 4 min per evitare che la sessione Clerk scada durante batch lunghi (>30 min)
    const keepAlive = setInterval(() => {
      fetch("/api/auth/ping").catch(() => {});
    }, 4 * 60 * 1000);
    try {
      const completed = [];
      for (const p of toSync) {
        if (stopRequested) {
          setProgress((pr) => ({ ...pr, running: false, error: "Stop richiesto dall'utente" }));
          return;
        }
        setProgress((pr) => ({ ...pr, current: p, step: "starting", batchInfo: "" }));
        try {
          await syncSingleMonth(p, (step) => {
            setProgress((pr) => ({ ...pr, step, batchInfo: step.includes("batch") ? step : pr.batchInfo }));
          });
          completed.push(p);
          setProgress((pr) => ({ ...pr, completed: [...pr.completed, p] }));
        } catch (e) {
          if (e.message === "STOPPED") {
            setProgress((pr) => ({ ...pr, running: false, error: "Fermato dall'utente" }));
            return;
          }
          setProgress((pr) => ({ ...pr, running: false, error: `Errore su ${p}: ${e.message}` }));
          return;
        }
      }
      setProgress((pr) => ({ ...pr, running: false, current: null, step: "Done" }));
      refetchStatus();
      refetchHistory();
    } finally {
      clearInterval(keepAlive);
    }
  }

  const neverSyncedCount = useMemo(() => months.filter((m) => !monthStates[m.id]?.synced).length, [months, monthStates]);
  const syncedCount = months.length - neverSyncedCount;

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/admin/creatorspro-sync" style={{ color: "inherit", textDecoration: "none" }}>Sync CP</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Storico</span>
          </div>
        }
        section="Data · Integration"
        title="🚀 Sync CP storico"
        subtitle="Popola la webapp con i dati CreatorsPro degli ultimi 24 mesi. Avvia un mese alla volta oppure 'sync tutti i mancanti' per riempire lo storico in batch automatico."
      />

      {/* ISTRUZIONI INLINE: cosa fa questo wizard */}
      <div style={{
        padding: "16px 20px",
        background: `linear-gradient(135deg, ${CP.accentGreen}12 0%, ${CP.accentGreen}05 100%)`,
        border: `1px solid ${CP.accentGreen}55`,
        borderRadius: 12,
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <div style={{ fontWeight: 700, fontSize: 14, color: CP.textPrimary }}>Come funziona (sync automatico da CP API)</div>
        </div>
        <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.6, margin: "0 0 10px 0" }}>
          <b>Non devi scaricare nulla a mano da CreatorsPro.</b> Questo wizard chiama direttamente la loro API e
          importa i wage records mese per mese. Bastano le tue credenziali bot già configurate su Vercel.
        </p>
        <ul style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.7, paddingLeft: 22, margin: "0 0 10px 0" }}>
          <li><b>Click &quot;🚀 Avvia sync ({neverSyncedCount})&quot;</b> per popolare automaticamente tutti i mesi mancanti</li>
          <li>Ogni mese richiede ~1-3 minuti (refdata → prepare → batch wages → finalize)</li>
          <li>Puoi <b>fermare</b> in qualsiasi momento — il mese in corso si completa prima dello stop</li>
          <li>I dati popolano: Sales CP, Creator leaderboard, Action Center, heatmap</li>
        </ul>
        <div style={{ fontSize: 12, color: CP.textMuted, fontStyle: "italic" }}>
          ⚠️ Solo lo sync mensile è disponibile via API (CP non espone export bulk multi-mese). Per questo cicliamo mese per mese.
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Mesi disponibili" value={months.length} sub="ultimi 24 mesi" />
        <StatCard label="Già syncati" value={syncedCount} sub={`${neverSyncedCount} mai syncati`} color={CP.accentGreen} />
        <StatCard label="In corso" value={progress.running ? "1" : "0"} sub={progress.current ? `Mese: ${progress.current}` : "—"} color={progress.running ? "#F59E0B" : null} />
        <StatCard label="Completati ora" value={`${progress.completed.length} / ${progress.total || "—"}`} />
      </div>

      {/* Banner azione batch */}
      <CpCard accent={CP.accentGreen} padding="20px 24px" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>🚀 Sync TUTTI i mesi mancanti ({neverSyncedCount})</div>
            <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.5 }}>
              Cicla automaticamente sui mesi non ancora sincronizzati. Ogni mese richiede ~1-3 minuti.
              Puoi fermare in qualsiasi momento (il mese corrente viene completato prima dello stop).
            </div>
          </div>
          {!progress.running ? (
            <button
              onClick={() => syncBatch(months.map((m) => m.id), { onlyMissing: true })}
              disabled={neverSyncedCount === 0}
              style={primaryBtn(neverSyncedCount === 0)}
            >
              <Play size={14} /> Avvia sync ({neverSyncedCount})
            </button>
          ) : (
            <button
              onClick={() => setStopRequested(true)}
              style={{ ...primaryBtn(false), background: CP.accentRed, color: "#0a0a0a" }}
            >
              <Square size={14} /> Ferma sync
            </button>
          )}
        </div>

        {progress.running && progress.current && (
          <div style={{ marginTop: 18, padding: "12px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <RefreshCw size={14} color="#F59E0B" className="animate-spin" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>{progress.current}</span>
              <span style={{ color: CP.textMuted, fontSize: 11, fontFamily: FONTS.mono }}>
                {progress.completed.length}/{progress.total} mesi completati
              </span>
            </div>
            <div style={{ fontSize: 12, color: CP.textSecondary, fontFamily: FONTS.mono }}>
              Step: <b style={{ color: CP.accentGreen }}>{progress.step}</b>
            </div>
            <div style={{ marginTop: 10, height: 4, background: CP.bg, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", background: CP.accentGreen, width: `${(progress.completed.length / progress.total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        {progress.error && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: CP.accentRed + "18", border: `1px solid ${CP.accentRed}55`, borderRadius: 8, color: CP.accentRed, fontSize: 13 }}>
            <AlertCircle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {progress.error}
          </div>
        )}
      </CpCard>

      {/* Lista mesi */}
      <SectionLabel style={{ display: "block", marginBottom: 12 }}>I 24 mesi</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {months.map((m) => {
          const state = monthStates[m.id];
          const synced = state?.synced;
          const isCurrent = progress.current === m.id;
          const isCompleted = progress.completed.includes(m.id);
          const cardColor = isCurrent ? "#F59E0B" : isCompleted ? CP.accentGreen : synced ? CP.accentGreen : CP.textMuted;
          return (
            <CpCard key={m.id} accent={cardColor} padding="14px 18px">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: FONTS.display }}>{m.label}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: CP.textMuted, marginTop: 2 }}>{m.id}</div>
                </div>
                {isCurrent ? (
                  <RefreshCw size={16} color="#F59E0B" className="animate-spin" />
                ) : synced ? (
                  <CheckCircle2 size={16} color={CP.accentGreen} />
                ) : (
                  <Clock size={16} color={CP.textMuted} />
                )}
              </div>
              {synced && state && (
                <div style={{ fontSize: 11, color: CP.textSecondary, lineHeight: 1.6 }}>
                  <div>{state.wages_count || 0} wages · {state.shifts_count || 0} shifts</div>
                  {state.last_sync_at && (
                    <div style={{ color: CP.textMuted }}>
                      Synced: {new Date(state.last_sync_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              )}
              {!synced && (
                <div style={{ fontSize: 11, color: CP.textMuted, fontStyle: "italic" }}>Mai sincronizzato</div>
              )}
              <button
                onClick={() => syncBatch([m.id], { onlyMissing: false })}
                disabled={progress.running}
                style={{
                  marginTop: 12, width: "100%",
                  padding: "7px 10px",
                  background: progress.running ? CP.surfaceAlt : (synced ? CP.surface : CP.accentGreen + "22"),
                  border: `1px solid ${synced ? CP.border : CP.accentGreen + "55"}`,
                  borderRadius: 6,
                  color: synced ? CP.textPrimary : CP.accentGreen,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: progress.running ? "not-allowed" : "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                {isCurrent ? "Sync in corso…" : synced ? "↻ Re-sync" : "▶ Sync ora"}
              </button>
            </CpCard>
          );
        })}
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: CP.textMuted, fontStyle: "italic" }}>
        ⚠️ Lo storico molto profondo (12+ mesi) può occupare spazio rilevante in KV. Per i mesi più vecchi le wage records contengono comunque metadati shift e takes esatti.
      </p>
    </div>
  );
}

const primaryBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "12px 20px",
  background: disabled ? CP.surfaceAlt : CP.accentGreen,
  color: disabled ? CP.textMuted : "#0a0a0a",
  border: "none",
  borderRadius: 8,
  fontSize: 14, fontWeight: 700, fontFamily: FONTS.body,
  cursor: disabled ? "not-allowed" : "pointer",
  whiteSpace: "nowrap",
});
