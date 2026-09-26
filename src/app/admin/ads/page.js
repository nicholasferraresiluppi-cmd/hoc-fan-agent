"use client";

// Ads · Acquisizione — hub dell'area Ads. Primo contenuto: lo studio bio-funnel OF
// (analisi + metodologia + template + classifica live delle 112 landing). Vista SEED.
// Materiale di acquisizione: non entra in score/comp.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
import { ExternalLink, Megaphone, FlaskConical, Trophy, Target } from "lucide-react";

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

function scoreColor(w) {
  if (w >= 80) return CP.accentGreen;
  if (w >= 68) return "#9bd67a";
  if (w >= 52) return "#e8c069";
  if (w >= 38) return "#e79a6a";
  return CP.accentRed;
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: CP.surface,
        border: `1px solid ${CP.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "26px 0 12px" }}>
      {Icon && <Icon size={17} strokeWidth={1.8} color={CP.accent} />}
      <h2 style={{ margin: 0, fontSize: 16, color: CP.textPrimary, fontFamily: FONTS.display }}>{children}</h2>
    </div>
  );
}

const dom = (u) => String(u).replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

export default function AdsPage() {
  const { data, error, isLoading } = useSWR("/api/admin/ads/funnel-study", fetcher, {
    revalidateOnFocus: false,
  });
  const [showAll, setShowAll] = useState(false);

  const scored = data?.scored || [];
  const visible = useMemo(() => (showAll ? scored : scored.slice(0, 20)), [scored, showAll]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 4px 80px" }}>
      <PageHeader
        section="Ads · Acquisizione"
        title="Studio bio-funnel OnlyFans"
        subtitle="Come lavorano gli altri sulla landing-ponte, e cosa (secondo i dati) converte meglio. Materiale di acquisizione — non entra in score/comp."
      />

      {error && (
        <Card style={{ borderColor: `${CP.accentRed}66`, marginTop: 14 }}>
          <span style={{ color: CP.accentRed, fontSize: 13 }}>Errore: {String(error.message)} (serve accesso SEED).</span>
        </Card>
      )}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 14 }}>Carico lo studio…</div>}

      {data && (
        <>
          {/* Intro + caveat onesto */}
          <Card style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <Megaphone size={22} strokeWidth={1.6} color={CP.accent} />
            <div style={{ flex: "1 1 320px" }}>
              <div style={{ color: CP.textSecondary, fontSize: 13.5, lineHeight: 1.5 }}>{data.meta.summary}</div>
              <div style={{ color: CP.textMuted, fontSize: 12, marginTop: 6 }}>
                <b style={{ color: CP.accentSoftText }}>Onestà:</b> {data.meta.caveat}
              </div>
            </div>
            <div style={{ display: "flex", gap: 18 }}>
              <Stat n={data.meta.count} label="landing" />
              <Stat n={data.platforms.length} label="piattaforme" />
              <Stat n={`${data.scored[0]?.weighted ?? "—"}`} label="top score" />
            </div>
          </Card>

          {/* Metodologia — come viene fatta */}
          <SectionTitle icon={FlaskConical}>Come viene fatta la ricerca</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            {data.methodology.map((m) => (
              <Card key={m.title}>
                <div style={{ color: CP.textPrimary, fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{m.title}</div>
                <div style={{ color: CP.textMuted, fontSize: 12.5, lineHeight: 1.5 }}>{m.body}</div>
              </Card>
            ))}
          </div>

          {/* Anatomia: vincenti vs perdenti */}
          <SectionTitle icon={Target}>Anatomia — cosa converte, cosa no</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
            <Card style={{ borderColor: `${CP.accentGreen}44` }}>
              <div style={{ color: CP.accentGreen, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>I tratti dei vincenti</div>
              <BulletList items={data.winning} />
            </Card>
            <Card style={{ borderColor: `${CP.accentRed}44` }}>
              <div style={{ color: CP.accentRed, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>I pattern perdenti</div>
              <BulletList items={data.losing} />
            </Card>
          </div>

          {/* Classifica piattaforme + template */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginTop: 12 }}>
            <div>
              <SectionTitle icon={Trophy}>Classifica per piattaforma</SectionTitle>
              <Card>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>Piattaforma</Th>
                      <Th align="right">Media</Th>
                      <Th align="right">n</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.platforms.map((p) => (
                      <tr key={p.platform}>
                        <Td>{p.platform}</Td>
                        <Td align="right" style={{ color: scoreColor(p.avg), fontWeight: 700 }}>{Math.round(p.avg)}</Td>
                        <Td align="right" style={{ color: CP.textMuted }}>{p.n}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ color: CP.textMuted, fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>
                  La piattaforma non fa il funnel, ma alcune lo ostacolano (link-dump) e altre lo abilitano (hero + CTA singola).
                </div>
              </Card>
            </div>
            <div>
              <SectionTitle icon={Megaphone}>Template consigliato (creator HOC)</SectionTitle>
              <Card>
                <ol style={{ margin: 0, paddingLeft: 18, color: CP.textSecondary, fontSize: 12.5, lineHeight: 1.55 }}>
                  {data.template.map((t, i) => (
                    <li key={i} style={{ marginBottom: 5 }}>{t}</li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>

          {/* Classifica live delle landing */}
          <SectionTitle icon={Trophy}>Le {scored.length} landing, dalla migliore alla peggiore</SectionTitle>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th align="right">Score</Th>
                    <Th>Landing</Th>
                    <Th>Verdetto</Th>
                    <Th>Fix #1</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.rank} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                      <Td style={{ color: CP.textMuted, whiteSpace: "nowrap" }}>{r.rank}</Td>
                      <Td align="right">
                        <span style={{ color: CP.accentInk, background: scoreColor(r.weighted), borderRadius: 6, padding: "1px 8px", fontWeight: 800, fontSize: 12.5 }}>
                          {r.weighted}
                        </span>
                      </Td>
                      <Td>
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: CP.accentSoftText, textDecoration: "none", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                          {dom(r.url)} <ExternalLink size={12} />
                        </a>
                      </Td>
                      <Td style={{ color: CP.textSecondary, fontSize: 12, maxWidth: 340, lineHeight: 1.4 }}>{r.verdict}</Td>
                      <Td style={{ color: CP.textMuted, fontSize: 11.5, maxWidth: 260, lineHeight: 1.4 }}>{r.topFix}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAll && scored.length > 20 && (
              <button
                onClick={() => setShowAll(true)}
                style={{ width: "100%", padding: "11px", background: CP.surfaceAlt, color: CP.textSecondary, border: "none", borderTop: `1px solid ${CP.border}`, cursor: "pointer", fontSize: 12.5 }}
              >
                Mostra tutte le {scored.length}
              </button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: CP.textPrimary, fontSize: 20, fontWeight: 700, fontFamily: FONTS.mono }}>{n}</div>
      <div style={{ color: CP.textMuted, fontSize: 11 }}>{label}</div>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: CP.textSecondary, fontSize: 12.5, lineHeight: 1.5 }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: 5 }}>{it}</li>
      ))}
    </ul>
  );
}

function Th({ children, align }) {
  return (
    <th style={{ textAlign: align || "left", padding: "10px 12px", color: CP.textMuted, fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

function Td({ children, align, style }) {
  return (
    <td style={{ textAlign: align || "left", padding: "9px 12px", verticalAlign: "top", ...style }}>{children}</td>
  );
}
