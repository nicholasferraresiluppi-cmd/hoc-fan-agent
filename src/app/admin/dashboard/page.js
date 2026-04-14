"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import AdminNav from "@/components/AdminNav";
import PlayerCard from "@/components/PlayerCard";
import { COLORS } from "@/lib/brand";

const C = {
  bgDark: COLORS.obsidian,
  orange: COLORS.champagne,
  purple: COLORS.cobalt,
  green: COLORS.verdant,
  red: COLORS.signal,
  yellow: COLORS.champagneDeep,
  white: COLORS.alabaster,
  gray: COLORS.mist,
};

const SKILLS = [
  { key: "naturalezza", label: "Nat." },
  { key: "esclusivita", label: "Escl." },
  { key: "dipendenza", label: "Dip." },
  { key: "conversione", label: "Conv." },
  { key: "tono", label: "Tono" },
  { key: "gestione_obiezioni", label: "Obiez." },
];

function Sparkline({ data, width = 100, height = 24, color = C.orange }) {
  if (!data || data.length === 0) {
    return <span style={{ color: C.gray, fontSize: "0.75rem" }}>—</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function skillColor(v) {
  if (v === null || v === undefined) return `${C.gray}20`;
  if (v >= 75) return `${C.green}40`;
  if (v >= 60) return `${C.yellow}40`;
  return `${C.red}40`;
}

export default function SMDashboard() {
  const { isLoaded, user } = useUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cardOp, setCardOp] = useState(null);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.operators) setError(d.error);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [isLoaded]);

  if (loading) {
    return (
      <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
        Caricamento dashboard...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
        <h1>Dashboard SM</h1>
        <p style={{ color: C.red }}>Errore: {error}</p>
      </div>
    );
  }

  const operators = data?.operators || [];
  const alerts = data?.alerts || [];
  const heatmap = data?.heatmap || [];

  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>Dashboard SM</h1>
          <p style={{ color: C.gray, margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            {operators.length} operatori · {data?.totalRecords || 0} sessioni · media cohort {data?.cohortAvg || 0}/100
          </p>
        </div>
        <a href="/" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>
          ← Home
        </a>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div
          style={{
            background: `${C.red}10`,
            border: `1px solid ${C.red}`,
            borderRadius: "0.75rem",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.75rem 0", color: C.red, fontSize: "1rem" }}>
            ⚠ Operatori a rischio ({alerts.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ fontSize: "0.88rem", display: "flex", gap: "0.75rem" }}>
                <span style={{
                  padding: "0.1rem 0.5rem",
                  background: a.severity === "high" ? C.red : C.yellow,
                  color: C.bgDark,
                  borderRadius: "0.25rem",
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                }}>
                  {a.type.replace("_", " ")}
                </span>
                <span style={{ fontWeight: 700 }}>{a.name}</span>
                <span style={{ color: C.gray }}>— {a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operators table */}
      <div
        style={{
          background: `${C.white}05`,
          border: `1px solid ${C.purple}30`,
          borderRadius: "0.75rem",
          overflow: "hidden",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${C.purple}30` }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Operatori</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ background: `${C.white}08`, textAlign: "left" }}>
              <th style={{ padding: "0.6rem 1.25rem" }}>Nome</th>
              <th style={{ padding: "0.6rem" }}>Sess.</th>
              <th style={{ padding: "0.6rem" }}>7g</th>
              <th style={{ padding: "0.6rem" }}>Media</th>
              <th style={{ padding: "0.6rem" }}>Trend 7/7</th>
              <th style={{ padding: "0.6rem" }}>Sparkline 30g</th>
              {SKILLS.map((s) => (
                <th key={s.key} style={{ padding: "0.6rem", textAlign: "center" }}>
                  {s.label}
                </th>
              ))}
              <th style={{ padding: "0.6rem" }}>Ultima att.</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.userId} onClick={() => setCardOp(op)} style={{ borderTop: `1px solid ${C.purple}20`, cursor: "pointer" }} title="Click per vedere la card FIFA-style">
                <td style={{ padding: "0.6rem 1.25rem", fontWeight: 700 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    {op.name}
                    {op.isTeamLead && (
                      <span
                        title={op.teamId ? `Team Lead · ${op.teamId}` : "Team Lead"}
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "999px",
                          background: `${COLORS.champagne}22`,
                          border: `1px solid ${COLORS.champagne}`,
                          color: COLORS.champagne,
                          letterSpacing: "0.03em",
                        }}
                      >
                        ⭐ LEAD
                      </span>
                    )}
                    {op.role === "qa_reviewer" && (
                      <span
                        title="QA Reviewer"
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "999px",
                          background: `${COLORS.champagneDeep}22`,
                          border: `1px solid ${COLORS.champagneDeep}`,
                          color: COLORS.champagneDeep,
                        }}
                      >
                        🔍 QA
                      </span>
                    )}
                    {op.role === "sales_manager" && (
                      <span
                        title="Sales Manager"
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "999px",
                          background: `${COLORS.cobalt}22`,
                          border: `1px solid ${COLORS.cobalt}`,
                          color: COLORS.cobalt,
                        }}
                      >
                        📊 SM
                      </span>
                    )}
                  </span>
                </td>
                <td style={{ padding: "0.6rem" }}>{op.totalSessions}</td>
                <td style={{ padding: "0.6rem" }}>{op.sessions7d}</td>
                <td style={{ padding: "0.6rem", fontWeight: 700, color: op.avgOverall >= 70 ? C.green : op.avgOverall >= 55 ? C.yellow : C.red }}>
                  {op.avgOverall}
                </td>
                <td style={{ padding: "0.6rem", color: op.trend === null ? C.gray : op.trend >= 0 ? C.green : C.red }}>
                  {op.trend === null ? "—" : `${op.trend > 0 ? "+" : ""}${op.trend}`}
                </td>
                <td style={{ padding: "0.6rem" }}>
                  <Sparkline data={op.sparkline} color={op.trend === null ? C.gray : op.trend >= 0 ? C.green : C.red} />
                </td>
                {SKILLS.map((s) => (
                  <td
                    key={s.key}
                    style={{
                      padding: "0.4rem",
                      textAlign: "center",
                      background: skillColor(op.skills[s.key]),
                    }}
                  >
                    {op.skills[s.key] ?? "—"}
                  </td>
                ))}
                <td style={{ padding: "0.6rem", color: C.gray }}>
                  {op.lastActivityDaysAgo === null ? "—" : op.lastActivityDaysAgo === 0 ? "oggi" : `${op.lastActivityDaysAgo}g fa`}
                </td>
              </tr>
            ))}
            {operators.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "2rem", textAlign: "center", color: C.gray }}>
                  Nessuna sessione ancora registrata. Gli operatori devono completare scenari con valutazione.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Heatmap skill x creator */}
      {heatmap.length > 0 && (
        <div
          style={{
            background: `${C.white}05`,
            border: `1px solid ${C.purple}30`,
            borderRadius: "0.75rem",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${C.purple}30` }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Heatmap skill × creator</h3>
            <p style={{ margin: "0.25rem 0 0 0", color: C.gray, fontSize: "0.8rem" }}>
              Dove la cohort è più debole — individua training mirato per creator.
            </p>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: `${C.white}08`, textAlign: "left" }}>
                <th style={{ padding: "0.6rem 1.25rem" }}>Creator</th>
                <th style={{ padding: "0.6rem" }}>Sess.</th>
                {SKILLS.map((s) => (
                  <th key={s.key} style={{ padding: "0.6rem", textAlign: "center" }}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.map((h) => (
                <tr key={h.creatorId} style={{ borderTop: `1px solid ${C.purple}20` }}>
                  <td style={{ padding: "0.6rem 1.25rem", fontWeight: 700 }}>{h.creatorName}</td>
                  <td style={{ padding: "0.6rem", color: C.gray }}>{h.totalSessions}</td>
                  {SKILLS.map((s) => (
                    <td
                      key={s.key}
                      style={{
                        padding: "0.4rem",
                        textAlign: "center",
                        background: skillColor(h.avg[s.key]),
                        fontWeight: 700,
                      }}
                    >
                      {h.avg[s.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
        <a href="/admin/review" style={{ color: C.orange, fontSize: "0.85rem", textDecoration: "none" }}>
          → Review valutazioni
        </a>
        <a href="/admin/outcomes" style={{ color: C.orange, fontSize: "0.85rem", textDecoration: "none" }}>
          → Outcomes revenue
        </a>
        <a href="/admin/creators" style={{ color: C.orange, fontSize: "0.85rem", textDecoration: "none" }}>
          → Creator personas
        </a>
      </div>

      {/* Player Card Modal */}
      {cardOp && (() => {
        const POS = { operator: "OP", team_lead: "TL", sales_manager: "SM", qa_reviewer: "QA", admin: "AD" };
        const leagueByScore = cardOp.avgOverall >= 85 ? "diamond" : cardOp.avgOverall >= 75 ? "platinum" : cardOp.avgOverall >= 65 ? "gold" : cardOp.avgOverall >= 50 ? "silver" : "bronze";
        const pos = (cardOp.role && POS[cardOp.role]) ? POS[cardOp.role] : (cardOp.role?.startsWith("c:") ? "CR" : "OP");
        return (
          <div onClick={() => setCardOp(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}>
            <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
              <button onClick={() => setCardOp(null)} style={{
                position: "absolute", top: -38, right: 0,
                background: "transparent", border: `1px solid ${C.white}40`, color: C.white,
                borderRadius: 8, padding: "0.25rem 0.6rem", cursor: "pointer", fontSize: "0.8rem",
              }}>Chiudi ✕</button>
              <PlayerCard
                name={cardOp.name}
                position={pos}
                overall={cardOp.avgOverall}
                skills={cardOp.skills || {}}
                league={leagueByScore}
                seniority={cardOp.avgOverall >= 75 ? "master" : cardOp.avgOverall >= 60 ? "senior" : "junior"}
                certifications={[]}
                totalSessions={cardOp.totalSessions}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
