"use client";

// Coaching vendite → scheda Fasce (22/10/2026). Chi rende di più e in quali turni:
// quanto vale un'ora in ogni fascia (pagina per pagina), chi chiude basso nelle
// fasce che valgono di più e chi, bravo, ci va poco. Calcolo e scelte in
// src/lib/fasce-core.js. Dà una priorità, non un calendario: le fasce dipendono
// anche dalla disponibilità delle persone.

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS, alpha } from "@/lib/brand";
import { FilterChip, DataTable, Notice, NUM, card } from "@/components/ds";
import { SLOTS, WEAK, STRONG } from "@/lib/fasce-core";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const MONTHS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const fx = (v, d = 2) => (v == null ? "–" : v.toFixed(d).replace(".", ","));
const usd = (n) => (n == null ? "–" : `${n < 0 ? "−" : ""}$${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);
const hh = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "–");
const SLOT_LABEL = Object.fromEntries(SLOTS.map((s) => [s.id, s.label]));
const slotList = (ids) => (ids || []).map((id) => SLOT_LABEL[id] || id).join(", ");
const btnSm = { background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body, whiteSpace: "nowrap" };

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

function Bravura({ v }) {
  if (v == null) return <span style={{ color: CP.textMuted, fontSize: 12 }}>pochi dati</span>;
  const c = v >= STRONG ? CP.accentGreen : v <= WEAK ? CP.accentRed : CP.textPrimary;
  return <span style={{ color: c, ...NUM }}>{fx(v)}</span>;
}

function Chip({ children, tone }) {
  const color = tone === "bad" ? CP.accentRed : tone === "good" ? CP.accentGreen : tone === "warn" ? CP.accentSoftText : CP.textMuted;
  return <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, border: `1px solid ${alpha(color, "66")}`, color, whiteSpace: "nowrap" }}>{children}</span>;
}

const opLink = (name, label = name) => <Link href={`/leaderboard/operational/${encodeURIComponent(name)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>{label}</Link>;

/** Ore di un operatore nelle fasce di punta delle pagine passate, e dove. */
function primeStats(op, pages) {
  let h = 0;
  const where = [];
  for (const p of pages) {
    const me = p.people.find((x) => x.op === op);
    if (!me || !p.prime.length) continue;
    const ph = p.prime.reduce((t, id) => t + (me.slots[id]?.h || 0), 0);
    if (ph) { h += ph; where.push({ name: p.name, h: ph }); }
  }
  where.sort((a, b) => b.h - a.h);
  return { h, where };
}

function SlotValues({ overall }) {
  const rows = SLOTS.filter((s) => overall?.[s.id]?.sph_adj != null);
  if (!rows.length) return null;
  const best = Math.max(...rows.map((s) => overall[s.id].sph_adj));
  return (
    <div style={{ ...card, padding: "14px 18px", display: "flex", gap: 30, flexWrap: "wrap" }}>
      {rows.map((s) => (
        <div key={s.id} style={{ minWidth: 92 }}>
          <div style={{ fontSize: 13, color: CP.textSecondary }}>{s.label}</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: overall[s.id].sph_adj === best ? CP.textPrimary : CP.textSecondary, ...NUM }}>{usd(overall[s.id].sph_adj)}<span style={{ fontSize: 12, color: CP.textMuted }}>/h</span></div>
          <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{hh(overall[s.id].h)} ore</div>
        </div>
      ))}
    </div>
  );
}

function PageCard({ p }) {
  const [open, setOpen] = useState(false);
  const ops = (ids) => ids.map((o) => p.people.find((x) => x.op === o)).filter(Boolean);
  const weak = ops(p.weak_in_prime);
  const strong = ops(p.strong_outside);
  const people = p.people.filter((x) => x.h >= 10 && !x.uscita);
  const shown = open ? people : people.slice(0, 8);
  const slotsHere = SLOTS.filter((s) => p.slots[s.id]);
  const primeTxt = p.flat ? "qui le fasce valgono uguale: nessuna priorità da dare" : p.prime.length ? `vale di più ${p.prime.length > 1 ? "nelle fasce" : "il"} ${slotList(p.prime)}` : "poche ore per dire quale fascia vale di più";
  const lines = [];
  if (weak.length) lines.push(`Nelle fasce di punta chiude sotto i colleghi: ${weak.map((x) => `${x.name} (${fx(x.idx)})`).join(", ")}.`);
  if (strong.length) lines.push(`Bravi che qui ci vanno poco: ${strong.map((x) => `${x.name} (${fx(x.idx)}, ${x.prime_h} ore di punta su ${x.h})`).join(", ")}.`);
  if (p.is_duo) lines.push(`Pagina a doppio turno (${pct(p.duo)} delle fasce in due): nelle fasce di punta ci stanno due persone, c'è più spazio per i bravi.`);
  return (
    <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>{p.name}</h3>
        <span style={{ fontSize: 12.5, color: CP.textSecondary }}>{primeTxt}</span>
        {p.is_duo && <Chip>doppio turno</Chip>}
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        {slotsHere.map((s) => {
          const v = p.slots[s.id];
          const isPrime = p.prime.includes(s.id);
          return (
            <div key={s.id} style={{ fontSize: 12.5, color: isPrime ? CP.textPrimary : CP.textMuted, ...NUM }}>
              <span style={{ fontWeight: isPrime ? 500 : 400 }}>{s.label}</span> {v.sph_adj != null ? `${usd(v.sph_adj)}/h` : "pochi dati"} <span style={{ color: CP.textMuted }}>· {hh(v.h)} h</span>
            </div>
          );
        })}
      </div>
      {lines.map((l) => <p key={l} style={{ fontSize: 13, color: CP.textSecondary, margin: 0, lineHeight: 1.5 }}>{l}</p>)}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={thL}>Operatore</th>
              <th style={th}>Bravura</th>
              {slotsHere.map((s) => <th key={s.id} style={{ ...th, color: p.prime.includes(s.id) ? CP.textPrimary : CP.textMuted }}>{s.label}</th>)}
              <th style={th}>Ore qui</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const mark = p.weak_in_prime.includes(x.op) ? "bad" : p.strong_outside.includes(x.op) ? "good" : null;
              return (
                <tr key={x.op}>
                  <td style={tdL}>{opLink(x.link_name || x.name, x.name)}{mark === "bad" && <> <Chip tone="bad">basso in punta</Chip></>}{mark === "good" && <> <Chip tone="good">da portare in punta</Chip></>}{!x.active && <> <Chip>nessun turno da 3 settimane</Chip></>}</td>
                  <td style={td}><Bravura v={x.idx} /></td>
                  {slotsHere.map((s) => {
                    const c = x.slots[s.id];
                    return (
                      <td key={s.id} style={{ ...td, color: c?.h ? CP.textSecondary : CP.textMuted }}>
                        {c?.h ? `${c.h} h` : "–"}
                      </td>
                    );
                  })}
                  <td style={td}>{hh(x.h)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {people.length > 8 && <button type="button" style={{ ...btnSm, alignSelf: "flex-start" }} onClick={() => setOpen(!open)}>{open ? "Mostra meno" : `Mostra tutti (${people.length})`}</button>}
    </section>
  );
}

const th = { textAlign: "right", padding: "6px 8px", fontSize: 11.5, color: CP.textMuted, fontWeight: 500, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
const thL = { ...th, textAlign: "left" };
const td = { textAlign: "right", padding: "6px 8px", color: CP.textSecondary, borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdL = { ...td, textAlign: "left", color: CP.textPrimary };

export default function FasceTab({ splitId }) {
  const url = `/api/admin/sales-coaching/fasce${splitId ? `?split=${encodeURIComponent(splitId)}` : ""}`;
  const { data, error, mutate, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, refreshInterval: (d) => (d?.computing && !d?.pages ? 15000 : 0) });
  const [view, setView] = useState("azioni");
  const [busy, setBusy] = useState(false);

  const derived = useMemo(() => {
    if (!data?.pages) return null;
    const ops = data.operators.filter((o) => !o.uscita);
    const togliere = ops.filter((o) => o.verdict === "togliere").map((o) => ({ ...o, id: o.op, ps: primeStats(o.op, data.pages) })).sort((a, b) => (a.est ?? 0) - (b.est ?? 0));
    const portare = ops.filter((o) => o.verdict === "portare").map((o) => ({ ...o, id: o.op, ps: primeStats(o.op, data.pages) })).sort((a, b) => b.idx - a.idx);
    return { ops, togliere, portare };
  }, [data]);

  if (error) return <Notice danger>{error.message}</Notice>;
  if (isLoading || !data) return <p style={{ fontSize: 13, color: CP.textMuted }}>Caricamento…</p>;
  if (data.computing && !data.pages) return <Notice>Sto calcolando le fasce (circa 20 secondi). La pagina si aggiorna da sola.</Notice>;

  const from = data.window?.from;
  const fromTxt = from ? `dal ${Number(from.slice(8, 10))} ${MONTHS_IT[Number(from.slice(5, 7)) - 1]}` : "";
  const st = data.stability || {};
  const bw = data.bravura_window;
  const ov = data.overall || {};
  const top = SLOTS.filter((s) => ov[s.id]?.sph_adj != null).sort((a, b) => ov[b.id].sph_adj - ov[a.id].sph_adj);
  const hi = top[0];
  // confronto con la fascia più bassa tra quelle dove si lavora davvero (il 1–7 sullo
  // split ha un quinto delle ore: 2,6 volte "tanto" contro di lui esagerava)
  const maxH = Math.max(0, ...top.map((s) => ov[s.id].h || 0));
  const common = top.filter((s) => (ov[s.id].h || 0) >= maxH * 0.5);
  const lo = common[common.length - 1];
  const ratio = hi && lo && ov[lo.id].sph_adj ? ov[hi.id].sph_adj / ov[lo.id].sph_adj : null;
  const { togliere, portare, ops } = derived;
  const lostTot = togliere.reduce((s, o) => s + Math.min(0, o.est || 0), 0);

  async function recompute() {
    setBusy(true);
    await fetch("/api/admin/sales-coaching/fasce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recompute" }) }).catch(() => null);
    await mutate();
    setBusy(false);
  }

  const colsTogliere = [
    { key: "name", label: "Operatore", render: (o) => opLink(o.link_name || o.name, o.name) },
    { key: "idx", label: "Bravura", align: "right", render: (o) => <Bravura v={o.idx} /> },
    { key: "prime_share", label: "Ore in fasce di punta", align: "right", sort: (o) => o.ps.h, render: (o) => `${o.ps.h} h · ${pct(o.prime_share)}` },
    { key: "est", label: "Stima su una persona media", align: "right", render: (o) => <span title="Stima, non conto: ore di punta × valore dell'ora a pari bravura × (bravura − 1)" style={{ color: (o.est || 0) < 0 ? CP.accentRed : CP.textSecondary, ...NUM }}>{o.est == null ? "–" : usd(o.est)}</span> },
    { key: "where", label: "Dove", sortable: false, muted: true, render: (o) => <span style={{ fontSize: 12, whiteSpace: "normal", display: "inline-block", minWidth: 200 }}>{o.ps.where.slice(0, 3).map((w) => `${w.name.replace(/ - IT$/, "")} ${w.h} h`).join(" · ")}</span> },
  ];
  const colsPortare = [
    { key: "name", label: "Operatore", render: (o) => opLink(o.link_name || o.name, o.name) },
    { key: "idx", label: "Bravura", align: "right", render: (o) => <Bravura v={o.idx} /> },
    { key: "h", label: "Ore", align: "right", render: (o) => hh(o.h) },
    { key: "prime_share", label: "Quota in fasce di punta", align: "right", render: (o) => pct(o.prime_share) },
    { key: "slots", label: "Dove lavora oggi", sortable: false, muted: true, render: (o) => <span style={{ fontSize: 12 }}>{SLOTS.filter((s) => o.slots[s.id] >= 10).map((s) => `${s.label} ${o.slots[s.id]} h`).join(" · ")}</span> },
    { key: "where", label: "Pagine e loro fasce di punta", sortable: false, muted: true, render: (o) => <span style={{ fontSize: 12, whiteSpace: "normal", display: "inline-block", minWidth: 220 }}>{data.pages.filter((p) => (o.pages[p.cid] || 0) >= 20 && p.prime.length).slice(0, 3).map((p) => `${p.name.replace(/ - IT$/, "")} → ${slotList(p.prime)}`).join(" · ")}</span> },
  ];
  const colsAll = [
    { key: "name", label: "Operatore", render: (o) => opLink(o.link_name || o.name, o.name) },
    { key: "idx", label: "Bravura", align: "right", render: (o) => <Bravura v={o.idx} /> },
    { key: "h", label: "Ore", align: "right", render: (o) => hh(o.h) },
    ...SLOTS.map((s) => ({ key: `s_${s.id}`, label: s.label, align: "right", muted: true, sort: (o) => o.slots[s.id] || 0, render: (o) => (o.slots[s.id] ? `${hh(o.slots[s.id])} h` : "–") })),
    { key: "prime_share", label: "In punta", align: "right", render: (o) => pct(o.prime_share) },
    { key: "verdict", label: "Lettura", sort: (o) => o.verdict || "", render: (o) => (o.verdict === "togliere" ? <Chip tone="bad">via dalle fasce di punta</Chip> : o.verdict === "portare" ? <Chip tone="good">da portare in punta</Chip> : !o.active ? <Chip>nessun turno da 3 settimane</Chip> : <span style={{ color: CP.textMuted }}>–</span>) },
    { key: "last_day", label: "Ultimo turno", align: "right", muted: true, render: (o) => dmy(o.last_day) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>Chi rende di più, e in quali turni{data.split ? ` · ${data.split.name}` : " · tutta HOC"}</h2>
          <Note>
            Quanto vende all'ora una persona di bravura media in ogni fascia, {fromTxt} al {dmy(data.until)}.
            {hi && lo && ratio ? ` Un'ora di ${hi.label} vale ${usd(ov[hi.id].sph_adj)}, una di ${lo.label} ${usd(ov[lo.id].sph_adj)}: la stessa persona${ratio >= 1.5 ? " rende " + fx(ratio, 1) + " volte tanto" : " rende di più"} nella fascia migliore.` : ""}
          </Note>
        </div>
        <button type="button" style={btnSm} disabled={busy || data.computing} onClick={recompute}>{busy || data.computing ? "Aggiorno…" : "Aggiorna ora"}</button>
      </div>

      {data.stale && <Notice>I dati sono di più di un giorno fa: il ricalcolo notturno non è passato.</Notice>}
      {bw?.until && (Date.now() - Date.parse(bw.until)) / 86400000 > 3 && (
        <Notice>La bravura usa le vendite Infloww fino al {dmy(bw.until)}: l'export automatico di Infloww non arriva da allora. Ore e fasce sono aggiornate al {dmy(data.until)}.</Notice>
      )}
      {data.until && (Date.now() - Date.parse(data.until)) / 86400000 > 3 && (
        <Notice danger>I turni di CreatorsPro arrivano solo fino al {dmy(data.until)}: la sincronizzazione dei turni è ferma. I numeri qui sotto valgono fino a quel giorno.</Notice>
      )}
      <SlotValues overall={ov} />

      <div style={{ ...card, padding: "14px 18px" }}>
        <p style={{ fontSize: 14, color: CP.textPrimary, margin: "0 0 6px", fontWeight: 500 }}>Chi è bravo lo è in tutte le fasce</p>
        <Note style={{ marginBottom: 6 }}>Bravura = quella della scheda Squadra: vendite Infloww di ogni persona confrontate coi colleghi sulla stessa pagina e fascia{bw ? `, dal ${dmy(bw.from)} al ${dmy(bw.until)}` : ""}. CreatorsPro qui serve solo come calendario e per il valore delle fasce di ogni pagina: divide gli acquisti tra le persone a modo suo, ma il totale della pagina combacia con le transazioni Infloww.</Note>
        <Note>
          Controllo fatto sui turni (giorni pari contro giorni dispari): La bravura generale di una persona torna simile (correlazione {fx(st.general)} su {st.general_n} operatori); il fatto di rendere meglio in una certa fascia rispetto alle proprie altre quasi no ({fx(st.personal)}). Quindi la regola non è «ognuno nella sua fascia» ma «i più bravi nelle fasce che valgono di più, e chi chiude basso non ha la priorità su quelle». Quale fascia vale di più si decide pagina per pagina: non è sempre il 22–3.
        </Note>
      </div>

      <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FilterChip label={`Da spostare (${togliere.length + portare.length})`} active={view === "azioni"} onClick={() => setView("azioni")} />
        <FilterChip label={`Per pagina (${data.pages.length})`} active={view === "pagine"} onClick={() => setView("pagine")} />
        <FilterChip label={`Tutta la squadra (${ops.length})`} active={view === "squadra"} onClick={() => setView("squadra")} />
      </div>

      {view === "azioni" && (
        <>
          <H2 sub={`Bravura fino a ${fx(WEAK)} e almeno il ${Math.round(0.3 * 100)}% delle ore nelle fasce di punta delle loro pagine. La stima dice quanto rendono in meno di una persona di bravura media nelle loro ore di punta, ${fromTxt}${lostTot < 0 ? `: in tutto circa ${usd(lostTot)}` : ""} — è una stima per ordinare la lista, non un conto.`}>
            Chiudono basso nelle fasce che valgono di più ({togliere.length})
          </H2>
          <DataTable columns={colsTogliere} rows={togliere} defaultSort={{ key: "gap", dir: 1 }} minWidth={900} empty="Nessuno: nelle fasce di punta non c'è chi chiude basso." />
          <H2 sub={`Bravura da ${fx(STRONG)} in su e meno del 20% delle ore nelle fasce di punta: le prime persone a cui offrire quelle fasce, se sono disponibili.`}>
            Bravi che nelle fasce di punta ci vanno poco ({portare.length})
          </H2>
          <DataTable columns={colsPortare} rows={portare} defaultSort={{ key: "idx", dir: -1 }} minWidth={900} empty="Nessuno: i più bravi sono già nelle fasce di punta." />
        </>
      )}

      {view === "pagine" && (
        <>
          <Note>Per ogni pagina: quanto vale un'ora in ogni fascia a pari bravura (in grassetto le fasce di punta, entro il 10% della migliore) e chi le copre. Passa sopra alle ore per vedere il venduto all'ora della persona in quella fascia e quello dei colleghi.</Note>
          {data.pages.map((p) => <PageCard key={p.cid} p={p} />)}
        </>
      )}

      {view === "squadra" && (
        <DataTable columns={colsAll} rows={ops.map((o) => ({ ...o, id: o.op }))} defaultSort={{ key: "idx", dir: -1 }} minWidth={1100} maxHeight="72vh" empty="Nessun operatore." />
      )}

      <Note>
        Come si calcola: bravura dalla scheda Squadra (venduto Infloww all'ora di turno ÷ quello dei colleghi sulla stessa pagina e fascia, escluso sé stessi; 1,00 = come loro). Ore e fasce dal calendario CreatorsPro {fromTxt} al {dmy(data.until)}. Valore di un'ora = venduto della pagina in quella fascia ÷ ore di turno pesate per la bravura di chi c'era (il venduto per pagina di CreatorsPro combacia con le transazioni Infloww: 0,97-1,01 a settembre). Il confronto giorni pari/dispari è fatto sui turni, l'unica fonte con le vendite per turno. Fasce dall'ora di inizio del turno (ora italiana): 22–3, 17–22 (anche 19–01), 12–17 (anche 13–19), 7–12 (anche 7–13), 1–7. Fuori dalle liste chi è uscito nel CRM o non fa turni da 3 settimane. Correlazione, non causa; le fasce dipendono anche dalla disponibilità delle persone. Non entra in score né compensi.
      </Note>
    </div>
  );
}
