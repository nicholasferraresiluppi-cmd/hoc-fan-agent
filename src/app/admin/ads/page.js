"use client";

// Ads · Acquisizione — hub dell'area Ads. Primo contenuto: lo studio bio-funnel OF
// (analisi + metodologia + template + classifica live delle 112 landing). Vista SEED.
// Materiale di acquisizione: non entra in score/comp.
//
// Redesign 26/09/2026 sul design system: prima si leggeva il METODO e solo in fondo
// cosa fare. Ora l'ordine è quello di chi decide: conclusione e modello per le nostre
// creator → cosa funziona / cosa no → piattaforme → classifica completa (una tabella
// ordinabile che scorre dentro di sé, al posto di "prime 20 + mostra tutte") →
// metodo e criteri su richiesta. Punteggi senza la scala a 5 colori: rosso solo
// sulle landing deboli. Avvertenza sul valore dello studio in testa, non in piccolo.

import { useState } from "react";
import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Metric, Notice, Disclosure, DataTable, SectionTitle, card } from "@/components/ds";

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const WEAK = 40;
const dom = (u) => String(u).replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
const n1 = (v) => Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 });

export default function AdsPage() {
  const { data, error, isLoading } = useSWR("/api/admin/ads/funnel-study", fetcher, { revalidateOnFocus: false });
  const [methodOpen, setMethodOpen] = useState(false);

  const scored = data?.scored || [];
  const keyFinding = (data?.winning || []).find((w) => /fattore #1/i.test(w));
  const median = scored.length ? [...scored].map((r) => r.weighted).sort((a, b) => a - b)[Math.floor(scored.length / 2)] : null;

  const landingCols = [
    { key: "rank", label: "#", align: "right", render: (r) => <span style={{ color: CP.textMuted }}>{r.rank}</span> },
    {
      key: "url", label: "Landing", sort: (r) => dom(r.url),
      render: (r) => (
        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: CP.accentSoftText, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          {dom(r.url)} <ExternalLink size={12} />
        </a>
      ),
    },
    { key: "weighted", label: "Punteggio", align: "right", render: (r) => <span style={{ color: r.weighted < WEAK ? CP.accentRed : CP.textPrimary, fontWeight: 500 }}>{n1(r.weighted)}</span> },
    { key: "verdict", label: "Giudizio", sortable: false, render: (r) => <div style={{ minWidth: 280, maxWidth: 420, fontSize: 13, color: CP.textSecondary, lineHeight: 1.45, whiteSpace: "normal" }}>{r.verdict}</div> },
    { key: "topFix", label: "La prima cosa da correggere", sortable: false, render: (r) => <div style={{ minWidth: 240, maxWidth: 340, fontSize: 12.5, color: CP.textMuted, lineHeight: 1.45, whiteSpace: "normal" }}>{r.topFix}</div> },
  ];
  const platformCols = [
    { key: "platform", label: "Piattaforma" },
    { key: "avg", label: "Punteggio medio", align: "right", render: (p) => <span style={{ color: p.avg < WEAK ? CP.accentRed : CP.textPrimary }}>{fmtInt(p.avg)}</span> },
    { key: "n", label: "Landing", align: "right" },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Marketing" }, { label: "Studio bio-funnel" }]}
        title="Studio bio-funnel OnlyFans"
        subtitle="Cosa convince chi arriva dalla bio di un social a iscriversi su OnlyFans, studiato su landing reali di altre creator. Serve a decidere come costruire la pagina-ponte delle nostre creator."
      />

      {error && <Notice danger>Non riesco a caricare lo studio: {String(error.message)}. La pagina è riservata agli admin.</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Carico lo studio…</div>}

      {data && (
        <>
          <Notice>
            Da leggere come giudizio esperto, non come misura: {data.meta.caveat} Prima di cambiare le landing delle nostre creator, conviene provare la modifica su una creator con un test A/B.
          </Notice>

          <section style={{ ...card, padding: "18px 20px", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: CP.textSecondary }}>La conclusione principale</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.35, margin: "4px 0 14px", maxWidth: 820 }}>
              {keyFinding || data.meta.summary}
            </div>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Landing analizzate" value={fmtInt(data.meta.count)} note={data.meta.capturedAt ? `raccolte il ${data.meta.capturedAt.split("-").reverse().join("/")}` : null} />
              <Metric label="Piattaforme confrontate" value={fmtInt(data.platforms.length)} note="con almeno 3 landing" />
              <Metric label="Punteggio migliore" value={`${n1(scored[0]?.weighted ?? 0)} / 100`} />
              {median != null && <Metric label="Punteggio a metà classifica" value={`${n1(median)} / 100`} />}
            </div>
          </section>

          <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
            <SectionTitle aside="per le creator HOC, in ordine dall’alto della pagina">Il modello da seguire</SectionTitle>
            <ol style={{ margin: 0, paddingLeft: 20, color: CP.textPrimary, fontSize: 14, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 6 }}>
              {data.template.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, marginBottom: 14 }}>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Cosa hanno le landing migliori</SectionTitle>
              <BulletList items={data.winning} />
            </section>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Cosa hanno le peggiori</SectionTitle>
              <BulletList items={data.losing} />
            </section>
          </div>

          <SectionTitle aside="la piattaforma non fa il funnel, ma alcune lo ostacolano (elenchi di link tutti uguali) e altre lo aiutano (foto grande + un solo bottone)">Piattaforme a confronto</SectionTitle>
          <div style={{ marginBottom: 20, maxWidth: 560 }}>
            <DataTable columns={platformCols} rows={data.platforms.map((p) => ({ ...p, id: p.platform }))} defaultSort={{ key: "avg", dir: -1 }} minWidth={320} />
          </div>

          <SectionTitle aside={`punteggio 0-100, in rosso sotto ${WEAK} · clicca un’intestazione per ordinare`}>Tutte le {fmtInt(scored.length)} landing, dalla migliore</SectionTitle>
          <div style={{ marginBottom: 20 }}>
            <DataTable columns={landingCols} rows={scored.map((r) => ({ ...r, id: r.rank }))} defaultSort={{ key: "rank", dir: 1 }} minWidth={980} maxHeight={640} />
          </div>

          <Disclosure open={methodOpen} onToggle={() => setMethodOpen(!methodOpen)} title="Come è stata fatta la ricerca" summary="raccolta, foto, giudizio, sintesi · criteri e pesi">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
              {data.methodology.map((m) => (
                <div key={m.title}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, marginBottom: 4 }}>{m.title}</div>
                  <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{m.body}</div>
                </div>
              ))}
            </div>
            {Array.isArray(data.rubric) && data.rubric.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 6 }}>Criteri del punteggio e quanto pesano</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.rubric.map((c) => (
                    <span key={c.key} style={{ padding: "4px 10px", borderRadius: 6, background: CP.surfaceAlt, fontSize: 13, color: CP.textPrimary }}>
                      {c.label} <span style={{ color: CP.textMuted }}>{Math.round(c.weight * 100)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Disclosure>
        </>
      )}
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: CP.textSecondary, fontSize: 13.5, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}
