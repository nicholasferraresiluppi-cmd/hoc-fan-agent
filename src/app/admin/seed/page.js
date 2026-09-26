"use client";

// Dati demo dell'Academy.
// Ridisegno 26/09/2026 (design system): avviso esplicito che i dati finti
// finiscono nella classifica Academy VERA (la vedono anche gli operatori, che
// entrano nell'app da questa settimana); azioni con parole al posto di emoji e
// colori pieni; il resoconto tecnico dell'API resta disponibile ma chiuso.
// API, azioni e conferme invariate.

import { useState } from "react";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, Disclosure, card } from "@/components/ds";

export default function SeedAdminPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [rawOpen, setRawOpen] = useState(false);

  const run = async (action) => {
    if (action === "clear" && !confirm("Sicuro di voler cancellare tutti i dati demo?")) return;
    if (action === "reseed" && !confirm("Questo cancella i dati demo esistenti e li ricrea. Confermi?")) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/admin/seed-leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || "Errore");
      else setResult(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const btn = (primary, danger) => ({
    padding: "9px 16px",
    borderRadius: 8,
    border: `1px solid ${primary ? CP.accent : CP.border}`,
    background: primary ? CP.accent : CP.surface,
    color: primary ? CP.accentInk : danger ? CP.accentRed : CP.textPrimary,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: FONTS.body,
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.6 : 1,
  });
  const actionLabel = { seed: "Dati demo creati", reseed: "Dati demo ricreati", clear: "Dati demo cancellati" };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 900, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Dati demo" }]}
        title="Dati demo dell'Academy"
        subtitle="Riempie la classifica dell'Academy con 10 operatori finti e circa 60 giorni di sessioni di allenamento, più 3 settimane storiche nella Hall of Fame. Serve per mostrare l'Academy a qualcuno quando i dati veri sono pochi."
      />

      <Notice danger>
        I dati finti entrano nella classifica Academy <b style={{ fontWeight: 500 }}>vera</b>, quella che vedono tutti, operatori compresi. Usali solo per una demo e poi cancellali con «Cancella i dati demo».
      </Notice>

      <section style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
        <SectionTitle>Chi sono gli operatori finti</SectionTitle>
        <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.7 }}>
          Giorgia (forte su esclusività e dipendenza) · Martina (conversione) · Alessia (naturalezza) · Sara (dipendenza) · Elena · Chiara · Federica · Valentina · Ilaria · Roberta (meno attiva). I nomi finiscono con l&apos;iniziale del cognome (es. «Giorgia R.»).
        </div>
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => run("seed")} disabled={loading} style={btn(true)}>Crea i dati demo</button>
        <button onClick={() => run("reseed")} disabled={loading} style={btn(false)}>Ricrea da capo</button>
        <button onClick={() => run("clear")} disabled={loading} style={btn(false, true)}>Cancella i dati demo</button>
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>«Ricrea da capo» cancella i dati demo e li genera di nuovo. I dati veri non vengono toccati.</div>

      {loading && <div style={{ marginTop: 16, color: CP.textMuted, fontSize: 14 }}>In corso… (può richiedere 10-30 secondi)</div>}

      {error && <div style={{ marginTop: 16 }}><Notice danger>{error}</Notice></div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...card, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 8 }}>{actionLabel[result.action] || `Fatto: ${result.action}`}.</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <Link href="/leaderboard" style={{ color: CP.accentSoftText }}>Classifica Academy →</Link>
              <Link href="/leaderboard/storico" style={{ color: CP.accentSoftText }}>Hall of Fame →</Link>
              <Link href="/admin/dashboard" style={{ color: CP.accentSoftText }}>Dashboard SM →</Link>
            </div>
          </div>
          <Disclosure open={rawOpen} onToggle={() => setRawOpen((v) => !v)} title="Dettaglio tecnico" summary="la risposta completa del server">
            <pre style={{ color: CP.textSecondary, fontSize: 12, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(result, null, 2)}</pre>
          </Disclosure>
        </div>
      )}
    </div>
  );
}
