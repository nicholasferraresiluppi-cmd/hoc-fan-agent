"use client";

// Hall of Fame (redesign 26/09/2026 sul design system).
// Stessa API (/api/leaderboard/history?limit=26) e stessi contenuti: chi ha
// vinto più settimane, e per ogni settimana il podio + i migliori per abilità.
// Tolti: medaglie emoji e colori oro/argento/bronzo scritti a mano (non erano
// token e non seguivano il tema); la posizione resta scritta (1°, 2°, 3°).
import { useEffect, useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, SectionTitle, Disclosure, Notice, card, NUM } from "@/components/ds";

const SKILL_LABELS = {
  naturalezza: "Naturalezza",
  esclusivita: "Esclusività",
  dipendenza: "Dipendenza",
  conversione: "Conversione",
  tono: "Tono creator",
  gestione_obiezioni: "Gestione obiezioni",
};

function fmtRange(startMs, endMs) {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const opt = { day: "2-digit", month: "short" };
  return `${s.toLocaleDateString("it-IT", opt)} → ${e.toLocaleDateString("it-IT", opt)}`;
}

function WeekCard({ s }) {
  const [open, setOpen] = useState(false);
  const skills = Object.entries(s.skillChampions || {});
  return (
    <section style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ fontWeight: 500, fontSize: 15, color: CP.textPrimary }}>Settimana {s.weekKey}</div>
        <div style={{ color: CP.textMuted, fontSize: 13, ...NUM }}>
          {fmtRange(s.periodStart, s.periodEnd)} · {fmtInt(s.totalQualifying)} in classifica · {fmtInt(s.totalSessions)} sessioni
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}>
        {s.top3.map((e, i) => (
          <div key={e.userId} style={{
            padding: "10px 12px",
            background: i === 0 ? CP.accentSoft : CP.surfaceAlt,
            borderRadius: 8,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 13, color: i === 0 ? CP.accentSoftText : CP.textMuted, width: 22, ...NUM }}>{i + 1}°</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
              <div style={{ color: CP.textMuted, fontSize: 12, ...NUM }}>{fmtInt(e.sessions)} {e.sessions === 1 ? "sessione" : "sessioni"}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, ...NUM }}>{e.overall}</div>
          </div>
        ))}
      </div>

      {skills.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Disclosure open={open} onToggle={() => setOpen((o) => !o)} title={`I migliori per abilità (${skills.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
              {skills.map(([k, v]) => (
                <div key={k} style={{ padding: "8px 10px", background: CP.surfaceAlt, borderRadius: 6 }}>
                  <div style={{ color: CP.textMuted, fontSize: 12 }}>{SKILL_LABELS[k] || k}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2, fontSize: 14 }}>
                    <span style={{ color: CP.textPrimary }}>{v.name}</span>
                    <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{v.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      )}
    </section>
  );
}

export default function HallOfFamePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard/history?limit=26")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setFailed(true); setLoading(false); });
  }, []);

  const snaps = data?.snapshots || [];
  const hof = data?.hallOfFame || [];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Academy", href: "/" }, { label: "Ladder", href: "/leaderboard" }, { label: "Hall of Fame" }]}
        title="Hall of Fame"
        subtitle="L'albo degli allenamenti, settimana per settimana: i primi tre dell'Academy e chi ha fatto meglio su ogni abilità."
      />

      {loading && <Notice>Caricamento dell'albo…</Notice>}
      {!loading && failed && <Notice danger>Non riesco a caricare l'albo. Riprova tra poco.</Notice>}

      {!loading && !failed && snaps.length === 0 && (
        <Notice>Nessuna settimana salvata ancora. La prima viene registrata al prossimo giro settimanale, il lunedì notte.</Notice>
      )}

      {hof.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle aside="quante settimane ha chiuso al primo posto">Più vittorie settimanali</SectionTitle>
          <div style={{ ...card, overflow: "hidden" }}>
            {hof.map((h, i) => (
              <div key={h.userId} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "11px 16px",
                borderTop: i === 0 ? "none" : `1px solid ${CP.borderSoft}`,
              }}>
                <div style={{ width: 28, color: CP.textMuted, fontSize: 13, ...NUM }}>{i + 1}°</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: CP.textPrimary }}>{h.name}</div>
                <div style={{ fontSize: 14, color: CP.textPrimary, ...NUM }}>
                  {h.wins} {h.wins === 1 ? "vittoria" : "vittorie"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {snaps.length > 0 && (
        <>
          <SectionTitle>Settimana per settimana</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {snaps.map((s) => <WeekCard key={s.weekKey} s={s} />)}
          </div>
        </>
      )}
    </div>
  );
}
