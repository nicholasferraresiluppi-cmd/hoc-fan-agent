"use client";

// Ladder di allenamento (redesign 26/09/2026 sul design system).
// Stessa API (/api/leaderboard?period&skill) e stessi dati: la propria
// posizione, il podio, il resto dei primi 10. Tolti: medaglie emoji, colori
// oro/argento/bronzo scritti a mano, bagliori animati e ombre (DESIGN.md: flat).
// Il podio resta, piatto: 1°, 2°, 3° scritti, il primo col viola tenue.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, FilterChip, SectionTitle, DataTable, Notice, card, NUM } from "@/components/ds";

const PERIODS = [
  { key: "week", label: "Settimana" },
  { key: "month", label: "Mese" },
  { key: "all", label: "Da sempre" },
];

const SKILLS = [
  { key: "overall", label: "Punteggio complessivo" },
  { key: "naturalezza", label: "Naturalezza" },
  { key: "esclusivita", label: "Esclusività" },
  { key: "dipendenza", label: "Dipendenza" },
  { key: "conversione", label: "Conversione" },
  { key: "tono", label: "Tono creator" },
  { key: "gestione_obiezioni", label: "Gestione obiezioni" },
];

const sessLabel = (n) => `${fmtInt(n ?? 0)} ${n === 1 ? "sessione" : "sessioni"}`;
const meTag = <span style={{ marginLeft: 8, color: CP.accentSoftText, fontSize: 12 }}>tu</span>;

function PodiumCard({ entry, place }) {
  const first = place === 1;
  return (
    <div style={{
      ...card,
      padding: "16px 18px",
      background: first ? CP.accentSoft : CP.surface,
      borderColor: entry?.isMe ? CP.accent : first ? CP.accentSoft : CP.border,
      display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
    }}>
      <div style={{ fontSize: 13, color: first ? CP.accentSoftText : CP.textMuted, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={NUM}>{place}° posto</span>
        {entry?.isMe && <span style={{ color: CP.accentSoftText }}>tu</span>}
      </div>
      <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.15, color: CP.textPrimary, ...NUM }}>{entry?.avg ?? "—"}</div>
      <div style={{ fontSize: 15, color: CP.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry?.name || "—"}</div>
      <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{sessLabel(entry?.sessions)}</div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { isLoaded } = useUser();
  const [period, setPeriod] = useState("week");
  const [skill, setSkill] = useState("overall");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoaded) return;
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}&skill=${skill}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.top10) setError(d.error);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [isLoaded, period, skill]);

  const top10 = data?.top10 || [];
  const me = data?.me;
  const hasPodium = top10.length >= 3;
  const podium = [top10[0], top10[1], top10[2]];
  const rest = hasPodium ? top10.slice(3) : top10;
  const minSessions = data?.minSessions || 2;

  const columns = [
    { key: "rank", label: "#", align: "right", render: (e) => <span style={{ color: CP.textMuted }}>{e.rank}</span> },
    { key: "name", label: "Operatore", render: (e) => <span>{e.name}{e.isMe && meTag}</span> },
    { key: "sessions", label: "Sessioni", align: "right", muted: true },
    { key: "avg", label: "Punteggio medio", align: "right", render: (e) => <span style={{ fontWeight: 500, color: e.avg >= 75 ? CP.accentGreen : CP.textPrimary }}>{e.avg}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Academy", href: "/" }, { label: "Ladder" }]}
        title="Ladder"
        subtitle={`Chi si sta allenando meglio nel simulatore dell'Academy, per punteggio medio delle sessioni. Per entrare servono almeno ${minSessions} sessioni valutate nel periodo.`}
        actions={
          <Link href="/leaderboard/storico" style={{ color: CP.textPrimary, textDecoration: "none", fontSize: 13, padding: "7px 12px", border: `1px solid ${CP.border}`, borderRadius: 10, background: CP.surface }}>
            Hall of Fame →
          </Link>
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18, alignItems: "center" }}>
        {PERIODS.map((p) => (
          <FilterChip key={p.key} label={p.label} active={period === p.key} onClick={() => setPeriod(p.key)} />
        ))}
        <select
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          aria-label="Abilità"
          style={{ padding: "7px 12px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 999, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" }}
        >
          {SKILLS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span style={{ color: CP.textMuted, fontSize: 13, marginLeft: "auto", ...NUM }}>
          {fmtInt(data?.totalQualifying || 0)} in classifica
        </span>
      </div>

      {loading && <Notice>Caricamento della classifica…</Notice>}
      {error && !loading && <Notice danger>Non riesco a caricare la classifica: {error}</Notice>}

      {!loading && !error && (
        <>
          {me && (
            <section style={{ ...card, padding: "18px 22px", marginBottom: 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, justifyContent: "space-between", borderColor: me.rank ? CP.accent : CP.border }}>
              <div>
                <div style={{ fontSize: 13, color: CP.textSecondary }}>La tua posizione</div>
                {me.rank ? (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.2, ...NUM }}>
                      {me.rank}° su {fmtInt(me.totalOperators)}
                    </div>
                    <div style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>
                      punteggio medio {me.avg}/100 · {sessLabel(me.sessions)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 15, color: CP.textPrimary, marginTop: 2 }}>
                    Non ancora in classifica.{me.reason ? ` ${me.reason}` : ""}
                  </div>
                )}
              </div>
              {me.rank && me.percentile != null && (
                <span style={{ padding: "5px 12px", background: CP.accentSoft, color: CP.accentSoftText, borderRadius: 999, fontSize: 13, ...NUM }}>
                  Top {100 - me.percentile + 1}%
                </span>
              )}
            </section>
          )}

          {hasPodium && (
            <>
              <SectionTitle>Podio</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12, marginBottom: 22 }}>
                {podium.map((e, i) => <PodiumCard key={e?.userId || i} entry={e} place={i + 1} />)}
              </div>
            </>
          )}

          {rest.length > 0 && (
            <>
              {hasPodium && <SectionTitle>Gli altri dei primi 10</SectionTitle>}
              <DataTable
                columns={columns}
                rows={rest.map((e) => ({ ...e, id: e.userId }))}
                defaultSort={{ key: "rank", dir: 1 }}
                selected={(e) => e.isMe}
                minWidth={440}
              />
            </>
          )}

          {top10.length === 0 && (
            <Notice>Nessuno in classifica in questo periodo. Servono almeno {minSessions} sessioni con valutazione.</Notice>
          )}
        </>
      )}
    </div>
  );
}
