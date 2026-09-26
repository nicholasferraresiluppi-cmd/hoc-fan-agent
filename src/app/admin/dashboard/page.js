"use client";

// Allenamento operatori (ex "Dashboard SM") — redesign 26/09/2026 sul design system.
// Sono i punteggi del SIMULATORE (training), non le vendite: prima il titolo non
// lo diceva. Numero principale = media del gruppo con quante sessioni la reggono;
// "da guardare" separa i segnali veri (sotto media, in calo) dagli "inattivi",
// che prima riempivano un grande riquadro rosso (11 su 12 erano solo fermi da
// mesi). Tabella ordinabile con le abilità per esteso; rosso solo sul dato
// sotto 60. Tolto il "rombo" per riga: ripeteva le 6 abilità già in colonna (resta
// nella scheda che si apre cliccando l'operatore). API invariata.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { X } from "lucide-react";
import PlayerCard from "@/components/PlayerCard";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, Notice, Disclosure, DataTable, SectionTitle, ActionRow, card, ATTN } from "@/components/ds";

const SKILLS = [
  { key: "naturalezza", label: "Naturalezza" },
  { key: "esclusivita", label: "Esclusività" },
  { key: "dipendenza", label: "Dipendenza" },
  { key: "conversione", label: "Conversione" },
  { key: "tono", label: "Tono" },
  { key: "gestione_obiezioni", label: "Obiezioni" },
];
const LOW = 60;
const ROLE_LABEL = { team_lead: "team lead", qa_reviewer: "QA", sales_manager: "sales manager" };

function Sparkline({ data, width = 90, height = 22 }) {
  if (!data || data.length === 0) return <span style={{ color: CP.textMuted }}>—</span>;
  if (data.length === 1) return <span style={{ color: CP.textMuted, fontSize: 12 }}>1 giorno</span>;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }} aria-label={`Andamento: da ${data[0]} a ${data[data.length - 1]}`}>
      <polyline points={points} fill="none" stroke={CP.accent} strokeWidth="1.5" />
    </svg>
  );
}

const skillCell = (v) => (v == null ? <span style={{ color: CP.textMuted }}>—</span> : <span style={v < LOW ? ATTN : { color: CP.textPrimary }}>{v}</span>);
const ago = (d) => (d == null ? "—" : d === 0 ? "oggi" : d === 1 ? "ieri" : `${d} giorni fa`);

export default function SMDashboard() {
  const { isLoaded } = useUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cardOp, setCardOp] = useState(null);
  const [idleOpen, setIdleOpen] = useState(false);

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

  const operators = data?.operators || [];
  const alerts = data?.alerts || [];
  const heatmap = data?.heatmap || [];

  const signals = alerts.filter((a) => a.type !== "inattivo");
  const idle = alerts.filter((a) => a.type === "inattivo");
  const active7 = operators.filter((o) => o.sessions7d > 0).length;
  const lastDays = useMemo(() => {
    const v = operators.map((o) => o.lastActivityDaysAgo).filter((d) => d != null);
    return v.length ? Math.min(...v) : null;
  }, [operators]);

  const opColumns = [
    {
      key: "name", label: "Operatore", sort: (o) => o.name,
      render: (o) => (
        <span>
          <span style={{ fontWeight: 500 }}>{o.name}</span>
          {(o.isTeamLead || ROLE_LABEL[o.role]) && (
            <span style={{ marginLeft: 8, fontSize: 12, color: CP.textMuted }} title={o.teamId ? `Team ${o.teamId}` : undefined}>
              {o.isTeamLead ? "team lead" : ROLE_LABEL[o.role]}
            </span>
          )}
        </span>
      ),
    },
    { key: "avgOverall", label: "Media", align: "right", render: (o) => <span style={o.avgOverall < 55 ? ATTN : { color: CP.textPrimary, fontWeight: 500 }}>{o.avgOverall}</span> },
    { key: "totalSessions", label: "Sessioni", align: "right" },
    { key: "sessions7d", label: "Ultimi 7 gg", align: "right" },
    {
      key: "trend", label: "Rispetto ai 7 gg prima", align: "right", sort: (o) => o.trend,
      render: (o) => (o.trend == null ? <span style={{ color: CP.textMuted }}>—</span>
        : <span style={o.trend <= -10 ? ATTN : { color: o.trend > 0 ? CP.accentGreen : CP.textPrimary }}>{o.trend > 0 ? "+" : o.trend < 0 ? "−" : ""}{Math.abs(o.trend)} punti</span>),
    },
    { key: "sparkline", label: "Ultimi 30 gg", sortable: false, render: (o) => <Sparkline data={o.sparkline} /> },
    ...SKILLS.map((s) => ({ key: s.key, label: s.label, align: "right", sort: (o) => o.skills?.[s.key], render: (o) => skillCell(o.skills?.[s.key]) })),
    { key: "lastActivityDaysAgo", label: "Ultima sessione", align: "right", sort: (o) => (o.lastActivityDaysAgo == null ? null : -o.lastActivityDaysAgo), render: (o) => <span style={{ color: CP.textSecondary }}>{ago(o.lastActivityDaysAgo)}</span> },
  ];

  const heatColumns = [
    { key: "creatorName", label: "Creator", sort: (h) => h.creatorName || "", render: (h) => h.creatorName || <span style={{ color: CP.textMuted }} title={h.creatorId}>Creator senza nome ({String(h.creatorId).slice(0, 10)})</span> },
    { key: "totalSessions", label: "Sessioni", align: "right" },
    ...SKILLS.map((s) => ({ key: s.key, label: s.label, align: "right", sort: (h) => h.avg?.[s.key], render: (h) => skillCell(h.avg?.[s.key]) })),
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "Allenamento operatori" }]}
        title="Allenamento operatori"
        subtitle="Come vanno gli operatori nel simulatore di chat (non nelle vendite reali): chi si allena, chi è rimasto indietro e su quali abilità conviene lavorare."
      />

      {loading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {!loading && error && !data?.operators && <Notice danger>Non riesco a caricare i dati: {error}. Se il problema resta, apri Alert operativi o avvisa un admin.</Notice>}
      {!loading && data?.error && data?.operators && <Notice danger>Dati parziali: {data.error}</Notice>}

      {!loading && data?.operators && (
        <>
          <HeroMetric
            label="Media del gruppo nel simulatore"
            value={`${fmtInt(data.cohortAvg || 0)} / 100`}
            compare={`${fmtInt(data.totalRecords || 0)} sessioni valutate di ${fmtInt(operators.length)} operatori`}
            hint="Si considerano le ultime 500 sessioni valutate."
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Metric label="Allenati negli ultimi 7 giorni" value={`${fmtInt(active7)} su ${fmtInt(operators.length)}`} />
              <Metric label="Molto sotto la media" value={fmtInt(signals.filter((a) => a.type === "sotto_media").length)} note="15+ punti sotto" attn={signals.some((a) => a.type === "sotto_media")} />
              <Metric label="In calo questa settimana" value={fmtInt(signals.filter((a) => a.type === "trend_negativo").length)} note="−10 punti o più" />
              <Metric label="Fermi da oltre 7 giorni" value={fmtInt(idle.length)} />
            </div>
          </HeroMetric>

          {operators.length > 0 && active7 === 0 && (
            <Notice>
              Nessuno si è allenato negli ultimi 7 giorni{lastDays != null ? ` (ultima sessione: ${ago(lastDays)})` : ""}: i numeri qui sotto descrivono il passato, non come vanno oggi. Si aggiornano da soli quando gli operatori tornano nel simulatore.
            </Notice>
          )}

          {signals.length > 0 && (
            <section style={{ ...card, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 4px" }}>
                <SectionTitle aside="apri la scheda per capire su cosa allenarli">Da guardare ({signals.length})</SectionTitle>
              </div>
              {signals.map((a, i) => (
                <ActionRow key={`${a.userId}-${a.type}-${i}`} severity="critical"
                  title={`${a.name} · ${a.type === "sotto_media" ? "molto sotto la media" : "in calo"}`}
                  detail={a.message} />
              ))}
            </section>
          )}

          {idle.length > 0 && (
            <Disclosure open={idleOpen} onToggle={() => setIdleOpen(!idleOpen)} title={`Fermi da oltre 7 giorni (${idle.length})`}
              summary="non è un problema di bravura: non si allenano da un po’">
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
                {idle.map((a, i) => (
                  <div key={`${a.userId}-${i}`} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ color: CP.textPrimary, minWidth: 180 }}>{a.name}</span>
                    <span style={{ color: CP.textMuted }}>{a.message}</span>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}

          <SectionTitle aside={`clicca un operatore per la sua scheda · sottolineate le abilità sotto ${LOW}`}>Operatori</SectionTitle>
          <div style={{ marginBottom: 20 }}>
            <DataTable columns={opColumns} rows={operators.map((o) => ({ ...o, id: o.userId }))} defaultSort={{ key: "avgOverall", dir: -1 }}
              onRowClick={setCardOp} minWidth={1180} maxHeight={620}
              empty="Nessuna sessione valutata ancora. La tabella si riempie quando gli operatori completano scenari nel simulatore." />
          </div>

          {heatmap.length > 0 && (
            <>
              <SectionTitle aside="media di tutte le sessioni per creator: la cifra più bassa è dove fare training mirato">Abilità per creator</SectionTitle>
              <div style={{ marginBottom: 20 }}>
                <DataTable columns={heatColumns} rows={heatmap.map((h) => ({ ...h, id: h.creatorId }))} defaultSort={{ key: "totalSessions", dir: -1 }} minWidth={860} maxHeight={480} />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13.5 }}>
            <Link href="/admin/review" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Rivedi le valutazioni →</Link>
            <Link href="/admin/outcomes" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Allenamento e vendite reali →</Link>
            <Link href="/admin/creators" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Voce delle creator →</Link>
          </div>
        </>
      )}

      {cardOp && (() => {
        const POS = { operator: "OP", team_lead: "TL", sales_manager: "SM", qa_reviewer: "QA", admin: "AD" };
        const leagueByScore = cardOp.avgOverall >= 85 ? "diamond" : cardOp.avgOverall >= 75 ? "platinum" : cardOp.avgOverall >= 65 ? "gold" : cardOp.avgOverall >= 50 ? "silver" : "bronze";
        const pos = (cardOp.role && POS[cardOp.role]) ? POS[cardOp.role] : (cardOp.role?.startsWith("c:") ? "CR" : "OP");
        return (
          <div onClick={() => setCardOp(null)} style={{ position: "fixed", inset: 0, background: "rgba(6,8,12,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
              <button onClick={() => setCardOp(null)} style={{ position: "absolute", top: -42, right: 0, display: "inline-flex", alignItems: "center", gap: 6, background: CP.surface, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, fontFamily: FONTS.body }}>
                <X size={14} /> Chiudi
              </button>
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
