"use client";

// Calendario S4S — chi scambia promozione con chi, giorno per giorno, e quanto
// ha reso ogni scambio. Sostituisce il "Calendario S4S Automatico 2.0" su Google
// Sheets (ott 2026): le pagine arrivano dallo split, il calendario non si ferma
// dopo un giro e ogni scambio si misura dal suo link di tracciamento.
// Logica in lib/s4s-core.js (testata), dati in /api/admin/s4s.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, FilterChip, DataTable, Notice, SectionTitle, card, NUM } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { fmtInt, fmtPct, MONTHS_IT } from "@/lib/format";
import { fillCaption, photosFor, needsPost, needsMass } from "@/lib/s4s-core";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const TABS = [
  ["oggi", "Oggi"],
  ["planner", "Planner"],
  ["agenda", "Giorno"],
  ["kit", "Kit"],
  ["risultati", "Risultati"],
  ["impostazioni", "Impostazioni"],
];
const WEEKDAYS = [[1, "lun"], [2, "mar"], [3, "mer"], [4, "gio"], [5, "ven"], [6, "sab"], [0, "dom"]];
const WD = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const LANG_LABEL = { it: "italiane", en: "inglesi", es: "spagnole", de: "tedesche", fr: "francesi" };

const dayLabel = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_IT[d.getUTCMonth()]}`;
};
const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
const int = fmtInt;
const usd = (n, d = 0) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (x) => fmtPct(x);
const FORMAT_LABEL = { massa: "messaggio di massa", post: "post", telegram: "Telegram" };

const btn = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}`, fontWeight: 500 };
const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body };
// nome del link da copiare: riquadro incassato (non monospazio: DESIGN.md)
const mono = { fontFamily: FONTS.body, fontSize: 12.5, background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, borderRadius: 6, padding: "1px 6px" };

function Note({ children, style }) {
  return <p style={{ fontSize: 12.5, color: CP.textMuted, margin: 0, lineHeight: 1.55, maxWidth: 860, ...style }}>{children}</p>;
}

function CopyButton({ text, label = "Copia", small }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch { /* appunti non disponibili: il testo resta selezionabile */ }
  }
  return (
    <button type="button" onClick={copy} title={text} aria-label={`${label}: ${text}`}
      style={small ? { ...btn, padding: "3px 7px", fontSize: 12 } : btn}>
      {done ? <Check size={small ? 12 : 14} /> : <Copy size={small ? 12 : 14} />}{!small && (done ? "Copiato" : label)}
    </button>
  );
}

// Testo del giorno da incollare nel gruppo WhatsApp: per ogni accordo ora, formato e il
// link già creato (se incollato) o il nome con cui crearlo.
const fmtLabel = (f) => FORMAT_TEXT[f] || f;
function dayText(d, only) {
  const lines = [`S4S · ${dayLabel(d.day)}`];
  for (const x of activeDeals(d).filter((x) => !only || x.a.id === only || x.b.id === only)) {
    lines.push("", `• ${x.a.name} ⇄ ${x.b.name} · ${x.time}${x.status === "proposto" ? " (da confermare)" : ""}`);
    for (const [s, o] of [[x.a, x.b], [x.b, x.a]]) {
      const extra = s.fmt === "post_mass" || s.fmt === "mass" ? ` (mass alle ${s.fmt === "mass" ? x.time : x.mass_time})` : "";
      lines.push(`   ${s.name} pubblica ${o.name}: ${fmtLabel(s.fmt)}${extra}`);
      lines.push(o.url ? `   link da usare: https://${o.url}` : `   ${o.name} crea il link: ${o.link}`);
    }
  }
  if (!only && d.rest.length) lines.push("", `Riposa: ${d.rest.map((r) => r.name).join(", ")}`);
  return lines.join("\n");
}

// ── Agenda (13/10/2026, sul modello dello "S4S Schedule" di Infloww) ────────
// Pagine a sinistra, scambi del giorno al centro come schede con lo stato di ogni
// metà, mini calendario e numeri a destra. Il link creato su OnlyFans si incolla
// sulla sua scheda: l'abbinamento diventa per URL, non per nome.
const initials = (name) => name.split(" ").filter((w) => !/^(IT|EN|ES)$/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function Avatar({ name, size = 34 }) {
  return (
    <span aria-hidden style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textSecondary, fontSize: size * 0.36, fontWeight: 500 }}>
      {initials(name)}
    </span>
  );
}

// Stato: forma + parola, non solo colore (negli stili Casa l'accento è neutro)
const STATUS_STYLE = {
  futuro: { border: `1px dashed ${CP.border}`, color: CP.textMuted },
  "da-fare": { border: `1px solid ${CP.attn}`, color: CP.attn, icon: "!" },
  mancante: { border: `1px dashed ${CP.attn}`, color: CP.textMuted },
  pronto: { border: `1px solid ${CP.border}`, color: CP.textSecondary, icon: "●" },
  pubblicato: { border: `1px solid ${CP.accent}`, color: CP.accentSoftText, icon: "↗" },
  misurato: { border: `1px solid ${CP.accentGreen}`, color: CP.accentGreen, icon: "✓" },
};
function StatusChip({ status }) {
  const st = STATUS_STYLE[status.code] || STATUS_STYLE.futuro;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, fontSize: 12, whiteSpace: "nowrap", border: st.border, color: st.color, ...NUM }}>
      {st.icon && <span aria-hidden style={{ fontSize: 10 }}>{st.icon}</span>}{status.label}
    </span>
  );
}

const DONE = new Set(["pronto", "pubblicato", "misurato"]);
const activeDeals = (d) => d.deals.filter((x) => x.status !== "annullato");
const sides = (d) => activeDeals(d).flatMap((x) => [x.a, x.b]);

function PasteLink({ splitId, day, s, partner, reload }) {
  const [val, setVal] = useState("");
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save(url) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/admin/s4s", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", split: splitId, day, receiver: s.id, partner: partner.id, url }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Salvataggio fallito"); return; }
    setVal(""); setEdit(false); reload();
  }
  if (s.url && !edit) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <a href={`https://${s.url}`} target="_blank" rel="noreferrer" style={{ ...mono, color: CP.textPrimary, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</a>
          <CopyButton text={`https://${s.url}`} small label="Copia il link" />
          {s.url_source === "incollato"
            ? <button type="button" onClick={() => setEdit(true)} style={{ ...btn, padding: "3px 8px", fontSize: 12 }}>Cambia</button>
            : <span style={{ fontSize: 12, color: CP.textMuted }} title="Trovato da solo: il nome del link porta il nome del partner">trovato</span>}
        </div>
        {s.url_mismatch && <span style={{ fontSize: 12, color: CP.attn, display: "inline-flex", gap: 5, alignItems: "center" }}><AlertTriangle size={12} />Questo link non è di @{s.handle}: forse è quello del partner</span>}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) save(val.trim()); }} style={{ display: "flex", gap: 6 }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Incolla il link creato su OnlyFans" aria-label={`Link creato su ${s.name}`} style={{ ...input, flex: 1, minWidth: 0, padding: "6px 9px" }} />
        <button type="submit" disabled={busy || !val.trim()} style={{ ...btnPrimary, padding: "6px 10px" }}>{busy ? "…" : "Salva"}</button>
        {edit && <button type="button" onClick={() => save(null)} disabled={busy} style={{ ...btn, padding: "6px 10px" }}>Togli</button>}
      </form>
      {err && <span style={{ fontSize: 12, color: CP.accentRed }}>{err}</span>}
    </div>
  );
}

function SideBlock({ s, partner, day, splitId, reload }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, padding: "12px 14px", borderRadius: 8, background: CP.bgSunken, border: `1px solid ${CP.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
        <Avatar name={s.name} size={30} />
        <div style={{ minWidth: 120, flex: 1 }}>
          <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
          {s.handle && <div style={{ fontSize: 12, color: CP.textMuted }}>@{s.handle}</div>}
        </div>
        <StatusChip status={s.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: CP.textMuted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          Nome del link <span style={mono}>{s.link}</span><CopyButton text={s.link} small label="Copia il nome del link" />
        </div>
        <PasteLink splitId={splitId} day={day} s={s} partner={partner} reload={reload} />
      </div>
      {s.last && <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>Ultimo scambio con {partner.name.split(" ")[0]} ({ddmm(s.last.day)}): {int(s.last.subs)} abbonati</div>}
    </div>
  );
}

function ExchangeCard({ p, day, splitId, reload, onEdit }) {
  const off = p.status === "annullato";
  return (
    <section style={{ ...card, padding: 12, marginBottom: 10, opacity: off ? 0.6 : 1 }}>
      <DealHeader x={p} onEdit={onEdit} />
      {!off && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 8, marginTop: 10 }}>
          <SideBlock s={p.a} partner={p.b} day={day} splitId={splitId} reload={reload} />
          <SideBlock s={p.b} partner={p.a} day={day} splitId={splitId} reload={reload} />
        </div>
      )}
    </section>
  );
}

// ── Accordi: intestazione, stato, finestra di modifica (punto 1 del ridisegno, 13/10) ──
const FORMAT_TEXT = { post: "post fissato", mass: "mass message", post_mass: "post + mass", telegram: "Telegram" };
const FORMAT_SHORT = { post: "post", mass: "mass", post_mass: "post + mass", telegram: "Telegram" };
// Forma prima del colore: proposto tratteggiato, confermato pieno, annullato barrato
const DEAL_LOOK = {
  proposto: { border: `1px dashed ${CP.textMuted}`, color: CP.textSecondary, label: "da confermare" },
  confermato: { border: `1px solid ${CP.accent}`, color: CP.accentSoftText, label: "confermato" },
  annullato: { border: `1px solid ${CP.borderSoft}`, color: CP.textMuted, label: "annullato" },
};
function DealStatus({ x }) {
  const l = DEAL_LOOK[x.status] || DEAL_LOOK.proposto;
  return <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: l.border, color: l.color, whiteSpace: "nowrap", textDecoration: x.status === "annullato" ? "line-through" : "none" }}>{l.label}{x.source === "extra" ? " · extra" : ""}</span>;
}
const pinText = (h) => (h ? `fissato ${h} h` : "non fissato");
function DealHeader({ x, onEdit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{x.a.name} ⇄ {x.b.name}</span>
      <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>ore {x.time}</span>
      <DealStatus x={x} />
      <span style={{ flexBasis: "100%", height: 0 }} />
      <span style={{ fontSize: 12.5, color: CP.textMuted }}>
        {x.a.name.split(" ")[0]} pubblica {x.b.name.split(" ")[0]}: {FORMAT_TEXT[x.a.fmt]} · {x.b.name.split(" ")[0]} pubblica {x.a.name.split(" ")[0]}: {FORMAT_TEXT[x.b.fmt]}
        {(x.a.fmt.includes("mass") || x.b.fmt.includes("mass")) ? ` · mass alle ${x.mass_time}` : ""} · {pinText(x.pin_hours)}
      </span>
      {onEdit && <button type="button" onClick={() => onEdit(x)} style={{ ...btn, padding: "4px 10px", fontSize: 12.5, marginLeft: "auto" }}>Modifica</button>}
      {x.note && <span style={{ flexBasis: "100%", fontSize: 12.5, color: CP.textSecondary }}>Nota: {x.note}</span>}
    </div>
  );
}

function FormatRadios({ name, value, onChange, legend }) {
  return (
    <fieldset style={{ margin: 0, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <legend style={{ fontSize: 12.5, color: CP.textSecondary, padding: "0 4px" }}>{legend}</legend>
      {Object.entries(FORMAT_TEXT).map(([k, l]) => (
        <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, color: CP.textPrimary, cursor: "pointer" }}>
          <input type="radio" name={name} checked={value === k} onChange={() => onChange(k)} /> {l}
        </label>
      ))}
    </fieldset>
  );
}

// Crea o modifica un accordo. deal = accordo esistente (dalla vista) oppure bozza {day, a?, b?}
function DealEditor({ v, deal, onClose, reload }) {
  const pages = v.pages.filter((p) => !p.paused);
  const isNew = !deal.id;
  const D = v.deal_defaults;
  // aperto dalla riga di una pagina: quella pagina va per prima (con il suo formato)
  const flip = deal.focus && deal.b?.id === deal.focus;
  const A = flip ? deal.b : deal.a, B = flip ? deal.a : deal.b;
  const [f, setF] = useState(() => ({
    day: deal.day, a: A?.id ?? A ?? "", b: B?.id ?? B ?? "",
    fmt_a: A?.fmt || D.fmt, fmt_b: B?.fmt || D.fmt,
    time: deal.time || D.time, mass_time: deal.mass_time || D.mass_time,
    pin_hours: deal.pin_hours ?? D.pin_hours, note: deal.note || "",
  }));
  const [same, setSame] = useState(() => (A?.fmt || D.fmt) === (B?.fmt || D.fmt));
  const [state, setState] = useState(null);
  const set = (k) => (val) => setF((o) => ({ ...o, [k]: val, ...(same && k === "fmt_a" ? { fmt_b: val } : {}) }));
  const nameOf = (id) => pages.find((p) => p.id === Number(id))?.name || "";
  const first = (id) => nameOf(id).split(" ")[0] || "…";
  const langA = pages.find((p) => p.id === Number(f.a))?.lang, langB = pages.find((p) => p.id === Number(f.b))?.lang;
  const hasMass = f.fmt_a.includes("mass") || f.fmt_b.includes("mass");
  // ultimo scambio tra le due pagine, nei due versi: dai risultati misurati
  const history = useMemo(() => {
    if (!f.a || !f.b) return null;
    const base = (id) => nameOf(id).replace(/ (IT|EN|ES)$/, "");
    const got = (recv, from) => v.results.filter((r) => r.creator_id === Number(recv) && r.partner === base(from)).sort((x, y) => (x.first_day < y.first_day ? 1 : -1))[0];
    const ra = got(f.a, f.b), rb = got(f.b, f.a);
    return ra || rb ? { ra, rb } : null;
  }, [f.a, f.b, v.results]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body) {
    setState({ busy: true });
    const r = await fetch("/api/admin/s4s", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ split: v.split.id, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setState({ error: d.error || "Salvataggio fallito" }); return; }
    setState(null); reload(); onClose();
  }
  const save = (status) => send({ action: "deal", ...f, a: Number(f.a), b: Number(f.b), status, prev_id: deal.id || null, prev_source: deal.source || null });
  const setStatus = (status) => send({ action: "deal_status", id: deal.id, status });
  const ready = f.a && f.b && f.a !== f.b && f.day;
  const field = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: CP.textSecondary };

  return (
    <Modal open onClose={onClose} title={isNew ? "Nuovo S4S" : "Accordo S4S"} maxWidth={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 24px minmax(0,1fr)", gap: 8, alignItems: "end" }}>
          <label style={field}>Pagina
            <select value={f.a} onChange={(e) => set("a")(Number(e.target.value))} style={input}>
              <option value="">Scegli…</option>
              {pages.filter((p) => p.mine || Number(f.a) === p.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <span aria-hidden style={{ textAlign: "center", color: CP.textMuted, paddingBottom: 8 }}>⇄</span>
          <label style={field}>Con
            <select value={f.b} onChange={(e) => set("b")(Number(e.target.value))} style={input}>
              <option value="">Scegli…</option>
              {pages.filter((p) => p.id !== Number(f.a)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {langA && langB && langA !== langB && <Notice>Lingue diverse ({langA.toUpperCase()} e {langB.toUpperCase()}): di solito porta pochi abbonati.</Notice>}
        {history && (
          <div style={{ fontSize: 12.5, color: CP.textSecondary, padding: "8px 10px", borderRadius: 8, background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, ...NUM }}>
            Ultimi scambi misurati: {history.ra ? `${first(f.a)} ha ricevuto ${int(history.ra.subs)} abbonati (${ddmm(history.ra.first_day)})` : `${first(f.a)}: nessun link trovato`} · {history.rb ? `${first(f.b)} ${int(history.rb.subs)} (${ddmm(history.rb.first_day)})` : `${first(f.b)}: nessun link trovato`}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <label style={field}>Giorno<input type="date" value={f.day} onChange={(e) => set("day")(e.target.value)} style={input} /></label>
          <label style={field}>Ora del post<input type="time" value={f.time} onChange={(e) => set("time")(e.target.value)} style={input} /></label>
          {hasMass && <label style={field}>Ora della mass<input type="time" value={f.mass_time} onChange={(e) => set("mass_time")(e.target.value)} style={input} /></label>}
          <label style={field}>Post fissato
            <select value={f.pin_hours} onChange={(e) => set("pin_hours")(Number(e.target.value))} style={input}>
              <option value={0}>non fissato</option><option value={12}>12 ore</option><option value={24}>24 ore</option><option value={48}>48 ore</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
            <input type="checkbox" checked={same} onChange={(e) => { setSame(e.target.checked); if (e.target.checked) setF((o) => ({ ...o, fmt_b: o.fmt_a })); }} /> stesso formato per entrambe
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <FormatRadios name="fmt_a" value={f.fmt_a} onChange={set("fmt_a")} legend={`${first(f.a)} pubblica ${first(f.b)}`} />
            {!same && <FormatRadios name="fmt_b" value={f.fmt_b} onChange={set("fmt_b")} legend={`${first(f.b)} pubblica ${first(f.a)}`} />}
          </div>
        </div>
        <label style={field}>Nota (facoltativa)<input value={f.note} onChange={(e) => set("note")(e.target.value)} maxLength={300} placeholder="Es. usare le foto nuove" style={input} /></label>
        {state?.error && <span style={{ fontSize: 13, color: CP.accentRed }}>{state.error}</span>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!isNew && deal.status !== "annullato" && <button type="button" disabled={state?.busy} onClick={() => setStatus("annullato")} style={{ ...btn, marginRight: "auto" }}>Annulla lo scambio</button>}
          {!isNew && deal.status === "annullato" && <button type="button" disabled={state?.busy} onClick={() => setStatus("proposto")} style={{ ...btn, marginRight: "auto" }}>Ripristina</button>}
          <button type="button" disabled={!ready || state?.busy} onClick={() => save(deal.status === "confermato" ? "confermato" : "proposto")} style={btn}>{isNew ? "Proponi" : "Salva"}</button>
          {deal.status !== "confermato" && <button type="button" disabled={!ready || state?.busy} onClick={() => save("confermato")} style={btnPrimary}>{isNew ? "Crea già confermato" : "Salva e conferma"}</button>}
        </div>
      </div>
    </Modal>
  );
}

// Planner della settimana: righe = pagine, colonne = giorni (i giorni fuori dal giro più stretti).
// Ogni casella: gli accordi della pagina quel giorno; "+" per aggiungerne uno extra.
const mondayOfISO = (s) => new Date(Date.parse(`${s}T00:00:00Z`) - ((new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
const plusDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const WD_SHORT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function Planner({ v, onEdit, onNew, onOpenDay }) {
  const pages = v.pages.filter((p) => !p.paused && p.mine);
  const byDay = useMemo(() => Object.fromEntries(v.schedule.map((d) => [d.day, d])), [v.schedule]);
  const [start, setStart] = useState(() => mondayOfISO(v.today));
  const days = Array.from({ length: 7 }, (_, i) => plusDays(start, i));
  const activeWd = new Set(v.settings.weekdays);
  const wdOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
  const hasDeals = (day) => (byDay[day]?.deals || []).length > 0;
  const wide = (day) => activeWd.has(wdOf(day)) || hasDeals(day);
  const cols = `minmax(170px, 210px) ${days.map((d) => (wide(d) ? "minmax(150px, 1fr)" : "minmax(64px, 0.45fr)")).join(" ")}`;
  const weekDeals = days.flatMap((d) => byDay[d]?.deals || []);
  const live = weekDeals.filter((x) => x.status !== "annullato");
  const confirmed = live.filter((x) => x.status === "confermato").length;
  const first = v.schedule[0]?.day || v.today, last = v.schedule[v.schedule.length - 1]?.day || v.today;
  const range = `${Number(days[0].slice(8))} ${MONTHS_IT[Number(days[0].slice(5, 7)) - 1]} – ${Number(days[6].slice(8))} ${MONTHS_IT[Number(days[6].slice(5, 7)) - 1]}`;
  const sideOf = (x, pid) => (x.a.id === pid ? { me: x.a, other: x.b } : { me: x.b, other: x.a });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>Settimana {range}</h2>
        <span style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>{live.length} scambi · {confirmed} confermati · {live.length - confirmed} da confermare</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button type="button" aria-label="Settimana prima" disabled={start <= mondayOfISO(first)} onClick={() => setStart(plusDays(start, -7))} style={{ ...btn, padding: "6px 9px" }}><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => setStart(mondayOfISO(v.today))} style={{ ...btn, padding: "6px 10px" }}>Oggi</button>
          <button type="button" aria-label="Settimana dopo" disabled={plusDays(start, 7) > last} onClick={() => setStart(plusDays(start, 7))} style={{ ...btn, padding: "6px 9px" }}><ChevronRight size={15} /></button>
          <button type="button" onClick={() => onNew({ day: v.today >= days[0] && v.today <= days[6] ? v.today : days[0] })} style={btnPrimary}>Nuovo S4S</button>
        </span>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div role="grid" aria-label={`Planner S4S, settimana ${range}`} style={{ minWidth: 980 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: cols, borderBottom: `1px solid ${CP.border}` }}>
            <div role="columnheader" style={{ padding: "10px 12px", fontSize: 12, color: CP.textMuted }}>Pagina</div>
            {days.map((day) => (
              <div key={day} role="columnheader" style={{ padding: "8px 10px", borderLeft: `1px solid ${CP.borderSoft}` }}>
                <button type="button" onClick={() => onOpenDay(day)} title="Apri il giorno" style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 12, color: wide(day) ? CP.textSecondary : CP.textMuted }}>{WD_SHORT[wdOf(day)]}</span>
                  <span style={{ fontSize: 15, fontWeight: 500, color: day === v.today ? CP.accentSoftText : wide(day) ? CP.textPrimary : CP.textMuted, textDecoration: day === v.today ? "underline" : "none", textUnderlineOffset: 3 }}>{Number(day.slice(8))}</span>
                </button>
              </div>
            ))}
          </div>
          {pages.map((p) => {
            const mine = weekDeals.filter((x) => x.status !== "annullato" && (x.a.id === p.id || x.b.id === p.id)).length;
            return (
              <div key={p.id} role="row" style={{ display: "grid", gridTemplateColumns: cols, borderBottom: `1px solid ${CP.borderSoft}`, minHeight: 76 }}>
                <div role="rowheader" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <Avatar name={p.name} size={30} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: CP.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: CP.textMuted, ...NUM }}>{mine} questa settimana</span>
                  </span>
                </div>
                {days.map((day) => {
                  const dd = byDay[day];
                  const mineDay = (dd?.deals || []).filter((x) => x.a.id === p.id || x.b.id === p.id);
                  const resting = dd?.rest?.some((r) => r.id === p.id);
                  const n = mineDay.filter((x) => x.status !== "annullato").length;
                  const canAdd = day >= v.today && n < v.max_per_day;
                  return (
                    <div key={day} role="gridcell" style={{ padding: 6, borderLeft: `1px solid ${CP.borderSoft}`, display: "flex", flexDirection: "column", gap: 5 }}>
                      {mineDay.map((x) => {
                        const { me, other } = sideOf(x, p.id);
                        const l = DEAL_LOOK[x.status] || DEAL_LOOK.proposto;
                        const done = DONE.has(me.status.code);
                        return (
                          <button key={x.id} type="button" onClick={() => onEdit({ ...x, focus: p.id })} aria-label={`${p.name} con ${other.name}, ${dayLabel(day)} ore ${x.time}, ${l.label}`}
                            style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, padding: "6px 8px", borderRadius: 8, background: CP.surfaceAlt, border: l.border, opacity: x.status === "annullato" ? 0.55 : 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 500, color: CP.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: x.status === "annullato" ? "line-through" : "none" }}>{other.name}</span>
                            <span style={{ fontSize: 11.5, color: CP.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...NUM }}>{FORMAT_SHORT[me.fmt]} · {x.time}</span>
                            <span style={{ fontSize: 11, color: l.color, display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
                              {done && <Check size={11} aria-label="link pronto" />}{l.label}{x.source === "extra" ? " · extra" : ""}
                            </span>
                          </button>
                        );
                      })}
                      {resting && mineDay.length === 0 && <span style={{ fontSize: 11.5, color: CP.textMuted, padding: "4px 2px" }}>riposa</span>}
                      {canAdd && mineDay.length === 0 && (
                        <button type="button" onClick={() => onNew({ day, a: p.id })} aria-label={`Aggiungi uno S4S a ${p.name} il ${dayLabel(day)}`}
                          style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", textAlign: "center", fontSize: 12, color: CP.textMuted, padding: "8px 0", borderRadius: 8, border: wide(day) ? `1px dashed ${CP.borderSoft}` : "none" }}>+</button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: CP.textMuted }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, height: 10, borderRadius: 3, border: DEAL_LOOK.proposto.border }} />da confermare (proposto dal giro o a mano)</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, height: 10, borderRadius: 3, border: DEAL_LOOK.confermato.border }} />confermato</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Check size={11} />link già incollato</span>
        <span>Massimo {v.max_per_day} S4S al giorno per pagina. Clic su uno scambio per modificarlo, su un giorno per aprirne il dettaglio.</span>
      </div>
    </div>
  );
}

// ── Oggi (13/10/2026, punto 2): i compiti del sales manager, pagina per pagina ──
// Per ogni scambio di una sua pagina: 1) crea e incolla il proprio link, 2) pubblica il
// partner con le sue foto e il suo testo (già col link del partner), 3) la mass, 4) "fatto".
const photoUrl = (cid, pid, dl) => `/api/admin/s4s/kit/photo?c=${cid}&p=${pid}${dl ? "&dl=1" : ""}`;
const hhmm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function KitPhotos({ cid, photos }) {
  if (!photos.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, maxWidth: 440 }}>
      {photos.map((ph) => (
        <a key={ph.id} href={photoUrl(cid, ph.id, true)} title="Scarica la foto" style={{ display: "block", position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${CP.borderSoft}`, aspectRatio: "3 / 4", background: CP.bgSunken }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(cid, ph.id)} alt="Foto del kit" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 11, padding: "1px 6px", borderRadius: 6, background: CP.panel, color: CP.textPrimary }}>Scarica</span>
        </a>
      ))}
    </div>
  );
}

function Caption({ text, url, partnerName }) {
  const filled = fillCaption(text, url);
  const waiting = !url && String(text || "").includes("{link}");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: "8px 10px", borderRadius: 8, background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, color: CP.textPrimary }}>{filled || <span style={{ color: CP.textMuted }}>Nessun testo nel kit</span>}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {filled && <CopyButton text={filled} label="Copia il testo" />}
        {waiting && <span style={{ fontSize: 12, color: CP.attn }}>Il link di {partnerName} non c&apos;è ancora: al suo posto resta {"{link}"}</span>}
      </div>
    </div>
  );
}

function Step({ n, title, children, done }) {
  return (
    <li style={{ display: "flex", gap: 12 }}>
      <span aria-hidden style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, border: `1px solid ${done ? CP.accentGreen : CP.border}`, color: done ? CP.accentGreen : CP.textSecondary }}>{done ? "✓" : n}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, color: CP.textPrimary }}>{title}</div>
        {children}
      </div>
    </li>
  );
}

function TaskCard({ v, x, me, other, day, reload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const kit = v.kits[String(other.id)] || { photos: [], ready: false, missing: ["foto", "testo"] };
  const doneAt = x.done?.[String(me.id)];
  const [open, setOpen] = useState(!doneAt); // chi ha già programmato vede la scheda chiusa
  const otherDone = x.done?.[String(other.id)];
  const first = (n) => n.split(" ")[0];
  async function post(body) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/admin/s4s", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ split: v.split.id, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(d.error || "Operazione fallita"); else reload();
  }
  const pin = x.pin_hours ? `, fissato ${x.pin_hours} ore` : "";
  let n = 1;
  return (
    <section style={{ ...card, padding: 16, marginBottom: 12, borderColor: doneAt ? CP.accentGreen : x.status === "confermato" ? CP.accent : CP.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{me.name} con {other.name}</span>
        <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>ore {x.time}</span>
        <DealStatus x={x} />
        {x.status === "proposto" && <button type="button" disabled={busy} onClick={() => post({ action: "deal_status", id: x.id, status: "confermato" })} style={{ ...btnPrimary, padding: "5px 10px", fontSize: 12.5 }}>Conferma</button>}
        {x.note && <span style={{ flexBasis: "100%", fontSize: 12.5, color: CP.textSecondary }}>Nota: {x.note}</span>}
      </div>
      {!open && <button type="button" onClick={() => setOpen(true)} style={{ ...btn, padding: "5px 10px", fontSize: 12.5, marginBottom: 4 }}>Mostra i passi</button>}
      {open && !kit.ready && <Notice>Manca il kit di {other.name} ({kit.missing.join(" e ")}): chiedilo al suo sales manager prima delle {x.time}.</Notice>}
      {open && <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
        <Step n={n++} title={<>Crea su OnlyFans di {first(me.name)} il link <span style={mono}>{me.link}</span> e incollalo qui</>} done={Boolean(me.url)}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><CopyButton text={me.link} label="Copia il nome" /></div>
          <div style={{ maxWidth: 560 }}><PasteLink splitId={v.split.id} day={day} s={me} partner={other} reload={reload} /></div>
        </Step>
        {(needsPost(me.fmt) || me.fmt === "telegram") && (
          <Step n={n++} title={<>{me.fmt === "telegram" ? "Pubblica su Telegram" : "Programma il post"} di {first(other.name)} alle <b style={{ fontWeight: 500 }}>{x.time}</b>{me.fmt === "telegram" ? "" : pin}</>}>
            <KitPhotos cid={other.id} photos={photosFor(kit, "post")} />
            <Caption text={kit.text_post || kit.text_mass} url={other.url} partnerName={first(other.name)} />
          </Step>
        )}
        {needsMass(me.fmt) && (
          <Step n={n++} title={<>Mass message alle <b style={{ fontWeight: 500 }}>{me.fmt === "mass" ? x.time : x.mass_time}</b></>}>
            <KitPhotos cid={other.id} photos={photosFor(kit, "mass")} />
            <Caption text={kit.text_mass || kit.text_post} url={other.url} partnerName={first(other.name)} />
          </Step>
        )}
      </ol>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: open ? 16 : 8, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}` }}>
        <span style={{ fontSize: 12.5, color: CP.textSecondary }}>
          {first(other.name)}: {other.url ? "link incollato" : "link non ancora incollato"} · {otherDone ? `ha programmato (${hhmm(otherDone)})` : "non ha ancora programmato"}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
          {doneAt
            ? <><span style={{ fontSize: 13, color: CP.accentGreen }}>✓ Fatto alle {hhmm(doneAt)}</span><button type="button" disabled={busy} onClick={() => post({ action: "done", id: x.id, page: me.id, done: false })} style={{ ...btn, padding: "5px 10px", fontSize: 12.5 }}>Annulla</button></>
            : <button type="button" disabled={busy || x.status === "annullato"} onClick={() => post({ action: "done", id: x.id, page: me.id })} style={btnPrimary}>Ho programmato tutto</button>}
        </span>
        {err && <span style={{ flexBasis: "100%", fontSize: 12.5, color: CP.accentRed }}>{err}</span>}
      </div>
    </section>
  );
}

function Oggi({ v, reload }) {
  const mine = new Set(v.pages.filter((p) => p.mine && !p.paused).map((p) => p.id));
  const myDays = v.schedule.filter((d) => activeDeals(d).some((x) => mine.has(x.a.id) || mine.has(x.b.id)));
  const start = myDays.find((d) => d.day >= v.today)?.day || myDays[myDays.length - 1]?.day || v.today;
  const [day, setDay] = useState(start);
  const idx = myDays.findIndex((d) => d.day === day);
  const d = myDays[idx];
  const tasks = d ? activeDeals(d).flatMap((x) => [[x.a, x.b], [x.b, x.a]].filter(([me]) => mine.has(me.id)).map(([me, other]) => ({ x, me, other }))) : [];
  const doneN = tasks.filter((t) => t.x.done?.[String(t.me.id)]).length;
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>{d ? (d.day === v.today ? `Oggi, ${dayLabel(d.day)}` : dayLabel(d.day).charAt(0).toUpperCase() + dayLabel(d.day).slice(1)) : "Nessuno S4S in programma"}</h2>
        {d && <span style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>{tasks.length} {tasks.length === 1 ? "S4S" : "S4S"} · {doneN} fatti</span>}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button type="button" aria-label="Giorno di S4S prima" disabled={idx <= 0} onClick={() => setDay(myDays[idx - 1].day)} style={{ ...btn, padding: "6px 9px" }}><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => setDay(start)} style={{ ...btn, padding: "6px 10px" }}>Prossimo</button>
          <button type="button" aria-label="Giorno di S4S dopo" disabled={idx < 0 || idx >= myDays.length - 1} onClick={() => setDay(myDays[idx + 1].day)} style={{ ...btn, padding: "6px 9px" }}><ChevronRight size={15} /></button>
        </span>
      </div>
      {d && d.day !== v.today && d.day === start && <Note style={{ marginBottom: 12 }}>Oggi non hai S4S: questo è il prossimo giorno in programma.</Note>}
      {!d && <Notice>Le tue pagine non hanno S4S in calendario.</Notice>}
      {tasks.map((t) => <TaskCard key={`${t.x.id}-${t.me.id}`} v={v} x={t.x} me={t.me} other={t.other} day={d.day} reload={reload} />)}
    </div>
  );
}

// ── Kit (13/10/2026, punto 2): foto e testi che le altre pagine pubblicano ──
function KitEditor({ v, reload }) {
  const pages = v.pages.filter((p) => p.mine && !p.paused);
  const [pageId, setPageId] = useState(pages[0]?.id || null);
  const page = pages.find((p) => p.id === pageId) || pages[0];
  const kit = (page && v.kits[String(page.id)]) || { photos: [], text_post: "", text_mass: "", ready: false, missing: ["foto", "testo"] };
  const [texts, setTexts] = useState({ post: kit.text_post, mass: kit.text_mass });
  const [state, setState] = useState(null);
  useEffect(() => { setTexts({ post: kit.text_post, mass: kit.text_mass }); setState(null); }, [page?.id, kit.text_post, kit.text_mass]);
  if (!page) return <Notice>Nessuna pagina da gestire.</Notice>;
  const post = async (body, okMsg) => {
    setState({ busy: true });
    const r = await fetch("/api/admin/s4s/kit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: page.id, ...body }) });
    const d = await r.json().catch(() => ({}));
    setState(r.ok ? { msg: okMsg } : { error: d.error || "Operazione fallita" });
    if (r.ok) reload();
  };
  async function upload(files) {
    const room = v.kit_max_photos - kit.photos.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (!list.length) { setState({ error: `Al massimo ${v.kit_max_photos} foto` }); return; }
    setState({ busy: true, msg: "Carico…" });
    const { shrinkImage } = await import("@/lib/hr-upload-client");
    for (const f of list) {
      const small = await shrinkImage(f);
      const fd = new FormData();
      fd.append("c", String(page.id));
      fd.append("file", small, small.name || "foto.jpg");
      const r = await fetch("/api/admin/s4s/kit", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setState({ error: d.error || "Caricamento non riuscito" }); reload(); return; }
    }
    setState({ msg: list.length === 1 ? "Foto caricata" : `${list.length} foto caricate` });
    reload();
  }
  const sample = "https://onlyfans.com/esempio/c1";
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {pages.map((p) => {
          const k = v.kits[String(p.id)];
          return <FilterChip key={p.id} active={p.id === page.id} onClick={() => setPageId(p.id)} attn={!k?.ready} label={`${p.name}${k?.ready ? " ✓" : ""}`} />;
        })}
      </div>
      <Note style={{ marginBottom: 14 }}>Il kit di {page.name} è quello che le altre pagine pubblicano quando fanno S4S con lei. {kit.ready ? "È pronto." : `Manca: ${kit.missing.join(" e ")}.`}</Note>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section style={{ ...card, padding: 16 }}>
            <SectionTitle aside={`${kit.photos.length} di ${v.kit_max_photos}`}>Foto</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {kit.photos.map((ph) => (
                <div key={ph.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${CP.borderSoft}`, aspectRatio: "3 / 4", background: CP.bgSunken }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(page.id, ph.id)} alt="Foto del kit" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                  <select aria-label="Per cosa va la foto" value={ph.use} onChange={(e) => post({ action: "use", id: ph.id, use: e.target.value }, "Salvato")} style={{ ...input, padding: "5px 8px", fontSize: 12.5 }}>
                    {Object.entries(v.photo_uses).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button type="button" disabled={state?.busy} onClick={() => { if (window.confirm("Togliere questa foto dal kit?")) post({ action: "remove", id: ph.id }, "Foto tolta"); }} style={{ ...btn, padding: "4px 8px", fontSize: 12.5, justifyContent: "center" }}>Togli</button>
                </div>
              ))}
              {kit.photos.length < v.kit_max_photos && (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", aspectRatio: "3 / 4", borderRadius: 8, border: `1px dashed ${CP.border}`, color: CP.textSecondary, fontSize: 13, cursor: "pointer", padding: 8 }}>
                  + Carica foto
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { upload(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
                </label>
              )}
            </div>
          </section>
          <section style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle>Testi</SectionTitle>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: CP.textSecondary }}>Testo per il post
              <textarea rows={4} value={texts.post} maxLength={1000} onChange={(e) => setTexts((t) => ({ ...t, post: e.target.value }))} placeholder="Es. Conoscete già lei? Seguitela qui {link}" style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: CP.textSecondary }}>Testo per la mass
              <textarea rows={3} value={texts.mass} maxLength={1000} onChange={(e) => setTexts((t) => ({ ...t, mass: e.target.value }))} placeholder="Testo breve per il messaggio di massa, con {link}" style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
            </label>
            <Note>Scrivi {"{link}"} dove va il link: il giorno dello scambio diventa il link creato da {page.name.split(" ")[0]} per quel partner.</Note>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button type="button" disabled={state?.busy || (texts.post === kit.text_post && texts.mass === kit.text_mass)} onClick={() => post({ action: "text", text_post: texts.post, text_mass: texts.mass }, "Testi salvati")} style={btnPrimary}>Salva i testi</button>
              {state?.msg && <span style={{ fontSize: 13, color: CP.textSecondary }}>{state.msg}</span>}
              {state?.error && <span style={{ fontSize: 13, color: CP.accentRed }}>{state.error}</span>}
            </div>
          </section>
        </div>
        <aside style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: CP.textSecondary }}>Come lo vedono i fan della pagina partner</span>
          <article style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", color: CP.textPrimary }}>{fillCaption(texts.post || texts.mass, sample) || <span style={{ color: CP.textMuted }}>Il testo del post comparirà qui</span>}</div>
            {kit.photos[0]
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={photoUrl(page.id, photosFor(kit, "post")[0].id)} alt="Anteprima" style={{ width: "100%", maxHeight: 340, objectFit: "cover", borderRadius: 10, display: "block" }} />
              : <div style={{ height: 240, borderRadius: 10, background: CP.bgSunken, border: `1px dashed ${CP.border}` }} />}
          </article>
        </aside>
      </div>
    </div>
  );
}

function MiniMonth({ month, setMonth, sel, setSel, today, byDay, only }) {
  const first = `${month}-01`;
  const startWd = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = [...Array(startWd).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const title = `${MONTHS_IT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  return (
    <section style={{ ...card, padding: "12px 12px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <button type="button" onClick={() => shift(-1)} aria-label="Mese prima" style={{ ...btn, padding: "4px 7px", background: "transparent", border: "none" }}><ChevronLeft size={15} /></button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{title.charAt(0).toUpperCase() + title.slice(1)}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Mese dopo" style={{ ...btn, padding: "4px 7px", background: "transparent", border: "none" }}><ChevronRight size={15} /></button>
      </div>
      <div role="grid" aria-label="Calendario del mese" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2, textAlign: "center" }}>
        {["L", "M", "M", "G", "V", "S", "D"].map((c, i) => <span key={i} style={{ fontSize: 11, color: CP.textMuted, padding: "2px 0 4px" }}>{c}</span>)}
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const d = byDay[day];
          const mine = d && (!only || sides(d).some((s) => s.id === only));
          const ss = mine ? sides(d).filter((s) => !only || s.id === only) : [];
          const allDone = ss.length > 0 && ss.every((s) => DONE.has(s.status.code));
          const missing = ss.some((s) => s.status.code === "mancante" || s.status.code === "da-fare");
          const isSel = day === sel, isToday = day === today;
          return (
            <button key={day} type="button" disabled={!mine} onClick={() => setSel(day)} aria-label={`${dayLabel(day)}${mine ? `, ${ss.length / (only ? 1 : 2)} scambi` : ""}`} aria-pressed={isSel}
              style={{ all: "unset", cursor: mine ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 0" }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, ...NUM,
                background: isSel ? CP.accent : "transparent", color: isSel ? CP.accentInk : mine ? CP.textPrimary : CP.textMuted,
                border: isToday && !isSel ? `1px solid ${CP.textSecondary}` : "1px solid transparent", fontWeight: mine ? 500 : 400 }}>
                {Number(day.slice(8, 10))}
              </span>
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: !mine ? "transparent" : allDone ? CP.accentGreen : "transparent", border: mine ? `1px solid ${missing && day <= today ? CP.attn : allDone ? CP.accentGreen : CP.textMuted}` : "none" }} />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 11.5, color: CP.textMuted }}>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><span style={{ width: 6, height: 6, borderRadius: "50%", border: `1px solid ${CP.textMuted}` }} />in programma</span>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: CP.accentGreen }} />link pronti</span>
      </div>
    </section>
  );
}

function StatBox({ label, value, note }) {
  return (
    <div style={{ ...card, padding: "12px 14px" }}>
      <div style={{ fontSize: 12.5, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.3, ...NUM }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{note}</div>}
    </div>
  );
}

function Agenda({ v, reload, initialDay, onEdit }) {
  const byDay = useMemo(() => Object.fromEntries(v.schedule.map((d) => [d.day, d])), [v.schedule]);
  const pages = v.pages.filter((p) => !p.paused && p.mine);
  const upcoming = v.schedule.filter((d) => d.day >= v.today);
  const [only, setOnly] = useState(null); // null = tutte le pagine
  const [sel, setSel] = useState(() => initialDay || upcoming[0]?.day || v.schedule[v.schedule.length - 1]?.day || v.today);
  const [month, setMonth] = useState(() => (initialDay || upcoming[0]?.day || v.today).slice(0, 7));
  const d = byDay[sel];
  const pairs = d ? d.deals.filter((p) => !only || p.a.id === only || p.b.id === only) : [];
  const resting = d ? d.rest : [];

  // cosa manca per pagina: metà di scambio di oggi o degli ultimi 14 giorni senza link
  const pending = useMemo(() => {
    const m = {};
    const from = new Date(Date.parse(`${v.today}T00:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10);
    for (const day of v.schedule) {
      if (day.day < from || day.day > v.today) continue;
      for (const s of sides(day)) if (s.status.code === "da-fare" || s.status.code === "mancante") m[s.id] = (m[s.id] || 0) + 1;
    }
    return m;
  }, [v]);
  const partnerOn = (pid) => {
    if (!d) return null;
    if (d.rest.some((r) => r.id === pid)) return "riposa";
    const x = activeDeals(d).find((p) => p.a.id === pid || p.b.id === pid);
    if (!x) return null;
    return `con ${x.a.id === pid ? x.b.name : x.a.name} · ${x.time}`;
  };
  // numeri del mese mostrato
  const monthDays = v.schedule.filter((x) => x.day.startsWith(month));
  const monthSides = monthDays.flatMap(sides).filter((s) => !only || s.id === only);
  const monthPairs = monthDays.reduce((n, x) => n + activeDeals(x).filter((p) => !only || p.a.id === only || p.b.id === only).length, 0);
  const withLink = monthSides.filter((s) => DONE.has(s.status.code)).length;
  const brought = monthSides.reduce((n, s) => n + (s.stat?.subs ?? s.result?.subs ?? 0), 0);
  const mature = v.results.reduce((s, r) => s + (r.mature_subs || 0), 0);
  const net = v.results.reduce((s, r) => s + (r.net30 || 0), 0);
  const perFan = mature >= v.meta.min_mature ? net / mature : null;
  const basePerFan = v.baseline?.fans ? v.baseline.net30 / v.baseline.fans : null;
  const mname = MONTHS_IT[Number(month.slice(5, 7)) - 1];

  return (
    <div className="s4s-agenda">
      <style>{`.s4s-agenda{display:grid;grid-template-columns:220px minmax(0,1fr) 270px;gap:16px;align-items:start}
        .s4s-pages{display:flex;flex-direction:column;gap:2px}
        @media (max-width:1180px){.s4s-agenda{grid-template-columns:minmax(0,1fr) 280px}.s4s-col-pages{grid-column:1 / -1}.s4s-pages{flex-direction:row;overflow-x:auto;padding-bottom:4px}.s4s-pages>button{min-width:190px}}
        @media (max-width:760px){.s4s-agenda{grid-template-columns:minmax(0,1fr)}.s4s-col-side{order:-1}}`}</style>

      <aside className="s4s-col-pages" aria-label="Pagine">
        <div className="s4s-pages">
          {[{ id: null, name: "Tutte le pagine" }, ...pages].map((p) => {
            const active = only === p.id;
            const n = p.id ? pending[p.id] || 0 : Object.values(pending).reduce((a, b) => a + b, 0);
            const line = p.id ? partnerOn(p.id) : `${d ? activeDeals(d).length : 0} scambi il ${ddmm(sel)}`;
            return (
              <button key={p.id ?? "all"} type="button" onClick={() => setOnly(p.id)} aria-pressed={active}
                style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: active ? CP.accentSoft : "transparent", border: `1px solid ${active ? CP.accent : "transparent"}` }}>
                {p.id ? <Avatar name={p.name} size={32} /> : <span aria-hidden style={{ width: 32, height: 32, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${CP.border}`, color: CP.textMuted, fontSize: 12 }}>{pages.length}</span>}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13.5, color: active ? CP.accentSoftText : CP.textPrimary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line || (p.handle ? `@${p.handle}` : "—")}</span>
                </span>
                {n > 0 && <span title={`${n} link da incollare negli ultimi 14 giorni`} style={{ fontSize: 11.5, padding: "1px 7px", borderRadius: 999, border: `1px solid ${CP.attn}`, color: CP.attn, ...NUM }}>{n}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      <main style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>{d ? dayLabel(d.day).charAt(0).toUpperCase() + dayLabel(d.day).slice(1) : "Nessun S4S"}</h2>
          {sel === v.today && <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: `1px solid ${CP.textSecondary}`, color: CP.textSecondary }}>oggi</span>}
          {d && <span style={{ fontSize: 13, color: CP.textMuted }}>{pairs.length} {pairs.length === 1 ? "scambio" : "scambi"}{only ? ` di ${pages.find((p) => p.id === only)?.name}` : ""}</span>}
          {d && pairs.length > 0 && <span style={{ marginLeft: "auto" }}><CopyButton text={dayText(d, only)} label="Copia per WhatsApp" /></span>}
        </div>
        {!d && <Notice>Nessuno scambio in questo giorno: scegli un giorno con il puntino nel calendario.</Notice>}
        {d && pairs.length === 0 && <Notice>{only ? `${pages.find((p) => p.id === only)?.name} oggi riposa.` : "Nessuno scambio."}</Notice>}
        {d && pairs.map((p) => <ExchangeCard key={p.id} p={p} day={d.day} splitId={v.split.id} reload={reload} onEdit={onEdit} />)}
        {d && !only && resting.length > 0 && <Note style={{ marginTop: 4 }}>Riposa: {resting.map((r) => r.name).join(", ")}</Note>}
        <Note style={{ marginTop: 14 }}>
          Su ogni scambio ciascuna pagina crea su OnlyFans il link col nome indicato, lo incolla qui e lo manda al partner, che lo pubblica. Click e abbonati del link compaiono qui da soli, entro qualche ora.
        </Note>
      </main>

      <aside className="s4s-col-side" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <MiniMonth month={month} setMonth={setMonth} sel={sel} setSel={setSel} today={v.today} byDay={byDay} only={only} />
        <StatBox label={`Scambi di ${mname}`} value={`${int(monthPairs)}`} note={`${int(withLink)} link pronti su ${int(monthSides.length)}${brought ? ` · ${int(brought)} abbonati portati` : ""}`} />
        <StatBox label="Incasso netto a 30 giorni per fan" value={perFan != null ? usd(perFan, 2) : "—"} note={basePerFan != null ? `contro ${usd(basePerFan, 2)} dei fan dagli altri link` : null} />
        <StatBox label={`Abbonati portati dagli S4S (${v.meta.window_days} giorni)`} value={int(v.by_page.reduce((s, p) => s + p.subs, 0))} note={`${v.results.length} link misurati`} />
      </aside>
    </div>
  );
}

function ResultsTable({ rows, hidePage }) {
  const cols = [
    { key: "first_day", label: "Dal", render: (r) => ddmm(r.first_day), sort: (r) => r.first_day },
    !hidePage && { key: "page", label: "Pagina che riceve" },
    { key: "partner_label", label: "Da chi", render: (r) => (
      <span title={r.partner_source === "manuale" ? "Assegnato a mano" : r.partner ? "Riconosciuto dal nome del link" : "Non riconosciuto: assegnalo in fondo alla pagina Risultati"}
        style={{ color: r.partner ? CP.textPrimary : CP.textMuted, fontStyle: r.partner ? "normal" : "italic" }}>
        {r.partner || `${r.partner_label} ?`}
      </span>
    ) },
    { key: "link_name", label: "Link", muted: true, render: (r) => <code style={mono}>{r.link_name}</code> },
    { key: "format", label: "Formato", muted: true, render: (r) => FORMAT_LABEL[r.format] || "—" },
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "net30_per_sub", label: "Incasso netto a 30 gg per fan", align: "right", render: (r) => (r.net30_per_sub != null ? usd(r.net30_per_sub, 2) : <span style={{ color: CP.textMuted }} title="Serve un link con almeno 20 abbonati arrivati da più di 30 giorni">presto</span>), sort: (r) => r.net30_per_sub ?? -1 },
    { key: "payers_rate", label: "Hanno pagato", align: "right", render: (r) => (r.payers_rate != null ? pct(r.payers_rate) : <span style={{ color: CP.textMuted }}>presto</span>), sort: (r) => r.payers_rate ?? -1 },
  ].filter(Boolean);
  return <DataTable columns={cols} rows={rows.map((r) => ({ ...r, id: r.key }))} defaultSort={{ key: "first_day", dir: -1 }} minWidth={hidePage ? 720 : 860} maxHeight={560} empty="Nessun link S4S nel periodo." />;
}

function Risultati({ v, reload }) {
  const byFormat = useMemo(() => {
    const m = {};
    for (const r of v.results) {
      const k = r.format || "non indicato";
      const e = (m[k] ||= { format: k, links: 0, subs: 0, mature: 0, net: 0 });
      e.links++; e.subs += r.subs; e.mature += r.mature_subs; e.net += r.net30 || 0;
    }
    const rows = Object.values(m).map((e) => ({ ...e, id: e.format, avg: e.subs / e.links, per_sub: e.mature >= v.meta.min_mature ? e.net / e.mature : null }));
    // termine di paragone: i fan arrivati dagli altri link (non S4S) delle stesse pagine
    if (v.baseline?.fans) rows.push({ id: "_base", format: "_base", links: null, avg: null, per_sub: v.baseline.net30 / v.baseline.fans, fans: v.baseline.fans });
    return rows;
  }, [v]);
  const rec = v.reciprocity.map((e) => ({ ...e, id: `${e.a}|${e.b}`, unbalanced: (e.one_way && Math.max(e.to_a, e.to_b) >= 30) || (e.ratio != null && e.ratio >= 3) }));
  return (
    <>
      <SectionTitle aside="pagine dello split che si sono scambiate tra loro">Chi dà e chi riceve</SectionTitle>
      <Note style={{ marginBottom: 10 }}>Uno scambio è alla pari se le due pagine si portano abbonati simili. Quando una dà molto più di quanto riceve, lo scambio le conviene poco: conviene cambiare formato (massa invece di post) o partner.</Note>
      {v.unmatched.length > 0 && <Notice>Conta solo i link di cui si sa il partner: {v.unmatched.length} testi sono ancora da attribuire (in fondo alla pagina), quindi qualche coppia può sembrare più sbilanciata di com&apos;è.</Notice>}
      <DataTable
        minWidth={620}
        rows={rec}
        empty="Nessuno scambio misurato tra due pagine dello split: servono link con il nome del partner."
        defaultSort={{ key: "gap", dir: -1 }}
        columns={[
          { key: "pair", label: "Coppia", render: (r) => `${r.a} ⇄ ${r.b}`, sort: (r) => r.a },
          { key: "recv", label: "Abbonati ricevuti", sortable: false, render: (r) => (
            <span style={NUM}>{r.a} <b style={{ fontWeight: 500 }}>{int(r.to_a)}</b><span style={{ color: CP.textMuted }}> · </span>{r.b} <b style={{ fontWeight: 500 }}>{int(r.to_b)}</b></span>
          ) },
          { key: "gap", label: "Squilibrio", align: "right", sort: (r) => (r.one_way ? 1e6 + Math.max(r.to_a, r.to_b) : r.ratio || 0), render: (r) => (
            r.unbalanced
              ? <span style={{ color: CP.attn, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}><AlertTriangle size={13} aria-label="sbilanciato" />{r.one_way ? "a senso unico" : `${r.ratio.toFixed(1).replace(".", ",")} a 1`}</span>
              : <span style={{ color: CP.textMuted }}>{r.one_way ? "a senso unico (pochi)" : `${(r.ratio || 1).toFixed(1).replace(".", ",")} a 1`}</span>
          ) },
        ]}
      />
      <div style={{ height: 24 }} />
      <SectionTitle aside="dal nome del link">Quale formato rende</SectionTitle>
      <DataTable
        minWidth={560}
        rows={byFormat}
        defaultSort={{ key: "avg", dir: -1 }}
        columns={[
          { key: "format", label: "Formato", render: (r) => (r.format === "_base" ? <span style={{ color: CP.textSecondary }}>Per confronto: altri link, non S4S ({int(r.fans)} fan)</span> : FORMAT_LABEL[r.format] || r.format), sort: (r) => (r.format === "_base" ? "zzz" : r.format) },
          { key: "links", label: "Link", align: "right", render: (r) => (r.links == null ? "—" : r.links) },
          { key: "avg", label: "Abbonati per link", align: "right", render: (r) => (r.avg == null ? "—" : int(r.avg)) },
          { key: "per_sub", label: "Incasso netto a 30 gg per fan", align: "right", render: (r) => usd(r.per_sub, 2), sort: (r) => r.per_sub ?? -1 },
        ]}
      />
      <div style={{ height: 24 }} />
      <SectionTitle aside={`ultimi ${v.meta.window_days} giorni · dal più recente`}>Tutti gli scambi misurati</SectionTitle>
      <ResultsTable rows={v.results} />
      <div style={{ height: 24 }} />
      {v.me?.all && <Unmatched v={v} reload={reload} />}
    </>
  );
}

function Unmatched({ v, reload }) {
  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState({});
  const options = v.partner_options;
  async function save(label_key, partner) {
    setBusy(label_key);
    await fetch("/api/admin/s4s", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "alias", label_key, partner }) }).catch(() => {});
    setBusy(null);
    reload();
  }
  const assigned = Object.entries(v.aliases || {});
  return (
    <>
      <SectionTitle aside={v.unmatched.length ? `${v.unmatched.length} da assegnare` : "tutto assegnato"}>Link da attribuire</SectionTitle>
      <Note style={{ marginBottom: 10 }}>
        Quando il nome del link non basta a capire il partner (&quot;Camilla&quot; può essere più di una pagina) il sistema non indovina. Dillo una volta qui e vale per tutti i link con lo stesso testo, anche i prossimi.
      </Note>
      {v.unmatched.length === 0 && <Note>Nessun link da attribuire.</Note>}
      {v.unmatched.map((u) => (
        <div key={u.label_key} style={{ ...card, padding: "10px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ fontSize: 14, color: CP.textPrimary }}>&quot;{u.label}&quot; <span style={{ color: CP.textMuted, fontSize: 12.5, ...NUM }}>· {int(u.subs)} abbonati</span></div>
            <div style={{ fontSize: 12, color: CP.textMuted }}>{u.links.slice(0, 3).join(" · ")}{u.links.length > 3 ? ` · altri ${u.links.length - 3}` : ""}</div>
          </div>
          <input list="s4s-partners" aria-label={`Pagina partner per ${u.label}`} placeholder="Scegli la pagina…" style={{ ...input, minWidth: 200 }}
            value={draft[u.label_key] || ""} onChange={(e) => setDraft((d) => ({ ...d, [u.label_key]: e.target.value }))} />
          <button type="button" style={btnPrimary} disabled={busy === u.label_key || !options.includes(draft[u.label_key])} onClick={() => save(u.label_key, draft[u.label_key])}>Salva</button>
          <button type="button" style={btn} disabled={busy === u.label_key} onClick={() => save(u.label_key, null)} title="Partner fuori da HOC o non identificabile">Esterna</button>
        </div>
      ))}
      <datalist id="s4s-partners">{options.map((o) => <option key={o} value={o} />)}</datalist>
      {assigned.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 13, color: CP.textSecondary, cursor: "pointer" }}>Già assegnati a mano ({assigned.length})</summary>
          <div style={{ marginTop: 8 }}>
            {assigned.map(([k, p]) => (
              <div key={k} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: CP.textSecondary, padding: "4px 0" }}>
                <span>&quot;{k}&quot; → {p || "esterna"}</span>
                <button type="button" style={{ ...btn, padding: "2px 8px", fontSize: 12 }} disabled={busy === k} onClick={() => save(k, undefined)}>Togli</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Impostazioni({ v, splitId, reload }) {
  const [weekdays, setWeekdays] = useState(v.settings.weekdays);
  const [start, setStart] = useState(v.segments[0]?.from || "");
  const [lang, setLang] = useState(v.settings.lang_override || {});
  const [paused, setPaused] = useState(v.settings.paused || []);
  const [state, setState] = useState(null);
  const started = (v.segments[0]?.from || "9999") <= v.today;
  const toggleDay = (d) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));
  async function save() {
    if (!weekdays.length) { setState({ error: "Scegli almeno un giorno" }); return; }
    setState({ saving: true });
    const r = await fetch("/api/admin/s4s", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", split: splitId, weekdays, start: started ? undefined : start, lang_override: lang, paused }) });
    const d = await r.json().catch(() => ({}));
    setState(r.ok ? { saved: true } : { error: d.error || "Salvataggio fallito" });
    reload();
  }
  return (
    <>
      <Note style={{ marginBottom: 16 }}>
        Le pagine arrivano dallo split (si modifica in Coaching vendite). Ogni modifica vale dal prossimo giorno di S4S: i giorni già passati e quello di oggi non cambiano.
      </Note>
      <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <SectionTitle>Giorni di S4S</SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {WEEKDAYS.map(([d, l]) => <FilterChip key={d} label={l} active={weekdays.includes(d)} onClick={() => toggleDay(d)} />)}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="s4s-start" style={{ fontSize: 13, color: CP.textSecondary }}>Primo giorno</label>
          <input id="s4s-start" type="date" value={start} disabled={started} onChange={(e) => setStart(e.target.value)} style={input} />
          {started && <span style={{ fontSize: 12.5, color: CP.textMuted }}>il calendario è già partito il {ddmm(v.segments[0].from)}</span>}
        </div>
      </section>
      <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <SectionTitle aside="le pagine scambiano solo con pagine della stessa lingua">Pagine</SectionTitle>
        {v.pages.map((p) => {
          const l = lang[p.id] || p.lang;
          const isPaused = paused.includes(p.id);
          return (
            <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 180, fontSize: 14, color: isPaused ? CP.textMuted : CP.textPrimary, textDecoration: isPaused ? "line-through" : "none" }}>{p.name}</span>
              <select aria-label={`Lingua di ${p.name}`} value={l} onChange={(e) => setLang((m) => ({ ...m, [p.id]: e.target.value }))} style={input}>
                <option value="it">Italiana</option>
                <option value="en">Inglese</option>
                <option value="es">Spagnola</option>
              </select>
              {p.lang_guessed && !lang[p.id] && <span style={{ fontSize: 12, color: CP.textMuted }} title="Il nome della pagina non dice la lingua">lingua presunta</span>}
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: CP.textSecondary, cursor: "pointer" }}>
                <input type="checkbox" checked={isPaused} onChange={() => setPaused((x) => (x.includes(p.id) ? x.filter((i) => i !== p.id) : [...x, p.id]))} />
                in pausa
              </label>
            </div>
          );
        })}
      </section>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" style={btnPrimary} disabled={state?.saving} onClick={save}>{state?.saving ? "Salvo…" : "Salva"}</button>
        {state?.saved && <span style={{ fontSize: 13, color: CP.textSecondary }}>Salvato.</span>}
        {state?.error && <span style={{ fontSize: 13, color: CP.accentRed }}>{state.error}</span>}
      </div>
      {v.segments.length > 1 && (
        <Note style={{ marginTop: 18 }}>
          Storico del calendario: {v.segments.map((s) => `dal ${ddmm(s.from)} ${Object.values(s.groups).reduce((n, g) => n + g.length, 0)} pagine`).join(" · ")}.
        </Note>
      )}
    </>
  );
}

export default function S4SPage() {
  const [splitId, setSplitId] = useState(null);
  const [tab, setTab] = useState(null); // null = scheda di partenza in base a chi guarda
  const [editing, setEditing] = useState(null); // accordo aperto nella finestra
  const [focusDay, setFocusDay] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem("s4s:split");
      if (s) setSplitId(s);
      const h = window.location.hash.replace("#", "");
      if (TABS.some(([k]) => k === h)) setTab(h);
    } catch { /* storage non disponibile */ }
  }, []);
  const url = `/api/admin/s4s${splitId ? `?split=${encodeURIComponent(splitId)}` : ""}`;
  const { data, error, mutate, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const v = data?.view;
  // chi vede tutte le creator parte dal planner, un sales manager dai compiti di oggi
  const allView = Boolean(v?.me?.all);
  const tabs = TABS.filter(([k]) => allView || k !== "impostazioni");
  const current = tab && tabs.some(([k]) => k === tab) ? tab : allView ? "planner" : "oggi";
  const choose = (id) => {
    setSplitId(id);
    try { localStorage.setItem("s4s:split", id); } catch { /* ok */ }
  };
  async function refresh() {
    setRefreshing(true);
    await fetch("/api/admin/s4s", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", split: v?.split?.id }) }).catch(() => {});
    setRefreshing(false);
    mutate();
  }

  const header = (
    <PageHead
      crumbs={[{ label: "Performance" }, { label: "Calendario S4S" }]}
      title="Calendario S4S"
      subtitle="Chi scambia promozione con chi, giorno per giorno, e quanti abbonati ha portato ogni scambio. Le pagine arrivano dallo split; ogni pagina scambia una volta con tutte le altre, poi il giro ricomincia rimescolato."
    />
  );
  const wrap = { padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body };

  if (error) return <div style={wrap}>{header}<Notice danger>{/scope|capability|vista su tutte|permesso/i.test(String(error.message)) ? "Questa pagina è per i sales manager e gli admin." : error.message}</Notice></div>;
  if (isLoading || !data) return <div style={wrap}>{header}<Note>Caricamento…</Note></div>;
  if (data.bigquery === false) return <div style={wrap}>{header}<Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente.</Notice></div>;
  if (!v) return <div style={wrap}>{header}<Notice>Nessuno split con le tue pagine. Gli split si creano in Coaching vendite: il calendario usa le loro pagine.</Notice></div>;

  return (
    <div style={wrap}>
      {header}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <label htmlFor="s4s-split" style={{ fontSize: 13, color: CP.textSecondary }}>Split</label>
        <select id="s4s-split" value={v.split.id} onChange={(e) => choose(e.target.value)} style={input}>
          {data.splits.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.n} pagine)</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: CP.textMuted }}>
          Risultati al {new Date(v.meta.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>
        {allView && <button type="button" style={btn} disabled={refreshing} onClick={refresh}><RefreshCw size={14} />{refreshing ? "Aggiorno…" : "Aggiorna"}</button>}
      </div>
      <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, borderBottom: `1px solid ${CP.border}`, paddingBottom: 12 }}>
        {tabs.map(([k, l]) => (
          <FilterChip key={k} active={current === k} onClick={() => { setTab(k); try { window.history.replaceState(null, "", `#${k}`); } catch { /* ok */ } }}
            label={k === "risultati" && v.unmatched.length ? `${l} · ${v.unmatched.length} da attribuire` : l} />
        ))}
      </div>
      {current === "oggi" && <Oggi key={v.split.id} v={v} reload={mutate} />}
      {current === "kit" && <KitEditor key={v.split.id} v={v} reload={mutate} />}
      {current === "planner" && <Planner key={v.split.id} v={v} onEdit={setEditing} onNew={setEditing} onOpenDay={(day) => { setFocusDay(day); setTab("agenda"); }} />}
      {current === "agenda" && <Agenda key={`${v.split.id}-${focusDay || ""}`} v={v} reload={mutate} initialDay={focusDay} onEdit={setEditing} />}
      {editing && <DealEditor key={editing.id || `${editing.day}-${editing.a || ""}`} v={v} deal={editing} onClose={() => setEditing(null)} reload={mutate} />}
      {current === "risultati" && <Risultati v={v} reload={mutate} />}
      {current === "impostazioni" && <Impostazioni key={v.split.id} v={v} splitId={v.split.id} reload={mutate} />}
      <Note style={{ marginTop: 28 }}>
        Come si misura: abbonati arrivati da link di tracciamento con S4S o SFS nel nome, sulle pagine dello split, negli ultimi {v.meta.window_days} giorni. Il partner si ricava dal nome del link solo quando è inequivocabile. &quot;Incasso netto a 30 giorni&quot; = quanto resta a House of Creators (dopo la quota di OnlyFans) da ciò che i fan arrivati da quel link spendono nei primi 30 giorni, contato solo sui fan abbonati da almeno 30 giorni e su link con almeno {v.meta.min_mature} di loro. Riguarda le pagine, non gli operatori: non entra in score né compensi.
      </Note>
    </div>
  );
}
