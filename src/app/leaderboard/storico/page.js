"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

const GOLD = "#FFD700";
const SILVER = "#C0C0C0";
const BRONZE = "#CD7F32";

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

const Breadcrumb = () => (
  <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
    <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
    <span style={{ color: CP.textMuted }}>›</span>
    <Link href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Ladder</Link>
    <span style={{ color: CP.textMuted }}>›</span>
    <span style={{ color: CP.textPrimary }}>Hall of Fame</span>
  </div>
);

export default function HallOfFamePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard/history?limit=26")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const snaps = data?.snapshots || [];
  const hof = data?.hallOfFame || [];

  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1100, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={<Breadcrumb />}
        section="Albo storico"
        title="🏛️ Hall of Fame"
        subtitle="I campioni settimana per settimana — top 3 della Academy + champions per ogni skill."
      />

      {loading && <p style={{ color: CP.textSecondary }}>Caricamento…</p>}

      {!loading && snaps.length === 0 && (
        <CpCard padding="28px" style={{ textAlign: "center", color: CP.textSecondary }}>
          Nessuno snapshot salvato ancora. Il primo verrà creato al prossimo run settimanale (lunedì notte).
        </CpCard>
      )}

      {/* Hall of Fame — most wins */}
      {hof.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel style={{ marginBottom: 10, display: "block" }}>👑 Più vittorie settimanali</SectionLabel>
          <CpCard accent={GOLD} padding="0">
            {hof.map((h, i) => (
              <div key={h.userId} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 20px",
                borderTop: i === 0 ? "none" : `1px solid ${CP.border}`,
              }}>
                <div style={{ width: 32, textAlign: "center", fontWeight: 700, color: GOLD, fontFamily: FONTS.mono }}>#{i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600 }}>{h.name}</div>
                <div style={{ color: GOLD, fontWeight: 700, fontFamily: FONTS.mono }}>
                  {h.wins} {h.wins === 1 ? "vittoria" : "vittorie"}
                </div>
              </div>
            ))}
          </CpCard>
        </div>
      )}

      {/* Snapshots timeline */}
      {snaps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {snaps.map((s) => (
            <CpCard key={s.weekKey} padding="18px 22px">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: FONTS.display }}>{s.weekKey}</div>
                <div style={{ color: CP.textMuted, fontSize: 12 }}>
                  {fmtRange(s.periodStart, s.periodEnd)} · {s.totalQualifying} qualificati · {s.totalSessions} sessioni
                </div>
              </div>

              {/* Podium top 3 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                {s.top3.map((e, i) => {
                  const color = [GOLD, SILVER, BRONZE][i];
                  const medal = ["🥇", "🥈", "🥉"][i];
                  return (
                    <div key={e.userId} style={{
                      padding: "10px 12px",
                      background: `${color}15`,
                      border: `1px solid ${color}55`,
                      borderRadius: 8,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 20 }}>{medal}</span>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                        <div style={{ color: CP.textMuted, fontSize: 11 }}>{e.sessions} sess.</div>
                      </div>
                      <div style={{ fontWeight: 700, color, fontFamily: FONTS.mono }}>{e.overall}</div>
                    </div>
                  );
                })}
              </div>

              {/* Skill champions */}
              {Object.keys(s.skillChampions || {}).length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", color: CP.accentGreen, fontSize: 12, fontWeight: 600 }}>
                    Campioni per skill ({Object.keys(s.skillChampions).length})
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 10 }}>
                    {Object.entries(s.skillChampions).map(([k, v]) => (
                      <div key={k} style={{
                        padding: "8px 10px",
                        background: CP.surfaceAlt,
                        border: `1px solid ${CP.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                      }}>
                        <div style={{ color: CP.textMuted, fontSize: 10, letterSpacing: "0.08em", fontFamily: FONTS.mono, fontWeight: 700 }}>
                          {SKILL_LABELS[k] || k}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontWeight: 600 }}>{v.name}</span>
                          <span style={{ fontWeight: 700, color: CP.accentGreen, fontFamily: FONTS.mono }}>{v.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CpCard>
          ))}
        </div>
      )}
    </div>
  );
}
