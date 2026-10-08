"use client";

// Scheda "Live chat": oggi in corso + fan di oggi (come chat.hoc.tools).

import { useMemo, useState } from "react";
import { CP } from "@/lib/brand";
import { Kpi, Section, Badge, grid, chip, th, td, FanLink, usd, int, pct, mins, ago, hm, div } from "./ui";

// Soglie dell'originale: benvenuto new ≤2h <95% rosso; latenza mediana 10 min / p90 45 min; senza risposta >8%.
const TH = { contact: 0.95, ret: 0.7, latMed: 10, latP90: 45, noReply: 0.08 };

export default function LiveTab({ data, country }) {
  const t = (data.today || []).find((r) => r.country === country) || {};
  const fans = useMemo(() => (data.fans || []).filter((f) => f.country === country), [data.fans, country]);
  const pending = (data.pending || []).filter((r) => r.country === country);
  const unlocks = (data.unlocks || []).filter((r) => r.country === country);
  const [open, setOpen] = useState(null); // "pending" | "ppv"

  const contactRate = div(t.new_contacted_2h, t.new_ge2h);
  const retRate = div(t.ret_contacted_2h, t.ret_ge2h);
  const noReplyRate = div(t.no_reply, t.fans_wrote);
  const latMed = t.lat_med_s != null ? t.lat_med_s / 60 : null;
  const latP90 = t.lat_p90_s != null ? t.lat_p90_s / 60 : null;
  const unlockedNet = (t.ppv_unlocked_value_ws || 0) * 0.8; // il valore dell'evento è il prezzo lordo: netto = 80%

  return (
    <>
      <Section title="Oggi in corso" badge={<Badge tone="live">● LIVE</Badge>} tip="Dati di oggi (ora italiana), dalla chat in tempo reale e dalle iscrizioni/transazioni.">
        <div style={grid(165)}>
          <Kpi label="Nuovi sub oggi" value={int(t.new_subs)} sub={`${int(t.ret_subs)} returning`} tip="Iscritti di oggi alla prima iscrizione (new) e chi torna dopo aver disdetto (returning)." />
          <Kpi label="Da contattare ora" value={int(t.welcome_pending)} sub={t.welcome_pending ? "benvenuto mancante · clicca per la lista" : "nessun benvenuto mancante"}
            status={t.welcome_pending > 0 ? "bad" : "ok"} onClick={t.welcome_pending ? () => setOpen(open === "pending" ? null : "pending") : undefined} active={open === "pending"}
            tip="Iscritti di oggi (new e returning) che non hanno ancora ricevuto nessun messaggio dal team." />
          <Kpi label="Contattati ≤2h" value={pct(contactRate)} sub={`su ${int(t.new_ge2h)} new iscritti da ≥2h · ret ${pct(retRate)}`}
            status={contactRate == null ? null : contactRate >= TH.contact ? "ok" : "bad"}
            tip="Quota dei nuovi iscritti da almeno 2 ore che hanno ricevuto il primo messaggio entro 2 ore. Soglia rossa sotto il 95%; per i returning sotto il 70%." />
          <Kpi label="Fan hanno scritto" value={int(t.fans_wrote)} sub={`${int(t.no_reply)} senza risposta (${pct(noReplyRate)})`}
            status={noReplyRate == null ? null : noReplyRate > TH.noReply ? "bad" : "ok"}
            tip="Fan che hanno scritto oggi. Senza risposta = il loro ultimo messaggio non ha ancora avuto risposta. Soglia rossa sopra l'8%." />
          <Kpi label="Latenza oggi" value={latMed == null ? "–" : mins(latMed)} sub={`p90: ${latP90 == null ? "–" : mins(latP90)}`}
            status={latMed == null ? null : latMed <= TH.latMed && latP90 <= TH.latP90 ? "ok" : "bad"}
            tip="Tempo tra il messaggio con cui il fan riapre la conversazione e la prima risposta del team (mediana e 90° percentile). Oltre 6 ore conta come non risposta. Soglie: 10 min mediana, 45 min p90." />
          <Kpi label="PPV oggi" value={`${int(t.ppv_sent)} inviati`} sub={`${int(t.ppv_unlocked_ws)} sbloccati (${usd(unlockedNet)} net) · ${int(t.ppv_opened_today)} aperti · clicca per dettaglio`}
            onClick={() => setOpen(open === "ppv" ? null : "ppv")} active={open === "ppv"}
            tip="PPV mandati in chat oggi (mass esclusi). Sbloccati = acquisti notificati in tempo reale; aperti = PPV di oggi che il fan ha aperto." />
          <Kpi label="Revenue oggi" value={usd(t.revenue)} sub={`${int(t.payers)} paganti (lag ~1h)`} tip="Netto delle transazioni di oggi su questo account (messaggi, tip, abbonamenti). Le transazioni arrivano con qualche minuto di ritardo." />
        </div>

        {open === "pending" && (
          <div style={{ marginTop: 12 }}>
            <SubTable head={["Utente", "Tipo", "Iscritto", "Da"]} rows={pending.map((p) => [
              <FanLink key="u" userId={p.user_id} username={p.username} />, p.sub_kind === "new" ? "new" : "returning", hm(p.sub_at), <span key="a" style={{ color: CP.accentRed }}>{ago(p.sub_at)}</span>,
            ])} empty="Nessun benvenuto mancante." />
          </div>
        )}
        {open === "ppv" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, color: CP.textSecondary, marginBottom: 6 }}>
              Messaggi pagati oggi: {int(t.msg_tx)} ({usd(t.msg_net)}) · tip {int(t.tip_tx)} ({usd(t.tip_net)}) · altro {int(t.other_tx)} ({usd(t.other_net)})
            </div>
            <SubTable head={["Ora", "Utente", "Netto", "Tipo"]} rows={unlocks.map((u) => [hm(u.ts), <FanLink key="u" userId={u.user_id} username={u.username} />, usd(u.net, 2), u.is_mass ? "mass" : "DM"])} empty="Nessun messaggio pagato oggi." />
          </div>
        )}
      </Section>

      <FansToday fans={fans} />
    </>
  );
}

function SubTable({ head, rows, empty }) {
  if (!rows.length) return <div style={{ fontSize: 13, color: CP.textMuted }}>{empty}</div>;
  return (
    <div style={{ overflow: "auto", maxHeight: 320 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{head.map((h, i) => <th key={h} style={{ ...th, textAlign: i === 1 || i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...td, textAlign: j === 1 || j === 0 ? "left" : "right" }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const FILTERS = [
  { id: "wrote", label: "hanno scritto oggi", test: (f) => f.wrote_today },
  { id: "unanswered", label: "senza risposta", test: (f) => f.wrote_today && f.unanswered },
  { id: "spender", label: "spender in attesa", test: (f) => f.unanswered && (f.ltv_project || 0) > 0, tone: "warn" },
  { id: "paying", label: "paganti oggi", test: (f) => (f.revenue_today || 0) > 0 },
];

const COLS = [
  { id: "user", label: "Utente", left: true, sort: (f) => (f.username || "").toLowerCase() },
  { id: "last_fan", label: "Ultimo msg fan", sort: (f) => f.last_fan_at || "" },
  { id: "last_out", label: "Ultima risposta chatter", sort: (f) => f.last_out_at || "" },
  { id: "rev", label: "Speso oggi", sort: (f) => f.revenue_today || 0 },
  { id: "l7", label: "LTV 7gg", sort: (f) => f.ltv_7d || 0 },
  { id: "l30", label: "LTV 30gg", sort: (f) => f.ltv_30d || 0 },
  { id: "lp", label: "LTV progetto", sort: (f) => f.ltv_project || 0 },
  { id: "la", label: "LTV agency", sort: (f) => f.ltv_agency || 0 },
  { id: "sub", label: "Iscritto il", sort: (f) => f.sub_date || "" },
  { id: "msg", label: "Ultimo messaggio", left: true },
];

function FansToday({ fans }) {
  const [filter, setFilter] = useState("unanswered");
  const [sort, setSort] = useState({ id: "last_fan", dir: -1 });
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, fans.filter(f.test).length]));
  const payingSum = fans.filter((f) => (f.revenue_today || 0) > 0).reduce((a, f) => a + f.revenue_today, 0);
  const rows = useMemo(() => {
    const F = FILTERS.find((x) => x.id === filter);
    const col = COLS.find((c) => c.id === sort.id);
    return fans.filter(F.test).sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [fans, filter, sort]);
  const money = (v) => (v ? usd(v) : "–");
  const fmtDate = (s) => (s ? s.split("-").reverse().map((x, i) => (i === 2 ? x.slice(2) : x)).join("/") : "–");

  return (
    <Section title="Fan di oggi" tip="Fan che hanno scritto o pagato oggi. LTV progetto = speso su questo account negli ultimi 182 giorni; LTV agency = speso su tutte le creator di HOC. Clicca un'intestazione per ordinare.">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={chip(filter === f.id, f.tone)}>
            {f.label}: <b style={{ fontWeight: 600 }}>{counts[f.id]}</b>{f.id === "paying" ? ` · ${usd(payingSum)}` : ""}
          </button>
        ))}
      </div>
      <div style={{ overflow: "auto", maxHeight: 560 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.id} onClick={c.sort ? () => setSort((s) => ({ id: c.id, dir: s.id === c.id ? -s.dir : -1 })) : undefined}
                  style={{ ...th, textAlign: c.left ? "left" : "right", cursor: c.sort ? "pointer" : "default" }}>
                  {c.label}{sort.id === c.id ? (sort.dir < 0 ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const waiting = f.unanswered;
              return (
                <tr key={f.user_id}>
                  <td style={{ ...td, textAlign: "left" }}>{(f.ltv_project || 0) > 0 && <span title="ha già speso" style={{ marginRight: 4 }}>$</span>}<FanLink userId={f.user_id} username={f.username} /></td>
                  <td style={{ ...td, color: waiting ? CP.accentRed : CP.textPrimary }}>{ago(f.last_fan_at)}</td>
                  <td style={{ ...td, color: waiting ? CP.accentRed : CP.textPrimary }}>{!f.last_out_at ? "mai risposto" : waiting ? `⏳ ${ago(f.last_out_at)}` : ago(f.last_out_at)}</td>
                  <td style={td}>{money(f.revenue_today)}</td>
                  <td style={td}>{money(f.ltv_7d)}</td>
                  <td style={td}>{money(f.ltv_30d)}</td>
                  <td style={td}>{money(f.ltv_project)}</td>
                  <td style={td}>{money(f.ltv_agency)}</td>
                  <td style={td}>{fmtDate(f.sub_date)}</td>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 260, maxWidth: 420, color: CP.textSecondary, fontSize: 12.5 }}>{f.preview || ""}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={COLS.length} style={{ ...td, textAlign: "center", color: CP.textMuted }}>Nessun fan in questa lista.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
