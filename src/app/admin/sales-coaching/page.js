"use client";

// Coaching vendite — la superficie del sales manager.
// Uno split = un insieme di creator. Per quello split: come vendono le creator ai
// fan che non hanno mai pagato, chi vende meglio a parità di creator, cosa fa
// vendere, il riferimento HOC (creator e operatori modello), i test in corso e
// gli esempi reali da far studiare agli operatori (/academy/vendere).
// Coaching, non score: l'indice serve a decidere chi affiancare a chi.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, PillTab } from "@/components/cp-style";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d).replace(".", ",")}%`);
const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString("it-IT")}`;
const idx = (x) => (x == null ? "—" : x.toFixed(2).replace(".", ","));
const fmtDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}` : "";
};
const deltaPts = (a, b) => (a == null || b == null ? null : (a - b) * 100);

const TABS = [
  ["panoramica", "Panoramica"],
  ["operatori", "Operatori"],
  ["riferimento", "Riferimento HOC"],
  ["comportamenti", "Cosa fa vendere"],
  ["test", "Test in corso"],
  ["esempi", "Esempi da studiare"],
  ["programma", "Come allenare"],
];

const card = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "16px 18px" };
const th = { textAlign: "right", padding: "8px 10px", fontSize: 11, color: CP.textMuted, fontWeight: 500, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap", background: CP.bgSunken };
const td = { textAlign: "right", padding: "8px 10px", fontSize: 13, color: CP.textSecondary, borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdL = { ...td, textAlign: "left", color: CP.textPrimary };
const btn = { background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}`, fontWeight: 500 };
const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body };

function Note({ children, style }) {
  return <p style={{ fontSize: 12, color: CP.textMuted, margin: 0, lineHeight: 1.55, maxWidth: 820, ...style }}>{children}</p>;
}

function H2({ children, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "6px 0 10px" }}>
      <h2 style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>{children}</h2>
      {sub && <Note>{sub}</Note>}
    </div>
  );
}

function Delta({ now, prev }) {
  const d = deltaPts(now, prev);
  if (d == null || Math.abs(d) < 0.05) return <span style={{ color: CP.textMuted, fontSize: 11 }}> ·</span>;
  return <span style={{ color: d > 0 ? CP.accentGreen : CP.accentRed, fontSize: 11 }}> {d > 0 ? "+" : "−"}{Math.abs(d).toFixed(1).replace(".", ",")}</span>;
}

function IndexCell({ v }) {
  if (v == null) return <span style={{ color: CP.textMuted }}>campione piccolo</span>;
  const c = v >= 1.1 ? CP.accentGreen : v <= 0.9 ? CP.accentRed : CP.textSecondary;
  return <span style={{ color: c, fontFamily: FONTS.mono }}>{idx(v)}</span>;
}

// sparkline della conversione settimanale (mai paganti)
function Spark({ series, w = 110, h = 26 }) {
  const pts = (series || []).map(([, n, c]) => (n >= 15 ? c : null));
  const vals = pts.filter((x) => x != null);
  if (vals.length < 2) return <span style={{ color: CP.textMuted, fontSize: 11 }}>—</span>;
  const max = Math.max(...vals, 0.05);
  const step = w / Math.max(1, pts.length - 1);
  const segs = [];
  let cur = [];
  pts.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur); cur = []; return; }
    cur.push(`${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur);
  const last = pts.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {segs.map((s, i) => <polyline key={i} points={s.join(" ")} fill="none" stroke={CP.accentDim} strokeWidth="1.5" />)}
      {last && <circle cx={last[1] * step} cy={h - 3 - (last[0] / max) * (h - 6)} r="2.5" fill={CP.accent} />}
    </svg>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: CP.textMuted }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 500, color: accent ? CP.accent : CP.textPrimary, fontFamily: FONTS.mono }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.45 }}>{sub}</span>}
    </div>
  );
}

// ── Gestione split ───────────────────────────────────────────────────────────
function SplitEditor({ names, allIds, split, onSaved, onCancel }) {
  const [name, setName] = useState(split?.name || "");
  const [sel, setSel] = useState(new Set(split?.creator_ids || []));
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = allIds
    .map((id) => ({ id, name: names[String(id)] || String(id) }))
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/sales-coaching/splits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: split?.id, name, creator_ids: [...sel] }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Salvataggio fallito");
      onSaved(d.split);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!split?.id) return;
    setBusy(true);
    await fetch(`/api/admin/sales-coaching/splits?id=${encodeURIComponent(split.id)}`, { method: "DELETE" });
    setBusy(false);
    onSaved(null);
  }
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label htmlFor="split-name" style={{ fontSize: 12, color: CP.textMuted }}>Nome split</label>
        <input id="split-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Split Nicholas" style={{ ...input, minWidth: 220 }} />
        <input id="split-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca creator" style={{ ...input, minWidth: 160 }} />
        <span style={{ fontSize: 12, color: CP.textMuted }}>{sel.size} creator scelte</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6, maxHeight: 280, overflowY: "auto" }}>
        {list.map((c) => (
          <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textSecondary, padding: "4px 6px", borderRadius: 6, background: sel.has(c.id) ? CP.surfaceAlt : "transparent", cursor: "pointer" }}>
            <input type="checkbox" id={`split-c-${c.id}`} checked={sel.has(c.id)} onChange={() => { const n = new Set(sel); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setSel(n); }} style={{ accentColor: CP.accent }} />
            {c.name}
          </label>
        ))}
      </div>
      {err && <span style={{ color: CP.accentRed, fontSize: 12 }}>{err}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnPrimary} disabled={busy} onClick={save}>{split ? "Salva modifiche" : "Crea split"}</button>
        <button style={btn} onClick={onCancel}>Annulla</button>
        {split && <button style={{ ...btn, marginLeft: "auto", color: CP.accentRed }} disabled={busy} onClick={remove}>Elimina split</button>}
      </div>
    </div>
  );
}

// ── Viste ────────────────────────────────────────────────────────────────────
function Panoramica({ d, name }) {
  const t = d.pages.total;
  const g = d.reference.goal;
  const org = d.reference.org;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        <Kpi label="% che compra in chat · fan mai paganti" value={pct(t.conv_nonpayer)} accent sub={`Creator modello ${pct(g?.conv_nonpayer)} · tutta HOC ${pct(org?.conv_nonpayer)}`} />
        <Kpi label="PPV mandati a chat ferma" value={pct(t.dead_share)} sub={`Lì compra solo il ${pct(t.conv_dead)}. Creator modello: ${pct(g?.dead_share)} dei PPV`} />
        <Kpi label="PPV con bonus o prezzo di riferimento" value={pct(t.tech_share)} sub={`Creator modello ${pct(g?.tech_share)}`} />
        <Kpi label="% che compra in chat · fan già paganti" value={pct(t.conv_payer)} sub={`Creator modello ${pct(g?.conv_payer)}`} />
      </div>
      <div>
        <H2 sub={`Ultime ${d.meta.recent_n} settimane chiuse (${fmtDate(d.meta.recent_weeks[0])}–${fmtDate(d.meta.recent_weeks.at(-1))}), tra parentesi la variazione in punti rispetto alle ${d.meta.recent_n} precedenti. "In chat" esclude il messaggio di benvenuto automatico.`}>Tabella creator {name ? `· ${name}` : "· tutta HOC"}</H2>
        <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Creator</th><th style={th}>Incasso PPV</th><th style={th}>PPV in chat</th><th style={th}>% compra · mai paganti</th><th style={th}>% compra · già paganti</th><th style={th}>PPV a chat viva</th><th style={th}>PPV a chat ferma</th><th style={th}>Bonus o prezzo di rif.</th><th style={th}>% compra · benvenuto</th>
            </tr></thead>
            <tbody>
              {d.pages.pages.map((p) => (
                <tr key={p.creator_id}>
                  <td style={tdL}>{d.names[String(p.creator_id)] || p.creator_id}</td>
                  <td style={td}>{usd(p.recent.net)}</td>
                  <td style={td}>{p.recent.chat_ppv.toLocaleString("it-IT")}</td>
                  <td style={{ ...td, color: CP.textPrimary }}>{pct(p.recent.conv_nonpayer)}<Delta now={p.recent.conv_nonpayer} prev={p.prev.conv_nonpayer} /></td>
                  <td style={td}>{pct(p.recent.conv_payer)}</td>
                  <td style={td}>{pct(p.recent.live_share, 0)}</td>
                  <td style={td}>{pct(p.recent.dead_share, 0)}</td>
                  <td style={td}>{pct(p.recent.tech_share, 0)}</td>
                  <td style={td}>{pct(p.recent.conv_welcome)}</td>
                </tr>
              ))}
              {!d.pages.pages.length && <tr><td style={{ ...tdL, color: CP.textMuted }} colSpan={9}>Nessun PPV su queste creator nel periodo. Controlla le creator dello split con "Modifica split".</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: CP.textPrimary }}>Andamento settimanale: fan mai paganti che comprano in chat</span>
          <span style={{ fontSize: 12, color: CP.textMuted }}>{d.series.map((s) => `${fmtDate(s.wk)} ${pct(s.conv, 0)}`).join(" · ")}</span>
        </div>
        <Spark series={d.series.map((s) => [s.wk, s.ppv, s.conv])} w={600} h={60} />
      </div>
    </div>
  );
}

function Operatori({ d }) {
  const [all, setAll] = useState(false);
  const rows = d.operators.filter((o) => all || o.reliable);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <H2 sub={`Indice di resa = quanto incassa l'operatore rispetto a quanto ci si aspetta sui SUOI PPV (stessa creator, stesso tipo di fan). 1,00 = in media; sopra 1,10 verde, sotto 0,90 rosso. Solo turni in cui era l'unico in chat; indice solo sopra ${d.meta.min_op_ppv} PPV. Serve a decidere chi affiancare a chi: non è una classifica da pubblicare né una base per decisioni disciplinari.`}>Chi vende meglio a parità di creator</H2>
      <label style={{ fontSize: 12, color: CP.textSecondary, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" id="ops-all" checked={all} onChange={(e) => setAll(e.target.checked)} style={{ accentColor: CP.accent }} /> Mostra anche chi ha pochi PPV
      </label>
      <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Operatore</th><th style={th}>Indice di resa</th><th style={th}>PPV in chat</th><th style={th}>% compra · mai paganti</th><th style={th}>PPV a chat viva</th><th style={th}>PPV a chat ferma</th><th style={th}>Bonus o prezzo di rif.</th><th style={{ ...th, textAlign: "left" }}>Creator</th><th style={th}>Andamento 8 settimane</th>
          </tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.op}>
                <td style={tdL}><Link href={`/leaderboard/operational/${encodeURIComponent(o.op)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>{o.op}</Link></td>
                <td style={td}><IndexCell v={o.index_net} /></td>
                <td style={td}>{o.ppv.toLocaleString("it-IT")}</td>
                <td style={td}>{pct(o.conv_nonpayer)}</td>
                <td style={td}>{pct(o.live_share, 0)}</td>
                <td style={td}>{pct(o.dead_share, 0)}</td>
                <td style={td}>{pct(o.tech_share, 0)}</td>
                <td style={{ ...td, textAlign: "left", color: CP.textMuted }}>{o.creators.slice(0, 3).map((c) => d.names[String(c.creator_id)] || c.creator_id).join(", ")}</td>
                <td style={td}><Spark series={o.series} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td style={{ ...tdL, color: CP.textMuted }} colSpan={9}>Nessun operatore con abbastanza PPV in turno singolo nel periodo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Riferimento({ d }) {
  const r = d.reference;
  const t = d.pages.total;
  const rows = [
    ["% che compra in chat · fan mai paganti", t.conv_nonpayer, r.goal?.conv_nonpayer, true],
    ["PPV mandati a chat viva", t.live_share, r.goal?.live_share, true],
    ["PPV mandati a chat ferma", t.dead_share, r.goal?.dead_share, false],
    ["PPV con bonus o prezzo di riferimento", t.tech_share, r.goal?.tech_share, true],
    ["% che compra in chat · fan già paganti", t.conv_payer, r.goal?.conv_payer, true],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <H2 sub="Le creator di tutta HOC dove i fan mai paganti comprano di più in chat (con un volume minimo di PPV). Sono il traguardo di formazione: il pubblico cambia da creator a creator, quindi i numeri sono una direzione, non una promessa.">Creator modello di HOC</H2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {r.model_pages.map((p) => (
            <span key={p.creator_id} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, background: CP.accentSoft, color: CP.accentSoftText }}>
              {d.names[String(p.creator_id)] || p.creator_id} · {pct(p.conv_nonpayer)}
            </span>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Comportamento</th><th style={th}>{d.split ? d.split.name : "Tutta HOC"}</th><th style={th}>Creator modello</th><th style={th}>Distanza</th></tr></thead>
          <tbody>
            {rows.map(([label, now, goal, up]) => {
              const dd = deltaPts(now, goal);
              const good = dd == null ? null : up ? dd >= 0 : dd <= 0;
              return (
                <tr key={label}>
                  <td style={tdL}>{label}</td>
                  <td style={td}>{pct(now)}</td>
                  <td style={{ ...td, color: CP.textPrimary }}>{pct(goal)}</td>
                  <td style={{ ...td, color: good == null ? CP.textMuted : good ? CP.accentGreen : CP.accentRed }}>{dd == null ? "—" : `${dd > 0 ? "+" : "−"}${Math.abs(dd).toFixed(1).replace(".", ",")} punti`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <H2 sub={`I migliori a parità di creator su tutta HOC (${r.operators_evaluated} operatori valutati) e i migliori dei team delle creator modello. Da qui vengono gli esempi da studiare. Sono un riferimento per la formazione: chi mettere su una creator si sceglie tra gli operatori dello split, nella scheda Operatori.`}>Operatori modello</H2>
        <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ ...th, textAlign: "left" }}>Operatore</th><th style={{ ...th, textAlign: "left" }}>Perché</th><th style={th}>Indice di resa</th><th style={th}>% compra · mai paganti</th><th style={th}>PPV a chat viva</th><th style={th}>Bonus o prezzo di rif.</th><th style={{ ...th, textAlign: "left" }}>Creator</th></tr></thead>
            <tbody>
              {r.operators.map((o) => (
                <tr key={o.op}>
                  <td style={tdL}>{o.op}</td>
                  <td style={{ ...td, textAlign: "left", color: CP.textMuted }}>{o.source}</td>
                  <td style={td}><IndexCell v={o.index_net} /></td>
                  <td style={td}>{pct(o.conv_nonpayer)}</td>
                  <td style={td}>{pct(o.live_share, 0)}</td>
                  <td style={td}>{pct(o.tech_share, 0)}</td>
                  <td style={{ ...td, textAlign: "left", color: CP.textMuted }}>{o.creators.slice(0, 2).map((c) => d.names[String(c.creator_id)] || c.creator_id).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Comportamenti({ d }) {
  const order = ["bonus", "anchor", "objection", "live", "q_hi", "dead"];
  const Bar = ({ v, max, strong }) => (
    <div style={{ height: 8, background: CP.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, ((v || 0) / max) * 100)}%`, height: "100%", background: strong ? CP.accent : CP.accentDim }} />
    </div>
  );
  const max = Math.max(0.05, ...order.flatMap((k) => [d.lifts.org[k]?.with || 0, d.lifts.org[k]?.without || 0, d.lifts.split[k]?.with || 0, d.lifts.split[k]?.without || 0]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <H2 sub="Solo fan che non hanno mai pagato, solo vendite in chat. Conversione CON e SENZA il comportamento, confrontata dentro la stessa creator e allo stesso punto della relazione col fan (primo PPV, secondo, …). Sono correlazioni: dicono dove guardare, la conferma la dà un test.">Cosa fa comprare chi non ha mai comprato</H2>
      {order.map((k) => {
        const o = d.lifts.org[k], s = d.lifts.split[k];
        return (
          <div key={k} style={{ ...card, display: "grid", gridTemplateColumns: "minmax(200px, 1.3fr) 2fr", gap: 16, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13.5, color: CP.textPrimary }}>{d.lifts.labels[k]}</div>
              <div style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 3 }}>usato nel {pct(s?.usage, 0)} dei PPV {d.split ? "dello split" : ""} · {pct(o?.usage, 0)} in HOC</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px", gap: "4px 10px", alignItems: "center", fontSize: 12 }}>
              {[[d.split ? "Split" : "HOC", s], ...(d.split ? [["Tutta HOC", o]] : [])].map(([lab, x]) => (
                <div key={lab} style={{ display: "contents" }}>
                  <span style={{ color: CP.textMuted }}>{lab}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><Bar v={x?.with} max={max} strong /><Bar v={x?.without} max={max} /></div>
                  <span style={{ fontFamily: FONTS.mono, color: CP.textSecondary, textAlign: "right" }}>{x?.with == null ? "pochi dati" : `${pct(x.with)} / ${pct(x.without)}`}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <Note>Barra piena = con il comportamento, barra chiara = senza. La velocità di risposta non compare perché nelle nostre chat non distingue chi vende da chi no: rispondono bene quasi tutti.</Note>
    </div>
  );
}

function ExperimentForm({ d, exp, onDone }) {
  const pages = (d.split ? d.split.creator_ids : d.pages.pages.map((p) => p.creator_id)).map((id) => ({ id, name: d.names[String(id)] || String(id) }));
  const [f, setF] = useState({
    name: exp?.name || "",
    creator_id: exp?.creator_id || pages[0]?.id || "",
    start: exp?.start || new Date().toISOString().slice(0, 10),
    target: exp?.target != null ? String(Math.round(exp.target * 1000) / 10) : "",
    operators: (exp?.operators || []).join(", "),
    note: exp?.note || "",
    status: exp?.status || "in corso",
  });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr(null);
    const body = { ...f, id: exp?.id, creator_id: Number(f.creator_id), target: f.target === "" ? null : Number(String(f.target).replace(",", ".")) / 100, operators: f.operators.split(",").map((s) => s.trim()).filter(Boolean) };
    const r = await fetch("/api/admin/sales-coaching/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const dd = await r.json();
    if (!r.ok) return setErr(dd.error || "Salvataggio fallito");
    onDone();
  }
  const opNames = d.operators.map((o) => o.op);
  return (
    <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Nome del test<input id="exp-name" style={input} value={f.name} onChange={set("name")} placeholder="es. Operatori forti su Martina" /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Creator
        <select id="exp-page" style={input} value={f.creator_id} onChange={set("creator_id")}>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Inizio<input id="exp-start" type="date" style={input} value={f.start} onChange={set("start")} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Obiettivo mai paganti (%)<input id="exp-target" style={input} value={f.target} onChange={set("target")} placeholder="es. 10" /></label>
      <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Operatori del test (separati da virgola, nomi come in CreatorsPro)
        <input id="exp-ops" list="exp-ops-list" style={input} value={f.operators} onChange={set("operators")} placeholder="es. Omar Hassan Aly Hassanein, Joshua De Luca" />
        <datalist id="exp-ops-list">{opNames.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Cosa cambia (note)<textarea id="exp-note" rows={2} style={input} value={f.note} onChange={set("note")} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>Stato
        <select id="exp-status" style={input} value={f.status} onChange={set("status")}><option>in corso</option><option>chiuso</option></select>
      </label>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center" }}>
        <button style={btnPrimary} onClick={save}>{exp ? "Salva test" : "Avvia test"}</button>
        <button style={btn} onClick={onDone}>Annulla</button>
        {err && <span style={{ color: CP.accentRed, fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}

function Test({ d, reload }) {
  const [edit, setEdit] = useState(null); // null | "new" | exp
  const scope = d.split ? new Set(d.split.creator_ids) : null;
  const list = d.experiments.filter((e) => !scope || scope.has(e.creator_id));
  async function remove(id) {
    await fetch(`/api/admin/sales-coaching/experiments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <H2 sub="Un test = un cambiamento su una creator (operatori diversi, un'abitudine nuova) e un numero da guardare: quanti fan mai paganti comprano in chat. Il confronto è con le 4 settimane prima dell'inizio. I dati si aggiornano ogni notte e contano i PPV fino a 3 giorni fa (servono 72 ore per sapere se sono stati comprati).">Test in corso</H2>
      {edit ? <ExperimentForm d={d} exp={edit === "new" ? null : edit} onDone={() => { setEdit(null); reload(); }} /> : <div><button style={btnPrimary} onClick={() => setEdit("new")}>Nuovo test</button></div>}
      {list.map((e) => {
        const v = e.view;
        const tmax = Math.max(0.05, v.target || 0, ...v.weeks.map((w) => w.conv || 0));
        return (
          <div key={e.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 15, color: CP.textPrimary }}>{e.name}</div>
                <div style={{ fontSize: 12, color: CP.textMuted }}>{d.names[String(e.creator_id)] || e.creator_id} · dal {fmtDate(e.start)} · {e.status}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={btn} onClick={() => setEdit(e)}>Modifica</button>
                <button style={{ ...btn, color: CP.accentRed }} onClick={() => remove(e.id)}>Elimina</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Kpi label="Prima (4 settimane)" value={pct(v.baseline)} sub={`${v.baseline_ppv} PPV a mai paganti`} />
              <Kpi label="Durante il test" value={pct(v.during)} accent sub={v.enough_data ? `${v.during_ppv} PPV` : `${v.during_ppv} PPV: troppo presto per giudicare`} />
              <Kpi label="Obiettivo" value={pct(v.target)} sub={v.target != null && v.during != null && v.enough_data ? (v.during >= v.target ? "raggiunto" : "non ancora") : ""} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 90, paddingTop: 6 }} aria-label="conversione settimanale">
              {v.weeks.map((w) => (
                <div key={w.wk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: CP.textMuted }}>{w.ppv >= 15 ? pct(w.conv, 0) : "—"}</span>
                  <div style={{ width: "100%", maxWidth: 40, height: `${w.ppv >= 15 ? Math.max(2, ((w.conv || 0) / tmax) * 56) : 2}px`, background: w.wk >= v.start_wk ? CP.accent : CP.accentDim, borderRadius: 3 }} />
                  <span style={{ fontSize: 10.5, color: CP.textMuted }}>{fmtDate(w.wk)}</span>
                </div>
              ))}
            </div>
            {v.operators.length > 0 && (
              <div style={{ fontSize: 12.5, color: CP.textSecondary, display: "flex", flexWrap: "wrap", gap: 14 }}>
                {v.operators.map((o) => <span key={o.op}>{o.op}: <b style={{ fontWeight: 500, color: CP.textPrimary }}>{pct(o.conv)}</b> <span style={{ color: CP.textMuted }}>({o.ppv} PPV)</span></span>)}
              </div>
            )}
            {e.note && <Note>{e.note}</Note>}
          </div>
        );
      })}
      {!list.length && !edit && <Note>Nessun test su queste creator. Esempio: "Joshua De Luca e Mattia Tripodi su Martina in turni singoli per due settimane, obiettivo 10%".</Note>}
    </div>
  );
}

function ChatView({ messages }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {messages.map((m, i) => (
        <div key={i} style={{ alignSelf: m.from === "op" ? "flex-end" : "flex-start", maxWidth: "82%", background: m.from === "op" ? CP.accentSoft : CP.surfaceAlt, color: CP.textPrimary, borderRadius: 10, padding: "6px 10px", fontSize: 13, lineHeight: 1.45 }}>
          {m.price ? <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.accentSoftText, marginRight: 6 }}>PPV ${m.price}</span> : null}
          {m.text}
        </div>
      ))}
    </div>
  );
}

function Esempi({ d, reload }) {
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState(null);
  async function act(action, id) {
    setBusy(id);
    await fetch("/api/admin/sales-coaching/examples", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, note: note[id] || "" }) });
    setBusy(null);
    reload();
  }
  const pending = d.examples.filter((e) => !e.approved);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <H2 sub="Vendite reali degli operatori modello a fan che non avevano mai pagato, con chat viva e bonus, prezzo di riferimento o un'obiezione gestita. Nome e username del fan sono già oscurati, ma leggi il testo prima di approvare: approvato = visibile a tutti gli operatori nella pagina Vendere in chat, senza nome dell'operatore. Aggiungi una riga su cosa guardare.">Esempi da studiare</H2>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>
        Approvati: <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{d.approved.length}</b> · <Link href="/academy/vendere" style={{ color: CP.accent }}>vedi la pagina degli operatori</Link>
      </div>
      {d.approved.map((e) => (
        <div key={e.id} style={{ ...card, borderColor: CP.accentDim }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: CP.textPrimary }}>Approvato · {e.creator} · PPV ${e.ppv_price} · {e.op}</span>
            <button style={btn} disabled={busy === e.id} onClick={() => act("unapprove", e.id)}>Togli dagli esempi</button>
          </div>
          {e.note && <Note style={{ marginTop: 6 }}>{e.note}</Note>}
        </div>
      ))}
      {pending.map((e) => (
        <div key={e.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => setOpen(open === e.id ? null : e.id)} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, color: CP.textPrimary }}>{d.names[String(e.creator_id)] || e.creator_id} · PPV ${e.ppv_price} comprato</span>
            <span style={{ fontSize: 12, color: CP.textMuted }}>{e.op} · {fmtDate(e.at)} · {open === e.id ? "chiudi" : "leggi"}</span>
          </button>
          {open === e.id && (
            <>
              <ChatView messages={e.messages} />
              <textarea id={`ex-note-${e.id}`} rows={2} placeholder="Cosa deve notare l'operatore? (es. prima il prezzo pieno, poi il pacchetto)" value={note[e.id] || ""} onChange={(ev) => setNote({ ...note, [e.id]: ev.target.value })} style={input} />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnPrimary} disabled={busy === e.id} onClick={() => act("approve", e.id)}>Approva per gli operatori</button>
                <button style={btn} disabled={busy === e.id} onClick={() => act("hide", e.id)}>Nascondi</button>
              </div>
            </>
          )}
        </div>
      ))}
      {!pending.length && <Note>Nessun nuovo esempio da rivedere: se ne aggiungono ogni notte.</Note>}
    </div>
  );
}

function Programma() {
  const steps = [
    ["Un'abitudine alla volta, per due settimane", "Si parte da \"non mandare PPV a chat ferme\" (la più facile e la più cara), poi \"bonus o prezzo di riferimento a ogni offerta a un mai pagante\", poi \"rispondere all'obiezione con un numero invece di mollare\"."],
    ["Un numero personale, non una classifica", "Ogni operatore guarda i suoi numeri rispetto alla sua settimana prima (scheda Operatori, colonna 8 settimane). Le classifiche pubbliche motivano chi è in cima e scoraggiano gli altri."],
    ["Quindici minuti a settimana con ciascuno", "Due sue conversazioni (una vinta, una persa) accanto a un esempio approvato nella stessa situazione. Prima si chiede \"cosa cambieresti qui?\", poi si dice."],
    ["Pratica prima del turno", "Dieci minuti sul simulatore Academy o in coppia: una fa il fan che dice \"costa troppo\", l'altra chiude senza scendere alla sua cifra."],
    ["Affiancare, non spostare", "Chi ha indice sotto 0,90 fa alcuni turni in coppia con chi è sopra 1,10 sulla stessa creator."],
    ["Misurare dopo due settimane", "Se il numero si muove si passa all'abitudine successiva; per i cambi più grossi si apre un test nella scheda Test in corso."],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <H2 sub="Mandare un documento da leggere cambia poco: la formazione arriva sul lavoro quando il responsabile la sostiene e c'è subito occasione di praticarla (Blume et al. 2010, 89 studi). Funziona vedere esempi reali buoni e cattivi e poi provarli (Taylor et al. 2005, 117 studi), con un obiettivo specifico (Locke & Latham).">Come allenare il team</H2>
      {steps.map(([t, s], i) => (
        <div key={t} style={{ ...card, display: "grid", gridTemplateColumns: "30px 1fr", gap: 12 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 6, height: 26, display: "grid", placeItems: "center" }}>{i + 1}</span>
          <div><div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 3 }}>{t}</div><div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{s}</div></div>
        </div>
      ))}
      <Note>Il materiale per gli operatori (le quattro abitudini, la checklist prima di ogni PPV, gli esercizi e gli esempi approvati) è nella pagina <Link href="/academy/vendere" style={{ color: CP.accent }}>Vendere in chat</Link>, visibile a tutti.</Note>
    </div>
  );
}

// Glossario: le STESSE parole del tutorial per il sales manager. Se cambi un
// termine qui, cambialo anche lì (e nelle intestazioni delle tabelle).
const GLOSSARY = [
  ["Creator", "Ogni account è una creator a sé: \"Martina Scavo - IT\" e un eventuale \"- EN\" sono due righe diverse."],
  ["Split", "Il gruppo di creator seguito da un sales manager."],
  ["PPV in chat", "PPV mandato a mano in chat. Non conta i messaggi di massa né il PPV di benvenuto."],
  ["PPV di benvenuto", "Il PPV che parte da solo quando un fan si iscrive. È misurato a parte perché nessun operatore lo sceglie."],
  ["Fan mai pagante", "Un fan che fino a quel momento non ha mai comprato niente da quella creator."],
  ["% che compra", "Su 100 PPV mandati, quanti vengono comprati entro 72 ore."],
  ["Chat viva / ferma", "Viva: il fan ha scritto almeno 3 messaggi nell'ora prima del PPV. Ferma: nell'ora prima non ha scritto niente."],
  ["Bonus o prezzo di riferimento", "Nell'ora prima del PPV l'operatore ha offerto qualcosa in più (\"ti mando anche…\") o ha detto quanto vale normalmente (\"di solito lo mando a 60…\")."],
  ["Indice di resa", "Quanto incassa un operatore rispetto a quanto si incassa di solito su quelle creator con quel tipo di fan. 1,00 = nella media."],
  ["Creator modello", "Le creator di tutta HOC dove i fan mai paganti comprano di più: il traguardo."],
];

function Glossary() {
  return (
    <details style={{ ...card, padding: "10px 14px", marginBottom: 16 }}>
      <summary style={{ cursor: "pointer", fontSize: 13, color: CP.textPrimary }}>Le parole usate in questa pagina</summary>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: "6px 16px", margin: "12px 0 4px" }}>
        {GLOSSARY.map(([t, d]) => (
          <div key={t} style={{ display: "contents" }}>
            <dt style={{ fontSize: 13, color: CP.textPrimary }}>{t}</dt>
            <dd style={{ margin: 0, fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{d}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────
export default function SalesCoachingPage() {
  const [splitId, setSplitId] = useState(null);
  const [tab, setTab] = useState("panoramica");
  const [editing, setEditing] = useState(null); // null | "new" | split
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("sales-coaching:split");
      if (s) setSplitId(s);
      const h = window.location.hash.replace("#", "");
      if (TABS.some(([k]) => k === h)) setTab(h);
    } catch { /* storage non disponibile: si parte da tutta HOC */ }
  }, []);
  const chooseSplit = (id) => {
    setSplitId(id);
    try { id ? localStorage.setItem("sales-coaching:split", id) : localStorage.removeItem("sales-coaching:split"); } catch { /* ok */ }
  };

  const url = `/api/admin/sales-coaching${splitId ? `?split=${encodeURIComponent(splitId)}` : ""}`;
  const { data, error, mutate, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, refreshInterval: (d) => (d?.computing ? 15000 : 0) });

  const allIds = useMemo(() => (data?.names ? Object.keys(data.names).map(Number) : []), [data?.names]);

  // Rete di sicurezza per il ricalcolo notturno (25/09: il giro del dispatcher
  // non è partito e la pagina mostrava dati di ieri): se chi apre la pagina
  // trova i dati scaduti, parte UN solo ricalcolo per visita. Il lock
  // single-flight lato server evita doppioni tra più persone.
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  useEffect(() => {
    if (!data?.meta?.stale || data.computing || autoRefreshed) return;
    setAutoRefreshed(true);
    fetch("/api/admin/sales-coaching", { method: "POST" }).catch(() => {}).finally(() => mutate());
  }, [data?.meta?.stale, data?.computing, autoRefreshed, mutate]);

  async function recompute() {
    setRecomputing(true);
    await fetch("/api/admin/sales-coaching", { method: "POST" }).catch(() => {});
    setRecomputing(false);
    mutate();
  }

  const header = (
    <PageHeader
      section="Performance · Coaching vendite"
      title="Vendere in chat"
      subtitle="Come vendono le creator del tuo split ai fan che non hanno mai pagato, chi lo fa meglio a parità di creator, cosa li fa comprare e come allenare il team. Aggiornato ogni notte."
    />
  );

  if (error) return <div style={{ padding: "8px 0" }}>{header}<div style={{ ...card, color: CP.accentRed, fontSize: 13 }}>{String(error.message).includes("scope") || String(error.message).includes("capability") ? "Questa pagina è riservata a sales manager e admin." : error.message}</div></div>;
  if (isLoading || !data) return <div>{header}<Note>Caricamento…</Note></div>;
  if (data.bigquery === false) return <div>{header}<Note>Il collegamento al warehouse non è configurato.</Note></div>;
  if (data.computing && !data.pages) return <div>{header}<div style={{ ...card, fontSize: 13, color: CP.textSecondary }}>Sto calcolando i dati di tutta HOC (circa 20 secondi). La pagina si aggiorna da sola.</div></div>;

  const split = data.split;
  return (
    <div>
      {header}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <label htmlFor="split-pick" style={{ fontSize: 12, color: CP.textMuted }}>Split</label>
        <select id="split-pick" value={splitId || ""} onChange={(e) => chooseSplit(e.target.value || null)} style={input}>
          <option value="">Tutta HOC</option>
          {(data.splits || []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.creator_ids.length})</option>)}
        </select>
        <button style={btn} onClick={() => setEditing("new")}>Nuovo split</button>
        {split && <button style={btn} onClick={() => setEditing(split)}>Modifica split</button>}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: CP.textMuted }}>
          Dati al {new Date(data.meta.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {data.meta.stale ? (autoRefreshed ? " · aggiorno…" : " · da aggiornare") : ""}
        </span>
        <button style={btn} disabled={recomputing || data.computing} onClick={recompute}>{recomputing || data.computing ? "Aggiorno…" : "Aggiorna ora"}</button>
      </div>
      {splitId && !split && <Note style={{ marginBottom: 12, color: CP.accentRed }}>Lo split scelto non esiste più: stai vedendo tutta HOC.</Note>}
      {editing && (
        <SplitEditor
          names={data.names}
          allIds={allIds}
          split={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(s) => { setEditing(null); chooseSplit(s ? s.id : null); mutate(); }}
        />
      )}
      <Glossary />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20, borderBottom: `1px solid ${CP.border}`, paddingBottom: 10 }}>
        {TABS.map(([k, l]) => <PillTab key={k} active={tab === k} onClick={() => { setTab(k); try { history.replaceState(null, "", `#${k}`); } catch { /* ok */ } }}>{l}</PillTab>)}
      </div>
      {tab === "panoramica" && <Panoramica d={data} name={split?.name} />}
      {tab === "operatori" && <Operatori d={data} />}
      {tab === "riferimento" && <Riferimento d={data} />}
      {tab === "comportamenti" && <Comportamenti d={data} />}
      {tab === "test" && <Test d={data} reload={mutate} />}
      {tab === "esempi" && <Esempi d={data} reload={mutate} />}
      {tab === "programma" && <Programma />}
      <Note style={{ marginTop: 28 }}>
        Come si calcola: PPV mandati a mano in chat (esclusi messaggi di massa e il benvenuto automatico), comprato = acquisto dello stesso fan per lo stesso importo entro 72 ore (abbinamento dedotto, uguale per tutte le creator). Operatori solo nei turni in cui erano gli unici in chat (circa metà dei PPV: i turni in duo non si possono attribuire). Bonus, prezzo di riferimento e obiezioni sono riconosciuti da parole chiave, quindi qualcuno sfugge. Non entra in score né compensi.
      </Note>
    </div>
  );
}
