"use client";

// Fasce e turni → «Due operatori» (26/10/2026): quando il secondo operatore in turno
// aggiunge incasso alla pagina, fascia per fascia. Calcolo e scelte in
// src/lib/fasce-duo-core.js; dati dall'API delle Fasce (campo `duo`).

import { useMemo, useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { DataTable, Notice, NUM, card } from "@/components/ds";
import { SLOTS } from "@/lib/fasce-core";
import { HIGH_LOAD, GAIN_ABS, GAIN_REL, MIN_SIDE_H } from "@/lib/fasce-duo-core";

const usd = (n) => (n == null ? "–" : `${n < 0 ? "−" : ""}$${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);
const plus = (n) => (n == null ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`);
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const fx = (v, d = 1) => (v == null ? "–" : v.toFixed(d).replace(".", ","));
const hh = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "–");
const SLOT_LABEL = Object.fromEntries(SLOTS.map((s) => [s.id, s.label]));
const btnSm = { background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body, whiteSpace: "nowrap" };

const VERDICT = {
  conviene: { label: "in due rende", color: CP.accentGreen },
  non_aggiunge: { label: "il secondo aggiunge poco", color: CP.textPrimary },
  da_provare: { label: "da provare in due", color: CP.accent },
  incerto: { label: "non si capisce ancora", color: CP.textMuted },
  pochi_dati: { label: "pochi dati", color: CP.textMuted },
};
const ACTION = {
  aggiungi: "Aggiungi il secondo",
  tieni: "Tieni in due",
  libera: "Il secondo può andare altrove",
  prova: "Prova in due",
};

function Note({ children, style }) {
  return <p style={{ fontSize: 12, color: CP.textMuted, margin: 0, lineHeight: 1.55, maxWidth: 880, ...style }}>{children}</p>;
}

function H2({ children, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0 2px" }}>
      <h2 style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>{children}</h2>
      {sub && <Note>{sub}</Note>}
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div style={{ minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: CP.textPrimary, ...NUM }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

function Cell({ s }) {
  if (!s) return <span style={{ color: CP.textMuted }}>–</span>;
  const v = VERDICT[s.verdict] || VERDICT.pochi_dati;
  const strong = s.verdict === "conviene" || s.verdict === "non_aggiunge" || s.verdict === "da_provare";
  const title = s.m
    ? `Da solo ${usd(s.m.solo_sph)}/h, il secondo ${plus(s.m.gain)}/h (± ${usd(2 * s.m.se)}), su ${hh(s.m.solo_h)} ore da solo e ${hh(s.m.duo_h)} in due confrontabili. Oggi in due il ${pct(s.duo_share)} delle ore; ${fx(s.starts_h)} fan nuovi all'ora.`
    : `${hh(s.h)} ore, in due il ${pct(s.duo_share)}; ${fx(s.starts_h)} fan nuovi all'ora. Troppe poche ore in due e da solo con lo stesso traffico per confrontarle.`;
  return (
    <span title={title} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
      <span style={{ color: strong ? v.color : CP.textSecondary, fontWeight: strong ? 500 : 400, ...NUM }}>{s.m ? `${plus(s.m.gain)}/h` : s.verdict === "da_provare" ? "da provare" : "–"}</span>
      <span style={{ fontSize: 11, color: CP.textMuted, ...NUM }}>in due {pct(s.duo_share)} · {fx(s.starts_h)} fan/h</span>
    </span>
  );
}

const th = { textAlign: "right", padding: "6px 8px", fontSize: 11.5, color: CP.textMuted, fontWeight: 500, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
const thL = { ...th, textAlign: "left" };
const td = { textAlign: "right", padding: "7px 8px", color: CP.textSecondary, borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap", verticalAlign: "top" };
const tdL = { ...td, textAlign: "left", color: CP.textPrimary };

export default function FasceDuo({ duo, onRecomputed }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [all, setAll] = useState(false);

  const todo = useMemo(() => {
    const out = [];
    for (const p of duo?.pages || []) {
      for (const [id, s] of Object.entries(p.slots || {})) {
        if (!s.action || s.action === "tieni") continue;
        out.push({ id: `${p.cid}|${id}`, page: p.name, slot: id, ...s, gain: s.m?.gain ?? null, ord: { aggiungi: 0, prova: 1, libera: 2 }[s.action] });
      }
    }
    return out.sort((a, b) => a.ord - b.ord || (b.gain ?? 0) - (a.gain ?? 0));
  }, [duo]);

  async function recompute() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/sales-coaching/fasce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recompute_duo" }) }).catch(() => null);
    if (!r?.ok) setErr("Ricalcolo non riuscito: riprova tra qualche minuto.");
    await onRecomputed?.();
    setBusy(false);
  }

  if (!duo || duo.missing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Notice>{duo?.computing ? "Sto calcolando il confronto tra turni da soli e in due (circa 30 secondi)." : "Il confronto tra turni da soli e in due non è ancora stato calcolato: si fa ogni notte. Puoi lanciarlo adesso (una lettura del warehouse, circa 1,5 centesimi)."}</Notice>
        {!duo?.computing && <button type="button" style={{ ...btnSm, alignSelf: "flex-start" }} disabled={busy} onClick={recompute}>{busy ? "Calcolo…" : "Calcola adesso"}</button>}
        {err && <Notice danger>{err}</Notice>}
      </div>
    );
  }

  const o = duo.overall;
  const w = duo.window || {};
  const lastDay = w.to ? new Date(Date.parse(`${w.to}T12:00:00Z`) - 86400000).toISOString().slice(0, 10) : null;
  const pages = duo.pages || [];
  const shown = all ? pages : pages.slice(0, 15);

  const colsTodo = [
    { key: "page", label: "Pagina" },
    { key: "slot", label: "Fascia", render: (r) => SLOT_LABEL[r.slot] || r.slot },
    { key: "action", label: "Cosa fare", sort: (r) => r.ord, render: (r) => <span style={{ color: r.action === "aggiungi" ? CP.accentGreen : r.action === "prova" ? CP.accent : CP.textPrimary, fontWeight: 500 }}>{ACTION[r.action]}</span> },
    { key: "gain", label: "Il secondo aggiunge", align: "right", render: (r) => (r.m ? <span style={NUM}>{plus(r.m.gain)}/h <span style={{ color: CP.textMuted }}>± {usd(2 * r.m.se)}</span></span> : <span style={{ color: CP.textMuted }}>non misurabile</span>) },
    { key: "solo", label: "Da solo", align: "right", muted: true, sort: (r) => r.m?.solo_sph ?? -1, render: (r) => (r.m ? `${usd(r.m.solo_sph)}/h` : "–") },
    { key: "duo_share", label: "Oggi in due", align: "right", render: (r) => pct(r.duo_share) },
    { key: "starts_h", label: "Fan nuovi all'ora", align: "right", muted: true, render: (r) => fx(r.starts_h) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 260 }}>
          <H2 sub={`Ore della stessa pagina, nella stessa fascia e con lo stesso traffico, fatte da un operatore solo e da due, dal ${dmy(w.from)} al ${dmy(lastDay)}. Traffico = fan che iniziano a scrivere in un'ora (dopo almeno un'ora di silenzio).`}>
            Quando serve il secondo operatore
          </H2>
        </div>
        <button type="button" style={btnSm} disabled={busy || duo.computing} onClick={recompute}>{busy || duo.computing ? "Aggiorno…" : "Aggiorna ora"}</button>
      </div>
      {err && <Notice danger>{err}</Notice>}

      {o ? (
        <div style={{ ...card, padding: "14px 18px", display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Tile label="Un operatore da solo" value={`${usd(o.solo_sph)}/h`} sub="incasso della pagina in un'ora" />
          <Tile label="Con il secondo" value={`${plus(o.gain)}/h`} sub={`${o.gain_pct != null ? `${o.gain_pct > 0 ? "+" : ""}${Math.round(o.gain_pct * 100)}%` : ""} a parità di pagina, fascia e traffico`} />
          {duo.pay && <Tile label="Ogni operatore guadagna" value={`$${fx(duo.pay.solo)} → $${fx(duo.pay.duo)}/h`} sub={`da solo → in due (stima: pagati circa il ${Math.round((duo.commission || 0) * 100)}% del venduto)`} />}
          <Tile label="Ore confrontate" value={hh(o.solo_h + o.duo_h)} sub={`${hh(o.duo_h)} in due, ${hh(o.solo_h)} da solo`} />
        </div>
      ) : (
        <Notice>Su queste pagine non ci sono abbastanza ore in due e da solo con lo stesso traffico per un confronto.</Notice>
      )}

      {o && (
        <div style={{ ...card, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 14, color: CP.textPrimary, margin: 0, fontWeight: 500 }}>Il secondo operatore non costa un'ora: costa metà dell'incasso a testa</p>
          <Note>
            Gli operatori sono pagati a percentuale sul venduto, quindi il secondo non ha un costo orario: ogni dollaro in più resta in buona parte all'agenzia. Il costo vero è un altro: in due la pagina incassa di più ma lo si divide, e ognuno guadagna meno all'ora{duo.pay ? ` (circa $${fx(duo.pay.solo)} da solo contro $${fx(duo.pay.duo)} in due)` : ""}. Chi guadagna meno all'ora è più facile che se ne vada, e le sue ore servono anche su altre pagine. Per questo il secondo va messo dove aggiunge davvero, non ovunque.
          </Note>
        </div>
      )}

      <H2 sub="Quanto aggiunge il secondo operatore secondo il traffico dell'ora, su tutte le pagine qui sopra.">Più traffico, più conta il secondo</H2>
      <div style={{ ...card, padding: "6px 10px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={thL}>Fan nuovi in un'ora</th>
              <th style={th}>Da solo</th>
              <th style={th}>Il secondo aggiunge</th>
              <th style={th}>Oggi in due</th>
              <th style={th}>Ore</th>
            </tr>
          </thead>
          <tbody>
            {duo.byBand.map((b) => (
              <tr key={b.id}>
                <td style={tdL}>{b.label}</td>
                <td style={{ ...td, ...NUM }}>{b.m ? `${usd(b.m.solo_sph)}/h` : "–"}</td>
                <td style={{ ...td, ...NUM, color: CP.textPrimary }}>{b.m ? `${plus(b.m.gain)}/h${b.m.gain_pct != null ? ` (${b.m.gain_pct > 0 ? "+" : ""}${Math.round(b.m.gain_pct * 100)}%)` : ""}` : "pochi dati"}</td>
                <td style={{ ...td, ...NUM }}>{pct(b.duo_share)}</td>
                <td style={{ ...td, ...NUM, color: CP.textMuted }}>{hh(b.h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 sub={`«Aggiungi» = in due rende (almeno ${usd(GAIN_ABS)}/h e il ${Math.round(GAIN_REL * 100)}% in più, anche col margine d'errore) ma oggi è in due meno di metà delle ore. «Prova» = traffico alto (${HIGH_LOAD}+ fan nuovi all'ora) e quasi mai in due: non si può misurare finché non si prova. «Il secondo può andare altrove» = spesso in due ma il secondo aggiunge poco anche nel caso migliore.`}>
        Cosa fare ({todo.length})
      </H2>
      <DataTable columns={colsTodo} rows={todo} defaultSort={{ key: "action", dir: 1 }} minWidth={860} empty="Niente da cambiare: dove il secondo rende c'è già, dove non rende non c'è." />

      <H2 sub={`Per ogni pagina e fascia: quanto aggiunge il secondo all'ora, la quota di ore già in due e il traffico. In verde dove in due rende, in grassetto dove il secondo aggiunge poco, col colore d'accento dove va provato. Il confronto si fa solo con almeno ${MIN_SIDE_H} ore da solo e ${MIN_SIDE_H} in due con lo stesso traffico; passa sopra a un numero per i dettagli.`}>
        Pagina per pagina
      </H2>
      <div style={{ ...card, padding: "6px 10px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={thL}>Pagina</th>
              <th style={th}>Tutte le fasce</th>
              {SLOTS.map((s) => <th key={s.id} style={th}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.cid}>
                <td style={tdL}>{p.name}</td>
                <td style={td}><Cell s={{ ...p, verdict: p.verdict }} /></td>
                {SLOTS.map((s) => <td key={s.id} style={td}><Cell s={p.slots[s.id]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages.length > 15 && <button type="button" style={{ ...btnSm, alignSelf: "flex-start" }} onClick={() => setAll(!all)}>{all ? "Mostra meno" : `Mostra tutte (${pages.length})`}</button>}

      <Note>
        Come si calcola: turni dei chatter HOC dal warehouse (un'ora conta per una persona se ci ha lavorato almeno 45 minuti), incasso netto della pagina in quell'ora (messaggi e mance), traffico = fan che scrivono dopo almeno un'ora di silenzio della conversazione. Il confronto da solo/in due si fa dentro gruppi con la stessa pagina, la stessa fascia e lo stesso traffico; tenendo fisso anche il giorno della settimana il risultato non cambia (+23% invece di +24% al primo calcolo). Il ± è il margine d'errore (due errori standard). Limiti: è un confronto tra ore vere, non un esperimento — in due a volte si mettono persone più brave o le giornate attese migliori, e questo resta nel numero. Il guadagno a testa è una stima dalla percentuale media delle buste CreatorsPro. Non entra in score né compensi.
      </Note>
    </div>
  );
}
