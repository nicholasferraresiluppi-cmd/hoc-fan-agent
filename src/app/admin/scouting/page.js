"use client";

// Radar creator — CRM dello scouting (SEED, admin-only). 10/10/2026.
// Le creator italiane trovate su Instagram (catena dei profili simili + parole chiave),
// una scheda per PERSONA (più account collegati), un percorso da "da valutare" a
// "firmata", la crescita settimana per settimana dal giro Apify.
// Regole: i collegamenti tra account si PROPONGONO, li conferma una persona; nessun
// dato sensibile nelle note (vedi docs/SCOUTING_PRIVACY.md); cancellazione su richiesta
// dalla scheda.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, FilterChip, DataTable, Notice, SectionTitle, card, NUM } from "@/components/ds";

const errText = (s) => (s === 401 || s === 403 ? "Sessione scaduta o permessi insufficienti." : s >= 500 ? "Errore del server, riprova." : "Errore.");
const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))));

const fmtN = (v) => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
const fmtPct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");
const SIG = { forte: "Evidente", debole: "Indizi", nessuno: "Nessuno" };
const GROWING = 5; // % a settimana per "in crescita"

const btn = { padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnAccent = { ...btn, background: CP.accent, color: CP.accentInk, borderColor: CP.accent };
const input = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, minWidth: 0 };

function Dots({ u }) {
  return <span aria-label={`unicità ${u} su 5`} style={{ color: CP.accent, letterSpacing: 1, whiteSpace: "nowrap" }}>{"●".repeat(u)}<span style={{ color: CP.border }}>{"●".repeat(5 - u)}</span></span>;
}
function Growth({ v }) {
  const c = v == null ? CP.textMuted : v >= GROWING ? CP.accentGreen : v < 0 ? CP.textSecondary : CP.textPrimary;
  return <span style={{ color: c, ...NUM }}>{fmtPct(v)}</span>;
}

function Spark({ hist }) {
  const pts = (hist || []).filter((p) => p[1] != null);
  if (pts.length < 2) return <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>La crescita compare dopo il secondo giro settimanale.</p>;
  const vals = pts.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const W = 300, H = 56, pad = 4;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => (max === min ? H / 2 : H - pad - ((v - min) * (H - 2 * pad)) / (max - min));
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} role="img" aria-label={`Follower da ${fmtN(vals[0])} a ${fmtN(vals[vals.length - 1])} in ${pts.length} settimane`}>
        <polyline points={pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ")} fill="none" stroke={CP.accent} strokeWidth="2" />
        <circle cx={x(pts.length - 1)} cy={y(vals[vals.length - 1])} r="3" fill={CP.accent} />
      </svg>
      <figcaption style={{ fontSize: 12, color: CP.textMuted, display: "flex", justifyContent: "space-between" }}>
        <span>{pts[0][0]} · {fmtN(vals[0])}</span><span>{pts[pts.length - 1][0]} · {fmtN(vals[vals.length - 1])}</span>
      </figcaption>
    </figure>
  );
}

export default function ScoutingPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/admin/scouting", fetcher, { revalidateOnFocus: false });
  const { user } = useUser();
  const me = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  const [stage, setStage] = useState("all");
  const [grp, setGrp] = useState("all");
  const [flags, setFlags] = useState({ growing: false, fmt: false, paid: false, free: false });
  const [q, setQ] = useState("");
  const [selH, setSelH] = useState(null); // si segue un ACCOUNT: la scheda resta aperta anche dopo una fusione
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const creators = data?.creators || [];
  const groups = useMemo(() => {
    const c = {};
    for (const r of creators) c[r.g] = (c[r.g] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [creators]);
  // conteggi dei filtri sull'insieme INTERO (non cambiano quando si filtra: preflight §1)
  const flagCounts = useMemo(() => ({
    growing: creators.filter((r) => r.g1 != null && r.g1 >= GROWING).length,
    fmt: creators.filter((r) => r.fmt !== "nessuno").length,
    paid: creators.filter((r) => r.sig === "forte").length,
    free: creators.filter((r) => !r.ours && !r.ag).length,
  }), [creators]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return creators.filter((r) => {
      if (stage !== "all" && r.stage !== stage) return false;
      if (grp !== "all" && r.g !== grp) return false;
      if (flags.growing && !(r.g1 != null && r.g1 >= GROWING)) return false;
      if (flags.fmt && r.fmt === "nessuno") return false;
      if (flags.paid && r.sig !== "forte") return false;
      if (flags.free && (r.ours || r.ag)) return false;
      if (s && !(`${r.name} ${r.handles.join(" ")} ${r.nic} ${r.fmts.join(" ")}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [creators, stage, grp, flags, q]);
  const sel = (selH && creators.find((r) => r.handles.includes(selH))) || null;
  const profilesBy = useMemo(() => Object.fromEntries((data?.profiles || []).map((p) => [p.h, p])), [data]);

  async function act(body, okMsg) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/creator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, by: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || errText(r.status));
      await mutate();
      if (okMsg) setMsg(okMsg);
      return true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally { setBusy(false); }
  }
  async function refreshNow() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/refresh", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || errText(r.status));
      setMsg(d.started ? `Giro avviato su ${d.count} account (tetto ${d.budget} $). I numeri arrivano al prossimo controllo notturno.` : d.running ? "C'è già un giro in corso." : d.completed ? "Giro raccolto: numeri aggiornati." : d.skip === "no-apify-token" ? "Manca la chiave Apify nelle impostazioni di HOC Pro." : "Niente da fare.");
      await mutate();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  const ref = data?.refresh || {};
  const columns = [
    { key: "name", label: "Creator", render: (r) => (
      <span>
        <span style={{ fontWeight: 500 }}>{r.name}</span>
        {r.n > 1 && <span style={{ color: CP.textMuted, fontSize: 12 }}> · {r.n} account</span>}
        {r.ours && <span style={{ color: CP.accentSoftText, fontSize: 12 }}> · già nostra</span>}
        {r.ag && <span style={{ color: CP.textMuted, fontSize: 12 }}> · agenzia</span>}
      </span>) },
    { key: "fol", label: "Follower", align: "right", render: (r) => fmtN(r.fol) },
    { key: "g1", label: "Settimana", align: "right", render: (r) => <Growth v={r.g1} /> },
    { key: "g4", label: "4 settimane", align: "right", render: (r) => <Growth v={r.g4} /> },
    { key: "medv", label: "View a reel", align: "right", render: (r) => fmtN(r.medv) },
    { key: "nic", label: "Nicchia", muted: true },
    { key: "fmt", label: "Format", muted: true, render: (r) => (r.fmt === "nessuno" ? "—" : r.fmt) },
    { key: "u", label: "Unicità", render: (r) => <Dots u={r.u} /> },
    { key: "sig", label: "Profilo a pagamento", sort: (r) => ({ forte: 2, debole: 1 }[r.sig] || 0), render: (r) => SIG[r.sig] + (r.hl ? " · in evidenza" : "") },
    { key: "stage", label: "Fase", sort: (r) => (data?.stages || []).findIndex((s) => s.id === r.stage), render: (r) => (data?.stages || []).find((s) => s.id === r.stage)?.label },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 20px 60px" }}>
      <PageHead
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Marketing" }]}
        title="Radar creator"
        subtitle="Le creator italiane trovate su Instagram, una scheda per persona, seguite settimana per settimana. Solo per gli admin."
        actions={<button style={btn} onClick={refreshNow} disabled={busy} title="Lancia subito il giro su Apify (~1 centesimo a profilo)">Aggiorna ora</button>}
      />
      <Notice>
        Dati presi da profili pubblici e ridotti al minimo. Prima di contattare una creator aspettiamo il parere dell&apos;avvocato. Nelle note niente salute, vita privata o orientamento. Se una creator chiede di essere cancellata: scheda → Cancella i dati.
      </Notice>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 16px" }}>
        {!ref.configured ? "Aggiornamento settimanale non attivo: manca la chiave Apify (APIFY_TOKEN) nelle impostazioni di HOC Pro." :
          ref.runId ? `Giro in corso dal ${fmtDate(ref.startedAt)} su ${ref.count} account: i numeri arrivano al prossimo controllo notturno.` :
          ref.lastCompletedAt ? `Ultimo aggiornamento ${fmtDate(ref.lastCompletedAt)} (${ref.lastUpdated} account letti${ref.lastMissing ? `, ${ref.lastMissing} non trovati` : ""}${ref.lastCostUsd != null ? `, ${ref.lastCostUsd.toFixed(2)} $` : ""}). Il prossimo parte da solo dopo una settimana.` :
          "Nessun giro ancora: i numeri sono quelli della ricerca del 9 ottobre."}
        {ref.lastError && <span style={{ color: CP.accentRed }}> Ultimo errore: {ref.lastError}.</span>}
      </p>
      {msg && <Notice>{msg}</Notice>}

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <p style={{ color: CP.textMuted }}>Caricamento…</p>}
      {data && creators.length === 0 && (
        <section style={{ ...card, padding: 20 }}>
          <SectionTitle>Il radar è vuoto</SectionTitle>
          <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0 }}>Non ci sono ancora creator nell&apos;archivio. Si caricano con lo script di importazione della ricerca (scripts/scouting-import.mjs).</p>
        </section>
      )}

      {data && creators.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }} role="group" aria-label="Fase">
            <FilterChip label={`Tutte · ${creators.length}`} active={stage === "all"} onClick={() => setStage("all")} />
            {data.stages.map((s) => <FilterChip key={s.id} label={`${s.label} · ${data.counts[s.id] || 0}`} active={stage === s.id} onClick={() => setStage(s.id)} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }} role="group" aria-label="Nicchia">
            <FilterChip label={`Tutte le nicchie · ${creators.length}`} active={grp === "all"} onClick={() => setGrp("all")} />
            {groups.map(([g, c]) => <FilterChip key={g} label={`${g} · ${c}`} active={grp === g} onClick={() => setGrp(g)} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <FilterChip label={`In crescita (+${GROWING}% a settimana) · ${flagCounts.growing}`} active={flags.growing} onClick={() => setFlags((f) => ({ ...f, growing: !f.growing }))} />
            <FilterChip label={`Con un format · ${flagCounts.fmt}`} active={flags.fmt} onClick={() => setFlags((f) => ({ ...f, fmt: !f.fmt }))} />
            <FilterChip label={`Profilo a pagamento evidente · ${flagCounts.paid}`} active={flags.paid} onClick={() => setFlags((f) => ({ ...f, paid: !f.paid }))} />
            <FilterChip label={`Libere (non nostre, senza agenzia) · ${flagCounts.free}`} active={flags.free} onClick={() => setFlags((f) => ({ ...f, free: !f.free }))} />
            <label htmlFor="sc-q" style={{ position: "absolute", left: -9999 }}>Cerca</label>
            <input id="sc-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome, account, nicchia" style={{ ...input, flex: "1 1 220px", maxWidth: 320 }} />
            <span style={{ fontSize: 13, color: CP.textMuted }}>{rows.length} su {creators.length}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 400px)", gap: 14, alignItems: "start" }} className="sc-grid">
            <div>
              <DataTable columns={columns} rows={rows} defaultSort={{ key: "u", dir: -1 }} onRowClick={(r) => setSelH(r.handles[0])} selected={(r) => sel && r.id === sel.id}
                maxHeight="72vh" minWidth={980} density="compact" empty="Nessuna creator con questi filtri. Togli un filtro o cerca un altro nome." />
            </div>
            <aside style={{ position: "sticky", top: 12 }}>
              {sel ? (
                <Detail key={sel.id} c={sel} data={data} profilesBy={profilesBy} busy={busy} act={act} onSelect={setSelH} />
              ) : (
                <Suggestions data={data} busy={busy} act={act} onSelect={setSelH} />
              )}
            </aside>
          </div>
          <style>{`@media (max-width: 900px){ .sc-grid{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
        </>
      )}
    </div>
  );
}

function Suggestions({ data, busy, act, onSelect }) {
  const s = data.suggestions || [];
  return (
    <section style={{ ...card, padding: 16 }}>
      <SectionTitle aside={`${s.length}`}>Forse sono la stessa creator</SectionTitle>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px" }}>Account con lo stesso link, lo stesso nome di base o che si citano. Collegali se sono la stessa persona: la scheda diventa una sola.</p>
      {s.length === 0 && <p style={{ fontSize: 13, color: CP.textMuted }}>Nessuna proposta aperta.</p>}
      <div style={{ display: "grid", gap: 8, maxHeight: "60vh", overflow: "auto" }}>
        {s.slice(0, 60).map((x) => (
          <div key={`${x.a}|${x.b}`} style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 8, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 14 }}>
              <button onClick={() => onSelect(x.a)} style={{ ...linkBtn }}>@{x.a}</button> e <button onClick={() => onSelect(x.b)} style={{ ...linkBtn }}>@{x.b}</button>
            </div>
            <div style={{ fontSize: 12, color: CP.textMuted }}>{x.reason}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn} disabled={busy} onClick={async () => { if (await act({ action: "link", target: x.a, handle: x.b }, "Account collegati.")) onSelect(x.a); }}>Collega</button>
              <button style={btn} disabled={busy} onClick={() => act({ action: "dismiss", a: x.a, b: x.b })}>Non sono la stessa</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
const linkBtn = { background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 14, fontFamily: FONTS.body };

function Detail({ c, data, profilesBy, busy, act, onSelect }) {
  const [name, setName] = useState(c.name.startsWith("@") ? "" : c.name);
  const [owner, setOwner] = useState(c.owner || "");
  const [note, setNote] = useState("");
  const [forget, setForget] = useState(null);
  const notes = data.notes?.[c.id] || [];
  const ps = c.handles.map((h) => profilesBy[h]).filter(Boolean);
  const hist = ps.length === 1 ? ps[0].hist : null;
  // una proposta per account esterno (con più account collegati la stessa "altra" arriverebbe più volte)
  const sug = [];
  const seenOther = new Set();
  for (const x of data.suggestions || []) {
    if (!(c.handles.includes(x.a) || c.handles.includes(x.b))) continue;
    const other = c.handles.includes(x.a) ? x.b : x.a;
    if (c.handles.includes(other) || seenOther.has(other)) continue;
    seenOther.add(other);
    sug.push(x);
  }
  return (
    <section style={{ ...card, padding: 16, display: "grid", gap: 14, maxHeight: "80vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{c.name}</div>
          <div style={{ fontSize: 13, color: CP.textSecondary }}>{[c.nic, c.fmt !== "nessuno" ? c.fmt : null].filter(Boolean).join(" · ")}</div>
        </div>
        <button style={btn} onClick={() => onSelect(null)} aria-label="Chiudi la scheda">Chiudi</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        <Mini label="Follower" value={fmtN(c.fol)} />
        <Mini label="Settimana" value={<Growth v={c.g1} />} />
        <Mini label="View a reel" value={fmtN(c.medv)} />
      </div>

      <label style={{ display: "grid", gap: 4, fontSize: 12, color: CP.textMuted }}>Fase
        <select value={c.stage} disabled={busy} onChange={(e) => act({ action: "stage", id: c.id, stage: e.target.value }, "Fase aggiornata.")} style={input}>
          {data.stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: CP.textMuted }}>Nome della scheda
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (c.name.startsWith("@") ? "" : c.name) && act({ action: "field", id: c.id, field: "name", value: name })} placeholder="Serena camionista" style={input} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: CP.textMuted }}>Chi la segue
          <input value={owner} onChange={(e) => setOwner(e.target.value)} onBlur={() => owner !== (c.owner || "") && act({ action: "field", id: c.id, field: "owner", value: owner })} placeholder="Nicholas" style={input} />
        </label>
      </div>

      <div>
        <SectionTitle aside={`${ps.length}`}>Account</SectionTitle>
        <div style={{ display: "grid", gap: 6 }}>
          {ps.map((p) => (
            <div key={p.h} style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 6, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <a href={`https://www.instagram.com/${encodeURIComponent(p.h)}/`} target="_blank" rel="noopener noreferrer" style={{ color: CP.accentSoftText, fontSize: 14, textDecoration: "none" }}>@{p.h}</a>
                <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>{fmtN(p.fol)} follower · {fmtN(p.medv)} view</span>
              </div>
              <div style={{ fontSize: 12, color: CP.textMuted }}>{SIG[p.sig]}{p.hl ? " · link nelle storie in evidenza" : ""}{p.nota && p.nota !== "—" ? ` · ${p.nota}` : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ps.length > 1 && <button style={btn} disabled={busy} onClick={() => act({ action: "unlink", handle: p.h }, "Account staccato.")}>Stacca</button>}
                {forget === p.h ? (
                  <>
                    <span style={{ fontSize: 12, color: CP.textSecondary, alignSelf: "center" }}>Cancella tutti i dati di @{p.h}? Non si torna indietro.</span>
                    <button style={{ ...btn, borderColor: CP.accentRed, color: CP.accentRed }} disabled={busy} onClick={async () => { if (await act({ action: "forget", handle: p.h }, `Dati di @${p.h} cancellati.`)) { setForget(null); if (ps.length === 1) onSelect(null); else if (p.h === c.handles[0]) onSelect(c.handles.find((x) => x !== p.h)); } }}>Sì, cancella</button>
                    <button style={btn} onClick={() => setForget(null)}>Annulla</button>
                  </>
                ) : (
                  <button style={btn} onClick={() => setForget(p.h)}>Cancella i dati</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {sug.length > 0 && (
        <div>
          <SectionTitle>Forse è anche…</SectionTitle>
          {sug.map((x) => {
            const other = c.handles.includes(x.a) ? x.b : x.a;
            return (
              <div key={`${x.a}|${x.b}`} style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                <div style={{ fontSize: 14 }}>@{other} <span style={{ fontSize: 12, color: CP.textMuted }}>· {x.reason}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={btn} disabled={busy} onClick={async () => { await act({ action: "link", target: c.handles[0], handle: other }, "Account collegati."); }}>Collega</button>
                  <button style={btn} disabled={busy} onClick={async () => { for (const h of c.handles) if (!(await act({ action: "dismiss", a: h, b: other }))) break; }}>No</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <SectionTitle>Crescita</SectionTitle>
        {hist ? <Spark hist={hist} /> : <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>Per le schede con più account la crescita è nella tabella (somma dei follower).</p>}
      </div>

      <div>
        <SectionTitle aside={`${notes.length}`}>Note</SectionTitle>
        <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
          {notes.slice().reverse().map((n, i) => (
            <div key={i} style={{ fontSize: 13, background: CP.surfaceAlt || CP.bg, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>{n.by || "—"} · {fmtDate(n.at)}</div>
            </div>
          ))}
        </div>
        <label htmlFor={`sc-note-${c.id}`} style={{ position: "absolute", left: -9999 }}>Nuova nota</label>
        <textarea id={`sc-note-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Cosa abbiamo visto, quando ricontattarla…" style={{ ...input, width: "100%", resize: "vertical" }} />
        <button style={{ ...btnAccent, marginTop: 6 }} disabled={busy || !note.trim()} onClick={async () => { if (await act({ action: "note", id: c.id, text: note }, "Nota salvata.")) setNote(""); }}>Salva nota</button>
      </div>
    </section>
  );
}

function Mini({ label, value }) {
  return (
    <div style={{ background: CP.bg, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, ...NUM }}>{value}</div>
    </div>
  );
}
