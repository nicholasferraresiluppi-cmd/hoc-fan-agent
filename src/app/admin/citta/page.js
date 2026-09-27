"use client";

/**
 * La città (admin, SEED): progetto di Nicholas — palazzo = creator del suo split, piano = area.
 * Due viste sugli STESSI dati: la città (per guardarla insieme, in riunione) e la tabella
 * (strumento di lavoro: creator × aree, ordinata per gravità) — dal pannello di 9 utenti sintetici.
 * Selettore del mese: nel mese passato solo i piani di HOC Pro hanno storico.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";

const CityScene = dynamic(() => import("@/components/CityScene"), { ssr: false });

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};

const AREAS = ["HR & People", "Finance", "Media Buying", "Marketing", "Sales", "Chatting"];
const HQ_OF = {};
const LABEL_OF = { Sales: "OnlyFans · Sales", Chatting: "OnlyFans · Chatting" };
const DOT = { ok: "#7FE0B8", wait: "#FFB54A", stop: "#6B6D75", none: "transparent", old: "transparent" };
const LABEL = { ok: "In movimento", wait: "Qualcosa in ritardo", stop: "Ferma", none: "Nessuna attività", old: "Da riordinare in ClickUp" };
const bad = (s) => s === "wait" || s === "stop";
const gravity = (t) => t.areas.reduce((g, a) => g + (a.s === "wait" ? (a.src === "hoc" ? 3 : 1) : a.s === "stop" ? 0.5 : 0), 0);
const usd = (v) => "$" + String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function Cell({ a }) {
  if (!a) return <td style={td}>—</td>;
  const href = a.link || null;
  const ext = href && href.startsWith("http");
  const body = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 99, flex: "none", background: DOT[a.s], border: a.s === "none" || a.s === "old" ? `1px ${a.s === "old" ? "dashed" : "solid"} ${CP.textMuted}` : "none" }} />
      <span style={{ color: bad(a.s) ? CP.textPrimary : CP.textSecondary, whiteSpace: "nowrap" }}>
        {a.short || LABEL[a.s]}
        {a.trend && <span style={{ marginLeft: 5, color: a.trend === "up" ? "#7FE0B8" : a.trend === "down" ? "#FFB54A" : CP.textMuted }}>{a.trend === "up" ? "↑" : a.trend === "down" ? "↓" : "→"}</span>}
      </span>
    </span>
  );
  return (
    <td style={td} title={`${LABEL[a.s]} — ${a.l || ""}${a.claim ? ` · In carico a ${a.claim.by}` : ""}`}>
      {href ? <a href={href} target={ext ? "_blank" : undefined} rel={ext ? "noopener" : undefined} style={{ color: "inherit", textDecoration: "none" }}>{body}</a> : body}
      {a.claim && <div style={{ fontSize: 11, color: CP.gold, marginTop: 2 }}>{a.claim.by}</div>}
    </td>
  );
}
const td = { padding: "11px 10px", borderBottom: `1px solid ${CP.border}`, fontSize: 13.5, verticalAlign: "middle" };
const th = { padding: "10px 10px", borderBottom: `1px solid ${CP.border}`, fontSize: 12.5, fontWeight: 500, color: CP.textMuted, textAlign: "left", whiteSpace: "nowrap" };

function CityTable({ data, bar }) {
  // stesso punteggio di "Da guardare" (segnali misurati), poi i ritardi stimati, poi il venduto
  const rows = [...data.projects].sort((x, y) => (y.gravity || 0) - (x.gravity || 0) || gravity(y) - gravity(x) || (y.sales || 0) - (x.sales || 0));
  const find = (t, n) => t.areas.find((a) => a.n === n) || (t === data.hq ? t.areas.find((a) => a.n === HQ_OF[n]) : null);
  const label = data.live ? cap(data.live.asOfDay ? `${data.live.label} fino al ${data.live.asOfDay}` : data.live.label) : "";
  return (
    <div style={{ padding: "28px 28px 64px", fontFamily: FONTS.body }}>
      <div style={{ marginBottom: 28 }}>{bar}</div>
      <h1 className="ds-h1" style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, margin: "0 0 6px" }}>La città, in tabella</h1>
      <p className="ds-sub" style={{ margin: "0 0 20px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
        {label}. Le creator più in difficoltà in alto. Sales, Finance e Chatting (area OnlyFans) vengono da HOC Pro; HR & People, Media Buying e Marketing sono stime dai titoli di ClickUp (cerchio tratteggiato = ClickUp da riordinare). * = creator senza spazio ClickUp. Clic su una cella per aprire la pagina o l'attività, sul nome per vedere chi ci lavora.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
          <thead><tr><th style={th}>Creator</th><th style={{ ...th, textAlign: "right" }}>Venduto</th>{AREAS.map((a) => <th key={a} style={th}>{LABEL_OF[a] || a}</th>)}</tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.n}>
                <td style={{ ...td, color: CP.textPrimary, fontWeight: 500, whiteSpace: "nowrap" }} title={t.nospace ? "Senza spazio ClickUp: attività trovate per nome" : undefined}><a href={`/admin/citta/ufficio?t=${encodeURIComponent(t.n)}`} style={{ color: "inherit", textDecoration: "none" }}>{t.n}</a>{t.nospace && <span style={{ marginLeft: 4, color: CP.textMuted, fontWeight: 400 }}>*</span>}</td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: CP.textSecondary }}>{usd(t.sales)}</td>
                {AREAS.map((n) => <Cell key={n} a={find(t, n)} />)}
              </tr>
            ))}
            <tr>
              <td style={{ ...td, color: CP.gold, fontWeight: 500 }}><a href="/admin/citta/ufficio?t=Azienda" style={{ color: "inherit", textDecoration: "none" }}>Azienda</a></td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: CP.textSecondary }}>{usd(data.hq.sales)}</td>
              {AREAS.map((n) => <Cell key={n} a={find(data.hq, n)} />)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CittaPage() {
  const [month, setMonth] = useState(null);
  const [view, setView] = useState("city");
  const [mineOnly, setMineOnly] = useState(false);
  // link diretto alla tabella: /admin/citta?vista=tabella
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get("vista") === "tabella") setView("table"); } catch {} }, []);
  const { data, isLoading } = useSWR(`/api/admin/citta${month ? `?month=${month}` : ""}`, fetcher, { revalidateOnFocus: false });
  const msg = (t) => (
    <div style={{ padding: "64px 32px", maxWidth: 640, fontFamily: FONTS.body, color: CP.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
      <h1 className="ds-h1" style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, margin: "0 0 12px" }}>La città</h1>
      {t}
    </div>
  );
  if (isLoading && !data) return msg("Sto costruendo la città…");
  if (data?.error) return msg(data.error);
  if (!data?.projects?.length) return msg("Non c'è ancora una fotografia di ClickUp da mostrare.");
  const scene = { ...data, api: "/api/admin/citta", base: "", noIntro: !!month || view !== "city" || mineOnly, mineOnly: mineOnly && data.mine?.length ? data.mine : null };
  const bar = <Bar view={view} setView={setView} data={data} setMonth={setMonth} fixed={view === "city"} mineOnly={mineOnly} setMineOnly={setMineOnly} />;
  return (
    <>
      {view === "city" ? <CityScene key={`${data.month || "cur"}-${mineOnly ? "mine" : "all"}`} data={scene} /> : <CityTable data={data} bar={bar} />}
      {view === "city" && bar}
      <style>{`.ct-bar.ct-fixed{position:fixed;top:24px;left:calc(248px + (100vw - 248px)/2);transform:translateX(-50%);z-index:35}`}</style>
    </>
  );
}

function Bar({ view, setView, data, setMonth, fixed, mineOnly, setMineOnly }) {
  return (
    <>
      <div className={`ct-bar${fixed ? " ct-fixed" : ""}`}>
        <div className="ct-seg" role="group" aria-label="Vista">
          {[["city", "Città"], ["table", "Tabella"]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        {data.mine?.length > 0 && (
          <div className="ct-seg" role="group" aria-label="Quali palazzi">
            {[[false, "Tutti"], [true, `I miei · ${data.mine.length}`]].map(([v, l]) => (
              <button key={String(v)} type="button" aria-pressed={mineOnly === v} onClick={() => setMineOnly(v)}>{l}</button>
            ))}
          </div>
        )}
        <div className="ct-seg"><a href="/admin/citta/persone" className="ct-lnk">Persone</a></div>
        {data.months?.length > 1 && (
          <div className="ct-seg" role="group" aria-label="Mese">
            {data.months.map((m) => (
              <button key={m.id} type="button" aria-pressed={m.id === data.month} onClick={() => setMonth(m.id)}>{cap(m.label)}</button>
            ))}
          </div>
        )}
      </div>
      <style>{`.ct-bar{display:inline-flex;gap:8px}
.ct-seg{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(22,23,29,.72);border:1px solid rgba(242,238,230,.12);backdrop-filter:blur(14px)}
.ct-seg button{font:inherit;font-family:var(--f-sans),Manrope,sans-serif;font-size:13.5px;color:rgba(242,238,230,.6);background:none;border:0;border-radius:999px;padding:7px 14px;cursor:pointer}
.ct-seg .ct-lnk{font-family:var(--f-sans),Manrope,sans-serif;font-size:13.5px;color:rgba(242,238,230,.6);text-decoration:none;padding:7px 14px}
.ct-seg button[aria-pressed="true"]{background:#F2EEE6;color:#111}
@media (max-width:899px){.ct-bar.ct-fixed{left:50%;top:66px}}`}</style>
    </>
  );
}
