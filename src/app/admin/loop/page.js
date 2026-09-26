"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmt$, fmtInt } from "@/lib/format";
import { PageHead, Metric, FilterChip, SectionTitle, Notice, DataTable, card } from "@/components/ds";

/**
 * /admin/loop — "Loop azione→esito". Rende visibile il dataset proprietario che
 * si accumula: ogni giorno la coda "quale fan seguire" viene registrata, e a
 * 48h di distanza si misura se i fan flaggati hanno ricevuto risposta e comprato.
 * È la metà-moat del ciclo: nessuno lo accumula perché nessuno chiude il loop.
 *
 * Redesign DS (26/09/2026): percorso in 3 passi scritto a schermo (giorno →
 * creator → esito; prima la pagina mostrava solo i giorni e sembrava vuota),
 * creator in tabella, esito con parole al posto di "lift/fast/slow".
 * API e cattura invariate.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());
const fmtDay = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const pct = (v) => (v == null ? "—" : `${Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

function OutcomeView({ day, creatorId }) {
  const { data, isLoading } = useSWR(
    day && creatorId ? `/api/admin/loop?day=${day}&creator_id=${creatorId}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 14, padding: "12px 0", display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} className="spin" /> Calcolo l'esito…</div>;
  const s = data?.snapshot;
  if (!s) return null;
  if (!s.matured) {
    return (
      <Notice>
        L'esito di questo giorno non è ancora pronto: si misura 48 ore dopo il salvataggio
        {s.matures_in_h != null ? ` (mancano circa ${s.matures_in_h} ore)` : ""}. Non serve fare nulla: torna dopo e lo trovi qui.
      </Notice>
    );
  }
  const o = s.outcomes;
  const lift = o.slow.rev_per > 0 ? (o.fast.rev_per / o.slow.rev_per) : null;
  return (
    <section style={{ ...card, padding: "18px 20px", marginTop: 4 }}>
      <SectionTitle aside={`lista del ${fmtDay(s.day)}`}>Esito per {s.creator_name}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 18, margin: "8px 0 16px" }}>
        <Metric label="Fan nella lista" value={fmtInt(o.fast.n + o.slow.n)} note="in attesa + si raffreddano" />
        <Metric label="Risposti entro 30 minuti" value={fmtInt(o.fast.n)} note={`${pct(o.fast.bought_pct)} ha comprato · ${fmt$(o.fast.rev_per)} a fan`} />
        <Metric label="Risposti tardi o mai" value={fmtInt(o.slow.n)} note={`${pct(o.slow.bought_pct)} ha comprato · ${fmt$(o.slow.rev_per)} a fan`} />
        <Metric label="Rispondere in fretta rende" value={lift == null ? "—" : `${lift.toLocaleString("it-IT", { maximumFractionDigits: 2 })} volte`} note="dollari a fan, veloci contro lenti" />
      </div>
      <p style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.6, margin: 0 }}>
        Da leggere come indicazione, non come prova: i fan a cui si risponde in fretta possono essere diversi da quelli lasciati indietro
        (per esempio più attivi, o già intenzionati a comprare). Il valore sta nella serie: giorno dopo giorno la stessa lista salvata e il suo esito misurato.
      </p>
    </section>
  );
}

export default function LoopPage() {
  const [day, setDay] = useState(null);
  const [creatorId, setCreatorId] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [captureErr, setCaptureErr] = useState(null);

  const { data: datesData, isLoading: datesLoading } = useSWR("/api/admin/loop", fetcher, { revalidateOnFocus: false });
  const { data: dayData } = useSWR(day ? `/api/admin/loop?day=${day}` : null, fetcher, { revalidateOnFocus: false });
  const dates = datesData?.dates || [];
  const creators = dayData?.creators || [];
  const denied = datesData?.error;

  const captureNow = async () => {
    setCapturing(true); setCaptureErr(null);
    try {
      const res = await fetch("/api/admin/loop", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setCaptureErr(j.error || "Cattura fallita"); return; }
      await mutate("/api/admin/loop");
    } catch { setCaptureErr("Errore di rete"); }
    finally { setCapturing(false); }
  };

  const columns = [
    { key: "creator_name", label: "Creator" },
    { key: "waiting", label: "In attesa di risposta", align: "right", render: (c) => fmtInt(c.waiting) },
    { key: "cooling", label: "Si raffreddano", align: "right", render: (c) => fmtInt(c.cooling) },
    { key: "go", label: "", sortable: false, render: (c) => <span style={{ color: creatorId === c.creator_id ? CP.accentSoftText : CP.textMuted, fontSize: 13, whiteSpace: "nowrap" }}>{creatorId === c.creator_id ? "Esito sotto ↓" : "Vedi esito"}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Insights" }, { label: "Loop azione → esito" }]}
        title="Loop azione → esito"
        subtitle="Ogni giorno salviamo la lista dei fan da seguire (quella della Priority queue) e, 48 ore dopo, misuriamo se hanno avuto risposta e se hanno comprato. Serve a vedere se seguire la lista porta davvero vendite."
        actions={
          <button onClick={captureNow} disabled={capturing}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: capturing ? "default" : "pointer", opacity: capturing ? 0.6 : 1, fontFamily: FONTS.body }}>
            {capturing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Salva la lista di oggi
          </button>
        }
      />

      {captureErr && <Notice danger>{captureErr}</Notice>}
      {denied && <Notice danger>{datesData.error}</Notice>}
      {datesLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!denied && dates.length === 0 && !datesLoading && (
        <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          Nessuna lista salvata ancora. Il salvataggio automatico gira una volta al giorno (di notte); per partire subito premi «Salva la lista di oggi».
          L'esito di ogni giorno si vede 48 ore dopo.
        </div>
      )}

      {dates.length > 0 && (
        <>
          <SectionTitle aside="L'esito c'è solo per i giorni di almeno 48 ore fa.">1. Scegli un giorno</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 24px" }}>
            {dates.map((d) => (
              <FilterChip key={d.day} label={`${fmtDay(d.day)} · ${d.creators} creator`} active={day === d.day}
                onClick={() => { setDay(d.day); setCreatorId(null); }} />
            ))}
          </div>
        </>
      )}

      {day && !dayData && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento creator…</div>}
      {day && dayData && creators.length === 0 && (
        <Notice>Nessuna creator aveva fan da seguire nella lista di questo giorno.</Notice>
      )}
      {day && creators.length > 0 && (
        <>
          <SectionTitle aside="Quanti fan c'erano nella lista, per stato.">2. Scegli una creator</SectionTitle>
          <div style={{ marginBottom: 20 }}>
            <DataTable
              columns={columns}
              rows={creators.map((c) => ({ ...c, id: c.creator_id }))}
              onRowClick={(c) => setCreatorId(c.creator_id)}
              selected={(c) => c.creator_id === creatorId}
              minWidth={480}
              maxHeight={420}
            />
          </div>
          {creatorId && (<>
            <SectionTitle>3. L'esito</SectionTitle>
            <OutcomeView day={day} creatorId={creatorId} />
          </>)}
        </>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
