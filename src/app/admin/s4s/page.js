"use client";

// Calendario S4S — chi scambia promozione con chi, giorno per giorno, e quanto
// ha reso ogni scambio. Sostituisce il "Calendario S4S Automatico 2.0" su Google
// Sheets (ott 2026): le pagine arrivano dallo split, il calendario non si ferma
// dopo un giro e ogni scambio si misura dal suo link di tracciamento.
// Logica in lib/s4s-core.js (testata), dati in /api/admin/s4s.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice, SectionTitle, card, NUM } from "@/components/ds";
import { fmtInt, fmtPct, MONTHS_IT } from "@/lib/format";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const TABS = [
  ["calendario", "Calendario"],
  ["pagina", "Per pagina"],
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

// Testo del giorno da incollare nel gruppo WhatsApp
function dayText(d) {
  const langs = Object.keys(d.groups);
  const lines = [`S4S · ${dayLabel(d.day)}`];
  for (const lang of langs) {
    const g = d.groups[lang];
    if (langs.length > 1) lines.push("", `Pagine ${LANG_LABEL[lang] || lang}`);
    for (const p of g.pairs) {
      lines.push(`• ${p.a.name} ⇄ ${p.b.name}`);
      lines.push(`   link su ${p.a.name}: ${p.a.link}`);
      lines.push(`   link su ${p.b.name}: ${p.b.link}`);
    }
    if (g.rest.length) lines.push(`Riposa: ${g.rest.map((r) => r.name).join(", ")}`);
  }
  return lines.join("\n");
}

// Una metà dello scambio: la pagina che riceve, il link da creare su di lei, il risultato
function Side({ s, partner, when }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>link su {s.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <code style={{ ...mono, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.link}</code>
        <CopyButton text={s.link} small label="Copia nome link" />
      </div>
      <div style={{ fontSize: 12, color: CP.textSecondary, ...NUM }}>
        {when === "today"
          ? <span style={{ color: CP.textMuted }}>il risultato arriva domani</span>
          : when === "past"
          ? s.result
            ? <>{int(s.result.subs)} abbonati portati da {partner}</>
            : <span style={{ color: CP.textMuted }}>nessun link trovato con il nome di {partner}</span>
          : s.last
            ? <span style={{ color: CP.textMuted }}>ultima volta ({ddmm(s.last.day)}): {int(s.last.subs)} abbonati</span>
            : null}
      </div>
    </div>
  );
}

function DayCard({ d, today }) {
  const isToday = d.day === today;
  const when = d.day < today ? "past" : isToday ? "today" : "future";
  const langs = Object.keys(d.groups);
  const n = langs.reduce((s, l) => s + d.groups[l].pairs.length, 0);
  return (
    <section style={{ ...card, padding: "14px 16px", marginBottom: 12, borderColor: isToday ? CP.accent : CP.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{dayLabel(d.day)}</h3>
        {isToday && <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: `1px solid ${CP.accent}`, color: CP.accentSoftText }}>oggi</span>}
        <span style={{ fontSize: 12.5, color: CP.textMuted }}>{n} {n === 1 ? "scambio" : "scambi"}</span>
        <span style={{ marginLeft: "auto" }}><CopyButton text={dayText(d)} label="Copia per WhatsApp" /></span>
      </div>
      {langs.map((lang) => {
        const g = d.groups[lang];
        return (
          <div key={lang} style={{ marginTop: 6 }}>
            {langs.length > 1 && <div style={{ fontSize: 12, color: CP.textMuted, margin: "6px 0" }}>Pagine {LANG_LABEL[lang] || lang}</div>}
            {g.pairs.map((p) => (
              <div key={`${p.a.id}-${p.b.id}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "8px 16px", padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{p.a.name} <span style={{ color: CP.textMuted, fontWeight: 400 }}>⇄</span> {p.b.name}</div>
                <Side s={p.a} partner={p.b.name} when={when} />
                <Side s={p.b} partner={p.a.name} when={when} />
              </div>
            ))}
            {g.rest.length > 0 && <div style={{ fontSize: 12.5, color: CP.textMuted, paddingTop: 8, borderTop: `1px solid ${CP.borderSoft}` }}>Riposa: {g.rest.map((r) => r.name).join(", ")}</div>}
          </div>
        );
      })}
    </section>
  );
}

// Di default i prossimi giorni fino a 2 settimane: il resto su richiesta (25 giorni aperti = pagina infinita)
const SHOW_DAYS = 14;
const addDaysISO = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function Calendario({ v }) {
  const [showPast, setShowPast] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const upcoming = v.schedule.filter((d) => d.day >= v.today);
  const horizon = addDaysISO(v.today, SHOW_DAYS);
  const visible = showAll ? upcoming : upcoming.filter((d) => d.day < horizon);
  const hidden = upcoming.length - visible.length;
  const past = v.schedule.filter((d) => d.day < v.today).reverse();
  const totSubs = v.by_page.reduce((s, p) => s + p.subs, 0);
  const mature = v.results.reduce((s, r) => s + (r.mature_subs || 0), 0);
  const net = v.results.reduce((s, r) => s + (r.net30 || 0), 0);
  const next = upcoming[0];
  return (
    <>
      <HeroMetric
        label="Prossimo giorno di S4S"
        value={next ? dayLabel(next.day) : "—"}
        compare={next ? `${Object.values(next.groups).reduce((s, g) => s + g.pairs.length, 0)} scambi${next.day === v.today ? " · è oggi" : ""}` : "Nessun giorno in calendario: controlla le impostazioni"}
      >
        <Metric label={`Abbonati portati dagli S4S (${v.meta.window_days} giorni)`} value={int(totSubs)} note={`${v.results.length} link misurati`} />
        <Metric label="Speso a 30 giorni per abbonato" value={mature >= v.meta.min_mature ? usd(net / mature, 2) : "—"} note={`su ${int(mature)} abbonati da almeno 30 giorni`} />
      </HeroMetric>
      <Note style={{ marginBottom: 16 }}>
        Su ogni scambio, ciascuna pagina crea un link di tracciamento con il nome indicato e lo dà al partner, che lo pubblica. Con quel nome il risultato compare qui da solo il giorno dopo.
      </Note>
      {upcoming.length === 0 && <Notice>Nessun giorno di S4S nelle prossime 8 settimane.</Notice>}
      {visible.map((d) => <DayCard key={d.day} d={d} today={v.today} />)}
      {hidden > 0 && <button type="button" style={btn} onClick={() => setShowAll(true)}>Mostra i giorni dopo ({hidden}, fino al {ddmm(upcoming[upcoming.length - 1].day)})</button>}
      {past.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button type="button" style={btn} onClick={() => setShowPast((x) => !x)}>{showPast ? "Nascondi i giorni passati" : `Mostra i giorni passati (${past.length})`}</button>
          {showPast && <div style={{ marginTop: 12 }}>{past.map((d) => <DayCard key={d.day} d={d} today={v.today} />)}</div>}
        </div>
      )}
    </>
  );
}

function PerPagina({ v }) {
  const [pageId, setPageId] = useState(null);
  const pages = v.pages.filter((p) => !p.paused);
  const sel = pages.find((p) => p.id === pageId) || pages[0];
  const upcoming = useMemo(() => {
    if (!sel) return [];
    const out = [];
    for (const d of v.schedule) {
      if (d.day < v.today) continue;
      for (const g of Object.values(d.groups)) {
        if (g.rest.some((r) => r.id === sel.id)) out.push({ day: d.day, rest: true });
        for (const p of g.pairs) {
          if (p.a.id === sel.id) out.push({ day: d.day, partner: p.b.name, link: p.a.link, last: p.a.last });
          if (p.b.id === sel.id) out.push({ day: d.day, partner: p.a.name, link: p.b.link, last: p.b.last });
        }
      }
    }
    return out;
  }, [v, sel]);
  if (!sel) return <Notice>Nessuna pagina attiva nello split.</Notice>;
  const received = v.results.filter((r) => r.creator_id === sel.id);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {pages.map((p) => <FilterChip key={p.id} label={p.name} active={p.id === sel.id} onClick={() => setPageId(p.id)} />)}
      </div>
      <SectionTitle aside="prossime 8 settimane">I prossimi scambi di {sel.name}</SectionTitle>
      <DataTable
        minWidth={560}
        rows={upcoming.map((u, i) => ({ ...u, id: i }))}
        empty="Nessuno scambio in calendario."
        columns={[
          { key: "day", label: "Giorno", render: (r) => dayLabel(r.day), sort: (r) => r.day },
          { key: "partner", label: "Con chi", render: (r) => (r.rest ? <span style={{ color: CP.textMuted }}>riposa</span> : r.partner) },
          { key: "link", label: "Link da creare", sortable: false, render: (r) => (r.rest ? "" : <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><code style={mono}>{r.link}</code><CopyButton text={r.link} small label="Copia nome link" /></span>) },
          { key: "last", label: "Ultima volta", align: "right", render: (r) => (r.last ? `${int(r.last.subs)} abbonati (${ddmm(r.last.day)})` : "—"), sort: (r) => r.last?.subs ?? -1 },
        ]}
      />
      <div style={{ height: 22 }} />
      <SectionTitle aside={`ultimi ${v.meta.window_days} giorni`}>Cosa ha ricevuto {sel.name} dagli S4S</SectionTitle>
      <ResultsTable rows={received} hidePage />
    </>
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
    { key: "net30_per_sub", label: "Speso a 30 gg per abbonato", align: "right", render: (r) => (r.net30_per_sub != null ? usd(r.net30_per_sub, 2) : <span style={{ color: CP.textMuted }} title="Serve un link con almeno 20 abbonati arrivati da più di 30 giorni">presto</span>), sort: (r) => r.net30_per_sub ?? -1 },
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
    return Object.values(m).map((e) => ({ ...e, id: e.format, avg: e.subs / e.links, per_sub: e.mature >= v.meta.min_mature ? e.net / e.mature : null }));
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
          { key: "format", label: "Formato", render: (r) => FORMAT_LABEL[r.format] || r.format },
          { key: "links", label: "Link", align: "right" },
          { key: "avg", label: "Abbonati per link", align: "right", render: (r) => int(r.avg) },
          { key: "per_sub", label: "Speso a 30 gg per abbonato", align: "right", render: (r) => usd(r.per_sub, 2), sort: (r) => r.per_sub ?? -1 },
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
  const [tab, setTab] = useState("calendario");
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
      {tab === "calendario" && <Calendario v={v} />}
      {tab === "pagina" && <PerPagina v={v} />}
      {tab === "risultati" && <Risultati v={v} reload={mutate} />}
      {tab === "impostazioni" && <Impostazioni key={v.split.id} v={v} splitId={v.split.id} reload={mutate} />}
      <Note style={{ marginTop: 28 }}>
        Come si misura: abbonati arrivati da link di tracciamento con S4S o SFS nel nome, sulle pagine dello split, negli ultimi {v.meta.window_days} giorni. Il partner si ricava dal nome del link solo quando è inequivocabile. &quot;Speso a 30 giorni&quot; = incasso netto dai fan arrivati da quel link nei loro primi 30 giorni, contato solo sui fan abbonati da almeno 30 giorni e su link con almeno {v.meta.min_mature} di loro. Riguarda le pagine, non gli operatori: non entra in score né compensi.
      </Note>
    </div>
  );
}
