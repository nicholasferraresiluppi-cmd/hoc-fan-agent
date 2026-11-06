"use client";

// Cosa ha funzionato (6/11/2026): i reel usciti dal profilo con le loro misure dal magazzino dati, e il
// collegamento al video del Banco da cui vengono. Le cartelle del Banco diventano i formati da
// confrontare: il giro dopo si rifà quello che va sopra il solito. Logica in studio-esiti-core.js.
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ExternalLink, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { BTN, DataTable, EmptyState, Notice, SectionTitle, Spiega, NUM } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};

const sm = { ...BTN, padding: "6px 10px", minHeight: 36, fontSize: 13 };
const field = { padding: "6px 8px", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, maxWidth: 220, width: "100%" };
const fmt = (n) => (n == null ? "–" : Math.round(n).toLocaleString("it-IT", { useGrouping: "always" }));
const fmtX = (x) => (x == null ? "–" : `×${x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "");
const muted = { fontSize: 12, color: CP.textMuted };

function Copertina({ src }) {
  const [ko, setKo] = useState(false);
  const box = { width: 36, height: 64, borderRadius: 6, background: CP.bgSunken, flexShrink: 0, objectFit: "cover" };
  if (!src || ko) return <span style={box} aria-hidden="true" />;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setKo(true)} style={box} />;
}

function SceltaVideo({ row, banco, onLink, busy }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const b of banco) {
      const k = b.path || "Cartella principale";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(b);
    }
    return [...m];
  }, [banco]);
  return (
    <select style={field} value={row.fileId || ""} disabled={busy} aria-label={`Video del Banco per il reel del ${fmtDay(row.pubDay)}`}
      onClick={(e) => e.stopPropagation()} onChange={(e) => onLink(row, e.target.value || null)}>
      <option value="">{row.fileId ? "Scollega" : "Non dal Banco"}</option>
      {row.video?.missing && <option value={row.fileId}>Video non più nel Banco</option>}
      {groups.map(([label, list]) => (
        <optgroup key={label} label={label}>
          {list.map((b) => <option key={b.id} value={b.id}>{b.title}{b.linked && b.id !== row.fileId ? " · già collegato" : ""}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function EsitiReel({ pid }) {
  const url = `/api/admin/studio-social/${encodeURIComponent(pid)}/esiti`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const rileggi = async () => {
    setRefreshing(true); setErr(null);
    try { await mutate(await fetcher(`${url}?refresh=1`), { revalidate: false }); } catch (e) { setErr(e.message); } finally { setRefreshing(false); }
  };
  const onLink = async (row, fileId) => {
    setBusy(row.code); setErr(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: row.code, fileId }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Errore ${r.status}`);
      await mutate();
    } catch (e) { setErr(`Reel del ${fmtDay(row.pubDay)} non collegato: ${e.message}`); } finally { setBusy(null); }
  };

  const title = "Cosa ha funzionato";
  if (isLoading) return (<><SectionTitle>{title}</SectionTitle><div style={{ fontSize: 14, color: CP.textMuted, marginBottom: 24 }}>Caricamento…</div></>);
  if (error) return (<><SectionTitle>{title}</SectionTitle><div style={{ marginBottom: 24 }}><Notice danger>{`Errore nel caricamento: ${error.message}`}</Notice></div></>);
  if (data?.unsupported) return null;

  const rows = data?.outcomes || [];
  const banco = data?.banco || [];
  const rules = data?.rules || {};
  const columns = [
    { key: "pubDay", label: "Reel", sort: (r) => r.pubAt || 0, render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Copertina src={r.thumb} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ whiteSpace: "nowrap" }}>{fmtDay(r.pubDay)}</span>
          {r.url && <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...muted, color: CP.textSecondary, display: "inline-flex", alignItems: "center", gap: 4 }}><ExternalLink size={11} aria-hidden="true" />Apri</a>}
        </span>
      </span>
    ) },
    { key: "video", label: "Video del Banco", sortable: false, render: (r) => banco.length ? <SceltaVideo row={r} banco={banco} onLink={onLink} busy={busy === r.code} /> : <span style={muted}>Banco vuoto</span> },
    { key: "views1", label: "View a 24 h", align: "right", render: (r) => fmt(r.views1) },
    { key: "views7", label: "View a 7 giorni", align: "right", render: (r) => (r.views7 == null ? <span style={muted}>{r.due7 ? "non misurata" : "non ancora"}</span> : fmt(r.views7)) },
    { key: "ratio", label: "Rispetto al solito", align: "right", render: (r) => (r.ratio == null ? <span style={muted}>–</span> : <span style={{ color: r.ratio >= 1.5 ? CP.accentGreen : CP.textPrimary }}>{fmtX(r.ratio)}</span>) },
    { key: "visits", label: "Visite al link (2 g)", align: "right", render: (r) => (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        {fmt(r.visits)}
        {r.visits != null && r.shared > 0 && <span style={muted}>con {r.shared} {r.shared === 1 ? "altro reel" : "altri reel"}</span>}
      </span>
    ) },
    { key: "subs", label: "Iscritti (2 g)", align: "right", render: (r) => fmt(r.subs) },
  ];
  const fmtCols = [
    { key: "label", label: "Formato (cartella del Banco)" },
    { key: "n", label: "Reel", align: "right" },
    { key: "ratio", label: "Rispetto al solito", align: "right", sort: (f) => f.ratio ?? -1, render: (f) => (f.enough ? fmtX(f.ratio) : <span style={muted}>pochi dati ({f.measured} di {rules.minFormat})</span>) },
    { key: "views7", label: "View a 7 giorni", align: "right", render: (f) => fmt(f.views7) },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle aside={
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {data?.lastDay && <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>dati al {fmtDay(data.lastDay)}</span>}
          <button type="button" style={sm} disabled={refreshing || data?.computing} onClick={rileggi}><RefreshCw size={13} aria-hidden="true" />{refreshing ? "Rileggo…" : "Rileggi"}</button>
        </span>
      }>{title}</SectionTitle>
      {data?.error && <div style={{ marginBottom: 10 }}><Notice danger>{`Il magazzino dati non risponde: ${data.error}.${rows.length ? " Qui sotto gli ultimi numeri letti." : ""}`}</Notice></div>}
      {data?.computing && <div style={{ marginBottom: 10 }}><Notice>Lettura in corso da un'altra finestra: tra un minuto rileggi.</Notice></div>}
      {err && <div style={{ marginBottom: 10 }}><Notice danger>{err}</Notice></div>}
      {data?.toLink > 0 && <div style={{ marginBottom: 10 }}><Notice>{data.toLink === 1 ? "1 reel uscito dopo il collegamento del Banco non è ancora collegato" : `${data.toLink} reel usciti dopo il collegamento del Banco non sono ancora collegati`} al suo video: sceglilo nella colonna «Video del Banco».</Notice></div>}

      {!data?.found && !data?.error && !data?.computing ? (
        <EmptyState title="Profilo non seguito dal magazzino dati">
          {`@${data?.handle || ""} non risulta tra i profili fotografati ogni giorno: le misure arrivano da lì. Va aggiunto agli account del talent.`}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="Nessun reel negli ultimi giorni">{`Nessun reel uscito negli ultimi ${rules.showDays || 90} giorni.`}</EmptyState>
      ) : (<>
        {data.formats?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <DataTable columns={fmtCols} rows={data.formats.map((f) => ({ ...f, id: f.path || "_" }))} minWidth={460} density="compact" />
          </div>
        )}
        <DataTable columns={columns} rows={rows} defaultSort={{ key: "pubDay", dir: -1 }} minWidth={820} />
      </>)}

      <Spiega style={{ marginTop: 10 }}>
        I numeri vengono dal magazzino dati, che fotografa il profilo una volta al giorno: «dati al» è l'ultima foto, il giorno di oggi arriva domani. «Non misurata» vuol dire che in quei giorni il magazzino non ha fotografato il reel: meglio nessun numero che uno vecchio.
        «Rispetto al solito» confronta le view a 7 giorni con la mediana degli ultimi {rules.baseReels || 10} reel del profilo usciti prima (servono almeno {rules.minBase || 5} reel): ×2 vuol dire il doppio del solito.
        Le visite al link e gli iscritti sono del profilo nel giorno dell'uscita e in quello dopo: Instagram non dice da quale reel arriva un clic, quindi sono un segnale, non un conto. Se nei due giorni è uscito un altro reel il numero è in comune e lo trovi scritto.
        Collegando ogni reel al suo video del Banco, la tabella in alto confronta le cartelle (i formati): un confronto vale da {rules.minFormat || 3} reel misurati in su.
      </Spiega>
    </div>
  );
}
