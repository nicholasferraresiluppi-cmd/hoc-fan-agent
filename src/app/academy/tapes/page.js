"use client";

// Game tape — libreria delle azioni di vendita reali (solo tape pubblicati).
// Pattern "call library": si studia la partita vera, non l'esempio inventato.

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import TapeReplay from "@/components/TapeReplay";

const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore di caricamento")))));
const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString("it-IT")}`;

function TapeCard({ tape, open, onToggle }) {
  const title = tape.title || `${tape.creator_name} — ${usd(tape.total)} in ${tape.stats?.buildup_min ?? "?"} minuti`;
  const opLabel =
    tape.attribution === "singolo"
      ? tape.operators?.[0]
      : tape.attribution === "duo"
        ? (tape.operators || []).join(" + ")
        : "turno non attribuito";

  return (
    <div
      style={{
        background: CP.surface,
        border: `1px solid ${open ? CP.accentDim : CP.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "block",
          width: "100%",
          padding: "16px 18px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: CP.accentGreen, fontWeight: 500 }}>{usd(tape.total)}</div>
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, color: CP.textMuted }}>
          <span>{tape.creator_name}</span>
          <span>{opLabel}</span>
          <span>
            {tape.fan}
            {tape.stats?.new_fan === true ? " (nuovo)" : tape.stats?.new_fan === false ? " (abituale)" : ""}
          </span>
          <span>{tape.buys?.length || 1} {tape.buys?.length === 1 ? "acquisto" : "acquisti"}</span>
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px 18px" }}>
          <TapeReplay tape={tape} />
        </div>
      )}
    </div>
  );
}

export default function TapesPage() {
  const { data, error, isLoading } = useSWR("/api/academy/tapes", fetcher);
  const [openId, setOpenId] = useState(null);
  const tapes = data?.tapes || [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Academy"
        title="Game tape"
        subtitle="Azioni di vendita reali, estratte dalle chat che hanno prodotto revenue. Si studia la partita vera: come si costruisce la tensione, quando si presenta il prezzo, cosa succede dopo lo sblocco."
      />

      {error ? (
        <div
          style={{
            padding: "20px 24px",
            background: CP.surface,
            border: `1px solid ${CP.accentRed}55`,
            borderRadius: 12,
            color: CP.accentRed,
            fontSize: 14,
          }}
        >
          Non riesco a caricare la libreria: {error.message}. Riprova tra poco.
        </div>
      ) : isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Carico la libreria…</div>
      ) : tapes.length === 0 ? (
        <div
          style={{
            padding: "28px 24px",
            background: CP.surface,
            border: `1px solid ${CP.border}`,
            borderRadius: 12,
            color: CP.textSecondary,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>
            Nessun tape pubblicato per ora
          </div>
          I game tape sono conversazioni reali selezionate dal team: le migliori azioni di vendita del
          periodo, con i momenti di acquisto in evidenza e le note del coach. Appena il primo tape viene
          pubblicato lo trovi qui.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tapes.map((t) => (
            <TapeCard key={t.id} tape={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
