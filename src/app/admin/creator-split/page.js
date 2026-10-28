"use client";

// Creator dello split (15/10/2026) — come la sezione creator di Infloww: si cerca una creator
// per nome, HOC Pro trova le sue pagine OnlyFans (paese, copie, turni, venduto) e con un clic
// entra nello split. Da lì compare da sola in Revenue e chat, Analisi vendite, S4S e Sales
// coaching. Nato perché Eleonora non vedeva Cubanita: l'elenco era scritto nel codice.
// Logica in lib/live-creators.js (testata), dati in /api/admin/creator-split.

import { useState } from "react";
import useSWR from "swr";
import { Plus, RefreshCw, Search, X, ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, SectionTitle, card, NUM } from "@/components/ds";
import { COUNTRY_NAMES, isActiveAccount as isActive } from "@/lib/live-creators";
import { fmtInt } from "@/lib/format";
import { confirmDialog } from "@/components/AppDialogs";

const API = "/api/admin/creator-split";
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}

const btn = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}`, fontWeight: 500 };
const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: FONTS.body, boxSizing: "border-box" };
const muted = { fontSize: 12, color: CP.textMuted };
const money = (v) => (v == null ? "—" : `$${fmtInt(v)}`);
const day = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : null);


function AccountLine({ a, check, onToggle }) {
  const active = isActive(a);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: CP.textSecondary, padding: "5px 0" }}>
      {onToggle && <input type="checkbox" checked={check} onChange={onToggle} disabled={a.in_split} style={{ accentColor: CP.accent }} aria-label={`Pagina ${a.alias || a.creator_id}`} />}
      <span style={{ color: CP.textPrimary, minWidth: 64 }}>{COUNTRY_NAMES[a.country] || a.country}{a.guessed ? "*" : ""}</span>
      <span style={{ minWidth: 150 }}>{a.username ? `@${a.username}` : a.alias || a.creator_id}</span>
      <span style={{ ...NUM, minWidth: 90 }}>{fmtInt(a.shifts14)} turni 14g</span>
      <span style={{ ...NUM, minWidth: 110 }}>{money(a.net30)} in 30g</span>
      <span style={{ color: active ? CP.accentGreen : CP.textMuted }}>{active ? "● attiva" : `○ ferma${a.last_data ? ` · ultimo dato ${day(a.last_data)}` : ""}`}</span>
      {a.in_split && <span style={muted}>già nello split</span>}
    </div>
  );
}

function Skipped({ list }) {
  if (!list?.length) return null;
  return <div style={{ ...muted, marginTop: 4 }}>Non usate: {list.map((s) => `${s.alias} (${s.id}) — ${s.reason}`).join("; ")}</div>;
}

function Result({ c, split, onAdded }) {
  const [sel, setSel] = useState(() => new Set(c.accounts.filter((a) => !a.in_split && isActive(a)).map((a) => a.creator_id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const allIn = c.accounts.length > 0 && c.accounts.every((a) => a.in_split);
  const add = async () => {
    setBusy(true); setErr(null);
    try { await post({ action: "add", split_id: split.id, ids: [...sel] }); onAdded(c.name); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, color: CP.textPrimary, fontWeight: 500 }}>{c.name}</span>
        <span style={{ flex: 1 }} />
        {allIn ? <span style={muted}>Già nello split</span> : (
          <button style={btnPrimary} disabled={busy || !sel.size} onClick={add}><Plus size={13} />{busy ? "Aggiungo…" : `Aggiungi allo split${sel.size > 1 ? ` (${sel.size} pagine)` : ""}`}</button>
        )}
      </div>
      {c.accounts.map((a) => (
        <AccountLine key={a.creator_id} a={a} check={sel.has(a.creator_id) || a.in_split}
          onToggle={() => { const n = new Set(sel); n.has(a.creator_id) ? n.delete(a.creator_id) : n.add(a.creator_id); setSel(n); }} />
      ))}
      {!c.accounts.length && <div style={muted}>Nessuna pagina utilizzabile.</div>}
      <Skipped list={c.skipped} />
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

function SearchBox({ split, onAdded }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState(null);
  const { data, error, isLoading } = useSWR(term ? `${API}?split=${encodeURIComponent(split.id)}&q=${encodeURIComponent(term)}` : null, fetcher, { revalidateOnFocus: false });
  const submit = (e) => { e.preventDefault(); if (q.trim().length >= 2) setTerm(q.trim()); };
  return (
    <div style={{ ...card, padding: 16, marginBottom: 24 }}>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: "1 1 240px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome della creator o username OnlyFans" aria-label="Cerca creator" />
        <button type="submit" style={btnPrimary} disabled={q.trim().length < 2}><Search size={13} />Cerca</button>
        {term && <button type="button" style={btn} onClick={() => { setTerm(null); setQ(""); }}><X size={13} />Chiudi</button>}
      </form>
      {term && (
        <div style={{ marginTop: 14 }}>
          {isLoading && <div style={muted}>Cerco nell’anagrafica delle pagine…</div>}
          {error && <Notice danger>{error.message}</Notice>}
          {data && !data.results.length && <div style={muted}>Nessuna pagina trovata per «{term}». Prova col nome d’arte o con lo username OnlyFans.</div>}
          {data?.results.map((c) => <Result key={c.slug} c={c} split={split} onAdded={(n) => { setTerm(null); setQ(""); onAdded(n); }} />)}
        </div>
      )}
    </div>
  );
}

function CreatorRow({ c, split, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const remove = async () => {
    if (!(await confirmDialog({ title: `Togliere ${c.name} dallo split?`, message: "Sparisce da Revenue e chat, Analisi vendite e S4S (i dati restano, si può rimettere).", ok: "Togli", danger: true }))) return;
    setBusy(true); setErr(null);
    try {
      await post({ action: "remove", split_id: split.id, ids: [...c.accounts.map((a) => a.creator_id), ...c.skipped.map((s) => s.id)] });
      onChanged();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${CP.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{c.name}</span>
        {c.accounts.some(isActive) && <a href={`/admin/revenue-pacing?creator=${encodeURIComponent(c.slug)}`} style={{ ...muted, display: "inline-flex", gap: 4, alignItems: "center", color: CP.textSecondary }}>Revenue e chat<ExternalLink size={11} /></a>}
        <span style={{ flex: 1 }} />
        <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={remove}>{busy ? "Tolgo…" : "Togli"}</button>
      </div>
      {c.accounts.map((a) => <AccountLine key={a.creator_id} a={a} />)}
      <Skipped list={c.skipped} />
      {err && <div style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

export default function CreatorSplitPage() {
  const [splitId, setSplitId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const url = `${API}${splitId ? `?split=${encodeURIComponent(splitId)}` : ""}${refresh ? `${splitId ? "&" : "?"}refresh=1` : ""}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const split = data?.split;
  const creators = data?.creators || [];
  const guessed = creators.some((c) => c.accounts.some((a) => a.guessed));

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Sales" }, { label: "Creator dello split" }]}
        title="Creator dello split"
        subtitle="Le creator che segui. Aggiungine una e HOC Pro collega da solo le sue pagine OnlyFans, il paese di ognuna e i turni: compare subito in Revenue e chat, Analisi vendite, S4S e Sales coaching. Ogni sales manager poi vede solo quelle che gli sono assegnate in Membri."
        actions={<button style={btn} onClick={() => { setRefresh((n) => n + 1); }}><RefreshCw size={13} />Aggiorna</button>}
      />
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={muted}>Carico lo split…</div>}
      {data && !split && <Notice>Non c’è ancora nessuno split: crealo da Sales coaching.</Notice>}
      {split && (
        <>
          {data.splits.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <select style={input} value={split.id} onChange={(e) => setSplitId(e.target.value)} aria-label="Split">
                {data.splits.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.n} pagine)</option>)}
              </select>
            </div>
          )}
          {msg && <Notice>{msg}</Notice>}
          <SectionTitle>Aggiungi una creator</SectionTitle>
          <SearchBox split={split} onAdded={(n) => { setMsg(`${n} è nello split: da adesso compare in Revenue e chat a chi la ha assegnata in Membri.`); mutate(); }} />
          <SectionTitle aside={<span style={muted}>{creators.length} creator in «{split.name}»</span>}>Nello split</SectionTitle>
          <div style={{ ...card, padding: "4px 16px" }}>
            {creators.map((c) => <CreatorRow key={c.slug} c={c} split={split} onChanged={() => { setMsg(`${c.name} tolta dallo split.`); mutate(); }} />)}
          </div>
          <div style={{ ...muted, marginTop: 10, lineHeight: 1.5 }}>
            Attiva = turni negli ultimi 14 giorni o venduto negli ultimi 30; le creator del tutto ferme non compaiono in Revenue e chat finché non ripartono. {guessed && "* paese dedotto: la pagina non lo dichiara nell’anagrafica. "}
            Le copie (la stessa pagina OnlyFans registrata due volte) restano fuori, altrimenti venduto e chat conterebbero doppio.
          </div>
        </>
      )}
    </div>
  );
}
