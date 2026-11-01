"use client";

// Creator AI (01/11/2026) — gli studi su Fanvue e la mappa delle creator AI italiane. Sezione privata:
// il file non contiene dati, arrivano da /api/admin/creator-ai solo al titolare. Ogni studio è fatto di
// blocchi (testo, numeri, tabella, spiegazione), così uno nuovo si aggiunge al KV senza toccare la pagina.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Tabs, Metric, DataTable, Notice, SectionTitle, EmptyState, FilterBar, Segmented, Spiega } from "@/components/ds";
import { fmtInt } from "@/lib/format";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const money = (n) => (n ? `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
const muted = { fontSize: 12, color: CP.textMuted };
const para = { fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, margin: "0 0 12px", maxWidth: 780 };
const linkStyle = { color: CP.accentSoftText, textDecoration: "underline", textUnderlineOffset: 2 };
const searchStyle = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body, minWidth: 200 };

function Ext({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{children}</a>;
}

function Blocco({ b }) {
  if (b.tipo === "testo") return <p style={para}>{b.testo}</p>;
  if (b.tipo === "metriche") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, margin: "0 0 18px" }}>
        {b.voci.map((v) => <Metric key={v.l} label={v.l} value={v.v} note={v.n} />)}
      </div>
    );
  }
  if (b.tipo === "tabella") {
    const columns = b.colonne.map((c, i) => ({
      key: c.k, label: c.l, align: c.right ? "right" : undefined, sortable: false,
      render: i === 0 ? (r) => <span style={{ color: CP.textPrimary }}>{r[c.k]}</span> : undefined,
    }));
    return (
      <div style={{ margin: "0 0 18px" }}>
        {b.titolo && <SectionTitle>{b.titolo}</SectionTitle>}
        <DataTable columns={columns} rows={b.righe.map((r, i) => ({ ...r, id: i }))} minWidth={Math.max(420, b.colonne.length * 150)} />
        {b.nota && <p style={{ ...muted, margin: "8px 0 0", maxWidth: 780 }}>{b.nota}</p>}
      </div>
    );
  }
  if (b.tipo === "spiega") {
    return (
      <Spiega label={b.titolo || "Come si legge"} style={{ margin: "0 0 18px" }}>
        {b.testo.map((t) => <span key={t}>{t}</span>)}
      </Spiega>
    );
  }
  if (b.tipo === "avviso") return <div style={{ margin: "0 0 18px" }}><Notice>{b.testo}</Notice></div>;
  if (b.tipo === "fonti") {
    return (
      <p style={{ ...muted, margin: "4px 0 0" }}>
        Fonti: {b.voci.map((f, i) => <span key={f.u}>{i > 0 && " · "}<Ext href={f.u}>{f.l}</Ext></span>)}
      </p>
    );
  }
  return null;
}

function Italia({ dati }) {
  const [vista, setVista] = useState("tutte");
  const [cerca, setCerca] = useState("");
  const conIg = dati.righe.filter((r) => r.ig);
  const inIt = dati.righe.filter((r) => r.voce === "italiano");
  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return dati.righe
      .filter((r) => (vista === "instagram" ? r.ig : vista === "italiano" ? r.voce === "italiano" : true))
      .filter((r) => !q || `${r.n} ${r.u} ${r.ig || ""} ${r.loc || ""}`.toLowerCase().includes(q))
      .map((r) => ({ ...r, id: r.u }));
  }, [dati.righe, vista, cerca]);
  const columns = [
    { key: "n", label: "Creator", render: (r) => <span><Ext href={`https://www.fanvue.com/${r.u}`}>{r.n}</Ext><br /><span style={muted}>{r.u}</span></span> },
    { key: "ig", label: "Instagram", render: (r) => (r.ig
      ? <span title={r.igpr}><Ext href={`https://www.instagram.com/${r.ig}/`}>@{r.ig}</Ext><br /><span style={muted}>{r.igst === "confermato" ? "Confermato" : "Da verificare"}</span></span>
      : <span style={muted}>Non trovato</span>) },
    { key: "igfo", label: "Follower IG", align: "right", render: (r) => (r.igfo == null ? "—" : fmtInt(r.igfo)) },
    { key: "lk", label: "Like Fanvue", align: "right", render: (r) => fmtInt(r.lk) },
    { key: "po", label: "Post", align: "right", render: (r) => fmtInt(r.po) },
    { key: "pr", label: "Prezzo", align: "right", render: (r) => money(r.pr) },
    { key: "pm", label: "Promozione", render: (r) => r.pm || "—" },
    { key: "voce", label: "Scrive in", render: (r) => (r.voce === "italiano" ? "Italiano" : "Inglese") },
    { key: "loc", label: "Luogo dichiarato", render: (r) => r.loc || "—" },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, margin: "0 0 16px" }}>
        <Metric label="Creator AI legate all'Italia" value={fmtInt(dati.righe.length)} />
        <Metric label="Scrivono in italiano" value={fmtInt(inIt.length)} />
        <Metric label="Con Instagram trovato" value={fmtInt(conIg.length)} note={`${conIg.filter((r) => r.igst === "confermato").length} confermati`} />
      </div>
      {dati.note.map((t) => <p key={t} style={para}>{t}</p>)}
      <Spiega style={{ margin: "0 0 16px" }}>
        {dati.spiega.map((t) => <span key={t}>{t}</span>)}
      </Spiega>
      <FilterBar onReset={vista !== "tutte" || cerca ? () => { setVista("tutte"); setCerca(""); } : undefined}>
        <Segmented value={vista} onChange={setVista} items={[["tutte", `Tutte ${dati.righe.length}`], ["instagram", `Con Instagram ${conIg.length}`], ["italiano", `In italiano ${inIt.length}`]]} />
        <input aria-label="Cerca una creator" placeholder="Cerca nome o luogo" value={cerca} onChange={(e) => setCerca(e.target.value)} style={searchStyle} />
      </FilterBar>
      <DataTable columns={columns} rows={righe} defaultSort={{ key: "lk", dir: -1 }} minWidth={1080} maxHeight={640} empty="Nessuna creator con questi filtri." />
    </>
  );
}

export default function CreatorAiPage() {
  const { data, error, isLoading } = useSWR("/api/admin/creator-ai", fetcher, { revalidateOnFocus: false });
  const studi = data?.studi || [];
  const [tab, setTab] = useState(null);
  const items = [...studi.map((s) => [s.id, s.titolo]), ...(data?.italia ? [["italia", "Mappa Italia"]] : [])];
  const open = tab || items[0]?.[0];
  const studio = studi.find((s) => s.id === open);
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px 64px", fontFamily: FONTS.body }}>
      <PageHead title="Creator AI" subtitle={data?.aggiornato ? `Studi e mappature, aggiornati al ${data.aggiornato}` : "Studi e mappature"} />
      {isLoading && <p style={muted}>Caricamento…</p>}
      {error && <Notice danger>{error.message}</Notice>}
      {data && !items.length && <EmptyState title="Nessuno studio ancora">Gli studi compaiono qui appena vengono caricati.</EmptyState>}
      {items.length > 0 && <Tabs items={items} value={open} onChange={setTab} />}
      {studio && (
        <>
          {studio.sintesi && <p style={{ ...para, color: CP.textPrimary, fontSize: 15 }}>{studio.sintesi}</p>}
          {studio.blocchi.map((b, i) => <Blocco key={i} b={b} />)}
        </>
      )}
      {open === "italia" && data?.italia && <Italia dati={data.italia} />}
    </div>
  );
}
