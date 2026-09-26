"use client";

// Difficoltà creator — profilo del pubblico per creator (SEED).
// Il CONTESTO per leggere i numeri di un operatore: la stessa CVR è un risultato
// diverso su un pubblico caldo e su uno freddo. Questa tabella dice QUANTO è
// freddo ciascun pubblico — non giudica nessuno, e non entra in score/comp.
//
// Redesign 26/09/2026 (pannello tester SM/BOARD/UX): le sigle in testata
// (CR, ARPPU, LTV P50, TOP-1%) erano spiegate solo nel tooltip → intestazioni
// in parole con la finestra dichiarata; il paragrafo "come leggere" (un muro di
// testo) diventa una lista di regole brevi, sempre visibile; filtri per fascia;
// tabella ordinabile con intestazione ferma. Regole di onestà invariate:
// indice direzionale, "—" sotto campione minimo, top-1% = varianza, pagine free
// fuori da indice. Ancora NIENTE ROSSO: qui non ci sono colpe, solo contesti.

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, FilterChip, DataTable, Disclosure, Notice, NUM } from "@/components/ds";

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
function band(idx) {
  if (idx == null) return "nd";
  if (idx >= 67) return "freddo";
  if (idx >= 34) return "media";
  return "caldo";
}
function indexColor(idx) {
  const b = band(idx);
  if (b === "nd") return CP.textMuted;
  if (b === "freddo") return CP.accentBlue;
  if (b === "media") return CP.textSecondary;
  return CP.accentGreen;
}
function indexLabel(idx) {
  const b = band(idx);
  if (b === "nd") return "n/d";
  if (b === "freddo") return "pubblico freddo";
  if (b === "media") return "nella media";
  return "pubblico caldo";
}

function IndexBadge({ idx }) {
  const c = indexColor(idx);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: c, minWidth: 26, textAlign: "right", ...NUM }}>{idx == null ? "—" : idx}</span>
      <span style={{ fontSize: 12, color: c, background: alpha(c, "1a"), border: `1px solid ${alpha(c, "44")}`, padding: "2px 8px", borderRadius: 999 }}>
        {indexLabel(idx)}
      </span>
    </span>
  );
}

// Intestazione con spiegazione al passaggio del mouse (la parola basta, il tooltip dà il dettaglio)
const H = ({ children, title }) => <span title={title} style={{ cursor: "help" }}>{children}</span>;

const btn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };

export default function CreatorDifficultyPage() {
  // revalidateOnFocus: false — su cache-miss il GET può lanciare una query
  // BigQuery: il ritorno di focus non deve poterla rilanciare (come operator-signals).
  const { data, error, isLoading, mutate } = useSWR("/api/admin/creator-difficulty", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showFree, setShowFree] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setRefreshErr(null);
    try {
      const r = await fetch("/api/admin/creator-difficulty", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || errText(r.status));
      mutate(d, { revalidate: false });
    } catch (e) {
      setRefreshErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const profiles = data?.profiles || [];
  const paid = profiles.filter((p) => !p.free_page).map((p) => ({ ...p, id: p.creator_id }));
  const free = profiles.filter((p) => p.free_page).map((p) => ({ ...p, id: p.creator_id }));
  const counts = { freddo: 0, media: 0, caldo: 0, nd: 0 };
  for (const p of paid) counts[band(p.difficulty_index)]++;
  const shown = filter === "all" ? paid : paid.filter((p) => band(p.difficulty_index) === filter);
  const w = data?.window_days;

  const columns = [
    { key: "creator_name", label: "Creator", render: (p) => <span style={{ fontWeight: 500 }}>{p.creator_name}</span> },
    { key: "difficulty_index", label: <H title="Indice direzionale 0-100: media dei percentili org invertiti sui componenti del pubblico. Serve a ordinare, non a decidere.">Difficoltà</H>, render: (p) => <IndexBadge idx={p.difficulty_index} />, sort: (p) => p.difficulty_index },
    { key: "pct_ever_paid", label: <H title="Quota dei fan MATURI (iscritti da ≥30g) che ha pagato almeno una volta oltre l'abbonamento — i fan appena arrivati non contano nel denominatore">Fan che hanno mai pagato</H>, align: "right", render: (p) => fmtPct(p.pct_ever_paid) },
    { key: "cr_avg", label: <H title={`Conversion rate pooled (${w}g): conversioni totali ÷ nuovi iscritti totali, pesato sul traffico — non media dei giorni`}>Conversione nuovi iscritti · {w}g</H>, align: "right", render: (p) => fmtPct(p.cr_avg) },
    { key: "arppu_avg", label: <H title={`ARPPU pooled (${w}g): incasso totale ÷ fan-attivi-giorno (un fan attivo N giorni conta N volte)`}>Incasso per fan al giorno · {w}g</H>, align: "right", render: (p) => fmtUsd2(p.arppu_avg) },
    { key: "ltv_p50", label: <H title="LTV P50: spesa mediana lifetime dei fan paganti (metà spende di più, metà di meno)">Spesa tipica di chi paga</H>, align: "right", render: (p) => fmtUsd2(p.ltv_p50) },
    { key: "n_fan", label: <H title="Fan totali (lifetime)">Fan</H>, align: "right", muted: true, render: (p) => fmtInt(p.n_fan) },
    { key: "new_subs_60d", label: <H title={`Nuovi iscritti (${w}g) — volume di traffico in ingresso`}>Nuovi iscritti · {w}g</H>, align: "right", muted: true, render: (p) => fmtInt(p.new_subs_60d) },
    { key: "revenue_60d", label: <H title={`Incasso (${w}g)`}>Incasso · {w}g</H>, align: "right", muted: true, render: (p) => fmtUsd(p.revenue_60d) },
    { key: "whale_share_top1", label: <H title="Quota dell'incasso portata dall'1% dei fan paganti che spende di più. È varianza, non difficoltà: dove è alta, un singolo grande spenditore può far sembrare bravo (o scarso) chiunque.">Peso dei grandi spenditori</H>, align: "right", muted: true, render: (p) => fmtPct(p.whale_share_top1) },
    { key: "ppv_price_p50", label: <H title={`Prezzo PPV mediano CHIESTO in chat (${w}g) — è un comportamento del team, non una proprietà del pubblico: fuori dall'indice`}>Prezzo PPV tipico (del team)</H>, align: "right", muted: true, render: (p) => fmtUsd2(p.ppv_price_p50) },
  ];

  const freeColumns = [
    { key: "creator_name", label: "Creator" },
    { key: "n_fan", label: "Fan", align: "right", render: (p) => fmtInt(p.n_fan) },
    { key: "new_subs_60d", label: `Nuovi iscritti · ${w}g`, align: "right", render: (p) => fmtInt(p.new_subs_60d) },
    { key: "revenue_60d", label: `Incasso · ${w}g`, align: "right", render: (p) => fmtUsd(p.revenue_60d) },
  ];

  const li = { margin: "0 0 4px" };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Training" }, { label: "Difficoltà creator" }]}
        title="Difficoltà creator"
        subtitle="Quanto è freddo il pubblico di ogni creator: il contesto per leggere i numeri di chi ci lavora prima di giudicarli. Non è un giudizio e non entra in score né compensi."
        actions={
          <button onClick={refresh} disabled={busy} style={{ ...btn, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Ricalcolo…" : "Ricalcola ora"}
          </button>
        }
      />

      {refreshErr && <Notice danger>Ricalcolo fallito: {refreshErr}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Carico il profilo…</div>}
      {error && <Notice danger>{String(error.message || error)}</Notice>}
      {data && data.bigquery === false && <Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente.</Notice>}
      {data && data.computing && (
        <Notice>Un calcolo è già in corso (lo ha avviato il giro notturno o un altro admin): ricarica la pagina tra un minuto.</Notice>
      )}
      {data && !data.computing && data.bigquery !== false && !error && !isLoading && profiles.length === 0 && (
        <Notice>
          Nessun profilo calcolato: il warehouse non ha restituito creator per questa organizzazione
          {data.generated_at ? ` (ultimo calcolo ${new Date(data.generated_at).toLocaleString("it-IT")})` : ""}. Verifica i dati di origine, poi usa
          &quot;Ricalcola ora&quot;.
        </Notice>
      )}

      {data && profiles.length > 0 && (
        <>
          {/* Come leggere — le regole di onestà, sempre visibili, mai solo nei commenti */}
          <Notice>
            <div style={{ color: CP.textPrimary, fontWeight: 500, marginBottom: 4 }}>Come leggere questa tabella</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li style={li}>
                L&apos;indice va da 100 (pubblico più freddo) a 0 (più caldo), confrontando le creator tra loro. È{" "}
                <strong style={{ fontWeight: 500, color: CP.textPrimary }}>direzionale</strong>: serve a ordinare, le decisioni si prendono
                guardando le colonne, mai sull&apos;indice da solo.
              </li>
              <li style={li}>
                Lo compongono solo misure del pubblico: quanti fan hanno mai pagato, conversione, incasso per fan, spesa tipica. Il prezzo PPV
                resta fuori perché lo decide il team, non il pubblico.
              </li>
              <li style={li}>
                Le colonne hanno periodi diversi (da sempre o ultimi {w} giorni, scritto nell&apos;intestazione): non vanno sommate tra loro.
              </li>
              <li style={li}>Un &quot;—&quot; vuol dire campione troppo piccolo: un rapporto su pochi fan è rumore, non un dato.</li>
              <li style={li}>
                &quot;Peso dei grandi spenditori&quot; non è difficoltà ma instabilità: dove è alto, un solo fan che spende tanto può far sembrare
                bravo (o scarso) chiunque.
              </li>
              <li style={{ margin: 0 }}>
                Le pagine free incassano sull&apos;account a pagamento abbinato: i loro numeri non sono confrontabili e restano fuori da indice e
                classifica (in fondo alla pagina).
              </li>
            </ul>
          </Notice>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <FilterChip label={`Tutte (${paid.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label={`Pubblico freddo (${counts.freddo})`} active={filter === "freddo"} onClick={() => setFilter("freddo")} disabled={!counts.freddo} />
            <FilterChip label={`Nella media (${counts.media})`} active={filter === "media"} onClick={() => setFilter("media")} disabled={!counts.media} />
            <FilterChip label={`Pubblico caldo (${counts.caldo})`} active={filter === "caldo"} onClick={() => setFilter("caldo")} disabled={!counts.caldo} />
            {counts.nd > 0 && <FilterChip label={`Senza indice (${counts.nd})`} active={filter === "nd"} onClick={() => setFilter("nd")} />}
            <span style={{ marginLeft: "auto", fontSize: 12, color: CP.textMuted }}>Passa sulle intestazioni per il dettaglio · clic per ordinare</span>
          </div>

          <DataTable
            columns={columns}
            rows={shown}
            defaultSort={{ key: "difficulty_index", dir: -1 }}
            minWidth={1100}
            maxHeight="calc(100vh - 220px)"
            empty="Nessuna creator in questa fascia."
          />

          <div style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 18px", lineHeight: 1.6 }}>
            {data.creators_total} creator · {data.free_pages} pagine free · aggiornato{" "}
            {data.generated_at ? new Date(data.generated_at).toLocaleString("it-IT") : "—"}
            {data.stale ? " · in ricalcolo al prossimo giro notturno" : ""} · metodo {data.version}
          </div>

          {free.length > 0 && (
            <Disclosure
              open={showFree}
              onToggle={() => setShowFree(!showFree)}
              title={`Pagine free (${free.length})`}
              summary="fuori da indice e classifica: incassano sull'account a pagamento abbinato"
            >
              <DataTable columns={freeColumns} rows={free} defaultSort={{ key: "revenue_60d", dir: -1 }} minWidth={480} />
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                Il pubblico compra sull&apos;account a pagamento abbinato: spesa e conversione qui non descrivono il pubblico reale. L&apos;abbinamento
                free↔a pagamento non è scritto esplicitamente nel warehouse.
              </div>
            </Disclosure>
          )}
        </>
      )}
    </div>
  );
}
