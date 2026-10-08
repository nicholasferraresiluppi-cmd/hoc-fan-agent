"use client";

// Scheda "Riepilogo & trend" (come chat.hoc.tools): KPI settimana, monitoraggio
// segnali, revenue per fonte / fascia LTV, trend giornalieri 30gg, engagement
// settimanale, chatter & presidio, coorti a 30 giorni.

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CP, alpha, DATA_SCALE } from "@/lib/brand";
import { useTheme } from "@/lib/theme-client";
import { Kpi, Section, Badge, grid, chip, th, td, usd, int, pct, div, shortDay, todayRome, addDays } from "./ui";
import { LineChart, StackBars, Legend, HeatGrid } from "./charts";

const SRC = () => [
  { key: "revenue_dm", name: "DM 1:1", color: CP.accent },
  { key: "revenue_mass", name: "Mass message", color: CP.gold },
  { key: "revenue_tip", name: "Tip", color: CP.accentGreen },
];

function wow(cur, prev) {
  const d = div((cur ?? 0) - (prev ?? 0), prev);
  if (d == null) return { txt: "–", col: CP.textMuted };
  const arrow = Math.abs(d) < 0.01 ? "→" : d > 0 ? "▲" : "▼";
  return { txt: `${arrow} ${pct(Math.abs(d))} vs sett. prec.`, col: Math.abs(d) < 0.01 ? CP.textMuted : d > 0 ? CP.accentGreen : CP.accentRed };
}

export default function TrendTab({ trend, daily, country }) {
  const [openSig, setOpenSig] = useState(true);
  const weeks = useMemo(() => (trend.rows || []).filter((r) => r.country === country && !r.settimana_parziale).sort((a, b) => (a.settimana < b.settimana ? -1 : 1)), [trend, country]);
  const cur = weeks[weeks.length - 1] || {};
  const prev = weeks[weeks.length - 2] || {};
  const quotaDm = (r) => div(r.revenue_dm, r.revenue_tot);

  // Monitoraggio segnali: ultime 6 settimane complete.
  const last6 = weeks.slice(-6);
  const first3 = last6.slice(0, 3), last3 = last6.slice(-3);
  const avg = (arr, k) => (arr.length ? arr.reduce((a, r) => a + (r[k] || 0), 0) / arr.length : null);
  const ratioChg = div(avg(last3, "ratio_fan_chatter") - avg(first3, "ratio_fan_chatter"), avg(first3, "ratio_fan_chatter"));
  const effChg = div((last6[last6.length - 1]?.revenue_per_msg_chatter ?? 0) - (last6[0]?.revenue_per_msg_chatter ?? 0), last6[0]?.revenue_per_msg_chatter);
  const massShare = div(cur.revenue_mass, cur.revenue_tot);
  const payChg = div((cur.paying_users || 0) - (prev.paying_users || 0), prev.paying_users);
  const revChg = div((cur.revenue_tot || 0) - (prev.revenue_tot || 0), prev.revenue_tot);
  const signals = [
    { name: "Reattività fan (ratio)", level: ratioChg == null ? null : ratioChg < -0.2 ? "bad" : ratioChg < -0.1 ? "warn" : "ok",
      text: `Media ultime 3 sett. ${avg(last3, "ratio_fan_chatter")?.toFixed(2) ?? "–"} vs ${avg(first3, "ratio_fan_chatter")?.toFixed(2) ?? "–"} delle 3 prima (${ratioChg == null ? "–" : `${ratioChg > 0 ? "+" : ""}${Math.round(ratioChg * 100)}%`}). ${ratioChg != null && ratioChg < -0.1 ? "In calo: early-warning di churn." : "Stabile o in salita."}` },
    { name: "Efficienza push DM", level: effChg == null ? null : effChg < -0.3 ? "bad" : effChg < -0.15 ? "warn" : "ok",
      text: `${effChg == null ? "–" : `${effChg > 0 ? "+" : ""}${Math.round(effChg * 100)}%`} su 6 sett. ${effChg != null && effChg < -0.15 ? "I PPV convertono meno: contenuto o pricing da rivedere." : "Revenue DM per PPV spinto stabile."}` },
    { name: "Composizione revenue · dipendenza mass", level: massShare == null ? null : massShare > 0.4 ? "bad" : massShare > 0.25 ? "warn" : "ok",
      text: `DM ${pct(quotaDm(cur), 0)} · Mass ${pct(massShare, 0)} · Tip ${pct(div(cur.revenue_tip, cur.revenue_tot), 0)}. Il semaforo guarda il mass: sopra il 25% il mass, che ha un ticket più basso del DM, diventa una fonte debole su cui ci si appoggia.` },
    { name: "Paying users", level: payChg == null ? null : payChg < -0.15 ? "bad" : payChg < -0.05 ? "warn" : "ok",
      text: `${payChg == null ? "–" : `${payChg > 0 ? "+" : ""}${Math.round(payChg * 100)}%`} sett. su sett. ${payChg != null && payChg < -0.05 ? "Base pagante in calo." : "Base pagante stabile o in crescita."}` },
    { name: "Revenue settimanale", level: revChg == null ? null : revChg < -0.15 ? "bad" : revChg < -0.05 ? "warn" : "ok",
      text: `${revChg == null ? "–" : `${revChg > 0 ? "+" : ""}${Math.round(revChg * 100)}%`} sett. su sett. ${revChg != null && revChg < -0.05 ? "Sotto la settimana prima." : "Nel range o in crescita."}` },
  ];
  const nBad = signals.filter((s) => s.level === "bad").length, nWarn = signals.filter((s) => s.level === "warn").length;

  const w = (k) => wow(cur[k], prev[k]);
  const wq = wow(quotaDm(cur), quotaDm(prev));

  return (
    <>
      <div style={{ ...grid(165), marginBottom: 12 }}>
        <Kpi label="Revenue settimana" value={usd(cur.revenue_tot)} sub={<span style={{ color: w("revenue_tot").col }}>{w("revenue_tot").txt}</span>} tip="Ultima settimana completa (lun-dom)." />
        <Kpi label="Quota DM 1:1" value={pct(quotaDm(cur), 0)} sub={<span style={{ color: wq.col }}>{wq.txt}</span>} tip="Quota del revenue che viene dai messaggi in chat 1:1 (non mass)." />
        <Kpi label="Ratio fan/chatter" value={cur.ratio_fan_chatter?.toFixed(2) ?? "–"} sub={<span style={{ color: w("ratio_fan_chatter").col }}>{w("ratio_fan_chatter").txt}</span>} tip="Messaggi dei fan per ogni messaggio del team: quanto rispondono i fan." />
        <Kpi label="Efficienza push DM" value={usd(cur.revenue_per_msg_chatter, 2)} sub={<span style={{ color: w("revenue_per_msg_chatter").col }}>{w("revenue_per_msg_chatter").txt}</span>} tip="Revenue DM per ogni contenuto a pagamento (PPV) spinto in chat." />
        <Kpi label="Fan attivi" value={int(cur.fan_attivi)} sub={<span style={{ color: w("fan_attivi").col }}>{w("fan_attivi").txt}</span>} tip="Fan che hanno scritto almeno un messaggio nella settimana." />
        <Kpi label="Paying users" value={int(cur.paying_users)} sub={<span style={{ color: w("paying_users").col }}>{w("paying_users").txt}</span>} tip="Fan che hanno speso almeno una volta nella settimana." />
      </div>

      <Section title="Monitoraggio segnali" tip="Controlli deterministici sulle settimane complete (nessuna AI)."
        badge={<span style={{ fontSize: 12.5 }}>{nBad > 0 && <span style={{ color: CP.accentRed }}>● {nBad} critic{nBad === 1 ? "o" : "i"}</span>}{nBad > 0 && nWarn > 0 && <span style={{ color: CP.textMuted }}> · </span>}{nWarn > 0 && <span style={{ color: CP.gold }}>● {nWarn} attenzione</span>}{!nBad && !nWarn && <span style={{ color: CP.accentGreen }}>● tutto nella norma</span>}</span>}
        aside={<button onClick={() => setOpenSig((o) => !o)} style={{ background: "none", border: "none", color: CP.textMuted, cursor: "pointer", padding: 0, display: "inline-flex" }} aria-label="Mostra o nascondi"><ChevronDown size={16} style={{ transform: openSig ? "none" : "rotate(-90deg)" }} /></button>}>
        {openSig && (
          <div style={{ display: "grid", gap: 8 }}>
            {signals.map((s) => {
              const col = s.level === "bad" ? CP.accentRed : s.level === "warn" ? CP.gold : s.level === "ok" ? CP.accentGreen : CP.textMuted;
              return (
                <div key={s.name} style={{ borderLeft: `3px solid ${col}`, padding: "6px 10px", background: alpha(col, "0d"), borderRadius: 6 }}>
                  <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 12.5, color: CP.textSecondary }}>{s.text}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <RevenueSection weeks={weeks} trend={trend} country={country} />
      <DailyTrends daily={daily} country={country} />
      <Engagement weeks={weeks} />
      <ChattersPresidio daily={daily} country={country} />
      <Cohorts daily={daily} country={country} />
    </>
  );
}

function RevenueSection({ weeks, trend, country }) {
  const [mode, setMode] = useState("fonte");
  const [theme] = useTheme();
  const BUCKET_COLORS = [...(DATA_SCALE[theme === "light" ? "light" : "dark"].fill), CP.accent];
  const src = SRC();
  const buckets = trend.buckets || [];
  const labels = weeks.map((r) => shortDay(r.settimana));
  const wl = (trend.weeklyLtv || []).filter((r) => r.country === country);
  const ltv = (trend.ltv || []).filter((r) => r.country === country).sort((a, b) => a.bucket - b.bucket);
  const stacks = mode === "fonte"
    ? src.map((s) => ({ name: s.name, color: s.color, values: weeks.map((r) => r[s.key] || 0) }))
    : buckets.map((b, i) => ({ name: b, color: BUCKET_COLORS[i], values: weeks.map((r) => { const x = wl.find((y) => y.wk === r.settimana && y.bucket === i); return x ? (x.dm || 0) + (x.mass || 0) + (x.tip || 0) : 0; }) }));
  return (
    <Section title="Revenue" aside="settimanale, per fonte e per valore utente">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>Revenue settimanale per fonte</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setMode("fonte")} style={chip(mode === "fonte")}>Per fonte</button>
              <button onClick={() => setMode("ltv")} style={chip(mode === "ltv")}>Per fascia LTV</button>
            </div>
          </div>
          <Legend items={stacks.map((s) => ({ name: s.name, color: s.color }))} />
          <StackBars labels={labels} stacks={stacks} yFmt={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)} />
          <div style={{ fontSize: 12, color: CP.textMuted }}>{mode === "fonte" ? "DM 1:1 · Mass message · Tip — il DM è il motore di monetizzazione." : "Revenue della settimana per fascia di valore del fan (LTV su 182 giorni)."}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500, marginBottom: 6 }}>Concentrazione revenue per fascia di valore utente (LTV)</div>
          <Legend items={src.map((s) => ({ name: s.name, color: s.color }))} />
          <StackBars labels={ltv.map((r) => `${buckets[r.bucket]} (${int(r.n_users)})`)}
            stacks={[{ name: "DM", color: src[0].color, values: ltv.map((r) => r.dm || 0) }, { name: "Mass", color: src[1].color, values: ltv.map((r) => r.mass || 0) }, { name: "Tip", color: src[2].color, values: ltv.map((r) => r.tip || 0) }]}
            yFmt={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)} />
          <div style={{ fontSize: 12, color: CP.textMuted }}>Revenue degli ultimi 182 giorni per fascia di spesa del fan (tra parentesi quanti fan), divisa per fonte.</div>
        </div>
      </div>
    </Section>
  );
}

function DailyTrends({ daily, country }) {
  const today = todayRome();
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -30 + i)); // 30 giorni completi
  const labels = days.map(shortDay);
  const f = (arr) => (arr || []).filter((r) => r.country === country);
  const dn = f(daily.daily), lat = f(daily.latency), ppv = f(daily.ppv), c7 = f(daily.conv7);
  const get = (arr, d, extra) => arr.find((r) => r.d === d && (!extra || extra(r)));
  const newRow = (d) => get(dn, d, (r) => r.sub_type === "new") || {};
  const retRow = (d) => get(dn, d, (r) => r.sub_type === "returning") || {};
  const age = (d) => Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${d}T12:00:00Z`)) / 86400000);
  const charts = [
    { title: "Contattati entro 2h — trend 30gg", tip: "New vs Returning · soglie 95% / 70%", el: (
      <LineChart labels={labels} yFmt={(v) => `${Math.round(v * 100)}%`} max={1}
        thresholds={[{ y: 0.95, color: CP.accentRed, label: "95%" }, { y: 0.7, color: CP.gold, label: "70%" }]}
        series={[{ name: "New", color: CP.accent, values: days.map((d) => div(newRow(d).contacted_2h, newRow(d).subs)) }, { name: "Returning", color: CP.accentGreen, values: days.map((d) => div(retRow(d).contacted_2h, retRow(d).subs)) }]} />) },
    { title: "Reply rate coorte — trend 30gg", tip: "% new sub che scrivono entro 24/48h (le ultime coorti sono parziali)", el: (
      <LineChart labels={labels} yFmt={(v) => `${Math.round(v * 100)}%`}
        series={[{ name: "entro 24h", color: CP.accent, values: days.map((d) => (age(d) >= 1 ? div(newRow(d).wrote_24h, newRow(d).subs) : null)) }, { name: "entro 48h", color: CP.accentGreen, values: days.map((d) => (age(d) >= 2 ? div(newRow(d).wrote_48h, newRow(d).subs) : null)) }]} />) },
    { title: "Latenza risposta chatter — trend 30gg", tip: "Mediana e P90 in minuti · scala log", el: (
      <LineChart labels={labels} log yFmt={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}m`}
        series={[{ name: "Mediana", color: CP.accent, values: days.map((d) => get(lat, d)?.lat_med ?? null) }, { name: "P90", color: CP.gold, values: days.map((d) => get(lat, d)?.lat_p90 ?? null) }]} />) },
    { title: "Mix benvenuto — trend 30gg", tip: "Nuovi iscritti contattati ≤2h, per tipo del primo messaggio", el: (
      <StackBars labels={labels} yFmt={(v) => Math.round(v)}
        stacks={[{ name: "PPV", color: CP.accent, values: days.map((d) => newRow(d).welcome_ppv || 0) }, { name: "Media", color: CP.accentGreen, values: days.map((d) => newRow(d).welcome_media || 0) }, { name: "Testo", color: CP.gold, values: days.map((d) => newRow(d).welcome_text || 0) }]} />) },
    { title: "PPV a freddo vs a caldo — trend 30gg", tip: "Barre: PPV caldo/freddo (escl. welcome) · linea: % scriventi → offerta", el: (
      <StackBars labels={labels} yFmt={(v) => Math.round(v)} lineMax={1} lineFmt={(v) => `${Math.round(v * 100)}%`}
        line={{ name: "% scriventi → offerta", color: CP.textPrimary, values: days.map((d) => { const p = get(ppv, d), l = get(lat, d); return div(p?.warm_users, l?.fans_wrote); }) }}
        stacks={[{ name: "A caldo", color: CP.accent, values: days.map((d) => get(ppv, d)?.ppv_warm || 0) }, { name: "A freddo", color: CP.accentRed, values: days.map((d) => get(ppv, d)?.ppv_cold || 0) }]} />) },
    { title: "Conversione precoce 7gg", tip: "Solo coorti mature (≥7gg) · linea: revenue 7gg per coorte", badge: "PROXY", el: (
      <StackBars labels={labels} yFmt={(v) => `${Math.round(v * 100)}%`} lineMax={Math.max(1, ...days.map((d) => get(c7, d)?.rev7 || 0))} lineFmt={(v) => `$${Math.round(v)}`}
        line={{ name: "Revenue 7gg", color: CP.gold, values: days.map((d) => (age(d) >= 7 ? get(c7, d)?.rev7 ?? null : null)) }}
        stacks={[{ name: "Conv 7gg", color: CP.accent, values: days.map((d) => (age(d) >= 7 ? div(get(c7, d)?.conv7, get(c7, d)?.subs) || 0 : 0)) }]} />) },
  ];
  return (
    <Section title="Trend giornalieri" aside="ultimi 30 giorni completi, per country selezionata">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
        {charts.map((c) => (
          <div key={c.title}>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500, display: "flex", gap: 8, alignItems: "center" }}>{c.title}{c.badge && <Badge>{c.badge}</Badge>}</div>
            <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 4 }}>{c.tip}</div>
            {c.el}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Engagement({ weeks }) {
  const labels = weeks.map((r) => shortDay(r.settimana));
  const charts = [
    { title: "Ratio risposta fan / chatter", tip: "Reattività dei fan. Calo strutturale = early-warning churn", series: [{ name: "Ratio", color: CP.accent, values: weeks.map((r) => r.ratio_fan_chatter) }], fmt: (v) => v.toFixed(2) },
    { title: "Efficienza push DM", tip: "Revenue DM per contenuto a pagamento (PPV) spinto", series: [{ name: "$ per PPV", color: CP.accent, values: weeks.map((r) => r.revenue_per_msg_chatter) }], fmt: (v) => `$${v.toFixed(1)}` },
    { title: "Fan attivi vs paying users", tip: "Ampiezza base attiva vs chi effettivamente paga", series: [{ name: "Fan attivi", color: CP.accent, values: weeks.map((r) => r.fan_attivi) }, { name: "Paying users", color: CP.accentGreen, values: weeks.map((r) => r.paying_users) }], fmt: (v) => Math.round(v) },
    { title: "Lunghezza media messaggi fan", tip: "Parole/messaggio del fan — proxy di coinvolgimento nella conversazione", series: [{ name: "Parole", color: CP.accent, values: weeks.map((r) => r.avg_parole_fan) }], fmt: (v) => v.toFixed(1) },
  ];
  return (
    <Section title="Engagement settimanale" aside="segnali comportamentali dalla chat">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
        {charts.map((c) => (
          <div key={c.title}>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>{c.title}</div>
            <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 4 }}>{c.tip}</div>
            {c.series.length > 1 && <Legend items={c.series.map((s) => ({ name: s.name, color: s.color, line: true }))} />}
            <LineChart labels={labels} series={c.series} yFmt={c.fmt} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function ChattersPresidio({ daily, country }) {
  const [win, setWin] = useState("7");
  const [heat, setHeat] = useState("lat");
  const rows = (daily.chatters || []).filter((r) => r.country === country)
    .map((r) => ({ ...r, rev: win === "7" ? r.rev_7d : r.rev_30d, tx: win === "7" ? r.tx_7d : r.tx_30d, buyers: win === "7" ? r.buyers_7d : r.buyers_30d }))
    .filter((r) => r.rev > 0).sort((a, b) => b.rev - a.rev);
  const cells = {};
  for (const h of (daily.heat || []).filter((r) => r.country === country)) {
    const k = `${h.dow}-${h.hr}`;
    if (heat === "lat") cells[k] = h.lat_med;
    if (heat === "msg") cells[k] = h.n_days ? h.fan_msgs / h.n_days : null;
  }
  if (heat === "staff") for (const s of (daily.staff || []).filter((r) => r.country === country)) cells[`${s.dow}-${s.hr}`] = s.avg_staff;
  const latMax = 45;
  const colorFor = (v, max) => {
    if (v == null) return null;
    if (heat === "lat") return v > latMax ? { bg: alpha(CP.accentRed, "55"), fg: CP.textPrimary } : { bg: alpha(CP.accent, v > 10 ? "40" : "1a"), fg: CP.textPrimary };
    return { bg: alpha(CP.accent, ["14", "26", "40", "5c", "80"][Math.min(4, Math.floor((v / max) * 5))]), fg: CP.textPrimary };
  };
  return (
    <Section title="Chatter & presidio" aside="revenue per chatter (takes) e copertura oraria">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 18 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>Leaderboard chatter</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setWin("7")} style={chip(win === "7")}>7 giorni</button>
              <button onClick={() => setWin("30")} style={chip(win === "30")}>30 giorni</button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 6 }}>Fonte: takes dei turni CreatorsPro · ticket medio PPV su 30gg</div>
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>Chatter</th><th style={th}>Revenue</th><th style={th}>Vendite</th><th style={th}>Acquirenti</th><th style={th}>Ticket PPV 30gg</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.member_id}>
                    <td style={{ ...td, textAlign: "left" }}><span style={{ color: CP.textMuted, display: "inline-block", width: 22 }}>{i + 1}</span>{r.member_name}</td>
                    <td style={td}>{usd(r.rev)}</td><td style={td}>{int(r.tx)}</td><td style={td}>{int(r.buyers)}</td><td style={td}>{usd(r.avg_ppv_30d, 1)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: CP.textMuted }}>Nessun turno nel periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>Presidio orario — ultime 3 settimane</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setHeat("lat")} style={chip(heat === "lat")}>Latenza</button>
              <button onClick={() => setHeat("msg")} style={chip(heat === "msg")}>Msg fan</button>
              <button onClick={() => setHeat("staff")} style={chip(heat === "staff")}>Presidio</button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 6 }}>
            {heat === "lat" ? "Latenza mediana di risposta (min) per fascia oraria — rosso = oltre 45 min (soglia p90)" : heat === "msg" ? "Messaggi dei fan in media per giorno, per fascia oraria" : "Persone in turno in media per fascia oraria (turni CreatorsPro)"}
          </div>
          <HeatGrid cells={cells} colorFor={colorFor} fmt={(v) => (heat === "staff" ? v.toFixed(1) : Math.round(v))} />
        </div>
      </div>
    </Section>
  );
}

function Cohorts({ daily, country }) {
  const rows = (daily.cohorts30 || []).filter((r) => r.country === country).sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 16);
  return (
    <Section title="Coorti" badge={<Badge>LAGGING</Badge>} aside="conversione 30gg — solo coorti mature" tip="Settimane di iscrizione (lun-dom) con 30 giorni di maturazione. Conv = nuovi iscritti che hanno speso almeno una volta (abbonamento escluso) entro 30 giorni.">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Settimana</th><th style={th}>Nuovi sub</th><th style={th}>Conv 30gg</th><th style={th}>% conv</th><th style={th}>Revenue 30gg</th><th style={th}>ARPPU</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.d}>
                <td style={{ ...td, textAlign: "left" }}>{shortDay(r.d)}</td><td style={td}>{int(r.subs)}</td><td style={td}>{int(r.conv30)}</td>
                <td style={td}>{pct(div(r.conv30, r.subs))}</td><td style={td}>{usd(r.rev30)}</td><td style={td}>{usd(r.arppu30, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
