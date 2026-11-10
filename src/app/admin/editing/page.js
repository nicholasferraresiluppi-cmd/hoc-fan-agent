"use client";

/**
 * /admin/editing — Editing (6/11/2026): la sala con una scrivania per creator.
 *
 * Ogni scrivania è la squadra che produce i reel di quella creator (agenti AI + una persona che sceglie)
 * e mostra a colpo d'occhio la cosa che la blocca adesso e le sette tappe, dal girato al reel misurato.
 * Dentro (/admin/editing/[slug]) c'è il lavoro vero: Banco, giri, cosa ha funzionato.
 * Permesso social.manage, come Regia social. Logica in src/lib/editing-core.js.
 */
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, EmptyState, Spiega, card, NUM } from "@/components/ds";
import { Adesso } from "@/components/editing/Tappe";
import HeroHead, { BigNum } from "@/components/HeroHead";

// Scrivanie: entrano una dopo l'altra e si sollevano al passaggio (ferme con «Riduci movimento»).
const ED_CSS = `
.edk-card{animation:edkIn .42s cubic-bezier(.2,.7,.2,1) both;transition:transform .18s ease, box-shadow .18s ease}
@media (hover:hover){.edk-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px -14px rgba(0,0,0,.35)}}
@keyframes edkIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.edk-card{animation:none;transition:none}.edk-card:hover{transform:none}}
`;

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");

function Scrivania({ d, i = 0 }) {
  const by = Object.fromEntries((d.stages || []).map((s) => [s.id, s]));
  const hot = (d.stages || []).some((s) => s.stuck);
  const nums = [["Da scegliere", by.scelta?.n], ["Pronti", by.uscita?.n], ["Misurati", by.misura?.n]];
  return (
    <Link href={`/admin/editing/${d.slug}`} className="edk-card" style={{ ...card, display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", borderRadius: 18, textDecoration: "none", color: CP.textPrimary, borderColor: hot ? CP.attn : CP.border, minWidth: 0, animationDelay: `${Math.min(i, 12) * 50}ms` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 500 }}>{d.creator}</span>
        <ArrowRight size={16} color={CP.textMuted} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: -6 }}>
        {(d.profiles || []).map((p) => `@${p.handle}`).join(" · ")}
        {d.lastGiro ? ` · giro ${d.lastGiro.n} il ${fmtDay(d.lastGiro.day)}` : " · nessun giro registrato"}
      </div>
      {d.error ? <Notice danger>{d.error}</Notice> : <Adesso adesso={d.adesso} compact />}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: CP.textSecondary }}>Girato <span style={{ color: by.girato?.stuck ? CP.attn : CP.textPrimary }}>{by.girato?.sub || "–"}</span></span>
        {nums.map(([l, n]) => <span key={l} style={{ fontSize: 13, color: CP.textSecondary }}>{l} <span style={{ color: CP.textPrimary, ...NUM }}>{n ?? "–"}</span></span>)}
      </div>
    </Link>
  );
}

export default function EditingPage() {
  const { data, error, isLoading } = useSWR("/api/admin/editing", fetcher, { revalidateOnFocus: false });
  const desks = data?.desks || [];
  // Intestazione «stile reel» (10/11/2026): quante scrivanie sono ferme e i reel nelle ultime tappe
  const tot = (id) => desks.reduce((n, d) => n + ((d.stages || []).find((s) => s.id === id)?.n || 0), 0);
  const stuck = desks.filter((d) => (d.stages || []).some((s) => s.stuck)).length;
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead crumbs={[{ label: "Hub", href: "/admin" }, { label: "Editing" }]} title="Editing"
        subtitle="Una scrivania per creator: la squadra che produce i suoi reel, dal girato al reel misurato." />
      {isLoading && <div style={{ fontSize: 14, color: CP.textMuted }}>Caricamento…</div>}
      {error && <Notice danger>{`Errore nel caricamento: ${error.message}`}</Notice>}
      {data && desks.length === 0 && (
        <EmptyState title="Nessuna scrivania" action={<Link href="/admin/studio-social" style={{ color: CP.accentSoftText }}>Vai a Regia social</Link>}>
          Le scrivanie nascono dai profili di Regia social: una per creator, con dentro i suoi profili.
        </EmptyState>
      )}
      <style>{ED_CSS}</style>
      {desks.length > 0 && (
        <HeroHead
          eyebrow="Le scrivanie"
          title={stuck ? "Ferme su una tappa:" : "Le scrivanie al lavoro sono"}
          accent={stuck ? `${stuck} ${stuck === 1 ? "scrivania" : "scrivanie"}` : String(desks.length)}
          sub={stuck ? "Hanno una tappa ferma da troppi giorni: il bordo acceso dice quale." : "Nessuna tappa ferma da troppi giorni."}
          numbers={<>
            <BigNum label="Scrivanie" value={desks.length} />
            <BigNum label="Da scegliere" value={tot("scelta")} strong={tot("scelta") > 0} />
            <BigNum label="Pronti" value={tot("uscita")} />
            <BigNum label="Misurati" value={tot("misura")} />
          </>}
        />
      )}
      {desks.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
          {desks.map((d, i) => <Scrivania key={d.slug} d={d} i={i} />)}
        </div>
      )}
      <Spiega style={{ marginTop: 14 }}>
        Ogni scrivania segue lo stesso percorso in sette tappe: girato, idee, montaggio, revisione, scelta, uscita, misura. Le prime quattro le fa la squadra AI a giri; la scelta e l'uscita una persona; la misura il programma che legge i numeri dal magazzino dati.
        La riga colorata è la cosa che blocca adesso. Una scrivania col bordo acceso ha una tappa ferma da troppi giorni.
      </Spiega>
    </div>
  );
}
