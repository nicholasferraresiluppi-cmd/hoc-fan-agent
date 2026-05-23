"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

const TIER_ORDER = ["diamond", "platinum", "gold", "silver", "bronze"];
const TIER_META = {
  diamond:  { label: "Diamond",  emoji: "💎", color: "#60A5FA" },
  platinum: { label: "Platinum", emoji: "💠", color: "#E5E4E2" },
  gold:     { label: "Gold",     emoji: "🥇", color: "#FFD700" },
  silver:   { label: "Silver",   emoji: "🥈", color: "#C0C0C0" },
  bronze:   { label: "Bronze",   emoji: "🥉", color: "#CD7F32" },
  unranked: { label: "Unranked", emoji: "⚪", color: CP.textMuted },
};

const Breadcrumb = () => (
  <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
    <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
    <span style={{ color: CP.textMuted }}>›</span>
    <Link href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Ladder</Link>
    <span style={{ color: CP.textMuted }}>›</span>
    <span style={{ color: CP.textPrimary }}>Leghe</span>
  </div>
);

export default function LeaguesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/leagues/standings");
        const j = await r.json();
        setData(j);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1200, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={<Breadcrumb />}
        section={`Stagione ${data?.seasonKey || "…"}`}
        title="Leghe"
        subtitle="Ladder competitiva mensile. Tier assegnato per percentile (top 10% Diamond, poi Platinum/Gold/Silver/Bronze). Min 5 sessioni nel mese per essere classificati."
      />

      {loading && <p style={{ color: CP.textSecondary }}>Caricamento…</p>}

      {data && !loading && data.totalRanked === 0 && (
        <CpCard padding="28px" style={{ textAlign: "center", color: CP.textSecondary }}>
          Nessun operatore classificato in questa stagione. Servono almeno 5 sessioni nel mese.
        </CpCard>
      )}

      {data && data.totalRanked > 0 && (
        <div style={{ display: "grid", gap: 16 }}>
          {TIER_ORDER.map((tier) => {
            const entries = data.byTier?.[tier] || [];
            if (!entries.length) return null;
            const meta = TIER_META[tier];
            return (
              <CpCard key={tier} accent={meta.color} padding="20px 24px">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                  <h2 style={{ margin: 0, color: meta.color, fontSize: 18, fontFamily: FONTS.display, fontWeight: 700, letterSpacing: "-0.01em" }}>{meta.label}</h2>
                  <span style={{ color: CP.textMuted, fontSize: 12, fontFamily: FONTS.mono }}>({entries.length})</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>#</th>
                      <th style={th}>Operatore</th>
                      <th style={th}>Avg</th>
                      <th style={th}>Sessioni</th>
                      <th style={th}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const isMe = e.userId === data.me;
                      return (
                        <tr key={e.userId} style={{ background: isMe ? `${meta.color}25` : "transparent", borderBottom: `1px solid ${CP.border}` }}>
                          <td style={{ ...td, color: CP.textMuted, fontFamily: FONTS.mono }}>{e.rank ?? "—"}</td>
                          <td style={{ ...td, fontWeight: isMe ? 700 : 500 }}>
                            {e.name}
                            {isMe && <span style={{ marginLeft: 8, color: meta.color, fontSize: 11 }}>(tu)</span>}
                          </td>
                          <td style={{ ...td, fontFamily: FONTS.mono }}>{e.avgOverall}</td>
                          <td style={{ ...td, fontFamily: FONTS.mono, color: CP.textSecondary }}>{e.sessions}</td>
                          <td style={td}>
                            {e.delta == null ? (
                              <span style={{ color: CP.textMuted }}>—</span>
                            ) : e.delta > 0 ? (
                              <span style={{ color: CP.accentGreen, fontFamily: FONTS.mono }}>↑ +{e.delta}</span>
                            ) : e.delta < 0 ? (
                              <span style={{ color: CP.accentRed, fontFamily: FONTS.mono }}>↓ {e.delta}</span>
                            ) : (
                              <span style={{ color: CP.textMuted }}>=</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CpCard>
            );
          })}

          {(data.byTier?.unranked || []).length > 0 && (
            <div style={{ color: CP.textMuted, fontSize: 12, padding: "8px 4px" }}>
              <SectionLabel>{data.byTier.unranked.length} operatori non classificati</SectionLabel>
              <span style={{ marginLeft: 8 }}>(meno di 5 sessioni questo mese)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const th = { textAlign: "left", padding: "10px 12px", color: CP.textMuted, fontFamily: FONTS.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, borderBottom: `1px solid ${CP.borderStrong}` };
const td = { padding: "10px 12px" };
