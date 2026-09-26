"use client";

// Difficoltà creator — profilo del pubblico per creator (SEED).
// Il CONTESTO per leggere i numeri di un operatore: la stessa CVR è un risultato
// diverso su un pubblico caldo e su uno freddo. Questa tabella dice QUANTO è
// freddo ciascun pubblico — non giudica nessuno, e non entra in score/comp.

import { useState } from "react";
import useSWR from "swr";
import { CP } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

// r.json() con catch: una risposta d'errore può NON essere JSON (504 HTML del
// gateway, redirect Clerk) — senza il fallback l'utente vedrebbe "Unexpected token <".
const errText = (status) =>
  status === 401 || status === 403 ? "Sessione scaduta o permessi insufficienti." :
  status >= 500 ? "Calcolo fallito o troppo lungo — riprova." : "Errore.";
const fetcher = (url) =>
  fetch(url).then((r) =>
    r.ok
      ? r.json()
      : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))
  );

const fmtInt = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT"));
const fmtUsd = (v) => (v == null ? "—" : `$${Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const fmtUsd2 = (v) => (v == null ? "—" : `$${Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 })}`);
const fmtPct = (v) => (v == null ? "—" : `${(Number(v) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

// Scala dell'indice: alto = pubblico freddo (più difficile). Colori come
// temperatura invertita: freddo→blu, caldo→verde. Nessun rosso: qui non
// esistono colpe, solo contesti.
function indexColor(idx) {
  if (idx == null) return CP.textMuted;
  if (idx >= 67) return CP.accentBlue;
  if (idx >= 34) return CP.textSecondary;
  return CP.accentGreen;
}
function indexLabel(idx) {
  if (idx == null) return "n/d";
  if (idx >= 67) return "pubblico freddo";
  if (idx >= 34) return "nella media";
  return "pubblico caldo";
}

function IndexBadge({ idx }) {
  const c = indexColor(idx);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: c, fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "right" }}>
        {idx == null ? "—" : idx}
      </span>
      <span style={{ fontSize: 10.5, color: c, background: `${c}1a`, border: `1px solid ${c}44`, padding: "2px 8px", borderRadius: 999 }}>
        {indexLabel(idx)}
      </span>
    </span>
  );
}

const TH = ({ children, right, title }) => (
  <th
    title={title || ""}
    style={{
      textAlign: right ? "right" : "left",
      padding: "8px 10px",
      fontSize: 10.5,
      fontWeight: 500,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: CP.textMuted,
      borderBottom: `1px solid ${CP.borderSoft}`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </th>
);
const TD = ({ children, right, muted, strong }) => (
  <td
    style={{
      textAlign: right ? "right" : "left",
      padding: "9px 10px",
      fontSize: 12.5,
      color: muted ? CP.textMuted : strong ? CP.textPrimary : CP.textSecondary,
      borderBottom: `1px solid ${CP.borderSoft}`,
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    }}
  >
    {children}
  </td>
);

export default function CreatorDifficultyPage() {
  // revalidateOnFocus: false — su cache-miss il GET può lanciare una query
  // BigQuery: il ritorno di focus non deve poterla rilanciare (come operator-signals).
  const { data, error, isLoading, mutate } = useSWR("/api/admin/creator-difficulty", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/creator-difficulty", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || errText(r.status));
      mutate(d, { revalidate: false });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const profiles = data?.profiles || [];
  const paid = profiles.filter((p) => !p.free_page);
  const free = profiles.filter((p) => p.free_page);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 28px 60px" }}>
      <PageHeader
        section="Admin"
        title="Difficoltà creator"
        subtitle="Quanto è freddo il pubblico di ogni creator. È il contesto per leggere i numeri di un operatore — non un giudizio, e non entra in score né comp."
        toolbar={
          <button
            onClick={refresh}
            disabled={busy}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              color: CP.textSecondary,
              background: CP.surface,
              border: `1px solid ${CP.borderSoft}`,
              borderRadius: 8,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Ricalcolo…" : "Ricalcola ora"}
          </button>
        }
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 13, padding: 20 }}>Carico il profilo…</div>}
      {error && (
        <CpCard>
          <div style={{ color: CP.accentRed, fontSize: 13 }}>{String(error.message || error)}</div>
        </CpCard>
      )}
      {data && data.bigquery === false && (
        <CpCard>
          <div style={{ color: CP.textMuted, fontSize: 13 }}>BigQuery non configurato in questo ambiente.</div>
        </CpCard>
      )}
      {data && data.computing && (
        <CpCard>
          <div style={{ color: CP.textMuted, fontSize: 13 }}>
            Un calcolo è già in corso (lo ha avviato il cron o un altro admin) — ricarica tra un minuto.
          </div>
        </CpCard>
      )}
      {data && !data.computing && data.bigquery !== false && !error && !isLoading && profiles.length === 0 && (
        <CpCard>
          <div style={{ color: CP.textMuted, fontSize: 13, lineHeight: 1.6 }}>
            Nessun profilo calcolato: il warehouse non ha restituito creator per questa org
            {data.generated_at ? ` (ultimo calcolo ${new Date(data.generated_at).toLocaleString("it-IT")})` : ""}.
            Verifica lo scope org / i dati sorgente, poi usa &quot;Ricalcola ora&quot;.
          </div>
        </CpCard>
      )}

      {data && profiles.length > 0 && (
        <>
          {/* Come leggere — le regole di onestà, sempre visibili, mai solo nei commenti */}
          <CpCard style={{ marginBottom: 18 }}>
            <SectionLabel>Come leggere questa tabella</SectionLabel>
            <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.65, marginTop: 8 }}>
              L&apos;indice ordina i pubblici dal più freddo (100) al più caldo (0) dentro l&apos;org: è{" "}
              <strong style={{ fontWeight: 500, color: CP.textPrimary }}>direzionale</strong> — le decisioni si prendono
              sui componenti, mai sull&apos;indice. Lo compongono 4 misure del pubblico (% maturi che paga, CR, ARPPU,
              LTV); il prezzo PPV chiesto resta fuori perché è un comportamento del <em>team</em>, non del pubblico. Le
              finestre sono dichiarate per colonna (lifetime o {data.window_days}g): numeri con finestre diverse non
              vanno sommati tra loro. I componenti calcolati su campioni troppo piccoli vengono taciuti (—) invece che
              mostrati: un rapporto su una manciata di fan è rumore, non un dato. La quota del top-1% fan non è
              &quot;difficoltà&quot; ma varianza: dove è alta, un singolo whale può far sembrare bravo (o scarso) chiunque.
              Le pagine FREE monetizzano sull&apos;account paid abbinato: i loro numeri di spesa non sono comparabili e
              restano fuori da indice e percentili.
            </div>
            <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 10 }}>
              {data.creators_total} creator · {data.free_pages} pagine free · aggiornato{" "}
              {data.generated_at ? new Date(data.generated_at).toLocaleString("it-IT") : "—"}
              {data.stale ? " · in ricalcolo al prossimo giro del cron" : ""} · v{data.version}
            </div>
          </CpCard>

          <CpCard padding="6px 8px">
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <TH>Creator</TH>
                    <TH title="Indice direzionale 0-100: media dei percentili org invertiti sui 5 componenti core. Serve a ordinare, non a decidere.">
                      Difficoltà
                    </TH>
                    <TH right title="Quota dei fan MATURI (iscritti da ≥30g) che ha pagato almeno una volta oltre il sub — i fan appena arrivati non contano nel denominatore">% ha pagato</TH>
                    <TH right title={`Conversion rate pooled (${data.window_days}g): conversioni totali ÷ nuovi sub totali, pesato sul traffico — non media dei giorni`}>CR</TH>
                    <TH right title={`Revenue per fan attivo al giorno, pooled (${data.window_days}g): revenue totale ÷ fan-attivi-giorno (un fan attivo N giorni conta N volte)`}>ARPPU</TH>
                    <TH right title={`Prezzo PPV mediano CHIESTO in chat (${data.window_days}g) — è un comportamento del team, non una proprietà del pubblico: fuori dall'indice`}>PPV p50</TH>
                    <TH right title="Spesa mediana lifetime dei fan paganti">LTV p50</TH>
                    <TH right title="Fan totali (lifetime)">Fan</TH>
                    <TH right title="Quota del revenue portata dal top-1% dei fan paganti (varianza, non difficoltà)">Top-1%</TH>
                    <TH right title={`Nuovi sub (${data.window_days}g) — volume di traffico in ingresso`}>Nuovi sub</TH>
                    <TH right title={`Revenue (${data.window_days}g)`}>Revenue</TH>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((p) => (
                    <tr key={p.creator_id}>
                      <TD strong>{p.creator_name}</TD>
                      <TD>
                        <IndexBadge idx={p.difficulty_index} />
                      </TD>
                      <TD right>{fmtPct(p.pct_ever_paid)}</TD>
                      <TD right>{fmtPct(p.cr_avg)}</TD>
                      <TD right>{fmtUsd2(p.arppu_avg)}</TD>
                      <TD right>{fmtUsd2(p.ppv_price_p50)}</TD>
                      <TD right>{fmtUsd2(p.ltv_p50)}</TD>
                      <TD right>{fmtInt(p.n_fan)}</TD>
                      <TD right>{fmtPct(p.whale_share_top1)}</TD>
                      <TD right>{fmtInt(p.new_subs_60d)}</TD>
                      <TD right>{fmtUsd(p.revenue_60d)}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CpCard>

          {free.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SectionLabel>Pagine free — fuori da indice e percentili</SectionLabel>
              <CpCard padding="6px 8px" style={{ marginTop: 8 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <TH>Creator</TH>
                        <TH right>Fan</TH>
                        <TH right>Nuovi sub</TH>
                        <TH right>Revenue ({data.window_days}g)</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {free.map((p) => (
                        <tr key={p.creator_id}>
                          <TD strong>{p.creator_name}</TD>
                          <TD right>{fmtInt(p.n_fan)}</TD>
                          <TD right>{fmtInt(p.new_subs_60d)}</TD>
                          <TD right>{fmtUsd(p.revenue_60d)}</TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: CP.textMuted, padding: "8px 10px" }}>
                  Il pubblico compra sull&apos;account paid abbinato: spesa e conversione qui non descrivono il pubblico
                  reale. Il mapping free↔paid non è esplicito nel warehouse.
                </div>
              </CpCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
