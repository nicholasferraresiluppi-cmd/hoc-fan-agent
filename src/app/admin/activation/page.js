"use client";

/**
 * /admin/activation — attivazione operatore (leading indicator).
 *
 * Mostra la coorte per la definizione "gap diagnosticato + allenato"
 * (src/lib/activation.js): funnel aha→attivato, activation rate, latenza.
 * SEED. Finché nessun operatore è onboardato la coorte è vuota: la pagina
 * dichiara cosa misura e resta in attesa di dati (onestà, non finta metrica).
 *
 * Redesign 26/09/2026: numero principale = attivati sulla coorte, con i passi
 * del percorso accanto; gergo tradotto (aha, leading indicator, north-star,
 * magic-number, Kirkpatrick); la riga senza nome ora dice perché; il "come si
 * convalida" è su richiesta. Soglie sempre lette dal config, mai scritte a mano.
 */
import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt, fmtPct } from "@/lib/format";
import { PageHead, HeroMetric, Metric, Notice, Disclosure, DataTable, SectionTitle, card } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || "Errore"), { status: r.status });
  return j;
};

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtLatency(ms) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  if (h < 24) return `${h.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ore`;
  return `${(h / 24).toLocaleString("it-IT", { maximumFractionDigits: 1 })} giorni`;
}

export default function ActivationPage() {
  const { data, error, isLoading } = useSWR("/api/admin/activation", fetcher, { revalidateOnFocus: false });
  const [whyOpen, setWhyOpen] = useState(false);

  const cfg = data?.config;
  const rate = data?.activationRate;
  const cohort = data?.cohortSize ?? 0;
  const members = data?.members || [];

  const columns = [
    { key: "employee", label: "Operatore", render: (m) => m.employee || <span style={{ color: CP.textMuted }} title="Ha usato l’app ma non ha ancora aperto una pagina che lo collega al suo nome operatore">Non ancora collegato a un operatore</span>, sort: (m) => m.employee || "" },
    { key: "firstSeen", label: "Primo accesso", render: (m) => fmtDate(m.firstSeen), sort: (m) => m.firstSeen ?? 0 },
    { key: "ahaReached", label: "Ha visto il suo punto debole", align: "right", render: (m) => m.ahaReached ? "sì" : <span style={{ color: CP.textMuted }}>non ancora</span>, sort: (m) => (m.ahaReached ? 1 : 0) },
    { key: "gapScenariosInWindow", label: "Allenamenti su quel punto", align: "right", render: (m) => `${fmtInt(m.gapScenariosInWindow)} di ${cfg?.minGapScenarios ?? "…"}` },
    { key: "activated", label: "Attivato", align: "right", render: (m) => m.activated ? <span style={{ color: CP.accentGreen }}>sì</span> : <span style={{ color: CP.textMuted }}>non ancora</span>, sort: (m) => (m.activated ? 1 : 0) },
    { key: "latencyMs", label: "In quanto tempo", align: "right", render: (m) => fmtLatency(m.latencyMs), sort: (m) => m.latencyMs ?? null },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Onboarding" }, { label: "Attivazione operatori" }]}
        title="Attivazione operatori"
        subtitle="Quanti operatori nuovi arrivano al primo risultato che conta: vedono il loro punto debole reale e lo allenano subito nel simulatore. È un segnale precoce di chi resterà e renderà; serve a capire se l’avvio in app funziona."
      />

      {error && error.status === 403 && <Notice>Serve un accesso admin per questa vista.</Notice>}
      {error && error.status !== 403 && <Notice danger>Non riesco a caricare i dati: {error.message}. Riprova tra poco.</Notice>}
      {data?.error && <Notice danger>{data.error} I numeri qui sotto potrebbero essere incompleti.</Notice>}
      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && (
        <>
          <HeroMetric
            label="Operatori attivati"
            value={`${fmtInt(data.activatedCount ?? 0)} su ${fmtInt(cohort)}`}
            compare={rate == null ? "Percentuale non ancora calcolabile: servono operatori che usano l’app" : `${fmtPct(rate)} di chi ha usato l’app`}
            hint="Conta chi ha già usato l’app almeno una volta."
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Metric label="Hanno usato l’app" value={fmtInt(cohort)} note="almeno un’azione registrata" />
              <Metric label="Hanno visto il punto debole" value={fmtInt(data.ahaCount ?? 0)} note="aperto il proprio profilo" />
              <Metric label="Attivati" value={fmtInt(data.activatedCount ?? 0)} note="visto e allenato" />
            </div>
          </HeroMetric>

          <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
            <SectionTitle aside={cfg?.version ? `versione ${cfg.version}` : null}>Quando un operatore conta come attivato</SectionTitle>
            <p style={{ margin: 0, fontSize: 14, color: CP.textPrimary, lineHeight: 1.6 }}>
              Entro {cfg?.windowDays ?? "…"} giorni da quando vede nel suo profilo un punto debole reale, completa almeno {cfg?.minGapScenarios ?? "…"} scenari del simulatore che allenano proprio quel punto, con un punteggio di almeno {cfg?.minOverall ?? "…"} su 100.
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: CP.textMuted, lineHeight: 1.55 }}>
              Queste soglie sono provvisorie{cfg?.derived === false ? " (non ancora ricavate dai dati)" : ""}: quando ci saranno abbastanza operatori si sceglieranno quelle che separano meglio chi poi migliora davvero da chi no.
            </p>
          </section>

          {cohort === 0 ? (
            <Notice>
              Nessun operatore ha ancora usato l’app, quindi qui non c’è nulla da contare. Il conteggio è già attivo: registra quando un operatore apre il suo profilo, completa uno scenario, conferma un coaching o apre il suo turno. Appena entrano i primi operatori la tabella si riempie da sola.
            </Notice>
          ) : (
            <>
              <SectionTitle aside={`${fmtInt(members.length)} operatori, dal più recente`}>Chi è a che punto</SectionTitle>
              <div style={{ marginBottom: 14 }}>
                <DataTable columns={columns} rows={members.map((m, i) => ({ ...m, id: `${m.employee || "anon"}-${i}` }))} minWidth={760} maxHeight={560} empty="Nessun operatore." />
              </div>
            </>
          )}

          <Disclosure open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} title="Perché questa misura e come si verifica" summary="non conta il tour, conta il primo allenamento mirato">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><span style={{ color: CP.textPrimary }}>Si misura l’attivazione, non il tour.</span> Non conta “ha finito la guida”: conta se ha collegato un punto debole vero ad allenamento su quel comportamento.</li>
              <li><span style={{ color: CP.textPrimary }}>Si verifica sul lavoro vero.</span> Per chi è attivato, controlliamo se dopo 30-60 giorni quel punto debole migliora davvero nelle chat reali. È quello il risultato che conta; questo numero serve solo ad accorgersene prima.</li>
              <li><span style={{ color: CP.textPrimary }}>Non va “spinto”.</span> Se si forzassero gli operatori a fare scenari per far salire il numero, il numero salirebbe senza che nessuno migliori. Si legge, non si insegue.</li>
              <li><span style={{ color: CP.textPrimary }}>Le soglie si ricavano dai dati.</span> {cfg?.windowDays ?? "…"} giorni e {cfg?.minGapScenarios ?? "…"} scenari sono un punto di partenza: la combinazione giusta si trova quando ci sono abbastanza operatori da confrontare.</li>
            </ul>
          </Disclosure>
        </>
      )}
    </div>
  );
}
