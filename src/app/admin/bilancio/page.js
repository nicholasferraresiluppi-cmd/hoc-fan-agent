"use client";

// Bilancio del mese (16/10/2026) — il foglio "Bilancio_unico_LIVE" di Nicholas in HOC Pro.
// La classifica di TUTTE le creator dello split: ogni sales manager la vede intera, anche se gli è
// assegnata una creator sola — è la classifica aziendale e serve a creare competizione (Nicholas).
// Tre blocchi come nel foglio: la classifica del mese (goal, ritmo, proiezione), la giornata di oggi
// (entrate contro target) e l'andamento del mese giorno per giorno per paese.
// Conti e definizioni in src/lib/bilancio-core.js. Goal condivisi con Revenue e chat.

import { useState } from "react";
import useSWR from "swr";
import { RefreshCw, Pencil, Check } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, SectionTitle, card } from "@/components/ds";
import { liveFetcher } from "@/components/LiveCreatorPicker";
import { MONTHS_IT } from "@/lib/format";

const NUM = { fontVariantNumeric: "tabular-nums" };
const ok = (v) => v != null && Number.isFinite(Number(v));
const group = (v) => Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (v) => (!ok(v) ? "—" : `${v < 0 ? "−" : ""}$${group(v)}`);
const signed = (v) => (!ok(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}$${group(v)}`);
const pct = (v) => (!ok(v) ? "—" : `${Math.round(v * 100)}%`);
const hm = (iso) => (!iso ? "" : new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const FLAG = { IT: "IT", EN: "EN", ES: "ES" };
const COUNTRY_LONG = { IT: "Italia", EN: "Inglese", ES: "Spagnolo" };
const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const tone = (v) => (!ok(v) || Math.abs(v) < 0.5 ? CP.textSecondary : v > 0 ? CP.accentGreen : CP.accentRed);

export default function BilancioPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/bilancio", liveFetcher, { refreshInterval: 10 * 60 * 1000, revalidateOnFocus: false });
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try { await mutate(await liveFetcher("/api/admin/bilancio?refresh=1"), { revalidate: false }); } catch { /* resta il dato di prima */ }
    setRefreshing(false);
  };

  const monthLabel = data ? `${cap(MONTHS_IT[Number(data.month.slice(5)) - 1])} ${data.month.slice(0, 4)}` : "";
  const t = data?.totals;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 16px 48px", fontFamily: FONTS.body }}>
      <PageHead
        title="Bilancio del mese"
        subtitle={data
          ? `${monthLabel} · giorno ${data.day} di ${data.daysInMonth} · tutte le creator dello split, in classifica rispetto al loro goal. Aggiornato alle ${hm(data.updated_at)}.`
          : "Tutte le creator dello split, in classifica rispetto al loro goal."}
        actions={data && (
          <>
            {data.canEdit && (
              <button onClick={() => setEditing((v) => !v)} style={btn(editing)}>
                {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? "Fatto" : "Goal e AM/SM"}
              </button>
            )}
            <button onClick={refresh} disabled={refreshing} style={btn(false)}>
              <RefreshCw size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : null} /> Aggiorna
            </button>
          </>
        )}
      />

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && !data && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Sto sommando il venduto di tutte le creator…</div>}

      {data && (
        <>
          <Summary data={data} />

          <SectionTitle aside={<span style={{ fontSize: 12.5, color: CP.textMuted }}>ordinata per proiezione sul goal</span>}>Classifica del mese</SectionTitle>
          <Ranking data={data} editing={editing} onSaved={() => mutate()} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, marginTop: 28, alignItems: "start" }}>
            <div style={{ minWidth: 0 }}>
              <SectionTitle>La giornata di oggi</SectionTitle>
              <Today data={data} />
            </div>
            <div style={{ minWidth: 0 }}>
              <SectionTitle>Andamento del mese</SectionTitle>
              <Days data={data} />
            </div>
          </div>

          <Explain data={data} />
          {t && !ok(t.goal) && <div style={{ marginTop: 12 }}><Notice>Nessun goal messo per {monthLabel}: la classifica parte quando ci sono i goal.</Notice></div>}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const btn = (strong) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 500, cursor: "pointer",
  background: strong ? CP.accent : CP.surface, color: strong ? CP.accentInk : CP.textPrimary, border: `1px solid ${strong ? CP.accent : CP.border}`,
});

// ─── In cima: i tre numeri del foglio (venduto, goal, proiezione) ────────────

function Summary({ data }) {
  const t = data.totals;
  const ahead = ok(t.pctActual) ? t.pctActual - data.idealPct : null;
  const items = [
    { label: "Venduto del mese", value: usd(t.mtd), note: ok(t.goal) ? `${pct(t.pctActual)} del goal · il ritmo ideale oggi è ${pct(data.idealPct)}` : null, noteColor: ahead == null ? CP.textSecondary : ahead >= 0 ? CP.accentGreen : CP.accentRed },
    { label: "Goal del mese", value: usd(t.goal), note: ok(t.targetToday) ? `${usd(t.targetToday)} al giorno` : "nessun goal messo" },
    { label: "Proiezione di fine mese", value: usd(t.projection), note: ok(t.gap) ? `${signed(t.gap)} sul goal` : data.closedDays ? null : "dal 2 del mese", noteColor: tone(t.gap) },
    { label: "Mese precedente", value: usd(t.prev), note: ok(t.deltaPrev) ? `proiezione ${signed(t.deltaPrev)}` : null, noteColor: tone(t.deltaPrev) },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 28 }}>
      {items.map((x) => (
        <div key={x.label} style={{ ...card, padding: "12px 14px", minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: CP.textSecondary }}>{x.label}</div>
          <div style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 500, color: CP.textPrimary, marginTop: 4, ...NUM }}>{x.value}</div>
          {x.note && <div style={{ fontSize: 12.5, color: x.noteColor || CP.textSecondary, marginTop: 4, ...NUM }}>{x.note}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── La classifica ───────────────────────────────────────────────────────────

const COLS = ["Creator", "AM", "SM", "Venduto", "Goal", "% goal", "Proiezione", "Sul goal", "Mese prima", "Δ mese prima"];

function Ranking({ data, editing, onSaved }) {
  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 980 }}>
        <thead>
          <tr>
            {COLS.map((c, i) => (
              <th key={c} style={{ ...th, textAlign: i < 3 ? "left" : "right", ...(i === 0 ? stick(false) : null) }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.creators.map((c) => (
            <CreatorRows key={c.slug} c={c} data={data} editing={editing} onSaved={onSaved} />
          ))}
          <tr>
            <td style={{ ...td, borderTop: `1px solid ${CP.borderStrong}`, fontWeight: 600, ...stick(false) }}>Totale</td>
            <td style={{ ...td, borderTop: `1px solid ${CP.borderStrong}` }} colSpan={2} />
            <Nums r={data.totals} ideal={data.idealPct} strong top />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CreatorRows({ c, data, editing, onSaved }) {
  const multi = c.accounts.length > 1;
  const single = !multi ? c.accounts[0] : null;
  return (
    <>
      <tr>
        <td style={{ ...td, fontWeight: 600, color: CP.textPrimary, ...stick(false) }}>
          <span style={{ display: "inline-block", minWidth: 24, color: CP.textMuted, fontWeight: 400, ...NUM }}>{c.rank ?? "–"}</span>
          {c.name}
          {single && <span style={{ color: CP.textMuted, fontWeight: 400, marginLeft: 6, fontSize: 12 }}>{FLAG[single.country]}</span>}
        </td>
        {single
          ? <People a={single} slug={c.slug} editing={editing} onSaved={onSaved} />
          : <><td style={td} /><td style={td} /></>}
        <Nums r={c} ideal={data.idealPct} strong={multi} goalEdit={single && editing ? { slug: c.slug, country: single.country, onSaved } : null} />
      </tr>
      {multi && c.accounts.map((a) => (
        <tr key={a.country}>
          <td style={{ ...sub, paddingLeft: 38, color: CP.textSecondary, ...stick(true) }}>{COUNTRY_LONG[a.country] || a.country}</td>
          <People a={a} slug={c.slug} editing={editing} onSaved={onSaved} sub />
          <Nums r={a} ideal={data.idealPct} sub goalEdit={editing ? { slug: c.slug, country: a.country, onSaved } : null} />
        </tr>
      ))}
    </>
  );
}

function Nums({ r, ideal, strong, sub: isSub, top, goalEdit }) {
  const base = { ...(isSub ? sub : td), textAlign: "right", ...NUM, ...(top ? { borderTop: `1px solid ${CP.borderStrong}` } : null), ...(strong ? { fontWeight: 600 } : null) };
  const ahead = ok(r.pctActual) ? r.pctActual - ideal : null;
  return (
    <>
      <td style={base}>{usd(r.mtd)}</td>
      <td style={base}>{goalEdit ? <EditCell value={r.goal} numeric save={(v) => put({ creator: goalEdit.slug, country: goalEdit.country, goal: v === "" ? null : Number(v) }, goalEdit.onSaved)} /> : usd(r.goal)}</td>
      <td style={{ ...base, color: ahead == null ? base.color : ahead >= 0 ? CP.accentGreen : CP.accentRed }}>{pct(r.pctActual)}</td>
      <td style={base}>{usd(r.projection)}</td>
      <td style={{ ...base, color: tone(r.gap) }}>{signed(r.gap)}</td>
      <td style={{ ...base, color: CP.textSecondary }}>{usd(r.prev)}</td>
      <td style={{ ...base, color: tone(r.deltaPrev) }}>{signed(r.deltaPrev)}</td>
    </>
  );
}

function People({ a, slug, editing, onSaved, sub: isSub }) {
  const s = { ...(isSub ? sub : td), color: CP.textSecondary };
  if (!editing) return <><td style={s}>{a.am || ""}</td><td style={s}>{a.sm || ""}</td></>;
  return (
    <>
      <td style={s}><EditCell value={a.am} save={(v) => put({ creator: slug, country: a.country, am: v }, onSaved)} /></td>
      <td style={s}><EditCell value={a.sm} save={(v) => put({ creator: slug, country: a.country, sm: v }, onSaved)} /></td>
    </>
  );
}

async function put(body, onSaved) {
  const r = await fetch("/api/admin/bilancio", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Salvataggio non riuscito");
  onSaved?.();
}

function EditCell({ value, numeric, save }) {
  const [v, setV] = useState(value ?? "");
  const [state, setState] = useState(null); // null | "saving" | "ok" | messaggio d'errore
  const commit = async () => {
    if (String(v) === String(value ?? "")) return;
    setState("saving");
    try { await save(String(v).trim()); setState("ok"); } catch (e) { setState(e.message); }
  };
  const err = state && state !== "saving" && state !== "ok";
  return (
    <input
      value={v}
      inputMode={numeric ? "numeric" : undefined}
      placeholder={numeric ? "goal $" : "—"}
      title={err ? state : undefined}
      onChange={(e) => { setV(numeric ? e.target.value.replace(/[^\d]/g, "") : e.target.value); setState(null); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{
        width: numeric ? 96 : 110, padding: "4px 8px", borderRadius: 6, fontSize: 13, textAlign: numeric ? "right" : "left", ...NUM,
        background: CP.bg, color: CP.textPrimary,
        border: `1px solid ${err ? CP.accentRed : state === "ok" ? CP.accentGreen : CP.border}`,
      }}
    />
  );
}

// ─── La giornata di oggi ─────────────────────────────────────────────────────

function Today({ data }) {
  const rows = data.creators.flatMap((c) => (c.accounts.length > 1 ? c.accounts.map((a) => ({ name: `${c.name} ${FLAG[a.country]}`, ...a })) : [{ name: c.name, ...c.accounts[0] }]));
  rows.sort((a, b) => (b.today || 0) - (a.today || 0));
  const t = data.totals;
  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead><tr><th style={{ ...th, textAlign: "left" }}>Creator</th><th style={{ ...th, textAlign: "right" }}>Ieri</th><th style={{ ...th, textAlign: "right" }}>Entrate oggi</th><th style={{ ...th, textAlign: "right" }}>Target oggi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.creator_id}>
              <td style={td}>{r.name}</td>
              <td style={{ ...td, textAlign: "right", ...NUM, color: ok(r.targetToday) && ok(r.yesterday) ? (r.yesterday >= r.targetToday ? CP.accentGreen : CP.textSecondary) : CP.textSecondary }}>{usd(r.yesterday)}</td>
              <td style={{ ...td, textAlign: "right", ...NUM, color: ok(r.targetToday) && r.today >= r.targetToday ? CP.accentGreen : CP.textPrimary }}>{usd(r.today)}</td>
              <td style={{ ...td, textAlign: "right", ...NUM, color: CP.textSecondary }}>{usd(r.targetToday)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 600, borderTop: `1px solid ${CP.borderStrong}` }}>Totale</td>
            <td style={{ ...td, fontWeight: 600, textAlign: "right", ...NUM, borderTop: `1px solid ${CP.borderStrong}` }}>{usd(t.yesterday)}</td>
            <td style={{ ...td, fontWeight: 600, textAlign: "right", ...NUM, borderTop: `1px solid ${CP.borderStrong}` }}>{usd(t.today)}</td>
            <td style={{ ...td, fontWeight: 600, textAlign: "right", ...NUM, borderTop: `1px solid ${CP.borderStrong}` }}>{usd(t.targetToday)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: CP.textMuted, padding: "8px 14px 12px" }}>Ieri è la giornata intera; oggi è in corso e cresce fino a mezzanotte (ora UTC, come nel foglio). Verde = target del giorno raggiunto.</div>
    </div>
  );
}

// ─── Andamento del mese ──────────────────────────────────────────────────────

function Days({ data }) {
  const cols = data.countries;
  const days = data.days.filter((d) => !d.future);
  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Giorno</th>
            {cols.map((k) => <th key={k} style={{ ...th, textAlign: "right" }}>{k}</th>)}
            <th style={{ ...th, textAlign: "right" }}>Totale</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const weekend = d.weekday === 0 || d.weekday === 6;
            return (
              <tr key={d.date}>
                <td style={{ ...td, color: weekend ? CP.accentRed : CP.textPrimary, whiteSpace: "nowrap" }}>
                  {WEEKDAYS[d.weekday]} {d.day}{d.partial && <span style={{ color: CP.textMuted, fontSize: 12 }}> · in corso</span>}
                </td>
                {cols.map((k) => <td key={k} style={{ ...td, textAlign: "right", ...NUM, color: CP.textSecondary }}>{d[k] ? usd(d[k]) : "–"}</td>)}
                <td style={{ ...td, textAlign: "right", ...NUM, fontWeight: 500 }}>{usd(d.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Come si legge ───────────────────────────────────────────────────────────

function Explain({ data }) {
  return (
    <details style={{ marginTop: 24, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
      <summary style={{ cursor: "pointer", color: CP.textPrimary }}>Come si calcola</summary>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        <li><b>Venduto</b>: il netto delle vendite dal warehouse, per giorno (ora UTC). Sono gli stessi numeri dei fogli-creator.</li>
        <li><b>% goal</b>: venduto del mese diviso goal. È verde se è pari o sopra il ritmo ideale di oggi ({Math.round(data.idealPct * 100)}%, cioè {data.closedDays} giorni finiti su {data.daysInMonth}), rossa se sotto.</li>
        <li><b>Proiezione</b>: la media dei giorni finiti moltiplicata per i giorni del mese. Il giorno in corso non conta, perché a metà giornata abbasserebbe la stima.</li>
        <li><b>Sul goal</b>: proiezione meno goal. <b>Δ mese prima</b>: proiezione meno il venduto di tutto il mese precedente.</li>
        <li><b>Target oggi</b>: goal diviso i giorni del mese.</li>
        <li><b>Classifica</b>: proiezione divisa goal, così ogni creator è misurata sul suo goal e non sulla grandezza. Senza goal resta in fondo, senza posizione.</li>
        <li>I goal sono gli stessi di Revenue e chat: cambiarli qui li cambia anche lì. Le creator sono quelle dello split.</li>
      </ul>
    </details>
  );
}

const th = { padding: "10px 14px", fontSize: 12, fontWeight: 500, color: CP.textMuted, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
const td = { padding: "9px 14px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textPrimary, whiteSpace: "nowrap" };
const SUB_BG = alpha(CP.textPrimary, "05");
const sub = { ...td, padding: "6px 14px", fontSize: 12.5, color: CP.textSecondary, background: SUB_BG };
// Colonna Creator ferma a sinistra quando la tabella scorre (telefono): fondo PIENO (CP.panel),
// altrimenti i numeri che scorrono sotto si leggono in trasparenza nello stile Casa.
const stick = (isSub) => ({ position: "sticky", left: 0, zIndex: 1, background: isSub ? `linear-gradient(${SUB_BG}, ${SUB_BG}), ${CP.panel}` : CP.panel });
