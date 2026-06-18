"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader, StatCard } from "@/components/cp-style";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2, Database, Search } from "lucide-react";

const fetcher = (url) => fetch(url).then((r) => r.json());

const MONTH_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
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

  // Parsing risposta robusto: se il server va in timeout Vercel risponde
  // testo non-JSON ("An error occurred...") → niente più "Unexpected token".
  async function postRecover(periodId) {
    const res = await fetch("/api/admin/wage-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_id: periodId, action: "recover_missing" }),
    });
    const text = await res.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch {
      // Risposta non-JSON = quasi sempre timeout (mese troppo grande per 60s)
      throw new Error("timeout: mese troppo grande in una sola richiesta — usa Re-sync da Sync CP storico (è chunkato)");
    }
    if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return j;
  }

  async function recover(periodId) {
    if (recovering[periodId] === "running") return;
    setRecovering((s) => ({ ...s, [periodId]: "running" }));
    setResults((s) => ({ ...s, [periodId]: "" }));
    try {
      const j = await postRecover(periodId);
      setRecovering((s) => ({ ...s, [periodId]: "done" }));
      setResults((s) => ({ ...s, [periodId]: j.message || "OK" }));
      setTimeout(() => mutate(url), 800);
    } catch (e) {
      setRecovering((s) => ({ ...s, [periodId]: "error" }));
      setResults((s) => ({ ...s, [periodId]: String(e?.message || e) }));
    }
  }

  const months = data?.months || [];
  const totalMissing = data?.total_missing ?? 0;
  const monthsWithGap = data?.months_with_gap ?? 0;
  const [bulkState, setBulkState] = useState({ running: false, message: "" });

  // Loop CLIENT-side: un mese per richiesta (ognuna bounded < 60s Vercel),
  // invece di tutti in una sola richiesta server-side (che andava in timeout
  // su 1596 wage → errore non-JSON). Sequenziale per non saturare CP API.
  async function recoverAll() {
    if (bulkState.running) return;
    const gapMonths = months.filter((m) => m.status === "missing").map((m) => m.period_id);
    if (gapMonths.length === 0) { setBulkState({ running: false, message: "Nessun gap da recuperare." }); return; }
    if (!confirm(`Recuperare ${gapMonths.length} mesi con gap, uno alla volta?\nPuò durare 1-2 minuti.`)) return;
    setBulkState({ running: true, message: `0/${gapMonths.length}…` });
    let ok = 0;
    const errs = [];
    for (let i = 0; i < gapMonths.length; i++) {
      const pid = gapMonths[i];
      setBulkState({ running: true, message: `${i + 1}/${gapMonths.length}: ${pid}…` });
      setRecovering((s) => ({ ...s, [pid]: "running" }));
      try {
        const j = await postRecover(pid);
        ok++;
        setRecovering((s) => ({ ...s, [pid]: "done" }));
        setResults((s) => ({ ...s, [pid]: j.message || "OK" }));
      } catch (e) {
        errs.push(`${pid}: ${e?.message || e}`);
        setRecovering((s) => ({ ...s, [pid]: "error" }));
        setResults((s) => ({ ...s, [pid]: String(e?.message || e) }));
      }
      await mutate(url);
    }
    setBulkState({
      running: false,
      message: errs.length === 0
        ? `Fatto: ${ok}/${gapMonths.length} mesi recuperati.`
        : `${ok} ok, ${errs.length} falliti. ${errs.join(" · ")}`,
    });
  }

  return (
    <div style={{ padding: "32px 28px 80px", maxWidth: 1300, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Wage Audit</span>
          </div>
        }
        section="Data integrity"
        title="Wage Audit CP"
        subtitle={<>
          Per ogni mese confronta i wages in KV con il conteggio LIVE da CreatorsPro API.
          Se mancano (es. il sync iniziale ha perso pagine prima del fix retry), il bottone
          <b> Recupera mancanti</b> ri-pesca le wage assenti e le append in KV.
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Mesi analizzati" value={months.length} sub={`ultimi ${lastN} mesi`} />
        <StatCard label="Mesi con gap" value={monthsWithGap} color={monthsWithGap > 0 ? "#EF4444" : "#10B981"} />
        <StatCard label="Wages totali mancanti" value={totalMissing} color={totalMissing > 0 ? "#F59E0B" : "#10B981"} sub={totalMissing > 0 ? "click recupera per mese" : "tutto sincronizzato"} />
        <StatCard label="Ultimo refresh" value={isLoading ? "Carico…" : "Live"} sub="ricarica per riconfrontare" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: COLORS.fog }}>Ultimi N mesi:</label>
        <select value={lastN} onChange={(e) => setLastN(parseInt(e.target.value))} style={{ padding: "8px 12px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 13 }}>
          <option value={6}>6 mesi</option>
          <option value={12}>12 mesi</option>
          <option value={18}>18 mesi</option>
          <option value={24}>24 mesi</option>
        </select>
        <button onClick={() => mutate(url)} style={{ padding: "8px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} /> Ricarica
        </button>
        {monthsWithGap > 0 && (
          <button
            onClick={recoverAll}
            disabled={bulkState.running}
            style={{
              padding: "8px 14px",
              background: bulkState.running ? COLORS.charcoal : "#F59E0B",
              color: bulkState.running ? COLORS.mist : COLORS.obsidian,
              border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: bulkState.running ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              marginLeft: "auto",
            }}
          >
            {bulkState.running ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
            {bulkState.running ? "Recupero…" : `Recupera TUTTI i ${monthsWithGap} mesi con gap`}
          </button>
        )}
      </div>
      {bulkState.message && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 8, fontSize: 12, color: COLORS.alabaster }}>
          {bulkState.message}
        </div>
      )}

      {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
      {data?.error && <p style={{ color: COLORS.signal, padding: 16, background: COLORS.signal + "20", borderRadius: 12 }}>{data.error}</p>}

      {data && !data.error && (
        <div style={{ background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 1fr 1.5fr", padding: "14px 22px", background: COLORS.obsidian + "80", color: COLORS.fog, fontSize: 10, letterSpacing: "0.1em", fontWeight: 500, borderBottom: `1px solid ${COLORS.charcoal}` }}>
            <div>Mese</div><div>KV</div><div>CP live</div><div>Gap</div><div>Stato</div><div>Azione</div>
          </div>
          {months.map((m) => {
            const status = m.status;
            const statusColor = status === "ok" ? "#10B981"
              : status === "missing" ? "#F59E0B"
              : status === "not_synced" ? COLORS.mist
              : "#EF4444";
            const statusLabel = status === "ok" ? "✓ allineato"
              : status === "missing" ? `⚠ ${m.gap} mancanti`
              : status === "not_synced" ? "—  non syncato"
              : "✗ live failed";
            const recState = recovering[m.period_id];
            const recMsg = results[m.period_id];
            return (
              <div key={m.period_id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 1fr 1.5fr", padding: "14px 22px", borderBottom: `1px solid ${COLORS.charcoal}88`, alignItems: "center", fontSize: 13 }}>
                <div style={{ fontWeight: 500 }}>{periodLabel(m.period_id)} <span style={{ color: COLORS.mist, fontFamily: FONTS.mono, fontSize: 11, marginLeft: 6 }}>{m.period_id}</span></div>
                <div style={{ fontFamily: FONTS.mono }}>{m.kv_count}</div>
                <div style={{ fontFamily: FONTS.mono }}>{m.live_count ?? "—"}</div>
                <div style={{ fontFamily: FONTS.mono, color: m.gap > 0 ? "#F59E0B" : COLORS.fog, fontWeight: m.gap > 0 ? 700 : 500 }}>{m.gap == null ? "—" : m.gap > 0 ? `+${m.gap}` : 0}</div>
                <div style={{ color: statusColor, fontSize: 12, fontWeight: 600 }}>{statusLabel}</div>
                <div>
                  {status === "missing" && (
                    <button
                      onClick={() => recover(m.period_id)}
                      disabled={recState === "running"}
                      style={{
                        padding: "8px 14px",
                        background: recState === "done" ? "#10B98122" : recState === "error" ? "#EF444422" : "#F59E0B22",
                        border: `1px solid ${recState === "done" ? "#10B981" : recState === "error" ? "#EF4444" : "#F59E0B"}`,
                        borderRadius: 8,
                        color: recState === "done" ? "#10B981" : recState === "error" ? "#EF4444" : "#F59E0B",
                        fontSize: 12, fontWeight: 700, cursor: recState === "running" ? "wait" : "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {recState === "running" ? <><Loader2 size={13} className="spin" /> Recupero…</>
                        : recState === "done" ? <><CheckCircle2 size={13} /> Fatto</>
                        : recState === "error" ? <><AlertCircle size={13} /> Errore</>
                        : <><RefreshCw size={13} /> Recupera mancanti</>}
                    </button>
                  )}
                  {status === "ok" && <span style={{ fontSize: 12, color: "#10B981" }}><CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> Tutto OK</span>}
                  {status === "not_synced" && (
                    <Link href="/admin/creatorspro-sync-history" style={{ fontSize: 12, color: COLORS.champagne, textDecoration: "none" }}>
                      → Sync questo mese
                    </Link>
                  )}
                  {status === "live_failed" && <span style={{ fontSize: 12, color: "#EF4444" }} title={m.live_error}>Errore CP API</span>}
                  {recMsg && <div style={{ fontSize: 11, color: recState === "error" ? "#EF4444" : COLORS.mist, marginTop: 4 }}>{recMsg}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
