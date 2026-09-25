"use client";

// Utilizzo — chi usa HOC Pro, cosa apre, cosa nessuno apre.
// Schema dei prodotti di analytics (PostHog/Amplitude): prima le cose da
// sapere (insight che portano a una decisione), poi utenti attivi e abitudine,
// poi pagine per UTENTI UNICI (non per visite) e persone. Solo admin.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { NAV_ITEMS } from "@/components/Sidebar";
import { buildUsageReport, buildUxReport } from "@/lib/usage-core";

const card = { border: `1px solid ${CP.border}`, borderRadius: 12, background: CP.surface };
const th = { textAlign: "left", fontSize: 12, fontWeight: 500, color: CP.textMuted, padding: "10px 14px", borderBottom: `1px solid ${CP.border}` };
const td = { fontSize: 13, color: CP.textSecondary, padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}`, verticalAlign: "top" };
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");
const KIND = { warn: CP.accentRed, good: CP.accentGreen, info: CP.accentSoftText };

export default function UsagePage() {
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState(null);
  const [win, setWin] = useState(30);

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

  return (
    <div style={{ background: CP.bg, minHeight: "100vh", color: CP.textPrimary, padding: "32px 28px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        breadcrumb={<div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}><Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link><span style={{ color: CP.textMuted }}>›</span><span style={{ color: CP.textPrimary }}>Utilizzo</span></div>}
        section="Insights"
        title="Utilizzo dell'app"
        subtitle="Chi usa HOC Pro, quali pagine servono davvero e quali nessuno apre. Si registra solo persona, pagina e giorno: nessun contenuto."
        toolbar={
          <div style={{ display: "flex", gap: 6 }}>
            {[7, 30].map((n) => (
              <button key={n} onClick={() => setWin(n)} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", border: `1px solid ${win === n ? CP.accent : CP.border}`, background: win === n ? CP.accentSoft : "transparent", color: win === n ? CP.accentSoftText : CP.textSecondary }}>
                Ultimi {n} giorni
              </button>
            ))}
          </div>
        }
      />

      {err && <div style={{ ...card, padding: 16, color: CP.accentRed, fontSize: 14 }}>{err}</div>}
      {!r && !err && <p style={{ color: CP.textMuted }}>Caricamento…</p>}

      {r && (
        <>
          <FeedbackInbox />

          {/* Cose da sapere */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 24 }}>
            {r.insights.map((i, k) => (
              <div key={k} style={{ ...card, padding: "14px 16px", borderLeft: `3px solid ${KIND[i.kind] || CP.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{i.title}</div>
                <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.55 }}>{i.text}</div>
              </div>
            ))}
          </section>

          {/* KPI */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Kpi label="Attivi negli ultimi 7 giorni" value={`${r.kpi.active_7d} / ${r.kpi.members}`} sub="persone con almeno una visita" />
            <Kpi label={`Attivi in ${win} giorni`} value={`${r.kpi.active_30d} / ${r.kpi.members}`} sub={r.partial ? `dati dal ${fmtDay(r.since)}` : "sui membri totali"} />
            <Kpi label="Giorni di uso a testa" value={r.tracked_days < 7 ? "—" : String(r.kpi.avg_active_days)} sub={r.tracked_days < 7 ? "serve almeno una settimana di dati" : `media su ${win} giorni: misura l'abitudine`} />
            <Kpi label="Pagine aperte" value={String(r.kpi.views_30d)} sub={`in ${win} giorni`} />
          </section>

          {/* Attivi al giorno */}
          <section style={{ ...card, padding: "16px 16px 10px", marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 12 }}>Persone attive al giorno</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
              {r.daily.map((d) => (
                <div key={d.day} title={`${fmtDay(d.day)}: ${d.users} persone, ${d.views} pagine`} style={{ flex: 1, height: `${(d.users / maxDaily) * 100}%`, minHeight: d.users ? 3 : 1, background: d.users ? CP.accent : CP.border, borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: CP.textMuted, marginTop: 6 }}>
              <span>{fmtDay(r.daily[0]?.day)}</span><span>oggi</span>
            </div>
          </section>

          {/* Pagine */}
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 10px" }}>Pagine, per numero di persone che le usano</h2>
          <div style={{ ...card, overflowX: "auto", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr><th style={th}>Pagina</th><th style={th}>Persone</th><th style={th}>Aperture</th><th style={th}>{r.partial ? "Periodo prima" : `Rispetto ai ${win} giorni prima`}</th><th style={th}>Ultimo uso</th></tr></thead>
              <tbody>
                {r.pages.length === 0 && <tr><td style={td} colSpan={5}>Nessuna visita nel periodo.</td></tr>}
                {r.pages.map((p) => {
                  const diff = p.users - p.prev_users;
                  return (
                    <tr key={p.page}>
                      <td style={td}><div style={{ color: CP.textPrimary }}>{p.label || p.page}</div>{p.label && <div style={{ fontSize: 11, color: CP.textMuted }}>{p.group} · {p.page}</div>}</td>
                      <td style={td}>{p.users}</td>
                      <td style={td}>{p.views}</td>
                      <td style={{ ...td, color: r.partial ? CP.textMuted : diff > 0 ? CP.accentGreen : diff < 0 ? CP.accentRed : CP.textMuted }}>{r.partial ? "nessun dato" : diff > 0 ? `+${diff} persone` : diff < 0 ? `${diff} persone` : "uguale"}</td>
                      <td style={td}>{fmtDay(p.last_day)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Esperienza d'uso */}
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>Come si usano le pagine</h2>
          <p style={{ fontSize: 13, color: CP.textMuted, margin: "0 0 10px" }}>
            Su cosa si clicca e dove sta nella pagina, dove qualcuno clicca più volte per frustrazione, fin dove si scorre, errori e lentezza. Ultimi 30 giorni, nessun contenuto registrato.
          </p>
          {ux && ux.insights.length > 0 && (
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
              {ux.insights.slice(0, 6).map((i, k) => (
                <div key={k} style={{ ...card, padding: "14px 16px", borderLeft: `3px solid ${KIND[i.kind] || CP.border}` }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{i.title}</div>
                  <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.55 }}>{i.text}</div>
                </div>
              ))}
            </section>
          )}
          {(!ux || ux.pages.length === 0) ? (
            <div style={{ ...card, padding: 14, fontSize: 13, color: CP.textMuted, marginBottom: 24 }}>Nessun segnale ancora: arrivano con le prossime visite.</div>
          ) : (
            <div style={{ ...card, padding: 14, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: CP.textSecondary }}>Pagina</span>
                <select value={sel?.page || ""} onChange={(e) => setUxPage(e.target.value)} style={{ padding: "6px 9px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 6, color: CP.textPrimary, fontSize: 13, maxWidth: "100%" }}>
                  {ux.pages.map((p) => <option key={p.page} value={p.page}>{(p.label || p.page) + ` · ${p.total_clicks} clic`}</option>)}
                </select>
                {sel && <span style={{ fontSize: 12, color: CP.textMuted }}>
                  {sel.scroll_avg != null ? `scorrimento medio ${sel.scroll_avg}%` : "scorrimento: pochi dati"} · {sel.load_avg_ms != null ? `apertura ${(sel.load_avg_ms / 1000).toFixed(1)}s` : "tempo di apertura: pochi dati"}
                </span>}
              </div>
              {sel && (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Elemento</th><th style={th}>Clic</th><th style={th}>Dove sta</th><th style={th}>Visibile all'apertura?</th></tr></thead>
                  <tbody>
                    {sel.clicks.slice(0, 12).map((c) => (
                      <tr key={c.label}>
                        <td style={td}>{c.label}</td>
                        <td style={td}>{c.count}</td>
                        <td style={td}>{c.zone}</td>
                        <td style={{ ...td, color: c.below_share >= 0.6 ? CP.accentRed : CP.textSecondary }}>{c.below_share >= 0.6 ? "no, bisogna scorrere" : c.below_share > 0 ? "a volte" : "sì"}</td>
                      </tr>
                    ))}
                    {sel.clicks.length === 0 && <tr><td style={td} colSpan={4}>Nessun clic registrato su questa pagina.</td></tr>}
                  </tbody>
                </table>
              )}
              {sel?.rage.length > 0 && <div style={{ fontSize: 12, color: CP.accentRed, marginTop: 10 }}>Clic di frustrazione: {sel.rage.map((g) => `${g.label} (${g.count})`).join(", ")}</div>}
              {sel?.errors.length > 0 && <div style={{ fontSize: 12, color: CP.accentRed, marginTop: 6 }}>Errori: {sel.errors.map((g) => `${g.label} (${g.count})`).join(", ")}</div>}
            </div>
          )}

          {/* Persone */}
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 10px" }}>Persone</h2>
          <div style={{ ...card, overflowX: "auto", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr><th style={th}>Persona</th><th style={th}>Giorni di uso</th><th style={th}>Aperture</th><th style={th}>Ultima visita</th><th style={th}>Pagine più usate</th></tr></thead>
              <tbody>
                {r.people.map((p) => (
                  <tr key={p.userId}>
                    <td style={td}><div style={{ color: CP.textPrimary }}>{p.name}</div><div style={{ fontSize: 11, color: CP.textMuted }}>{p.email || ""}</div></td>
                    <td style={td}>{p.active_days}</td>
                    <td style={td}>{p.views}</td>
                    <td style={td}>{p.last_day ? fmtDay(p.last_day) : p.last_sign_in_at ? "prima del tracciamento" : <span style={{ color: CP.accentRed }}>mai entrato</span>}</td>
                    <td style={td}>{p.top_pages.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mai aperte */}
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>Voci di menu mai aperte · {r.never_opened.length}</h2>
          <p style={{ fontSize: 13, color: CP.textMuted, margin: "0 0 10px" }}>
            {r.tracked_days < 7
              ? `Dati da ${r.tracked_days} ${r.tracked_days === 1 ? "giorno" : "giorni"}: per ora l'elenco dice solo cosa non è ancora stato aperto, non cosa è inutile.`
              : "Candidate a finire in modalità Advanced o a essere tolte: meno voci, app più leggibile."}
          </p>
          <div style={{ ...card, padding: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {r.never_opened.length === 0 && <span style={{ fontSize: 13, color: CP.textMuted }}>Tutte le voci sono state aperte almeno una volta.</span>}
            {r.never_opened.map((n) => (
              <Link key={n.href} href={n.href} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, border: `1px solid ${CP.border}`, color: CP.textSecondary, textDecoration: "none" }}>
                {n.label} <span style={{ color: CP.textMuted }}>· {n.group}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, margin: "4px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 11, color: CP.textMuted }}>{sub}</div>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Segnalazioni ricevute · {open.length} aperte</h2>
        <button onClick={() => setShowDone((v) => !v)} style={{ background: "transparent", border: "none", color: CP.accentSoftText, fontSize: 12, cursor: "pointer" }}>{showDone ? "Nascondi fatte" : "Mostra anche fatte"}</button>
      </div>
      <div style={{ ...card }}>
        {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, color: CP.textMuted }}>Nessuna segnalazione {showDone ? "" : "aperta"}. Arrivano dal tasto «Segnala o suggerisci» in basso a destra di ogni pagina.</div>}
        {shown.map((i, k) => (
          <div key={i.id} style={{ padding: "12px 14px", borderTop: k ? `1px solid ${CP.borderSoft}` : "none" }}>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>
              {KIND_LABEL[i.kind] || "Idea"} · {i.name || "—"} · {new Date(i.at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · <Link href={i.page || "/"} style={{ color: CP.accentSoftText }}>{i.page}</Link>
            </div>
            <div style={{ fontSize: 14, color: CP.textPrimary, whiteSpace: "pre-wrap", marginBottom: 8 }}>{i.text}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {STATUS.map(([st, l]) => (
                <button key={st} onClick={() => setStatus(i.id, st)} style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, cursor: "pointer", border: `1px solid ${i.status === st ? CP.accent : CP.border}`, background: i.status === st ? CP.accentSoft : "transparent", color: i.status === st ? CP.accentSoftText : CP.textMuted }}>{l}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
