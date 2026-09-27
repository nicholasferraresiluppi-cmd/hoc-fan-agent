"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { CREATOR_PERSONAS } from "@/lib/creator-personas";
import { PageHead, SectionTitle, Notice, card, NUM } from "@/components/ds";

// Ridisegno sul design system 26/09/2026: stessa fonte (/api/profile), stessi
// requisiti e stessa barra di avanzamento (sulle sessioni). Tolte le medaglie
// emoji e i colori bronzo/argento/oro: il livello si legge a parole.

const LEVEL_META = {
  0: { label: "Nessun livello ancora" },
  1: { label: "L1 Base" },
  2: { label: "L2 Expert" },
  3: { label: "L3 Master" },
};

const REQUIREMENTS = [
  { level: 1, sessions: 10, avg: 65 },
  { level: 2, sessions: 25, avg: 75 },
  { level: 3, sessions: 50, avg: 85 },
];

export default function CertificationsPage() {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/profile");
        const j = await r.json();
        setCerts(j?.certifications || []);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1100, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Academy", href: "/" }, { label: "Certificazioni" }]}
        title="Le mie certificazioni"
        subtitle="Una certificazione per ogni creator. Ognuna ha il suo tono e le sue dinamiche: la certificazione dimostra che sai gestirla. Si ottiene allenandosi nel simulatore e resta per sempre."
      />

      <section style={{ ...card, padding: "14px 18px", marginBottom: 20 }}>
        <SectionTitle>Cosa serve per ogni livello</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {REQUIREMENTS.map((r) => (
            <div key={r.level} style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, ...NUM }}>
              <div style={{ fontWeight: 500, color: CP.textPrimary }}>{LEVEL_META[r.level].label}</div>
              Almeno {r.sessions} sessioni con quella creator e punteggio medio almeno {r.avg}
            </div>
          ))}
        </div>
      </section>

      {loading && <p style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</p>}
      {/* Le certificazioni seguono le creator che hanno un personaggio nel simulatore
          (lib/creator-personas). Senza questa nota un operatore vedeva
          "creator che non sono le mie" e pensava a un errore (pannello tester 26/09). */}
      <Notice>
        Le certificazioni si ottengono nel simulatore, e oggi il simulatore ha i personaggi di {CREATOR_PERSONAS.length} creator: {CREATOR_PERSONAS.map((c) => c.name).join(", ")}. Se lavori su altre creator, allenarti su queste vale comunque: le tecniche sono le stesse. Le altre creator arriveranno.
      </Notice>
      {!loading && failed && <Notice danger>Errore di rete: le certificazioni non si sono caricate. Riprova tra poco.</Notice>}
      {!loading && !failed && certs.length === 0 && (
        <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary }}>
          Nessuna certificazione da mostrare per ora. Allenati nel simulatore con una creator per iniziare il percorso.
        </div>
      )}

      {!loading && certs.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {certs.map((c) => {
            const meta = LEVEL_META[c.level] || LEVEL_META[0];
            const nextLevel = REQUIREMENTS.find((r) => r.level === c.level + 1);
            const progressSess = nextLevel ? Math.min(100, Math.round((c.stats.sessions / nextLevel.sessions) * 100)) : 100;
            const achieved = c.level > 0;
            return (
              <article key={c.creatorId} style={{ ...card, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>
                      {c.creatorName}
                      {c.creatorArchetype && <span style={{ color: CP.textMuted, fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{c.creatorArchetype}</span>}
                    </h2>
                    <div style={{ marginTop: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                        background: achieved ? CP.accentSoft : CP.surfaceAlt, color: achieved ? CP.accentSoftText : CP.textMuted }}>
                        {achieved && <Award size={13} />}{meta.label}
                      </span>
                    </div>
                    {c.achievedAt && achieved && (
                      <div style={{ color: CP.textMuted, fontSize: 12, marginTop: 6 }}>
                        Ottenuta il {new Date(c.achievedAt).toLocaleDateString("it-IT")}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", color: CP.textSecondary, fontSize: 13, lineHeight: 1.5, ...NUM }}>
                    <div>{c.stats.sessions} sessioni</div>
                    <div>punteggio medio {c.stats.avgOverall}</div>
                  </div>
                </div>

                {nextLevel && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontSize: 12, color: CP.textMuted, marginBottom: 6, ...NUM }}>
                      <span>Prossimo livello: {LEVEL_META[nextLevel.level].label}</span>
                      <span>Sessioni {c.stats.sessions} su {nextLevel.sessions} · punteggio medio {c.stats.avgOverall} su {nextLevel.avg}</span>
                    </div>
                    <div role="progressbar" aria-valuenow={progressSess} aria-valuemin={0} aria-valuemax={100} aria-label="Sessioni verso il prossimo livello"
                      style={{ height: 6, background: CP.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${progressSess}%`, background: CP.scale, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
