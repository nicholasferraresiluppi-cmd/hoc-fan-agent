"use client";

// Infloww ingest — carica un export Message Dashboard (scoped per-operatore per via
// del tetto 500k di Infloww) e accumula i profili-segnali. Il file è parsato e i
// segnali calcolati QUI nel browser: solo gli aggregati (nessun messaggio) vanno al
// server. Estende la copertura ai turni in duo, che il warehouse non attribuisce.

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Upload, Loader2, CheckCircle2, Lock, Trash2, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, DataTable, card } from "@/components/ds";
import { fmtInt } from "@/lib/format";
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

  // Redesign 26/09/2026 (pannello tester BOARD/UX): titolo e testi in gergo
  // ("ingest", "scoped", "count-based", "warehouse"), nessuna indicazione di dove
  // finiscono i numeri, e nessun segnale che un file è vecchio (il profilo-segnali
  // depotenzia gli export con fine periodo oltre 45 giorni). Lettura del file e
  // calcolo nel browser invariati.
  const STALE_DAYS = 45;
  const ageDays = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
  const rows = shown.map((p) => ({ ...p, id: p.operator, age: ageDays(p.period?.to) }));
  const staleCount = profiles.filter((p) => { const a = ageDays(p.period?.to); return a != null && a > STALE_DAYS; }).length;

  const columns = [
    { key: "operator", label: "Operatore", render: (p) => <span style={{ fontWeight: 500 }}>{p.operator}</span> },
    { key: "msgs", label: "Messaggi", align: "right", render: (p) => fmtInt(p.msgs) },
    { key: "question_rate", label: "Messaggi con domanda", align: "right", render: (p) => pct(p.question_rate) },
    { key: "avg_ppv_price", label: "Prezzo medio PPV", align: "right", render: (p) => usd(p.avg_ppv_price) },
    { key: "ppv_share", label: "Messaggi che sono PPV", align: "right", render: (p) => pct(p.ppv_share) },
    { key: "period", label: "Periodo del file", align: "right", sort: (p) => (p.period?.to ? new Date(p.period.to).getTime() : null), render: (p) => (
      <span style={{ color: CP.textMuted, fontSize: 13 }}>
        {p.period ? `${fmtDate(p.period.from)}–${fmtDate(p.period.to)}` : "—"}
        {p.age != null && p.age > STALE_DAYS && <span style={{ marginLeft: 6, color: CP.textSecondary }}>· vecchio</span>}
      </span>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Carica export Infloww" }]}
        title="Carica export Infloww"
        subtitle="Aggiunge al profilo-segnali degli operatori anche i turni in coppia, che il warehouse non sa attribuire a una persona. Carichi l'export dei messaggi di un operatore: servono per il coaching, non entrano nello score."
        actions={<Link href="/admin/operator-signals" style={{ ...btnGhost, textDecoration: "none" }}>Profilo-segnali <ArrowRight size={13} /></Link>}
      />

      <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: CP.accent, color: CP.accentInk, borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 500, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.75 : 1 }}>
            {busy ? <><Loader2 size={15} className="animate-spin" /> Leggo il file…</> : <><Upload size={15} /> Carica export (.xlsx o .csv)</>}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={busy} style={{ display: "none" }} />
          </label>
          <div style={{ flex: "1 1 280px", fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
            In Infloww: Analytics → Message dashboard → filtra <span style={{ color: CP.textPrimary }}>un solo operatore</span> → Export.
            <div style={{ fontSize: 12, color: CP.textMuted }}>Un operatore per file: l&apos;export di Infloww si ferma a circa 500.000 messaggi, con tutti gli operatori insieme copre solo pochi giorni.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}`, fontSize: 12, color: CP.textMuted, lineHeight: 1.5 }}>
          <Lock size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          Il file viene letto nel tuo browser: a HOC Pro arrivano solo i totali per operatore, mai i messaggi. Ricaricare lo stesso operatore ne aggiorna i numeri.
        </div>
      </section>

      {msg && (
        msg.ok ? (
          <section style={{ ...card, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: CP.textPrimary, lineHeight: 1.5 }}>
            <CheckCircle2 size={16} color={CP.accentGreen} style={{ flexShrink: 0, marginTop: 1 }} /> {msg.text}
          </section>
        ) : (
          <Notice danger><span style={{ color: CP.textPrimary }}>File non caricato.</span> {msg.text}</Notice>
        )
      )}

      {error ? (
        <Notice danger>Non riesco a leggere i profili già caricati: {error.message}. Riprova tra poco.</Notice>
      ) : isLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 14 }}><Loader2 size={15} className="animate-spin" /> Carico i profili già caricati…</div>
      ) : profiles.length === 0 ? (
        <section style={{ ...card, padding: "20px 20px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>Ancora nessun operatore caricato</div>
          Carica il primo export. La copertura cresce a ogni file: ogni operatore caricato appare qui e nel suo profilo-segnali.
        </section>
      ) : (
        <>
          <SectionTitle aside={`${profiles.length} operatori · ultimo caricamento ${data?.updated_at ? new Date(data.updated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}`}>Operatori caricati</SectionTitle>
          {staleCount > 0 && (
            <Notice>{staleCount === 1 ? "1 operatore ha" : `${staleCount} operatori hanno`} un file che finisce più di {STALE_DAYS} giorni fa (“vecchio” in tabella): nel profilo-segnali il confronto non accende avvisi finché non carichi un export più recente.</Notice>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 10px" }}>
            <input placeholder="Cerca operatore…" aria-label="Cerca operatore" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...ctl, minWidth: 220 }} />
            <div style={{ flex: 1 }} />
            <button onClick={clearAll} style={{ ...btnGhost, color: CP.accentRed }}>
              <Trash2 size={13} /> Svuota tutto
            </button>
          </div>

          <DataTable columns={columns} rows={rows} minWidth={720} maxHeight={600} empty="Nessun operatore con questo filtro." />

          <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 12, lineHeight: 1.6 }}>
            Da questo export si ricavano in modo affidabile solo i conteggi: quanti messaggi fanno una domanda, il prezzo medio dei PPV (contenuti a pagamento) e quanti messaggi sono PPV.
            Il ritmo per ora non si può calcolare qui, perché l&apos;export non contiene le ore lavorate. Controllo fatto: sui messaggi con domanda, questi numeri concordano bene con quelli del warehouse (correlazione 0,78).
          </p>
        </>
      )}
    </div>
  );
}

const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" };
