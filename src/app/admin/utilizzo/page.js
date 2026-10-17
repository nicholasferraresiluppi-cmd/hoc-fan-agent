"use client";

// Utilizzo — chi usa HOC Pro, cosa apre, cosa nessuno apre, dove si blocca.
// Schema dei prodotti di analytics (PostHog/Amplitude): prima le cose da
// sapere (insight che portano a una decisione), poi utenti attivi e abitudine,
// poi pagine per UTENTI UNICI (non per visite) e persone. Solo admin.
//
// Ridisegno 26/09/2026 (design system): numero principale = persone attive su
// quelle invitate; tabelle ordinabili con intestazione ferma; voci mai aperte
// chiuse in fondo.
//
// Sezione apposita 17/10/2026 (richiesta Nicholas: "chi apre cosa, cosa non
// apre nessuno, dove si blocca"). Cinque viste, sul modello di PostHog
// (Paths), Amplitude (Journeys) e Pendo (Friction):
//   Panoramica       → il numero, cosa fare adesso, aree, stato delle persone
//   Persone          → per ognuno: abitudine (4 settimane), cosa usa, cosa
//                      della SUA mansione non ha mai aperto (mansione ∩ permessi)
//   Pagine           → ogni pagina con tempo, uscite subito, problemi; il
//                      dettaglio mostra da dove si arriva e dove si va dopo
//   Dove si blocca   → muri di permesso, errori, pagine richiuse subito,
//                      clic per frustrazione, lentezza, tasti da scorrere
//   Segnalazioni     → il tasto «Segnala o suggerisci»
// Percorsi e blocchi sono ANONIMI (aggregati per pagina): per decidere dove
// intervenire non serve sapere chi, e per persona sarebbe sorveglianza.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { NAV_ITEMS } from "@/components/Sidebar";
import { WORKSPACES } from "@/lib/workspaces";
import { canSee } from "@/lib/nav-access";
import {
  buildUsageReport, buildUxReport, buildFlowReport, buildStuckReport, enrichPeople, buildAreas,
  lastDays, PERSON_STATUS, FLOW_MIN, pageLabel,
} from "@/lib/usage-core";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, DataTable, FilterChip, Disclosure, NUM, card } from "@/components/ds";
import { SectionTabs, HabitStrip, StatusPill, BarRow, FlowView, TodoRow, fmtDay, fmtSeconds } from "@/components/usage/UsageParts";
import { fmtInt, fmtPct } from "@/lib/format";

const TAB_IDS = ["panoramica", "persone", "pagine", "blocchi", "segnalazioni"];
const STATUS_ORDER = ["abitudine", "occasionale", "fermo", "mai"];

/** Strumenti della mansione che la persona può davvero aprire (stesso filtro del suo menu). */
function expectedFor(m) {
  const ws = WORKSPACES[m?.workspace];
  if (!ws || ws.id === "all") return [];
  const seen = new Set();
  return ws.sections.flatMap((s) => s.items)
    .filter((i) => i.href !== ws.home && canSee(i.href, m.capabilities || {}, m.admin))
    .filter((i) => (seen.has(i.href) ? false : seen.add(i.href)))
    .map((i) => ({ href: i.href, label: i.label }));
}

export default function UsagePage() {
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState(null);
  const [win, setWin] = useState(30);
  const [tab, setTabState] = useState("panoramica");
  const [selPage, setSelPage] = useState(null);
  const [statusF, setStatusF] = useState(null);
  const [areaF, setAreaF] = useState(null);
  const [neverOpen, setNeverOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(0);
  const detailRef = useRef(null);

  // la vista sta nell'indirizzo (?vista=…): si può mandare il link a una scheda precisa
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const v = q.get("vista");
      if (TAB_IDS.includes(v)) setTabState(v);
      if (q.get("pagina")) setSelPage(q.get("pagina"));
    } catch {}
  }, []);
  const setTab = (v, page = null) => {
    setTabState(v);
    if (page !== undefined) setSelPage(page);
    try {
      const q = new URLSearchParams(window.location.search);
      q.set("vista", v);
      page ? q.set("pagina", page) : q.delete("pagina");
      window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
    } catch {}
    window.scrollTo?.({ top: 0 });
  };
  const openPage = (page) => setTab("pagine", page);

  useEffect(() => {
    fetch("/api/admin/usage")
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Errore"); return j; })
      .then(setRaw)
      .catch((e) => setErr(e.message));
  }, []);

  const navByHref = useMemo(() => Object.fromEntries(NAV_ITEMS.map((n) => [n.href, n])), []);
  const r = useMemo(() => {
    if (!raw) return null;
    const base = buildUsageReport({ days: raw.days, members: raw.members, nav: NAV_ITEMS, window: win });
    return enrichPeople(base, { days: raw.days, members: raw.members, expectedFor });
  }, [raw, win]);
  const areas = useMemo(() => (raw ? buildAreas({ days: raw.days, window: win, nav: NAV_ITEMS }) : []), [raw, win]);
  // percorsi e segnali sulla stessa finestra scelta (l'API ne manda 30 giorni)
  const uxWin = useMemo(() => {
    if (!raw?.ux) return {};
    const from = lastDays(win)[0];
    return Object.fromEntries(Object.entries(raw.ux).filter(([d]) => d >= from));
  }, [raw, win]);
  const ux = useMemo(() => buildUxReport(uxWin, navByHref), [uxWin, navByHref]);
  const flow = useMemo(() => buildFlowReport(uxWin, NAV_ITEMS), [uxWin]);
  const stuck = useMemo(() => buildStuckReport(flow, ux), [flow, ux]);

  // pagine: aperture per persona (usage:d) + tempo, uscite e problemi (usage:x)
  const pageRows = useMemo(() => {
    if (!r) return [];
    const fl = Object.fromEntries(flow.pages.map((p) => [p.page, p]));
    const keys = new Set([...r.pages.map((p) => p.page), ...flow.pages.map((p) => p.page)]);
    const byPage = Object.fromEntries(r.pages.map((p) => [p.page, p]));
    return [...keys].map((page) => {
      const u = byPage[page] || {};
      const f = fl[page] || null;
      return {
        id: page, page,
        label: f?.label || u.label || page,
        group: f?.group || u.group || "Fuori dal menu",
        users: u.users || 0, views: u.views || 0, last_day: u.last_day || null,
        flow: f,
        avg_seconds: f?.avg_seconds ?? null,
        quick_share: f && f.views >= FLOW_MIN.views ? f.quick_share : null,
        problem_share: f && f.views >= FLOW_MIN.views ? f.blocked_views / f.views : null,
      };
    }).filter((p) => p.users > 0 || (p.flow && p.flow.views > 0));
  }, [r, flow]);

  if (err) return <Shell><Notice danger>{err}</Notice></Shell>;
  if (!r) return <Shell><div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div></Shell>;

  const warnCount = stuck.filter((s) => s.kind === "warn").length;
  const tabs = [
    ["panoramica", "Panoramica"],
    ["persone", "Persone", r.people.length],
    ["pagine", "Pagine", pageRows.length],
    ["blocchi", "Dove si blocca", stuck.length],
    ["segnalazioni", "Segnalazioni", feedbackOpen],
  ];

  return (
    <Shell>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Insights" }, { label: "Utilizzo" }]}
        title="Utilizzo dell'app"
        subtitle="Chi usa HOC Pro, cosa apre, cosa non apre nessuno e dove si blocca: da qui decidi cosa migliorare, cosa spiegare e cosa togliere dal menu. Per persona si registrano solo pagina e giorno; percorsi e problemi sono anonimi; mai i contenuti."
        actions={<div style={{ display: "flex", gap: 6 }}>
          {[7, 30].map((n) => <FilterChip key={n} label={`Ultimi ${n} giorni`} active={win === n} onClick={() => setWin(n)} />)}
        </div>}
      />
      <SectionTabs tabs={tabs} value={tab} onChange={(v) => setTab(v, null)} />

      {tab === "panoramica" && <Overview r={r} areas={areas} stuck={stuck} win={win} warnCount={warnCount} setTab={setTab} setStatusF={setStatusF} setAreaF={setAreaF} openPage={openPage} />}
      {tab === "persone" && <People r={r} statusF={statusF} setStatusF={setStatusF} win={win} />}
      {tab === "pagine" && (
        <Pages rows={pageRows} r={r} flow={flow} ux={ux} stuck={stuck} win={win} selPage={selPage} openPage={(p) => { setSelPage(p); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }}
          areaF={areaF} setAreaF={setAreaF} detailRef={detailRef} neverOpen={neverOpen} setNeverOpen={setNeverOpen} />
      )}
      {tab === "blocchi" && <Stuck stuck={stuck} flow={flow} openPage={openPage} />}
      <div style={{ display: tab === "segnalazioni" ? "block" : "none" }}><FeedbackInbox onCount={setFeedbackOpen} /></div>
    </Shell>
  );
}

function Shell({ children }) {
  return <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Panoramica                                                          */
/* ------------------------------------------------------------------ */

function Overview({ r, areas, stuck, win, warnCount, setTab, setStatusF, setAreaF, openPage }) {
  const maxDaily = Math.max(1, ...r.daily.map((d) => d.users));
  const maxArea = Math.max(1, ...areas.map((a) => a.users));
  const sc = r.status_counts;
  // cosa fare: prima i problemi (persone e blocchi), poi il resto; massimo 6 righe
  const todo = [
    ...r.insights.filter((i) => i.kind === "warn").map((i) => ({ ...i, action: /mansione|non torna|mai entrat/.test(i.title) ? "Vedi le persone" : null, go: () => setTab("persone", null) })),
    ...stuck.filter((s) => s.kind === "warn").slice(0, 3).map((s) => ({ ...s, action: "Vedi la pagina", go: () => openPage(s.page) })),
    ...r.insights.filter((i) => i.kind !== "warn").map((i) => ({ ...i, action: /mai aperte/.test(i.title) ? "Vedi le pagine" : null, go: () => setTab("pagine", null) })),
  ].slice(0, 6);

  return (
    <>
      <HeroMetric
        label="Persone attive negli ultimi 7 giorni"
        value={`${fmtInt(r.kpi.active_7d)} su ${fmtInt(r.kpi.members)}`}
        compare={`In ${win} giorni: ${r.kpi.active_30d} su ${r.kpi.members}`}
        hint={r.partial ? `Dati dal ${fmtDay(r.since)} (${r.tracked_days} ${r.tracked_days === 1 ? "giorno" : "giorni"}): numeri parziali.` : "Su tutte le persone che hanno accesso."}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Metric label="Lo usano ogni settimana" value={fmtInt(sc.abitudine)} note="attivi in 3 settimane su 4" />
          <Metric label="Giorni di uso a testa" value={r.tracked_days < 7 ? "—" : String(r.kpi.avg_active_days).replace(".", ",")} note={r.tracked_days < 7 ? "serve una settimana di dati" : `media su ${win} giorni`} />
          <Metric label="Punti di blocco" value={fmtInt(warnCount)} note="da sistemare" attn={warnCount > 0} />
        </div>
      </HeroMetric>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle aside="ordinate da cosa conviene fare prima">Cosa fare adesso</SectionTitle>
        <div style={{ ...card, overflow: "hidden" }}>
          {todo.length === 0 && <div style={{ padding: 14, fontSize: 13, color: CP.textMuted }}>Niente di urgente: nessuna persona ferma e nessun punto di blocco sopra le soglie.</div>}
          {todo.map((i, k) => <TodoRow key={k} first={k === 0} kind={i.kind} title={i.title} text={i.text} action={i.action} onAction={i.go} />)}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, marginBottom: 24 }}>
        <section style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 12 }}>Come stanno le persone</div>
          <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: CP.borderSoft, marginBottom: 12 }}>
            {STATUS_ORDER.map((s) => sc[s] ? <div key={s} title={`${PERSON_STATUS[s].short}: ${sc[s]}`} style={{ width: `${(sc[s] / Math.max(1, r.people.length)) * 100}%`, background: s === "abitudine" ? CP.scale : s === "occasionale" ? CP.accentDim : s === "fermo" ? CP.attn : CP.textMuted, opacity: s === "mai" ? 0.5 : 1 }} /> : null)}
          </div>
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => { setStatusF(s); setTab("persone", null); }} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", background: "transparent", border: "none", borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer", fontFamily: FONTS.body, textAlign: "left" }}>
              <span style={{ fontSize: 13, color: CP.textSecondary }}>{PERSON_STATUS[s].label}</span>
              <span style={{ fontSize: 15, color: CP.textPrimary, ...NUM }}>{fmtInt(sc[s])}</span>
            </button>
          ))}
        </section>

        <section style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 6 }}>Le aree più usate</div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>persone diverse che le hanno aperte in {win} giorni</div>
          {areas.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna visita nel periodo.</div>}
          {areas.slice(0, 8).map((a) => (
            <BarRow key={a.group} label={a.group} value={a.users} max={maxArea} sub={`${a.users} ${a.users === 1 ? "persona" : "persone"} · ${fmtInt(a.views)} aperture`} onClick={() => { setAreaF(a.group); setTab("pagine", null); }} />
          ))}
        </section>
      </div>

      <section style={{ ...card, padding: "16px 16px 10px", marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 12 }}>Persone attive al giorno</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
          {r.daily.map((d, i) => (
            <div key={d.day} title={`${fmtDay(d.day)}: ${d.users} persone, ${d.views} pagine`} style={{ flex: 1, height: `${(d.users / maxDaily) * 100}%`, minHeight: d.users ? 3 : 1, background: !d.users ? CP.border : i === r.daily.length - 1 ? CP.scale : CP.accentDim, borderRadius: 2 }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: CP.textMuted, marginTop: 6 }}>
          <span>{fmtDay(r.daily[0]?.day)}</span><span>oggi</span>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Persone                                                             */
/* ------------------------------------------------------------------ */

function People({ r, statusF, setStatusF, win }) {
  const days28 = lastDays(28);
  const shown = statusF ? r.people.filter((p) => p.status === statusF) : r.people;
  const order = { fermo: 0, mai: 1, occasionale: 2, abitudine: 3 };
  // prima chi ha bisogno di una spinta, poi gli altri; dentro, chi usa di più in alto
  const sorted = [...shown].sort((a, b) => (order[a.status] - order[b.status]) || (b.active_days - a.active_days) || (a.name || "").localeCompare(b.name || ""));
  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterChip label={`Tutte · ${r.people.length}`} active={!statusF} onClick={() => setStatusF(null)} />
        {STATUS_ORDER.map((s) => <FilterChip key={s} label={`${PERSON_STATUS[s].short} · ${r.status_counts[s]}`} active={statusF === s} attn={(s === "fermo" || s === "mai") && r.status_counts[s] > 0} onClick={() => setStatusF(statusF === s ? null : s)} />)}
      </div>
      {r.tracked_days < 21 && <Notice>L'abitudine si misura su 4 settimane, ma i dati partono dal {fmtDay(r.since)}: finché non ci sono 3 settimane vale «almeno 5 giorni sugli ultimi 14».</Notice>}
      {sorted.length === 0 && <div style={{ ...card, padding: 14, fontSize: 13, color: CP.textMuted }}>Nessuna persona in questo stato. <button onClick={() => setStatusF(null)} style={{ background: "none", border: "none", color: CP.accentSoftText, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13, padding: 0 }}>Mostra tutte</button></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 12 }}>
        {sorted.map((p) => (
          <article key={p.userId} style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{p.workspace ? (WORKSPACES[p.workspace]?.label || p.workspace) : "Nessuna mansione"}{p.admin ? " · admin" : ""}</div>
              </div>
              <StatusPill status={p.status} />
            </div>
            <div>
              <HabitStrip strip={p.strip} days={days28} />
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6, ...NUM }}>
                {p.status === "mai" ? "Non ha mai aperto l'app" : <>
                  {p.active_days} {p.active_days === 1 ? "giorno" : "giorni"} su {win} · ultima visita {p.last_day ? fmtDay(p.last_day) : "prima del tracciamento"}
                </>}
              </div>
            </div>
            {p.top_pages.length > 0 && <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}><span style={{ color: CP.textMuted }}>Usa di più: </span>{p.top_pages.join(", ")}</div>}
            {p.expected_count > 0 && (
              <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 10 }}>
                <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: p.missing.length ? 6 : 0 }}>
                  Strumenti della sua mansione usati: <span style={{ color: CP.textPrimary, ...NUM }}>{p.expected_used} su {p.expected_count}</span>
                </div>
                {p.missing.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 12, color: CP.textMuted, alignSelf: "center" }}>Mai aperti:</span>
                    {p.missing.slice(0, 6).map((m) => (
                      <Link key={m.href} href={m.href} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, border: `1px solid ${CP.border}`, color: CP.textSecondary, textDecoration: "none" }}>{m.label}</Link>
                    ))}
                    {p.missing.length > 6 && <span style={{ fontSize: 12, color: CP.textMuted, alignSelf: "center" }}>+{p.missing.length - 6}</span>}
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pagine                                                              */
/* ------------------------------------------------------------------ */

function Pages({ rows, r, flow, ux, stuck, win, selPage, openPage, areaF, setAreaF, detailRef, neverOpen, setNeverOpen }) {
  const groups = useMemo(() => {
    const c = {};
    for (const p of rows) c[p.group] = (c[p.group] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const shown = areaF ? rows.filter((p) => p.group === areaF) : rows;
  const sel = rows.find((p) => p.page === selPage) || null;
  const noFlow = !flow.since;

  const cols = [
    { key: "label", label: "Pagina", sort: (p) => p.label.toLowerCase(), render: (p) => <div><div style={{ color: CP.textPrimary }}>{p.label}</div><div style={{ fontSize: 12, color: CP.textMuted }}>{p.group}</div></div> },
    { key: "users", label: "Persone", align: "right" },
    { key: "views", label: "Aperture", align: "right" },
    { key: "avg_seconds", label: "Tempo medio", align: "right", render: (p) => fmtSeconds(p.avg_seconds) },
    { key: "quick_share", label: "Chiusa subito", align: "right", render: (p) => p.quick_share == null ? <span style={{ color: CP.textMuted }}>—</span> : <span style={{ color: p.quick_share >= FLOW_MIN.quickShare ? CP.attn : CP.textPrimary }}>{fmtPct(p.quick_share)}</span> },
    { key: "problem_share", label: "Con problemi", align: "right", render: (p) => p.problem_share == null ? <span style={{ color: CP.textMuted }}>—</span> : <span style={{ color: p.problem_share >= FLOW_MIN.blockShare ? CP.accentRed : CP.textPrimary }}>{fmtPct(p.problem_share)}</span> },
    { key: "last_day", label: "Ultimo uso", muted: true, sort: (p) => p.last_day || "", render: (p) => fmtDay(p.last_day) },
  ];

  return (
    <>
      {noFlow && <Notice>Tempo, uscite e problemi si registrano da oggi: le colonne si riempiono con le prossime visite. Persone e aperture hanno già la storia dal {fmtDay(r.since)}.</Notice>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <FilterChip label={`Tutte · ${rows.length}`} active={!areaF} onClick={() => setAreaF(null)} />
        {groups.map(([g, n]) => <FilterChip key={g} label={`${g} · ${n}`} active={areaF === g} onClick={() => setAreaF(areaF === g ? null : g)} />)}
      </div>
      <DataTable columns={cols} rows={shown} defaultSort={{ key: "users", dir: -1 }} minWidth={760} maxHeight={520}
        onRowClick={(p) => openPage(p.page)} selected={(p) => p.page === selPage}
        empty={areaF ? "Nessuna pagina aperta in quest'area nel periodo." : "Nessuna visita nel periodo."} />
      <div style={{ fontSize: 12, color: CP.textMuted, margin: "6px 0 24px", lineHeight: 1.5 }}>Tocca una pagina per vedere da dove ci si arriva, dove si va dopo e cosa si clicca. «Chiusa subito» = meno di 10 secondi senza nessun clic; «Con problemi» = almeno una richiesta di dati andata male. Tempo, chiusa subito e problemi contano le aperture registrate {flow.since ? `dal ${fmtDay(flow.since)}` : "da oggi"} (con almeno {FLOW_MIN.views} aperture).</div>

      <div ref={detailRef} style={{ scrollMarginTop: 16 }}>
        {sel && <PageDetail p={sel} ux={ux} stuck={stuck} since={flow.since} openPage={openPage} />}
      </div>

      <Disclosure open={neverOpen} onToggle={() => setNeverOpen((v) => !v)} title={`Voci di menu mai aperte · ${r.never_opened.length}`}
        summary={r.tracked_days < 7 ? "troppo presto per dire che non servono" : `in ${win} giorni nessuno le ha aperte`}>
        <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
          {r.tracked_days < 7
            ? `Dati da ${r.tracked_days} ${r.tracked_days === 1 ? "giorno" : "giorni"}: per ora l'elenco dice solo cosa non è ancora stato aperto, non cosa è inutile.`
            : "Candidate a finire in modalità Advanced o a essere tolte: meno voci, app più leggibile. Prima di toglierle chiedi a chi dovrebbero servire."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {r.never_opened.length === 0 && <span style={{ fontSize: 13, color: CP.textMuted }}>Tutte le voci sono state aperte almeno una volta.</span>}
          {r.never_opened.map((n) => (
            <Link key={n.href} href={n.href} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999, border: `1px solid ${CP.border}`, color: CP.textSecondary, textDecoration: "none" }}>
              {n.label} <span style={{ color: CP.textMuted }}>· {n.group}</span>
            </Link>
          ))}
        </div>
      </Disclosure>
    </>
  );
}

// "→ /admin/le-mie-creator" (destinazione di un link, vedi ux-client) → "→ Revenue e chat"
const clickLabel = (l) => (String(l).startsWith("→ /") ? `→ ${pageLabel(l.slice(2).replace(/:x/g, "[x]"), NAV_ITEMS)}` : l);

function PageDetail({ p, ux, stuck, since, openPage }) {
  const u = ux.pages.find((x) => x.page === p.page) || null;
  const f = p.flow;
  const issues = stuck.filter((s) => s.page === p.page);
  const linkable = !/\[/.test(p.page);
  const blocks = f ? Object.entries(f.blocks).sort((a, b) => b[1] - a[1]) : [];
  const BLOCK_LABEL = { "403": "non hai il permesso", "5xx": "errore del server", "404": "dati non trovati", "401": "sessione scaduta", rete: "nessuna risposta" };
  return (
    <section style={{ ...card, padding: 18, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: CP.textMuted }}>{p.group}</div>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: "2px 0 0", color: CP.textPrimary }}>{p.label}</h2>
        </div>
        {linkable && <Link href={p.page} style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>Apri la pagina →</Link>}
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 18 }}>
        <Metric label="Persone" value={fmtInt(p.users)} />
        <Metric label="Aperture" value={fmtInt(p.views)} />
        <Metric label="Tempo medio" value={fmtSeconds(p.avg_seconds)} note="pagina in primo piano" />
        <Metric label="Chiusa subito" value={p.quick_share == null ? "—" : fmtPct(p.quick_share)} note={p.quick_share == null ? "pochi dati" : "sotto 10 s, nessun clic"} attn={p.quick_share >= FLOW_MIN.quickShare} />
        <Metric label="Si scorre fino al" value={u?.scroll_avg != null ? `${u.scroll_avg}%` : "—"} note={u?.scroll_avg != null ? "della pagina, in media" : "pochi dati"} />
        <Metric label="Apertura" value={u?.load_avg_ms != null ? `${(u.load_avg_ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s` : "—"} note={u?.load_avg_ms != null ? "primo caricamento" : "pochi dati"} />
      </div>

      {issues.length > 0 && (
        <div style={{ ...card, overflow: "hidden", marginBottom: 18 }}>
          {issues.map((i, k) => <TodoRow key={k} first={k === 0} kind={i.kind} title={i.title} text={i.text} />)}
        </div>
      )}

      <SectionTitle aside={f && since ? `${fmtInt(f.views)} aperture registrate dal ${fmtDay(since)}, quando è partita la raccolta dei percorsi` : null}>Il percorso</SectionTitle>
      {f ? <FlowView row={f} onPick={openPage} /> : <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 6 }}>Ancora nessun percorso registrato per questa pagina: si raccoglie dalle prossime visite.</div>}

      {blocks.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <SectionTitle aside="aperture in cui almeno una richiesta di dati è andata male">Risposte andate male</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {blocks.map(([code, n]) => <span key={code} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999, border: `1px solid ${CP.border}`, color: code === "403" || code === "5xx" ? CP.accentRed : CP.textSecondary, ...NUM }}>{BLOCK_LABEL[code] || code} · {fmtInt(n)}</span>)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <SectionTitle aside="nessun contenuto registrato">Su cosa si clicca</SectionTitle>
        {(!u || u.clicks.length === 0) ? <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun clic registrato su questa pagina nel periodo.</div> : (
          <DataTable
            columns={[
              { key: "label", label: "Elemento", sort: (c) => String(c.label).toLowerCase(), render: (c) => clickLabel(c.label) },
              { key: "count", label: "Clic", align: "right" },
              { key: "zone", label: "Dove sta", muted: true },
              { key: "below", label: "Visibile all'apertura?", sort: (c) => c.below_share, render: (c) => <span style={{ color: c.below_share >= 0.6 ? CP.accentRed : CP.textSecondary }}>{c.below_share >= 0.6 ? "no, bisogna scorrere" : c.below_share > 0 ? "a volte" : "sì"}</span> },
            ]}
            rows={u.clicks.slice(0, 12).map((c) => ({ ...c, id: c.label }))}
            defaultSort={{ key: "count", dir: -1 }}
            minWidth={520}
          />
        )}
        {u?.rage.length > 0 && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 10 }}>Clic ripetuti per frustrazione: {u.rage.map((g) => `${g.label} (${g.count})`).join(", ")}</div>}
        {u?.errors.length > 0 && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 6 }}>Errori: {u.errors.map((g) => `${g.label} (${g.count})`).join(", ")}</div>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dove si blocca                                                      */
/* ------------------------------------------------------------------ */

const CAUSE_LABEL = { permesso: "Permessi", errore: "Errori", subito: "Chiusa subito", frustrazione: "Frustrazione", lenta: "Lentezza", nascosto: "Tasti nascosti", scorrimento: "Non si scorre", vuota: "Dati non trovati", sessione: "Sessione scaduta", rete: "Connessione" };

function Stuck({ stuck, flow, openPage }) {
  const [cause, setCause] = useState(null);
  const counts = useMemo(() => {
    const c = {};
    for (const s of stuck) c[s.cause] = (c[s.cause] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [stuck]);
  const shown = cause ? stuck.filter((s) => s.cause === cause) : stuck;
  return (
    <>
      <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 14px", lineHeight: 1.55, maxWidth: 820 }}>
        I punti in cui chi usa l'app si ferma: pagine che si aprono ma rispondono «non hai il permesso» o vanno in errore, pagine richiuse dopo pochi secondi, clic ripetuti per frustrazione, pagine lente, tasti che si trovano solo scorrendo. Prima i più gravi; ognuno dice cosa fare. Una pagina compare solo dopo almeno {FLOW_MIN.views} aperture.
      </p>
      {!flow.since && <Notice>Permessi, errori e pagine richiuse subito si registrano da oggi: questa lista si riempie con le prossime visite. Frustrazione, lentezza e tasti nascosti hanno già la storia.</Notice>}
      {counts.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <FilterChip label={`Tutti · ${stuck.length}`} active={!cause} onClick={() => setCause(null)} />
          {counts.map(([c, n]) => <FilterChip key={c} label={`${CAUSE_LABEL[c] || c} · ${n}`} active={cause === c} onClick={() => setCause(cause === c ? null : c)} />)}
        </div>
      )}
      <div style={{ ...card, overflow: "hidden" }}>
        {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, color: CP.textMuted }}>Nessun punto di blocco sopra le soglie nel periodo.</div>}
        {shown.map((s, k) => <TodoRow key={k} first={k === 0} kind={s.kind} title={s.title} text={s.text} action={s.page ? "Vedi la pagina" : null} onAction={() => openPage(s.page)} />)}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Segnalazioni                                                        */
/* ------------------------------------------------------------------ */

const KIND_LABEL = { problem: "Problema", idea: "Idea", question: "Domanda" };
const STATUS = [["new", "Nuova"], ["seen", "Letta"], ["done", "Fatta"]];

// Segnalazioni dal tasto "Segnala o suggerisci": la voce diretta di chi usa l'app.
function FeedbackInbox({ onCount }) {
  const [items, setItems] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const load = () => fetch("/api/admin/feedback").then((r) => (r.ok ? r.json() : null)).then((j) => setItems(j?.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const open = (items || []).filter((i) => i.status !== "done");
  useEffect(() => { onCount?.(open.length); }, [open.length, onCount]);
  if (!items) return <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>;
  const setStatus = async (id, status) => { await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); load(); };
  const shown = showDone ? items : open;
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <SectionTitle aside="la voce diretta di chi usa l'app">Segnalazioni ricevute · {open.length} aperte</SectionTitle>
        <button onClick={() => setShowDone((v) => !v)} style={{ background: "transparent", border: "none", color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, padding: 0, marginBottom: 10 }}>{showDone ? "Nascondi quelle fatte" : "Mostra anche quelle fatte"}</button>
      </div>
      <div style={card}>
        {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, color: CP.textMuted }}>Nessuna segnalazione {showDone ? "" : "aperta"}. Arrivano dal tasto «Segnala o suggerisci» in basso a destra di ogni pagina.</div>}
        {shown.map((i, k) => (
          <div key={i.id} style={{ padding: "12px 14px", borderTop: k ? `1px solid ${CP.borderSoft}` : "none" }}>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>
              {KIND_LABEL[i.kind] || "Idea"} · {i.name || "—"} · {new Date(i.at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · <Link href={i.page || "/"} style={{ color: CP.accentSoftText }}>{i.page}</Link>
            </div>
            <div style={{ fontSize: 14, color: CP.textPrimary, whiteSpace: "pre-wrap", marginBottom: 8 }}>{i.text}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {STATUS.map(([st, l]) => (
                <button key={st} onClick={() => setStatus(i.id, st)} aria-pressed={i.status === st} style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${i.status === st ? CP.accent : CP.border}`, background: i.status === st ? CP.accentSoft : "transparent", color: i.status === st ? CP.accentSoftText : CP.textMuted }}>{l}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
