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
import { fmtInt, fmtPct, MONTHS_IT } from "@/lib/format";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const TABS = [
  ["agenda", "Agenda"],
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

// Testo del giorno da incollare nel gruppo WhatsApp: per ogni scambio il link già creato
// (se incollato) o il nome con cui crearlo.
function dayText(d, only) {
  const langs = Object.keys(d.groups);
  const lines = [`S4S · ${dayLabel(d.day)}`];
  for (const lang of langs) {
    const g = d.groups[lang];
    const pairs = g.pairs.filter((p) => !only || p.a.id === only || p.b.id === only);
    if (!pairs.length) continue;
    if (langs.length > 1) lines.push("", `Pagine ${LANG_LABEL[lang] || lang}`);
    for (const p of pairs) {
      lines.push(`• ${p.a.name} ⇄ ${p.b.name}`);
      for (const [s, o] of [[p.a, p.b], [p.b, p.a]]) {
        lines.push(s.url ? `   ${o.name} pubblica: https://${s.url}` : `   link su ${s.name}: ${s.link}`);
      }
    }
    if (!only && g.rest.length) lines.push(`Riposa: ${g.rest.map((r) => r.name).join(", ")}`);
  }
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
const sides = (d) => Object.values(d.groups).flatMap((g) => g.pairs.flatMap((p) => [p.a, p.b]));

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

function ExchangeCard({ p, day, splitId, reload }) {
  return (
    <section style={{ ...card, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 8 }}>
        <SideBlock s={p.a} partner={p.b} day={day} splitId={splitId} reload={reload} />
        <SideBlock s={p.b} partner={p.a} day={day} splitId={splitId} reload={reload} />
      </div>
    </section>
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

function Agenda({ v, reload }) {
  const byDay = useMemo(() => Object.fromEntries(v.schedule.map((d) => [d.day, d])), [v.schedule]);
  const pages = v.pages.filter((p) => !p.paused);
  const upcoming = v.schedule.filter((d) => d.day >= v.today);
  const [only, setOnly] = useState(null); // null = tutte le pagine
  const [sel, setSel] = useState(() => upcoming[0]?.day || v.schedule[v.schedule.length - 1]?.day || v.today);
  const [month, setMonth] = useState(() => (upcoming[0]?.day || v.today).slice(0, 7));
  const d = byDay[sel];
  const pairs = d ? Object.values(d.groups).flatMap((g) => g.pairs).filter((p) => !only || p.a.id === only || p.b.id === only) : [];
  const resting = d ? Object.values(d.groups).flatMap((g) => g.rest) : [];

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
    for (const g of Object.values(d.groups)) {
      if (g.rest.some((r) => r.id === pid)) return "riposa";
      for (const p of g.pairs) { if (p.a.id === pid) return `con ${p.b.name}`; if (p.b.id === pid) return `con ${p.a.name}`; }
    }
    return null;
  };
  // numeri del mese mostrato
  const monthDays = v.schedule.filter((x) => x.day.startsWith(month));
  const monthSides = monthDays.flatMap(sides).filter((s) => !only || s.id === only);
  const monthPairs = monthDays.reduce((n, x) => n + Object.values(x.groups).flatMap((g) => g.pairs).filter((p) => !only || p.a.id === only || p.b.id === only).length, 0);
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
            const line = p.id ? partnerOn(p.id) : `${pairs.length || (d ? Object.values(d.groups).flatMap((g) => g.pairs).length : 0)} scambi il ${ddmm(sel)}`;
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
        {d && pairs.map((p) => <ExchangeCard key={`${p.a.id}-${p.b.id}`} p={p} day={d.day} splitId={v.split.id} reload={reload} />)}
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
      <Unmatched v={v} reload={reload} />
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
  const [tab, setTab] = useState("agenda");
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

  if (error) return <div style={wrap}>{header}<Notice danger>{/scope|capability|vista su tutte|permesso/i.test(String(error.message)) ? "Questa pagina è riservata a sales manager e admin con la vista su tutte le creator." : error.message}</Notice></div>;
  if (isLoading || !data) return <div style={wrap}>{header}<Note>Caricamento…</Note></div>;
  if (data.bigquery === false) return <div style={wrap}>{header}<Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente.</Notice></div>;
  if (!v) return <div style={wrap}>{header}<Notice>Non c&apos;è ancora nessuno split. Crealo in <a href="/admin/sales-coaching" style={{ color: CP.accentSoftText }}>Coaching vendite</a>: il calendario usa le sue pagine.</Notice></div>;

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
        <button type="button" style={btn} disabled={refreshing} onClick={refresh}><RefreshCw size={14} />{refreshing ? "Aggiorno…" : "Aggiorna"}</button>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, borderBottom: `1px solid ${CP.border}`, paddingBottom: 12 }}>
        {TABS.map(([k, l]) => (
          <FilterChip key={k} active={tab === k} onClick={() => { setTab(k); try { window.history.replaceState(null, "", `#${k}`); } catch { /* ok */ } }}
            label={k === "risultati" && v.unmatched.length ? `${l} · ${v.unmatched.length} da attribuire` : l} />
        ))}
      </div>
      {tab === "agenda" && <Agenda key={v.split.id} v={v} reload={mutate} />}
      {tab === "risultati" && <Risultati v={v} reload={mutate} />}
      {tab === "impostazioni" && <Impostazioni key={v.split.id} v={v} splitId={v.split.id} reload={mutate} />}
      <Note style={{ marginTop: 28 }}>
        Come si misura: abbonati arrivati da link di tracciamento con S4S o SFS nel nome, sulle pagine dello split, negli ultimi {v.meta.window_days} giorni. Il partner si ricava dal nome del link solo quando è inequivocabile. &quot;Incasso netto a 30 giorni&quot; = quanto resta a House of Creators (dopo la quota di OnlyFans) da ciò che i fan arrivati da quel link spendono nei primi 30 giorni, contato solo sui fan abbonati da almeno 30 giorni e su link con almeno {v.meta.min_mature} di loro. Riguarda le pagine, non gli operatori: non entra in score né compensi.
      </Note>
    </div>
  );
}
