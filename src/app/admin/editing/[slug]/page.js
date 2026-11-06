"use client";

/**
 * /admin/editing/[slug] — la scrivania di una creator (6/11/2026).
 *
 * Dall'alto, nello stesso ordine del lavoro: la cosa che blocca adesso; le sette tappe (girato → idee →
 * montaggio → revisione → scelta → uscita → misura), toccandone una si scende alla sua sezione; cosa
 * rifare nel prossimo giro e quanto resta il lavoro tra le tappe. Sotto, il lavoro vero del profilo
 * scelto: il Banco (scelta e uscita), Cosa ha funzionato (misura), i giri della squadra (idee,
 * montaggio, revisione e lo stato del girato). Logica in src/lib/editing-core.js.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Clock, Repeat, ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, Segmented, Spiega, BTN, card, NUM } from "@/components/ds";
import { Adesso, Tappe } from "@/components/editing/Tappe";
import BancoMontaggi from "@/components/studio/BancoMontaggi";
import EsitiReel from "@/components/studio/EsitiReel";
import RedazioneVideo from "@/components/studio/RedazioneVideo";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};
const fmtX = (x) => `×${x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtG = (d) => (d == null ? "–" : d < 1 ? "meno di un giorno" : `${d.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ${d === 1 ? "giorno" : "giorni"}`);
// tappa → sezione della pagina
const SEZIONE = { girato: "giri", idee: "giri", montaggio: "giri", revisione: "giri", scelta: "banco", uscita: "banco", misura: "misura" };

function Riquadro({ icon: Icon, title, children }) {
  return (
    <div style={{ ...card, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}><Icon size={14} aria-hidden="true" />{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, color: CP.textPrimary, ...NUM }}>{children}</div>
    </div>
  );
}

export default function ScrivaniaPage() {
  const { slug } = useParams();
  const { data, error, isLoading } = useSWR(`/api/admin/editing/${encodeURIComponent(slug)}`, fetcher, { revalidateOnFocus: true });
  const [pid, setPid] = useState(null);

  const crumbs = [{ label: "Hub", href: "/admin" }, { label: "Editing", href: "/admin/editing" }, { label: data?.creator || "…" }];
  if (isLoading) return <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}><PageHead crumbs={crumbs} title="Scrivania" /><div style={{ fontSize: 14, color: CP.textMuted }}>Caricamento…</div></div>;
  if (error) return <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}><PageHead crumbs={crumbs} title="Scrivania" /><Notice danger>{error.status === 404 ? "Scrivania non trovata." : `Errore nel caricamento: ${error.message}`}</Notice></div>;

  const profiles = data.profiles || [];
  const cur = profiles.find((p) => p.id === pid) || profiles[0];
  const vai = (stage) => document.getElementById(`ed-${SEZIONE[stage]}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const { sure = [], few = [] } = data.rifare || {};
  const t = data.tempi || {};

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead crumbs={crumbs} title={data.creator}
        subtitle={profiles.map((p) => `@${p.handle}`).join(" · ")}
        actions={cur && <Link href={`/admin/studio-social/${encodeURIComponent(cur.id)}`} style={{ ...BTN, textDecoration: "none" }}><ExternalLink size={14} aria-hidden="true" />Profilo in Regia social</Link>} />

      <div style={{ marginBottom: 12 }}><Adesso adesso={data.adesso} /></div>
      <Tappe stages={data.stages} onPick={vai} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, margin: "12px 0 28px" }}>
        <Riquadro icon={Repeat} title="Cosa rifare nel prossimo giro">
          {sure.length === 0 && <span style={{ color: CP.textMuted, fontSize: 13 }}>Ancora nessun formato con abbastanza reel misurati.</span>}
          {sure.map((f) => <span key={f.path}>{f.label} <span style={{ color: f.ratio >= 1 ? CP.accentGreen : CP.textSecondary }}>{fmtX(f.ratio)}</span></span>)}
          {few.map((f) => <span key={f.path} style={{ color: CP.textMuted, fontSize: 13 }}>{f.label}: pochi dati ({f.measured} di 3)</span>)}
        </Riquadro>
        <Riquadro icon={Clock} title="Quanto resta il lavoro tra le tappe">
          <span>Dal Banco alla scelta: <b style={{ fontWeight: 500 }}>{fmtG(t.scelta)}</b>{t.sceltaN ? <span style={{ color: CP.textMuted, fontSize: 13 }}> · su {t.sceltaN} video</span> : null}</span>
          <span>Da pronto all'uscita: <b style={{ fontWeight: 500 }}>{fmtG(t.uscita)}</b>{t.uscitaN ? <span style={{ color: CP.textMuted, fontSize: 13 }}> · su {t.uscitaN} reel</span> : null}</span>
          <span style={{ color: CP.textMuted, fontSize: 12.5 }}>Montaggio e revisione girano a giri: i loro tempi sono nei giri qui sotto.</span>
        </Riquadro>
      </div>

      {profiles.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <Segmented label="Profilo" items={profiles.map((p) => [p.id, `@${p.handle}`])} value={cur?.id} onChange={setPid} />
        </div>
      )}

      {cur && (
        <>
          <section id="ed-banco" style={{ scrollMarginTop: 80 }}><BancoMontaggi key={`b-${cur.id}`} pid={cur.id} /></section>
          {cur.platform === "instagram" && <section id="ed-misura" style={{ scrollMarginTop: 80 }}><EsitiReel key={`e-${cur.id}`} pid={cur.id} /></section>}
          <section id="ed-giri" style={{ scrollMarginTop: 80 }}><RedazioneVideo key={`r-${cur.id}`} pid={cur.id} senzaPercorso title="La squadra e i giri" /></section>
        </>
      )}

      <Spiega>
        Le sette tappe sono sempre nello stesso ordine e dicono chi ha il lavoro in mano: la creator (il girato), la squadra AI (idee, montaggio, revisione, a giri), una persona (scelta e uscita, nel Banco), il programma che misura.
        Idee, montaggio e revisione mostrano l'ultimo giro registrato: lavorano fuori dall'app e si conoscono a giro finito. Una tappa si accende quando è ferma da troppi giorni (scelta da 2, uscita da 3) o quando il girato utile è finito.
        «Cosa rifare» è il confronto delle cartelle del Banco una volta usciti e misurati i reel: entra nelle idee del giro dopo e, se il girato è finito, nella richiesta di shooting.
      </Spiega>
    </div>
  );
}
