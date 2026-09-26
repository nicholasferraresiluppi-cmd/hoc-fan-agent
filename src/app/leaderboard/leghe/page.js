"use client";

// Leghe di allenamento (redesign 26/09/2026 sul design system).
// Stessa API (/api/leagues/standings) e stessa logica: fasce per posizione nel
// mese, minimo 5 sessioni. Cambia la presentazione: una tabella per fascia sul
// DataTable del DS, la propria riga evidenziata, niente colori-metallo scritti
// a mano (oro/argento/bronzo non erano token e non seguivano il tema).
import { useEffect, useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, DataTable, Notice, NUM } from "@/components/ds";

const TIER_ORDER = ["diamond", "platinum", "gold", "silver", "bronze"];
const TIER_META = {
  diamond: { label: "Diamond", hint: "il 10% più alto del mese" },
  platinum: { label: "Platinum" },
  gold: { label: "Gold" },
  silver: { label: "Silver" },
  bronze: { label: "Bronze" },
  unranked: { label: "Non in classifica" },
};

function Trend({ delta }) {
  if (delta == null) return <span style={{ color: CP.textMuted }}>—</span>;
  if (delta > 0) return <span style={{ color: CP.accentGreen, ...NUM }}>↑ +{delta}</span>;
  if (delta < 0) return <span style={{ color: CP.accentRed, ...NUM }}>↓ {delta}</span>;
  return <span style={{ color: CP.textMuted }}>=</span>;
}

export default function LeaguesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/leagues/standings");
        const j = await r.json();
        setData(j);
      } catch {
        setFailed(true);
      } finally { setLoading(false); }
    })();
  }, []);

  const columns = (me) => [
    { key: "rank", label: "#", align: "right", render: (e) => <span style={{ color: CP.textMuted }}>{e.rank ?? "—"}</span> },
    {
      key: "name", label: "Operatore",
      render: (e) => (
        <span>
          {e.name}
          {e.userId === me && <span style={{ marginLeft: 8, color: CP.accentSoftText, fontSize: 12 }}>tu</span>}
        </span>
      ),
    },
    { key: "avgOverall", label: "Punteggio medio", align: "right" },
    { key: "sessions", label: "Sessioni", align: "right", muted: true },
    { key: "delta", label: "Andamento", align: "right", render: (e) => <Trend delta={e.delta} /> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Academy", href: "/" }, { label: "Classifica allenamento", href: "/leaderboard" }, { label: "Leghe" }]}
        title={data?.seasonKey ? `Leghe · stagione ${data.seasonKey}` : "Leghe"}
        subtitle="La classifica mensile degli allenamenti nel simulatore. Le fasce vanno per posizione nel mese: il 10% più alto è Diamond, poi Platinum, Gold, Silver e Bronze. Per entrare servono almeno 5 sessioni nel mese."
      />

      {loading && <Notice>Caricamento delle leghe…</Notice>}
      {!loading && (failed || data?.error) && <Notice danger>Non riesco a caricare le leghe{data?.error ? `: ${data.error}` : ""}. Riprova tra poco.</Notice>}

      {data && !loading && !data.error && data.totalRanked === 0 && (
        <Notice>Nessuno è ancora in classifica in questa stagione: servono almeno 5 sessioni nel mese.</Notice>
      )}

      {data && data.totalRanked > 0 && (
        <div style={{ display: "grid", gap: 22 }}>
          {TIER_ORDER.map((tier) => {
            const entries = data.byTier?.[tier] || [];
            if (!entries.length) return null;
            const meta = TIER_META[tier];
            return (
              <section key={tier}>
                <SectionTitle aside={[`${entries.length} ${entries.length === 1 ? "persona" : "persone"}`, meta.hint].filter(Boolean).join(" · ")}>{meta.label}</SectionTitle>
                <DataTable
                  columns={columns(data.me)}
                  rows={entries.map((e) => ({ ...e, id: e.userId }))}
                  defaultSort={{ key: "rank", dir: 1 }}
                  selected={(e) => e.userId === data.me}
                  minWidth={520}
                />
              </section>
            );
          })}

          {(data.byTier?.unranked || []).length > 0 && (
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>
              {data.byTier.unranked.length} {data.byTier.unranked.length === 1 ? "persona non è" : "persone non sono"} in classifica questo mese (meno di 5 sessioni).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
