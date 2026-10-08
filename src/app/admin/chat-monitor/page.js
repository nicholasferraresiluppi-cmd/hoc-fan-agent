"use client";

// Laura Chat Monitor — ricostruzione di chat.hoc.tools ("Laura Chat Monitor · Live"),
// spento con lo split a ottobre 2026. Struttura, schede, riquadri ed etichette dal
// sito originale (letto il 20 e 22/07/2026). Dati: src/lib/chat-monitor*.js.

import { useEffect, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Notice, card } from "@/components/ds";
import { COUNTRIES, hm, ago, ymdRome } from "./ui";
import LiveTab from "./LiveTab";
import DailyTab from "./DailyTab";
import TrendTab from "./TrendTab";

const errText = (status) =>
  status === 401 || status === 403 ? "Non hai il permesso per vedere questi dati." :
  status >= 500 ? "Calcolo fallito o troppo lungo — riprova." : "Errore.";
const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))));

const TABS = [
  { id: "live", label: "Live chat" },
  { id: "daily", label: "Dettaglio giornaliero" },
  { id: "trend", label: "Riepilogo & trend" },
];

export default function ChatMonitorPage() {
  const [country, setCountryState] = useState("IT");
  // Paese condiviso con la scheda Revenue ("Totale" là non esiste qui: resta l'ultimo paese scelto)
  useEffect(() => { try { const v = localStorage.getItem("hoc:laura:paese"); if (["IT", "EN", "ES"].includes(v)) setCountryState(v); } catch {} }, []);
  const setCountry = (c) => { setCountryState(c); try { localStorage.setItem("hoc:laura:paese", c); } catch {} };
  const [tab, setTab] = useState("live");
  const [refreshing, setRefreshing] = useState(false);
  const opts = { revalidateOnFocus: false };
  // La Live serve a tutte le schede (coda adesso); daily serve a dettaglio e trend.
  const live = useSWR("/api/admin/chat-monitor?tab=live", fetcher, { ...opts, refreshInterval: 15 * 60 * 1000 });
  const daily = useSWR(tab !== "live" ? "/api/admin/chat-monitor?tab=daily" : null, fetcher, opts);
  const trend = useSWR(tab === "trend" ? "/api/admin/chat-monitor?tab=trend" : null, fetcher, opts);

  const current = tab === "live" ? live : tab === "daily" ? daily : trend;
  const err = current.error || (tab !== "live" && daily.error) || live.error;
  const ready = tab === "live" ? live.data : tab === "daily" ? daily.data : trend.data && daily.data;
  const b = live.data?.boundary || {};

  // "Aggiorna tab": la Live si ricalcola sempre; le altre schede solo se hanno più di un'ora
  // (leggono ~12 GB e cambiano una volta al giorno).
  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetcher("/api/admin/chat-monitor?tab=live&refresh=1");
      await live.mutate(fresh, { revalidate: false });
      if (tab !== "live" && daily.data && Date.now() - new Date(daily.data.generated_at).getTime() > 3600_000) {
        await daily.mutate(await fetcher("/api/admin/chat-monitor?tab=daily&refresh=1"), { revalidate: false });
      }
      if (tab === "trend" && trend.data && Date.now() - new Date(trend.data.generated_at).getTime() > 3600_000) {
        await trend.mutate(await fetcher("/api/admin/chat-monitor?tab=trend&refresh=1"), { revalidate: false });
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 60px", fontFamily: FONTS.body }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: CP.textPrimary }}>Laura Chat Monitor <span style={{ fontSize: 14, color: CP.textMuted, fontWeight: 400 }}>· Live</span></h1>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 4 }}>Segnali comportamentali da chat + transazioni · aggiornamento da BigQuery</div>
        </div>
        {current.data?.generated_at && (
          <div style={{ fontSize: 12.5, color: CP.textMuted }}>Aggiornato: {new Date(current.data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</div>
        )}
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {COUNTRIES.map((c) => (
          <button key={c.id} onClick={() => setCountry(c.id)} style={pill(country === c.id)}>{c.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${CP.border}`, marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.label}</button>
        ))}
      </div>

      {live.data && tab !== "trend" && (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 14px", marginBottom: 12, fontSize: 12.5, color: CP.textSecondary }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: CP.accentGreen }} />
          <b style={{ color: CP.textPrimary, fontWeight: 500 }}>Chat live a {hm(b.ws_max)} ({ago(b.ws_max)})</b>
          <span>Storico consolidato fino a {ymdRome(b.of_max)} · {hm(b.of_max)} · Iscrizioni/transazioni: ~{hm(b.tx_max)}</span>
          <span style={{ marginLeft: "auto" }}>tab aggiornata {hm(current.data?.generated_at || live.data.generated_at)} · cache {tab === "live" ? "15 min" : "6 ore"}</span>
          <button onClick={refresh} disabled={refreshing} style={btn}>
            <RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} /> {refreshing ? "Aggiorno…" : "Aggiorna tab"}
          </button>
        </div>
      )}

      {err && <Notice danger>{err.message}</Notice>}
      {!err && !ready && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Calcolo in corso… la prima apertura di una scheda può richiedere fino a mezzo minuto.</div>}

      {tab === "live" && live.data && <LiveTab data={live.data} country={country} />}
      {tab === "daily" && daily.data && <DailyTab daily={daily.data} live={live.data} country={country} />}
      {tab === "trend" && trend.data && daily.data && <TrendTab trend={trend.data} daily={daily.data} country={country} />}

      {ready && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 16, lineHeight: 1.7 }}>
          Dati da BigQuery (chat in tempo reale, storico consolidato, iscrizioni e transazioni) · settimana in corso esclusa dai trend · LTV su finestra mobile 182gg · giorni e ore in ora italiana.<br />
          Alert deterministici (no AI). Ricostruzione di chat.hoc.tools: le definizioni sono descritte nei riquadri (passa sopra la "i").
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const pill = (on) => ({ padding: "7px 16px", borderRadius: 999, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, fontWeight: on ? 500 : 400, border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accentSoft : CP.surface, color: on ? CP.accentSoftText : CP.textPrimary });
const tabBtn = (on) => ({ padding: "9px 14px", fontSize: 13.5, cursor: "pointer", fontFamily: FONTS.body, border: "none", borderBottom: `2px solid ${on ? CP.accent : "transparent"}`, background: "transparent", color: on ? CP.textPrimary : CP.textSecondary, fontWeight: on ? 500 : 400, marginBottom: -1 });
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 7, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 12.5, cursor: "pointer", fontFamily: FONTS.body };
