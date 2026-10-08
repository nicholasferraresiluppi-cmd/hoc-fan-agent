"use client";

// Chat Monitor per creator — ricostruzione di chat.hoc.tools ("Laura Chat Monitor · Live"),
// spento con lo split a ottobre 2026. Struttura, schede, riquadri ed etichette dal
// sito originale (letto il 20 e 22/07/2026). Dati: src/lib/chat-monitor*.js.

import { useEffect, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Notice, card } from "@/components/ds";
import { hm, ago, ymdRome } from "./ui";
import { COUNTRY_NAMES } from "@/lib/live-creators";
import { useLiveCreator, CreatorPills, liveFetcher } from "@/components/LiveCreatorPicker";
import LiveTab from "./LiveTab";
import DailyTab from "./DailyTab";
import TrendTab from "./TrendTab";

const TABS = [
  { id: "live", label: "Live chat" },
  { id: "daily", label: "Dettaglio giornaliero" },
  { id: "trend", label: "Riepilogo & trend" },
];

export default function ChatMonitorPage() {
  const [slug, setSlug] = useLiveCreator();
  const [countryPick, setCountryState] = useState(null);
  // Paese condiviso con la scheda Revenue ("Totale" qui non esiste: resta il primo paese)
  useEffect(() => { try { const v = localStorage.getItem("hoc:live:paese"); if (v) setCountryState(v); } catch {} }, []);
  const setCountry = (c) => { setCountryState(c); try { localStorage.setItem("hoc:live:paese", c); } catch {} };
  const [tab, setTab] = useState("live");
  const [refreshing, setRefreshing] = useState(false);
  const opts = { revalidateOnFocus: false };
  const url = (t, extra = "") => (slug == null ? null : `/api/admin/chat-monitor?tab=${t}${slug ? `&creator=${encodeURIComponent(slug)}` : ""}${extra}`);
  // La Live serve a tutte le schede (coda adesso); daily serve a dettaglio e trend.
  const live = useSWR(url("live"), liveFetcher, { ...opts, refreshInterval: 15 * 60 * 1000 });
  const daily = useSWR(tab !== "live" ? url("daily") : null, liveFetcher, opts);
  const trend = useSWR(tab === "trend" ? url("trend") : null, liveFetcher, opts);
  // Creator salvata che non è più tra le tue (403 con l'elenco): si passa alla prima visibile.
  useEffect(() => {
    const e = live.error;
    if (e?.creators?.length && !e.creators.some((c) => c.slug === slug)) setSlug(e.creators[0].slug);
  }, [live.error, slug]);
  const countries = live.data?.countries || [];
  const country = countries.includes(countryPick) ? countryPick : countries[0];
  const creatorName = (live.data?.creators || []).find((c) => c.slug === live.data?.creator)?.short || "";

  const current = tab === "live" ? live : tab === "daily" ? daily : trend;
  const err = current.error || (tab !== "live" && daily.error) || live.error;
  const ready = tab === "live" ? live.data : tab === "daily" ? daily.data : trend.data && daily.data;
  const b = live.data?.boundary || {};

  // "Aggiorna tab": la Live si ricalcola sempre; le altre schede solo se hanno più di un'ora
  // (leggono ~12 GB e cambiano una volta al giorno).
  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await liveFetcher(url("live", "&refresh=1"));
      await live.mutate(fresh, { revalidate: false });
      if (tab !== "live" && daily.data && Date.now() - new Date(daily.data.generated_at).getTime() > 3600_000) {
        await daily.mutate(await liveFetcher(url("daily", "&refresh=1")), { revalidate: false });
      }
      if (tab === "trend" && trend.data && Date.now() - new Date(trend.data.generated_at).getTime() > 3600_000) {
        await trend.mutate(await liveFetcher(url("trend", "&refresh=1")), { revalidate: false });
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
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{creatorName ? `${creatorName} · ` : ""}Chat Monitor <span style={{ fontSize: 14, color: CP.textMuted, fontWeight: 400 }}>· Live</span></h1>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 4 }}>Segnali comportamentali da chat + transazioni · aggiornamento da BigQuery</div>
        </div>
        {current.data?.generated_at && (
          <div style={{ fontSize: 12.5, color: CP.textMuted }}>Aggiornato: {new Date(current.data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</div>
        )}
      </header>

      <CreatorPills creators={live.data?.creators || live.error?.creators} current={live.data?.creator || slug} onChange={setSlug} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {countries.map((c) => (
          <button key={c} onClick={() => setCountry(c)} style={pill(country === c)}>{COUNTRY_NAMES[c] || c}</button>
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
