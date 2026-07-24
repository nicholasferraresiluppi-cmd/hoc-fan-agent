"use client";

// Infloww ingest — carica un export Message Dashboard (scoped per-operatore per via
// del tetto 500k di Infloww) e accumula i profili-segnali. Il file è parsato e i
// segnali calcolati QUI nel browser: solo gli aggregati (nessun messaggio) vanno al
// server. Estende la copertura ai turni in duo, che il warehouse non attribuisce.

import { useState, useMemo } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { computeInflowwOperatorSignals } from "@/lib/infloww-signals";

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const usd = (v) => (v == null ? "—" : `$${Math.round(v)}`);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");
// YYYY-MM-DD da componenti LOCALI (toISOString sposterebbe di un giorno per i fusi UTC+)
const localYMD = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const NEED = ["Sender", "Creator Message", "Price", "Sent to"];

export default function InflowwIngestPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/admin/infloww-ingest", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const XLSX = await import("xlsx"); // dep pesante: caricata solo qui
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Il file non contiene fogli.");
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (!rows.length) throw new Error("Il file è vuoto.");
      const missing = NEED.filter((h) => !(h in rows[0]));
      if (missing.length) throw new Error(`Colonne mancanti: ${missing.join(", ")}. È un export Message Dashboard di Infloww?`);

      const out = computeInflowwOperatorSignals(rows, { minMsgs: 100 });
      if (!out.profiles.length) throw new Error("Nessun operatore con almeno 100 messaggi in questo file.");

      // finestra temporale del file (best-effort, per etichettare la copertura)
      let from = null;
      let to = null;
      for (const r of rows) {
        const d = Date.parse(r["Sent date"]);
        if (Number.isFinite(d)) {
          if (from == null || d < from) from = d;
          if (to == null || d > to) to = d;
        }
      }
      const meta = {
        rows: rows.length,
        period_from: from ? localYMD(from) : null,
        period_to: to ? localYMD(to) : null,
      };

      const res = await fetch("/api/admin/infloww-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles: out.profiles, meta }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Ingest fallito");
      setMsg({ ok: true, text: `Caricati ${out.profiles.length} operatori da ${out.rows_seen.toLocaleString("it-IT")} messaggi. Copertura totale: ${j.count} operatori.` });
      mutate(j, { revalidate: false });
    } catch (err) {
      setMsg({ ok: false, text: String(err?.message || err) });
    } finally {
      setBusy(false);
      e.target.value = ""; // permette di ricaricare lo stesso file
    }
  }

  async function clearAll() {
    if (!confirm("Svuotare tutti i profili Infloww accumulati?")) return;
    setMsg(null);
    try {
      const res = await fetch("/api/admin/infloww-ingest", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const j = await res.json();
      if (res.ok) mutate(j, { revalidate: false });
      else setMsg({ ok: false, text: j.error || "Svuotamento fallito" });
    } catch (err) {
      setMsg({ ok: false, text: String(err?.message || err) });
    }
  }

  const profiles = data?.profiles || [];
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? profiles.filter((p) => p.operator.toLowerCase().includes(n)) : profiles;
  }, [profiles, q]);

  const inputStyle = { background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, padding: "8px 10px", outline: "none" };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Admin · Academy"
        title="Ingest Infloww — copertura anche in duo"
        subtitle="Carica un export Message Dashboard di Infloww (scoped per operatore, per via del tetto 500k messaggi). Il file è letto e i segnali calcolati nel browser: al server arrivano solo gli aggregati, mai i messaggi. Estende il profilo-segnali ai turni in duo, che il warehouse non sa attribuire. Coaching, non score."
      />

      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          padding: 18,
          background: CP.surface,
          border: `1px solid ${CP.border}`,
          borderRadius: 12,
          marginBottom: 8,
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: CP.accent,
            color: CP.accentInk,
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 500,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Leggo il file…" : "Carica export (.xlsx / .csv)"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={busy} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: 12.5, color: CP.textMuted, flex: 1, minWidth: 180 }}>
          Da Infloww: Analytics → Message dashboard → filtra un operatore → Export.
        </span>
      </div>

      {msg && (
        <div
          style={{
            fontSize: 13,
            color: msg.ok ? CP.accentGreen : CP.accentRed,
            background: CP.surface,
            border: `1px solid ${msg.ok ? `${CP.accentGreen}44` : `${CP.accentRed}55`}`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          {msg.text}
        </div>
      )}

      {error ? (
        <div style={{ marginTop: 8, padding: "20px 24px", background: CP.surface, border: `1px solid ${CP.accentRed}55`, borderRadius: 12, color: CP.accentRed, fontSize: 14 }}>
          Impossibile caricare i profili: {error.message}.
        </div>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14, marginTop: 8 }}>Carico i profili accumulati…</div>
      ) : profiles.length === 0 ? (
        <div style={{ marginTop: 8, padding: "22px 24px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, color: CP.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>Ancora nessun profilo</div>
          Carica il primo export per operatore. La copertura cresce a ogni file: ogni operatore caricato appare qui, e
          un nuovo upload dello stesso operatore ne aggiorna i numeri.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "8px 0 12px" }}>
            <input placeholder="Cerca operatore…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, minWidth: 200 }} />
            <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: "auto" }}>
              {profiles.length} operatori · aggiornato {data?.updated_at ? new Date(data.updated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}
            </span>
            <button onClick={clearAll} style={{ background: "transparent", color: CP.textMuted, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer" }}>
              Svuota
            </button>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
              <thead>
                <tr style={{ background: CP.surface, color: CP.textMuted, textAlign: "left" }}>
                  <th style={th}>Operatore</th>
                  <th style={thR}>Messaggi</th>
                  <th style={thR}>Tasso domande</th>
                  <th style={thR}>Prezzo PPV</th>
                  <th style={thR}>Quota PPV</th>
                  <th style={thR}>Periodo</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.operator} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                    <td style={{ ...td, color: CP.textPrimary, fontWeight: 500 }}>{p.operator}</td>
                    <td style={tdR}>{p.msgs.toLocaleString("it-IT")}</td>
                    <td style={tdR}>{pct(p.question_rate)}</td>
                    <td style={tdR}>{usd(p.avg_ppv_price)}</td>
                    <td style={tdR}>{pct(p.ppv_share)}</td>
                    <td style={{ ...tdR, color: CP.textMuted, fontSize: 12 }}>
                      {p.period ? `${fmtDate(p.period.from)}–${fmtDate(p.period.to)}` : "—"}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...td, color: CP.textMuted }}>Nessun operatore con questo filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 14, lineHeight: 1.6 }}>
            Segnali count-based affidabili da questo export: tasso di domande, prezzo medio PPV, quota di messaggi che
            sono PPV. La <strong>cadenza-per-ora</strong> non è calcolabile qui (l&apos;export non porta le ore lavorate).
            Validato: i segnali da Infloww correlano 0.78 col warehouse sul tasso di domande.
          </p>
        </>
      )}
    </div>
  );
}

const th = { padding: "10px 12px", fontWeight: 500, whiteSpace: "nowrap" };
const thR = { ...th, textAlign: "right" };
const td = { padding: "9px 12px" };
const tdR = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
