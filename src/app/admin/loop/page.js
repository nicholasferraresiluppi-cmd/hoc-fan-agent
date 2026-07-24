"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Loader2, RefreshCw, Clock, Snowflake, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

/**
 * /admin/loop — "Loop azione→esito". Rende visibile il dataset proprietario che
 * si accumula: ogni giorno la coda "quale fan seguire" viene registrata, e a
 * 48h di distanza si misura se i fan flaggati hanno ricevuto risposta e comprato.
 * È la metà-moat del ciclo: nessuno lo accumula perché nessuno chiude il loop.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());
const usd = (v) => "$" + Number(v || 0).toLocaleString("it-IT", { maximumFractionDigits: 0 });

function OutcomeView({ day, creatorId }) {
  const { data, isLoading } = useSWR(
    day && creatorId ? `/api/admin/loop?day=${day}&creator_id=${creatorId}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  if (isLoading) return <div style={{ color: CP.textMuted, fontSize: 13, padding: "12px 0" }}><Loader2 size={14} className="spin" /> Calcolo esito…</div>;
  const s = data?.snapshot;
  if (!s) return null;
  if (!s.matured) {
    return (
      <CpCard style={{ marginTop: 12 }}>
        <p style={{ color: CP.textSecondary, fontSize: 13.5, margin: 0 }}>
          Snapshot non ancora maturo: l'esito si misura a 48h dalla cattura
          {s.matures_in_h != null ? ` (mancano ~${s.matures_in_h}h)` : ""}. Torna dopo — il dato si aggancia da solo.
        </p>
      </CpCard>
    );
  }
  const o = s.outcomes;
  const lift = o.slow.rev_per > 0 ? (o.fast.rev_per / o.slow.rev_per).toFixed(2) : "—";
  return (
    <div style={{ marginTop: 12 }}>
      <SectionLabel>Esito · {s.creator_name} · snapshot {s.day}</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, margin: "10px 0 14px" }}>
        <StatCard label="Fan flaggati" value={o.fast.n + o.slow.n} sub="waiting + cooling" />
        <StatCard label="Risposti ≤30min" value={o.fast.n} sub={`${o.fast.bought_pct}% ha comprato · ${usd(o.fast.rev_per)}/fan`} color={CP.accentGreen} />
        <StatCard label="Lenti / mai" value={o.slow.n} sub={`${o.slow.bought_pct}% ha comprato · ${usd(o.slow.rev_per)}/fan`} color={CP.textMuted} />
        <StatCard label="Lift revenue" value={lift === "—" ? "—" : `${lift}×`} sub="fast vs lento, $/fan" accent={CP.accent} />
      </div>
      <p style={{ fontSize: 11.5, color: CP.textMuted, lineHeight: 1.5 }}>
        Direzionale, non contabile: chi viene risposto in fretta può essere un fan diverso (confondimento) e c'è
        reverse-causality. Il valore che si accumula è la SERIE: giorno dopo giorno, la stessa raccomandazione
        registrata e il suo esito misurato — è quel dataset, non la singola riga, a diventare il vantaggio.
      </p>
    </div>
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

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 940, margin: "0 auto" }}>
      <PageHeader
        section="Insights"
        title="Loop azione→esito"
        subtitle="Ogni giorno registra quale fan era da seguire (la coda) e, a 48h, misura se ha ricevuto risposta e comprato. È il dataset proprietario che si accumula solo facendo girare il loop — il vantaggio che nessuno può comprare."
        toolbar={
          <button onClick={captureNow} disabled={capturing}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 9, padding: "8px 14px", fontSize: 13, cursor: capturing ? "default" : "pointer", opacity: capturing ? 0.6 : 1 }}>
            {capturing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Cattura snapshot ora
          </button>
        }
      />

      {captureErr && <CpCard style={{ marginBottom: 12 }}><p style={{ color: CP.accentRed, fontSize: 13, margin: 0 }}>{captureErr}</p></CpCard>}
      {denied && <CpCard><p style={{ color: CP.accentRed, fontSize: 13.5, margin: 0 }}>{datesData.error}</p></CpCard>}
      {datesLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!denied && dates.length === 0 && !datesLoading && (
        <CpCard>
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: "0 0 6px" }}>Nessuno snapshot ancora.</p>
          <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Il cron gira una volta al giorno (dispatcher, 03:00 UTC). Premi "Cattura snapshot ora" per il primo. L'esito di ciascuno matura dopo 48h.</p>
        </CpCard>
      )}

      {dates.length > 0 && (
        <>
          <SectionLabel>Giorni catturati</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 20px" }}>
            {dates.map((d) => (
              <button key={d.day} onClick={() => { setDay(d.day); setCreatorId(null); }}
                style={{ background: day === d.day ? CP.accentSoft || CP.surface : CP.surface, color: day === d.day ? CP.accent : CP.text, border: `1px solid ${day === d.day ? CP.accent : CP.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.mono }}>
                {d.day} <span style={{ color: CP.textMuted }}>· {d.creators} creator</span>
              </button>
            ))}
          </div>
        </>
      )}

      {day && !dayData && <div style={{ color: CP.textMuted, fontSize: 13 }}>Caricamento creator…</div>}
      {day && dayData && creators.length === 0 && (
        <CpCard><p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Nessun creator con coda in questo snapshot.</p></CpCard>
      )}
      {day && creators.length > 0 && (
        <>
          <SectionLabel>Creator nello snapshot {day} — scegli per vedere l'esito</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {creators.map((c) => (
              <button key={c.creator_id} onClick={() => setCreatorId(c.creator_id)}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", background: creatorId === c.creator_id ? CP.surface : "transparent", border: `1px solid ${creatorId === c.creator_id ? CP.accent : CP.border}`, borderRadius: 10, padding: "11px 16px", marginBottom: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 14, color: CP.textPrimary }}>{c.creator_name}</span>
                <span style={{ fontSize: 12.5, color: CP.textMuted, display: "inline-flex", gap: 14, alignItems: "center" }}>
                  <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Clock size={12} /> {c.waiting}</span>
                  <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Snowflake size={12} /> {c.cooling}</span>
                  <ArrowRight size={14} color={creatorId === c.creator_id ? CP.accent : CP.mutedIcons} />
                </span>
              </button>
            ))}
          </div>
          {creatorId && <OutcomeView day={day} creatorId={creatorId} />}
        </>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
