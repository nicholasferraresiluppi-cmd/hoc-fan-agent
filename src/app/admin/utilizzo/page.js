"use client";

// Utilizzo — chi usa HOC Pro, cosa apre, cosa nessuno apre.
// Schema dei prodotti di analytics (PostHog/Amplitude): prima le cose da
// sapere (insight che portano a una decisione), poi utenti attivi e abitudine,
// poi pagine per UTENTI UNICI (non per visite) e persone. Solo admin.
//
// Ridisegno 26/09/2026 (design system): numero principale = persone attive su
// quelle invitate; segnalazioni e "cose da sapere" come elenco con la gravità;
// tabelle ordinabili con intestazione ferma (erano lunghe decine di righe);
// la colonna "rispetto al periodo prima" compare solo quando esiste un periodo
// prima (con dati parziali diceva "nessun dato" su ogni riga); voci mai aperte
// chiuse in fondo. Dati e calcoli (usage-core) invariati.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { NAV_ITEMS } from "@/components/Sidebar";
import { buildUsageReport, buildUxReport } from "@/lib/usage-core";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, DataTable, FilterChip, Disclosure, ActionRow, NUM, card } from "@/components/ds";
import { fmtInt } from "@/lib/format";

const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");
const SEV = { warn: "critical", good: "info", info: "info" };

export default function UsagePage() {
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState(null);
  const [win, setWin] = useState(30);
  const [neverOpen, setNeverOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/usage")
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Errore"); return j; })
      .then(setRaw)
      .catch((e) => setErr(e.message));
  }, []);

  const r = useMemo(() => (raw ? buildUsageReport({ days: raw.days, members: raw.members, nav: NAV_ITEMS, window: win }) : null), [raw, win]);
  const maxDaily = r ? Math.max(1, ...r.daily.map((d) => d.users)) : 1;
  const navByHref = useMemo(() => Object.fromEntries(NAV_ITEMS.map((n) => [n.href, n])), []);
  const ux = useMemo(() => (raw?.ux ? buildUxReport(raw.ux, navByHref) : null), [raw, navByHref]);
  const [uxPage, setUxPage] = useState(null);
  const sel = ux?.pages.find((p) => p.page === uxPage) || ux?.pages[0] || null;

  const neverIn = r ? r.people.filter((p) => !p.last_day && !p.last_sign_in_at).length : 0;

  const pageCols = r ? [
    {
      key: "page", label: "Pagina", sort: (p) => (p.label || p.page).toLowerCase(),
      render: (p) => <div><div style={{ color: CP.textPrimary }}>{p.label || p.page}</div>{p.label && <div style={{ fontSize: 12, color: CP.textMuted }}>{p.group} · {p.page}</div>}</div>,
    },
    { key: "users", label: "Persone", align: "right" },
    { key: "views", label: "Aperture", align: "right" },
    ...(r.partial ? [] : [{
      key: "diff", label: `Rispetto ai ${win} giorni prima`, align: "right", sort: (p) => p.users - p.prev_users,
      render: (p) => { const diff = p.users - p.prev_users; return <span style={{ color: diff > 0 ? CP.accentGreen : diff < 0 ? CP.accentRed : CP.textMuted }}>{diff > 0 ? `+${diff} persone` : diff < 0 ? `−${Math.abs(diff)} persone` : "uguale"}</span>; },
    }]),
    { key: "last_day", label: "Ultimo uso", muted: true, sort: (p) => p.last_day || "", render: (p) => fmtDay(p.last_day) },
  ] : [];

  const peopleCols = [
    { key: "name", label: "Persona", sort: (p) => (p.name || "").toLowerCase(), render: (p) => <div><div style={{ color: CP.textPrimary }}>{p.name}</div><div style={{ fontSize: 12, color: CP.textMuted }}>{p.email || ""}</div></div> },
    { key: "active_days", label: "Giorni di uso", align: "right" },
    { key: "views", label: "Aperture", align: "right" },
    {
      key: "last_day", label: "Ultima visita", sort: (p) => p.last_day || (p.last_sign_in_at ? "0" : ""),
      render: (p) => (p.last_day ? fmtDay(p.last_day) : p.last_sign_in_at ? <span style={{ color: CP.textMuted }}>prima del tracciamento</span> : <span style={{ color: CP.accentRed }}>mai entrato</span>),
    },
    { key: "top", label: "Pagine più usate", sortable: false, muted: true, render: (p) => <span style={{ fontSize: 13 }}>{p.top_pages.join(", ") || "—"}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Insights" }, { label: "Utilizzo" }]}
        title="Utilizzo dell'app"
        subtitle="Chi usa HOC Pro, quali pagine servono davvero e quali nessuno apre: da qui decidi cosa migliorare, cosa spiegare e cosa togliere dal menu. Si registrano solo persona, pagina e giorno, mai i contenuti."
        actions={<div style={{ display: "flex", gap: 6 }}>
          {[7, 30].map((n) => <FilterChip key={n} label={`Ultimi ${n} giorni`} active={win === n} onClick={() => setWin(n)} />)}
        </div>}
      />

      {err && <Notice danger>{err}</Notice>}
      {!r && !err && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {r && (
        <>
          <HeroMetric
            label="Persone attive negli ultimi 7 giorni"
            value={`${fmtInt(r.kpi.active_7d)} su ${fmtInt(r.kpi.members)}`}
            compare={`In ${win} giorni: ${r.kpi.active_30d} su ${r.kpi.members}`}
            hint={r.partial ? `Dati dal ${fmtDay(r.since)} (${r.tracked_days} ${r.tracked_days === 1 ? "giorno" : "giorni"}): numeri parziali.` : "Su tutte le persone che hanno accesso."}
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Metric label="Giorni di uso a testa" value={r.tracked_days < 7 ? "—" : String(r.kpi.avg_active_days)} note={r.tracked_days < 7 ? "serve una settimana di dati" : `media su ${win} giorni`} />
              <Metric label="Pagine aperte" value={fmtInt(r.kpi.views_30d)} note={`in ${win} giorni`} />
              <Metric label="Mai entrati" value={fmtInt(neverIn)} note="invitati che non hanno mai aperto l'app" />
            </div>
          </HeroMetric>

          <FeedbackInbox />

          {/* Cose da sapere */}
          {r.insights.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <SectionTitle>Cose da sapere</SectionTitle>
              <div style={{ ...card, borderTop: "none", overflow: "hidden" }}>
                {r.insights.map((i, k) => (
                  <div key={k}>
                    <ActionRow severity={SEV[i.kind] || "info"} title={i.title} detail={i.text} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Attivi al giorno */}
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

          {/* Pagine */}
          <section style={{ marginBottom: 24 }}>
            <SectionTitle aside={r.partial ? "il confronto col periodo prima compare quando ci sono abbastanza giorni di dati" : null}>Pagine, per numero di persone che le usano</SectionTitle>
            <DataTable columns={pageCols} rows={r.pages.map((p) => ({ ...p, id: p.page }))} defaultSort={{ key: "users", dir: -1 }} minWidth={600} maxHeight={480} empty="Nessuna visita nel periodo." />
          </section>

          {/* Esperienza d'uso */}
          <section style={{ marginBottom: 24 }}>
            <SectionTitle aside="ultimi 30 giorni, nessun contenuto registrato">Come si usano le pagine</SectionTitle>
            <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
              Su cosa si clicca e dove sta nella pagina, dove qualcuno clicca più volte di fila per frustrazione, fin dove si scorre, errori e lentezza. Serve a decidere dove mettere i tasti.
            </p>
            {ux && ux.insights.length > 0 && (
              <div style={{ ...card, borderTop: "none", overflow: "hidden", marginBottom: 12 }}>
                {ux.insights.slice(0, 6).map((i, k) => (
                  <div key={k}>
                    <ActionRow severity={SEV[i.kind] || "info"} title={i.title} detail={i.text} />
                  </div>
                ))}
              </div>
            )}
            {(!ux || ux.pages.length === 0) ? (
              <div style={{ ...card, padding: 14, fontSize: 13, color: CP.textMuted }}>Nessun segnale ancora: arrivano con le prossime visite.</div>
            ) : (
              <div style={{ ...card, padding: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>Pagina</span>
                  <select value={sel?.page || ""} onChange={(e) => setUxPage(e.target.value)} aria-label="Pagina da analizzare" style={{ padding: "6px 9px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, maxWidth: "100%" }}>
                    {ux.pages.map((p) => <option key={p.page} value={p.page}>{(p.label || p.page) + ` · ${p.total_clicks} clic`}</option>)}
                  </select>
                  {sel && <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>
                    {sel.scroll_avg != null ? `scorrimento medio ${sel.scroll_avg}%` : "scorrimento: pochi dati"} · {sel.load_avg_ms != null ? `apertura ${(sel.load_avg_ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s` : "tempo di apertura: pochi dati"}
                  </span>}
                </div>
                {sel && (
                  <DataTable
                    columns={[
                      { key: "label", label: "Elemento", sort: (c) => String(c.label).toLowerCase() },
                      { key: "count", label: "Clic", align: "right" },
                      { key: "zone", label: "Dove sta", muted: true },
                      { key: "below", label: "Visibile all'apertura?", sort: (c) => c.below_share, render: (c) => <span style={{ color: c.below_share >= 0.6 ? CP.accentRed : CP.textSecondary }}>{c.below_share >= 0.6 ? "no, bisogna scorrere" : c.below_share > 0 ? "a volte" : "sì"}</span> },
                    ]}
                    rows={sel.clicks.slice(0, 12).map((c) => ({ ...c, id: c.label }))}
                    defaultSort={{ key: "count", dir: -1 }}
                    minWidth={520}
                    empty="Nessun clic registrato su questa pagina."
                  />
                )}
                {sel?.rage.length > 0 && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 10 }}>Clic ripetuti per frustrazione: {sel.rage.map((g) => `${g.label} (${g.count})`).join(", ")}</div>}
                {sel?.errors.length > 0 && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 6 }}>Errori: {sel.errors.map((g) => `${g.label} (${g.count})`).join(", ")}</div>}
              </div>
            )}
          </section>

          {/* Persone */}
          <section style={{ marginBottom: 24 }}>
            <SectionTitle aside={`${r.people.length} persone con accesso`}>Persone</SectionTitle>
            <DataTable columns={peopleCols} rows={r.people.map((p) => ({ ...p, id: p.userId }))} defaultSort={{ key: "active_days", dir: -1 }} minWidth={680} maxHeight={480} empty="Nessuna persona." />
          </section>

          {/* Mai aperte */}
          <Disclosure open={neverOpen} onToggle={() => setNeverOpen((v) => !v)} title={`Voci di menu mai aperte · ${r.never_opened.length}`}
            summary={r.tracked_days < 7 ? "troppo presto per dire che non servono" : "candidate alla modalità Advanced o a essere tolte"}>
            <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
              {r.tracked_days < 7
                ? `Dati da ${r.tracked_days} ${r.tracked_days === 1 ? "giorno" : "giorni"}: per ora l'elenco dice solo cosa non è ancora stato aperto, non cosa è inutile.`
                : "Candidate a finire in modalità Advanced o a essere tolte: meno voci, app più leggibile."}
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
      )}
    </div>
  );
}


const KIND_LABEL = { problem: "Problema", idea: "Idea", question: "Domanda" };
const STATUS = [["new", "Nuova"], ["seen", "Letta"], ["done", "Fatta"]];

// Segnalazioni dal tasto "Segnala o suggerisci": la voce diretta di chi usa l'app.
function FeedbackInbox() {
  const [items, setItems] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const load = () => fetch("/api/admin/feedback").then((r) => (r.ok ? r.json() : null)).then((j) => setItems(j?.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items) return null;
  const setStatus = async (id, status) => { await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); load(); };
  const open = items.filter((i) => i.status !== "done");
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
