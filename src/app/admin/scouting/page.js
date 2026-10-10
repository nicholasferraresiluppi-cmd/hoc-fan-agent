"use client";

// Radar creator — lo strumento dello scouting (SEED, admin-only). v2 10/10/2026.
// Quattro viste sul lavoro vero: Oggi (chi guardare adesso), Esplora (tutte, con viste pronte),
// Mercato (dove c'è spazio e cosa funziona nei reel), Contatti (il percorso fino alla firma).
// Una scheda per PERSONA (più account collegati), con i reel che si guardano dentro l'app.
// Regole: collegamenti tra account PROPOSTI e confermati da una persona; nessun dato sensibile
// nelle note (docs/SCOUTING_PRIVACY.md); cancellazione su richiesta dalla scheda; nessun
// contatto prima del parere legale.

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { CP } from "@/lib/brand";
import { PageHead, Notice } from "@/components/ds";
import RadarOggi from "@/components/scouting/RadarOggi";
import RadarEsplora from "@/components/scouting/RadarEsplora";
import RadarScheda from "@/components/scouting/RadarScheda";
import RadarMercato from "@/components/scouting/RadarMercato";
import RadarContatti from "@/components/scouting/RadarContatti";
import RadarFormat from "@/components/scouting/RadarFormat";
import RadarSegnala from "@/components/scouting/RadarSegnala";
import { btn, btnPrimary, fmtFull } from "@/components/scouting/radar-ui";
import { newCutoff } from "@/lib/scouting-core";

const errText = (s) => (s === 401 || s === 403 ? "Sessione scaduta o permessi insufficienti." : s >= 500 ? "Errore del server, riprova." : "Errore.");
const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))));
const TABS = [
  { id: "oggi", label: "Oggi" },
  { id: "esplora", label: "Esplora" },
  { id: "mercato", label: "Mercato" },
  { id: "format", label: "Format" },
  { id: "contatti", label: "Contatti" },
];

// Telefono (10/10/2026, richiesta Nicholas: "il radar deve essere comodo dal telefono").
// Esplora e Mercato hanno un disegno apposta (useIsPhone); qui le regole di contorno.
const PHONE_CSS = `
.rx-strip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px}
.rx-strip::-webkit-scrollbar{display:none}
@media (max-width:699px){
  .rx-page{padding:16px 16px 64px !important}
  .rx-page .ds-head{margin-bottom:12px !important}
  .rx-page .ds-sub{display:none !important}
  .rx-page .ds-h1{font-size:30px !important;line-height:1.08 !important}
  .rx-tabs{flex-wrap:nowrap !important;overflow-x:auto;scrollbar-width:none;gap:22px !important;margin:0 -16px 20px !important;padding:0 16px}
  .rx-tabs::-webkit-scrollbar{display:none}
  .ro-nums{grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:18px 16px !important;padding:18px 0 !important}
  .ro-nums > div > span:first-child{font-size:34px !important}
  .ro-nums > div > span:last-child{font-size:12.5px !important}
  .ro-today{display:flex !important;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:16px;gap:16px !important;margin:0 -16px;padding:0 16px 6px;scrollbar-width:none}
  .ro-today::-webkit-scrollbar{display:none}
  .ro-today > article{flex:0 0 86%;scroll-snap-align:start}
  .rx-page[data-sel] .ds-head{display:none !important}
  .rs-ini{display:none}
  .rs-acts{width:100%}
  .rs-main > section{order:4}
  .rs-main > .rs-why{order:1}.rs-main > .rs-reels{order:2}.rs-main > .rs-nums{order:3}
  .rs-stages{flex-direction:row !important;flex-wrap:wrap}
  .rs-stages button{padding:8px 12px !important;font-size:13.5px !important}
  .rc-scroll{overflow:visible !important}
  .rc-cols{grid-template-columns:1fr !important;min-width:0 !important}
}`;

export default function ScoutingPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/admin/scouting", fetcher, { revalidateOnFocus: false });
  const { data: inboxData, mutate: mutateInbox } = useSWR("/api/admin/scouting/segnala", fetcher, {
    revalidateOnFocus: false,
    // finché una segnalazione è in lettura si riguarda ogni 5 secondi
    refreshInterval: (d) => (d?.items || []).some((x) => x.status === "in_lettura") ? 5000 : 0,
  });
  const { user } = useUser();
  const me = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  const [tab, setTab] = useState("oggi");
  const [selH, setSelH] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [segnala, setSegnala] = useState(false);

  // vista e scheda nell'indirizzo (?vista=…&c=handle): link condivisibili e tasto indietro
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      setTab(TABS.some((t) => t.id === p.get("vista")) ? p.get("vista") : "oggi");
      setSelH(p.get("c") || null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const go = useCallback((nextTab, h) => {
    const p = new URLSearchParams();
    if (nextTab && nextTab !== "oggi") p.set("vista", nextTab);
    if (h) p.set("c", h);
    const q = p.toString();
    window.history.pushState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    setTab(nextTab || "oggi");
    setSelH(h || null);
    window.scrollTo({ top: 0 });
  }, []);

  const creators = useMemo(() => data?.creators || [], [data]);
  const newCut = useMemo(() => newCutoff(creators), [creators]);
  const profilesBy = useMemo(() => Object.fromEntries((data?.profiles || []).map((p) => [p.h, p])), [data]);
  const sel = (selH && creators.find((r) => r.handles.includes(selH))) || null;
  const inbox = inboxData?.items || [];
  const paid = creators.filter((c) => c.sig === "forte").length;

  // quando una segnalazione finisce, i dati del radar si ricaricano
  const doneKey = inbox.filter((x) => x.status !== "in_lettura").map((x) => x.id).join(",");
  useEffect(() => { if (doneKey) mutate(); }, [doneKey, mutate]);

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

  const line2 = sel || !data ? null : tab === "oggi" ? `${fmtFull(paid)} creator con un profilo a pagamento.` : tab === "mercato" ? "Dove c'è spazio, cosa funziona." : tab === "format" ? "I format che esistono già." : tab === "contatti" ? "Dalla scelta alla firma." : `${fmtFull(creators.length)} creator italiane.`;

  return (
    <div className="rx-page" data-sel={sel ? "1" : undefined} style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 72px" }}>
      <style>{PHONE_CSS}</style>
      <PageHead
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Marketing" }]}
        title="Radar creator"
        line2={line2}
        subtitle={sel ? null : "Le creator italiane trovate su Instagram, una scheda per persona, seguite settimana per settimana."}
        actions={<button style={btnPrimary} onClick={() => setSegnala(true)}>Segnala una creator</button>}
      />

      {!sel && (
        <nav role="tablist" aria-label="Viste del radar" className="rx-tabs" style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", borderBottom: `1px solid ${CP.border}`, marginBottom: 32 }}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}
              style={{ background: "none", border: "none", borderBottom: `1px solid ${tab === t.id ? CP.gold : "transparent"}`, color: tab === t.id ? CP.textPrimary : CP.textSecondary, padding: "0 0 12px", fontSize: 15, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>{t.label}</button>
          ))}
        </nav>
      )}

      {msg && <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 900, maxWidth: "calc(100% - 32px)" }}><Notice>{msg} <button onClick={() => setMsg(null)} style={{ ...btn, minHeight: 0, padding: "2px 10px", marginLeft: 8 }}>Ok</button></Notice></div>}
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <p style={{ color: CP.textMuted }}>Caricamento…</p>}
      {data && creators.length === 0 && <Notice>Il radar è vuoto: si carica con lo script di importazione della ricerca (scripts/scouting-import.mjs) o segnalando una creator.</Notice>}

      {data && creators.length > 0 && (
        sel ? (
          <RadarScheda key={sel.id} c={sel} newCut={newCut} data={data} profilesBy={profilesBy} act={act} busy={busy}
            onBack={() => window.history.length > 1 ? window.history.back() : go(tab)} onSelectHandle={(h) => go(tab, h)} />
        ) : tab === "esplora" ? (
          <RadarEsplora creators={creators} newCut={newCut} profilesBy={profilesBy} onOpen={(c) => go("esplora", c.handles[0])} />
        ) : tab === "mercato" ? (
          <RadarMercato creators={creators} />
        ) : tab === "format" ? (
          <RadarFormat />
        ) : tab === "contatti" ? (
          <RadarContatti creators={creators} onOpen={(c) => go("contatti", c.handles[0])} />
        ) : (
          <RadarOggi newCut={newCut} data={data} creators={creators} profilesBy={profilesBy} onOpen={(c) => go("oggi", c.handles[0])} act={act} busy={busy} inbox={inbox} onSegnala={() => setSegnala(true)} />
        )
      )}

      <RadarSegnala open={segnala} onClose={() => setSegnala(false)} me={me} onSent={() => mutateInbox()} />
    </div>
  );
}
