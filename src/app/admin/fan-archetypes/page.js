"use client";

// Tipi di fan (redesign 26/09/2026 sul design system).
// È un catalogo di riferimento (dati statici in lib/fan-archetypes): chi allena
// gli operatori lo legge per riconoscere un fan e scegliere come vendergli.
// Per questo: filtro per difficoltà + ricerca, e in ogni scheda l'ordine in cui
// si ragiona in chat (chi è → come lo riconosci → cosa cerca → cosa fare → cosa
// evitare). Le emoji dei tipi e dei titoletti sono state tolte (decorazione).
import { useMemo, useState } from "react";
import { FAN_ARCHETYPES } from "@/lib/fan-archetypes";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, FilterChip, Notice, card } from "@/components/ds";

const band = (d) => (d <= 2 ? "facile" : d === 3 ? "medio" : "difficile");
const BAND_LABEL = { facile: "Facile", medio: "Medio", difficile: "Difficile" };

export default function FanArchetypesPage() {
  const [diff, setDiff] = useState("");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const count = (b) => FAN_ARCHETYPES.filter((a) => band(a.difficulty) === b).length;
  const rows = useMemo(
    () => FAN_ARCHETYPES.filter((a) => (!diff || band(a.difficulty) === diff)
      && (!needle || `${a.name} ${a.profile} ${(a.signals || []).join(" ")}`.toLowerCase().includes(needle))),
    [diff, needle]
  );

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "Tipi di fan" }]}
        title="Tipi di fan"
        subtitle={`${FAN_ARCHETYPES.length} tipi di fan ricorrenti nelle chat reali. Servono a riconoscere chi hai davanti e a scegliere come vendergli: il simulatore li usa per variare gli scenari e la valutazione per giudicare la strategia.`}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <FilterChip label={`Tutti (${FAN_ARCHETYPES.length})`} active={!diff} onClick={() => setDiff("")} />
        {["facile", "medio", "difficile"].map((b) => (
          <FilterChip key={b} label={`${BAND_LABEL[b]} (${count(b)})`} active={diff === b} disabled={!count(b)} onClick={() => setDiff(diff === b ? "" : b)} />
        ))}
        <span style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o segnale" aria-label="Cerca tipo di fan"
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, width: 240, maxWidth: "100%" }} />
      </div>

      {rows.length === 0 ? (
        <Notice>Nessun tipo di fan corrisponde alla ricerca. Togli il filtro o prova un’altra parola.</Notice>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
          {rows.map((a) => (
            <article key={a.id} style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{a.name}</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: CP.textSecondary, whiteSpace: "nowrap" }}>
                  {BAND_LABEL[band(a.difficulty)]} · difficoltà {a.difficulty}/5
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.5 }}>{a.profile}</p>

              <Block title="Come lo riconosci">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(a.signals || []).map((s, i) => (
                    <span key={i} style={{ padding: "3px 9px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textPrimary, fontSize: 12.5 }}>{s}</span>
                  ))}
                </div>
              </Block>
              <Block title="Cosa cerca davvero">{a.emotional_need}</Block>
              <Block title="Cosa fare">{a.conversion_strategy}</Block>
              <Block title="Cosa evitare" danger>{a.avoid}</Block>

              <div style={{ marginTop: "auto", paddingTop: 12 }}>
                <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 12, color: CP.textMuted }}>
                  <span>Quanto vale nel tempo: <span style={{ color: CP.textSecondary }}>{a.typical_ltv}</span></span>
                  <span title="Identificativo usato da scenari e valutazioni">id {a.id}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Block({ title, danger, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12.5, color: danger ? CP.accentRed : CP.textMuted, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: CP.textPrimary, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
