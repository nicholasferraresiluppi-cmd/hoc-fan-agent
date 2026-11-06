"use client";

// La redazione video (6/11/2026): il lavoro dell'ufficio che produce i reel di questo profilo, reso
// visibile — chi fa cosa, giro per giro, e quanto di quel lavoro arriva fino al reel che rende.
// È la stessa squadra che si moltiplica sulle altre creator. Logica in studio-giri-core.js.
import { useState } from "react";
import useSWR from "swr";
import { ArrowRight } from "lucide-react";
import { CP } from "@/lib/brand";
import { Disclosure, EmptyState, Notice, SectionTitle, Spiega, NUM, card } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};

const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("it-IT", { useGrouping: "always" }));
const CHI = { AI: "AI", persona: "Persona", codice: "Codice" };

function Squadra({ team, work }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10, marginBottom: 12 }}>
      {team.map((m) => (
        <div key={m.id} style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{m.nome}</span>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: m.chi === "persona" ? CP.surfaceAlt : CP.accentSoft, color: m.chi === "persona" ? CP.textSecondary : CP.accentSoftText, whiteSpace: "nowrap" }}>{CHI[m.chi] || m.chi}</span>
          </div>
          <div style={{ fontSize: 13, color: work[m.id] ? CP.textPrimary : CP.textMuted, ...NUM }}>{work[m.id] || "Ancora niente"}</div>
          <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.4 }}>{m.compito}</div>
        </div>
      ))}
    </div>
  );
}

function Percorso({ steps }) {
  return (
    <div style={{ ...card, padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 6px", marginBottom: 12 }}>
      {steps.map((s, i) => (
        <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 74 }}>
            <span style={{ fontSize: 20, fontWeight: 500, color: s.n ? CP.textPrimary : CP.textMuted, ...NUM }}>
              {fmt(s.n)}{s.of != null && <span style={{ fontSize: 13, color: CP.textMuted }}> di {fmt(s.of)}</span>}
            </span>
            <span style={{ fontSize: 12, color: CP.textSecondary }}>{s.label}</span>
          </span>
          {i < steps.length - 1 && <ArrowRight size={14} color={CP.textMuted} aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}

function Lista({ title, list }) {
  if (!list?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {list.map((x, i) => (
          <li key={i} style={{ fontSize: 13, color: CP.textPrimary, lineHeight: 1.45 }}>
            {x.titolo}{x.motivo && <span style={{ color: CP.textSecondary }}> — {x.motivo}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RedazioneVideo({ pid }) {
  const url = `/api/admin/studio-social/${encodeURIComponent(pid)}/redazione`;
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(null);

  const title = "La redazione";
  if (isLoading) return (<><SectionTitle>{title}</SectionTitle><div style={{ fontSize: 14, color: CP.textMuted, marginBottom: 24 }}>Caricamento…</div></>);
  if (error) return (<><SectionTitle>{title}</SectionTitle><div style={{ marginBottom: 24 }}><Notice danger>{`Errore nel caricamento: ${error.message}`}</Notice></div></>);

  const giri = data?.giri || [];
  const t = data?.totals || {};
  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle aside={t.ultimo ? `ultimo giro ${fmtDay(t.ultimo)}` : null}>{title}</SectionTitle>
      <Squadra team={data?.team || []} work={data?.work || {}} />
      <Percorso steps={data?.funnel || []} />
      {giri.length === 0 ? (
        <EmptyState title="Nessun giro registrato">
          Ogni giro di montaggio si registra alla fine, con cosa è stato montato, cosa ha scartato il revisore e perché. Da lì si vede il lavoro della squadra e si confrontano i giri.
        </EmptyState>
      ) : giri.map((g) => {
        const isOpen = open === g.n;
        return (
          <Disclosure key={g.n} open={isOpen} onToggle={() => setOpen(isOpen ? null : g.n)}
            title={`${g.titolo} · ${fmtDay(g.day)}`}
            summary={`${g.tenuti} tenuti su ${g.montati}${g.revisioni ? ` · ${g.revisioni} passaggi del revisore` : ""}`}>
            <div style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>
              {g.tenuti} tenuti su {g.montati} montati{g.revisioni ? `, dopo ${g.revisioni} ${g.revisioni === 1 ? "passaggio" : "passaggi"} del revisore` : ""}{g.cartella ? ` · cartella «${g.cartella}»` : ""}
            </div>
            <Lista title="Scartati dal revisore" list={g.scartati} />
            <Lista title="Fermati prima del montaggio" list={g.fermati} />
          </Disclosure>
        );
      })}
      <Spiega style={{ marginTop: 4 }}>
        La squadra lavora a giri: il direttore creativo sceglie le idee dal girato, il montaggio le monta, il revisore guarda ogni video e scarta quello che ha un errore o non si può pubblicare. Quello che resta finisce nel Banco montaggi, dove una persona sceglie cosa pubblicare; «Cosa ha funzionato» misura cosa è uscito.
        La riga dei numeri segue lo stesso percorso: quanto lavoro arriva fino a un reel che va sopra il solito. «Sopra il solito» conta solo i reel collegati al loro video e già misurati a 7 giorni.
      </Spiega>
    </div>
  );
}
