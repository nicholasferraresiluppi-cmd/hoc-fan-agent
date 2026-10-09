"use client";

// Scheda "Dettaglio giornaliero": un giorno alla volta (di base ieri), con le
// soglie del giorno e il funnel della coorte (come chat.hoc.tools).

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { CP, alpha } from "@/lib/brand";
import { Kpi, Section, Badge, grid, th, td, FanLink, usd, int, pct, mins, ago, div, dayLabel, todayRome, addDays, diffDays } from "./ui";

export default function DailyTab({ daily, live, country }) {
  const today = todayRome();
  const [day, setDay] = useState(addDays(today, -1));
  const [openTh, setOpenTh] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const pick = (arr) => (arr || []).filter((r) => r.country === country);
  const days = useMemo(() => [...new Set(pick(daily.latency).map((r) => r.d))].sort(), [daily, country]);
  const minDay = days[0] || addDays(today, -30);

  const subNew = pick(daily.daily).find((r) => r.d === day && r.sub_type === "new") || {};
  const subRet = pick(daily.daily).find((r) => r.d === day && r.sub_type === "returning") || {};
  const lat = pick(daily.latency).find((r) => r.d === day) || {};
  const ppv = pick(daily.ppv).find((r) => r.d === day) || {};
  const rev = pick(daily.revenue).find((r) => r.d === day) || {};
  const c7 = pick(daily.conv7).find((r) => r.d === day) || {};
  const queue = (live?.queue || []).filter((r) => r.country === country);

  const age = diffDays(today, day);
  const replyPartial = age < 2; // la finestra di 48h non è ancora chiusa
  const convMature = age >= 7;
  const contact = div(subNew.contacted_2h, subNew.subs);
  const retC = div(subRet.contacted_2h, subRet.subs);
  const wrote48 = div(subNew.wrote_48h, subNew.subs);
  const noReply = div(lat.no_reply, lat.fans_wrote);
  const nonWelcome = (ppv.ppv_cold || 0) + (ppv.ppv_warm || 0);
  const cold = div(ppv.ppv_cold, nonWelcome);
  const conv7 = convMature ? div(c7.conv7, c7.subs) : null;

  // Soglie del giorno (stesse dell'originale; PPV a freddo: attenzione oltre il 5%, critico oltre il 10%).
  const checks = [
    { name: "Copertura benvenuto new ≤2h", v: contact, level: contact == null ? null : contact < 0.95 ? "bad" : "ok",
      text: `${pct(contact)} (${int(subNew.contacted_2h)}/${int(subNew.subs)}). Soglia rossa: <95%.` },
    { name: "Copertura returning ≤2h", v: retC, level: retC == null ? null : retC < 0.7 ? "bad" : retC < 0.8 ? "warn" : "ok",
      text: `${pct(retC)} (${int(subRet.contacted_2h)}/${int(subRet.subs)}). Soglia rossa: <70%.${retC != null && retC < 0.7 ? " I returning oggi sono il punto debole." : ""}` },
    { name: "Latenza di risposta", v: lat.lat_med, level: lat.lat_med == null ? null : lat.lat_med > 10 || lat.lat_p90 > 45 ? "bad" : lat.lat_p90 > 30 ? "warn" : "ok",
      text: `Mediana ${mins(lat.lat_med)} · p90 ${mins(lat.lat_p90)}. Soglie: 10 min (med) / 45 min (p90). Il p90 scopre i buchi di presidio.` },
    { name: "Fan senza risposta nel giorno", v: noReply, level: noReply == null ? null : noReply > 0.08 ? "bad" : noReply > 0.05 ? "warn" : "ok",
      text: `${pct(noReply)} (${int(lat.no_reply)} su ${int(lat.fans_wrote)}). Soglia rossa: >8%.` },
    { name: "PPV a freddo (fuori sequenza)", v: cold, level: cold == null ? null : cold > 0.1 ? "bad" : cold > 0.05 ? "warn" : "ok",
      text: `${pct(cold)} (${int(ppv.ppv_cold)} su ${int(nonWelcome)} PPV non-welcome). Il PPV va dopo la risposta del fan, non prima.` },
  ];
  const nBad = checks.filter((c) => c.level === "bad").length;
  const nWarn = checks.filter((c) => c.level === "warn").length;

  const steps = [
    { label: "Iscritti (new)", n: subNew.subs, rate: 1 },
    { label: "Contattati ≤2h", n: subNew.contacted_2h, rate: div(subNew.contacted_2h, subNew.subs) },
    { label: "Rispondono ≤48h", n: subNew.wrote_48h, rate: div(subNew.wrote_48h, subNew.contacted_2h), partial: replyPartial },
    { label: "Pagano ≤7gg", n: convMature ? c7.conv7 : null, rate: convMature ? div(c7.conv7, subNew.wrote_48h) : null, immature: !convMature },
  ];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => setDay(addDays(day, -1))} disabled={day <= minDay} style={navBtn} aria-label="Giorno prima"><ChevronLeft size={16} /></button>
        <button onClick={() => setDay(addDays(day, 1))} disabled={day >= today} style={navBtn} aria-label="Giorno dopo"><ChevronRight size={16} /></button>
        <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{dayLabel(day)}</span>
        <span style={{ fontSize: 12.5, color: CP.textMuted }}>
          · reply 48h {replyPartial ? "⏳ parziale" : "completa"} · conv 7gg {convMature ? "matura" : "⏳ non matura"}
        </span>
      </div>

      <div style={{ ...grid(190), marginBottom: 12 }}>
        <Kpi label="Nuovi sub" value={int(subNew.subs)} sub={`${int(subRet.subs)} returning`} />
        <Kpi label="Contattati ≤2h" value={pct(contact)} sub={`mediana ${mins(subNew.med_min_contact)}`} status={checks[0].level} tip="Nuovi iscritti del giorno contattati entro 2 ore dall'iscrizione." />
        <Kpi label="Returning ≤2h" value={pct(retC)} sub={`${int(subRet.contacted_2h)} su ${int(subRet.subs)}`} status={checks[1].level} tip="Chi torna dopo aver disdetto, contattato entro 2 ore." />
        <Kpi label="Hanno scritto ≤48h" value={<>{pct(wrote48)}{replyPartial ? " ⏳" : ""}</>} sub={replyPartial ? "coorte parziale" : `${int(subNew.wrote_48h)} su ${int(subNew.subs)}`} tip="Nuovi iscritti del giorno che hanno scritto almeno un messaggio entro 48 ore dall'iscrizione (anche 24h nel trend)." />
        <Kpi label="Latenza risposta" value={mins(lat.lat_med)} sub={`p90: ${mins(lat.lat_p90)}`} status={checks[2].level} />
        <Kpi label="Senza risposta" value={pct(noReply, 0)} sub={`${int(lat.no_reply)} fan su ${int(lat.fans_wrote)}`} status={checks[3].level} tip="Fan che hanno scritto nel giorno e non hanno avuto risposta entro 6 ore dal loro ultimo messaggio." />
        <Kpi label="Coda adesso" value={int(queue.length)} sub={<span style={{ color: CP.accentGreen }}>● live · clicca per la lista</span>} onClick={() => setShowQueue((s) => !s)} active={showQueue}
          tip="Fan il cui ultimo messaggio (ultimi 7 giorni) aspetta ancora una risposta, adesso." />
        <Kpi label="Revenue giorno" value={usd(rev.revenue)} sub={`${int(rev.payers)} paganti · ARPPU ${usd(rev.arppu, 1)}`} />
        <Kpi label="Conv 7gg coorte" value={conv7 == null ? "–" : pct(conv7)} sub={convMature ? `${int(c7.conv7)} su ${int(c7.subs)} · ${usd(c7.rev7)}` : `matura tra ${7 - age}gg`} tip="Nuovi iscritti del giorno che hanno speso almeno una volta (abbonamento escluso) entro 7 giorni." />
      </div>

      {showQueue && (
        <Section title="Coda adesso" aside={`${int(queue.length)} fan in attesa, dal più vecchio`}>
          <div style={{ overflow: "auto", maxHeight: 380 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Utente</th><th style={th}>In attesa da</th><th style={th}>Ultima risposta</th><th style={th}>Speso 60gg</th><th style={{ ...th, textAlign: "left" }}>Ultimo messaggio</th>
              </tr></thead>
              <tbody>
                {[...queue].sort((a, b) => (b.spent_60d || 0) - (a.spent_60d || 0) || (a.last_fan_at < b.last_fan_at ? -1 : 1)).slice(0, 300).map((q) => (
                  <tr key={q.user_id}>
                    <td style={{ ...td, textAlign: "left" }}><FanLink userId={q.user_id} username={q.username} /></td>
                    <td style={{ ...td, color: CP.accentRed }}>{ago(q.last_fan_at)}</td>
                    <td style={td}>{q.last_out_at ? ago(q.last_out_at) : "mai risposto"}</td>
                    <td style={td}>{q.spent_60d ? usd(q.spent_60d) : "–"}</td>
                    <td style={{ ...td, textAlign: "left", whiteSpace: "normal", maxWidth: 420, color: CP.textSecondary, fontSize: 12.5 }}>{q.preview || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>Ordinati per speso negli ultimi 60 giorni, poi per attesa.</div>
        </Section>
      )}

      <Section title="Soglie del giorno" tip="Controlli deterministici sul giorno scelto (nessuna AI)."
        badge={<span style={{ fontSize: 12.5, color: CP.textSecondary }}>{nBad > 0 && <span style={{ color: CP.accentRed }}>● {nBad} critic{nBad === 1 ? "o" : "i"}</span>}{nBad > 0 && nWarn > 0 && " · "}{nWarn > 0 && <span style={{ color: CP.gold }}>● {nWarn} attenzione</span>}{!nBad && !nWarn && <span style={{ color: CP.accentGreen }}>● tutto nella norma</span>}</span>}
        aside={<button onClick={() => setOpenTh((o) => !o)} style={{ background: "none", border: "none", color: CP.textMuted, cursor: "pointer", padding: 0, display: "inline-flex" }} aria-label="Mostra o nascondi"><ChevronDown size={16} style={{ transform: openTh ? "none" : "rotate(-90deg)" }} /></button>}>
        {openTh && (
          <div style={{ display: "grid", gap: 8 }}>
            {checks.map((c) => {
              const col = c.level === "bad" ? CP.accentRed : c.level === "warn" ? CP.gold : c.level === "ok" ? CP.accentGreen : CP.textMuted;
              return (
                <div key={c.name} style={{ borderLeft: `3px solid ${col}`, padding: "6px 10px", background: alpha(col, "0d"), borderRadius: 6 }}>
                  <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12.5, color: CP.textSecondary }}>{c.text}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Funnel del giorno" badge={<Badge>LEADING</Badge>} tip="Coorte dei nuovi iscritti del giorno: quanti contattati entro 2h, quanti rispondono entro 48h, quanti pagano entro 7 giorni."
        aside={`Coorte del ${dayLabel(day)} — mix benvenuto: ${int(subNew.welcome_ppv)} PPV · ${int(subNew.welcome_media)} media · ${int(subNew.welcome_text)} testo`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {steps.map((s, i) => {
            const w = div(s.n, steps[0].n);
            return (
              <div key={s.label} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${CP.border}` }}>
                <div style={{ fontSize: 12, color: CP.textSecondary }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: CP.textPrimary, margin: "4px 0" }}>{s.immature ? "–" : int(s.n)}</div>
                <div style={{ height: 6, borderRadius: 4, background: CP.surfaceAlt, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(1, w || 0) * 100}%`, height: "100%", background: CP.accent }} />
                </div>
                <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>
                  {i === 0 ? "100%" : s.immature ? "coorte non matura" : `${pct(s.rate)} dello step prec.${s.partial ? " ⏳" : ""}`}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

const navBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, cursor: "pointer" };
