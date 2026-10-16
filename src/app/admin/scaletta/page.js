"use client";

// La scaletta — il funnel del sexting per pagina, con i concetti accanto ai numeri.
// Nata dal caso di studio Martina Scavo (16/10/2026): invece di un documento da riaprire, una
// pagina che si aggiorna ogni settimana e dice se i concetti stanno passando.
// Coaching, non score: le percentuali per operatore servono a decidere cosa allenare.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, DataTable, Notice, SectionTitle, NUM } from "@/components/ds";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const pct = (x, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d).replace(".", ",")}%`);
const usd = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString("it-IT")}`);
const usd1 = (n) => (n == null ? "—" : `$${Number(n).toFixed(1).replace(".", ",")}`);
const int = (n) => (n == null ? "—" : Math.round(n).toLocaleString("it-IT"));
const fmtDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}` : "";
};
const fmtVal = (kind, v) => (kind === "pct" ? pct(v) : kind === "usd" ? usd1(v) : int(v));
const nextMonday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};

const section = { display: "flex", flexDirection: "column", gap: 12, padding: "26px 0", borderTop: `1px solid ${CP.border}` };
const th = { textAlign: "right", padding: "8px 10px", fontSize: 12, color: CP.textMuted, fontWeight: 500, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
const td = { textAlign: "right", padding: "8px 10px", fontSize: 13, color: CP.textSecondary, borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap", ...NUM };
const tdL = { ...td, textAlign: "left", color: CP.textPrimary, whiteSpace: "normal" };
const btn = { background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, minHeight: 36 };
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}`, fontWeight: 500 };
const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: FONTS.body, minHeight: 36 };

function Text({ children, muted, style }) {
  return <p style={{ fontSize: muted ? 12 : 14, color: muted ? CP.textMuted : CP.textSecondary, margin: 0, lineHeight: 1.6, maxWidth: 760, ...style }}>{children}</p>;
}

// Il concetto: una riga di spiegazione accanto ai numeri, per chi studia la pagina
function Concept({ title, children }) {
  return (
    <div style={{ borderLeft: `2px solid ${CP.scale}`, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 4, maxWidth: 760 }}>
      <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: CP.textMuted, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

function Table({ head, rows, minWidth = 520 }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

// Il funnel: ogni gradino con il suo numero, la quota sul passo prima e il riferimento
function Funnel({ page, reference }) {
  const steps = [
    { label: "Conversazioni con almeno una proposta", n: page.sessions, of: null, ref: null },
    { label: "Vendono almeno un contenuto", n: page.sold, of: page.sold_rate, ref: reference.sold_rate, ofLabel: "delle conversazioni" },
    { label: "Dopo il 1° acquisto arriva un'altra proposta", n: page.cont_rate == null ? null : page.cont_rate * page.sold, of: page.cont_rate, ref: reference.cont_rate, ofLabel: "di quelle che vendono" },
    { label: "Comprano anche il 2° gradino", n: page.b2_rate == null ? null : page.b2_rate * page.sold, of: page.second_if_proposed, ref: reference.second_if_proposed, ofLabel: "di quando arriva" },
    { label: "Arrivano a 3 o più acquisti", n: page.b3_rate == null ? null : page.b3_rate * page.sold, of: page.b3_rate, ref: reference.b3_rate, ofLabel: "di quelle che vendono" },
  ];
  const max = page.sessions || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ color: CP.textPrimary }}>{s.label}</span>
            <span style={{ color: CP.textSecondary, ...NUM }}>
              <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{int(s.n)}</b>
              {s.of != null && <> · {pct(s.of)} {s.ofLabel}</>}
              {s.ref != null && <span style={{ color: CP.textMuted }}> · riferimento {pct(s.ref)}</span>}
            </span>
          </div>
          <div style={{ height: 8, background: CP.track, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(0.5, Math.min(100, ((s.n || 0) / max) * 100))}%`, height: "100%", background: CP.scale, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProvaForm({ data, onSaved }) {
  const [start, setStart] = useState(nextMonday());
  const [note, setNote] = useState("");
  const [vals, setVals] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const s = data.suggested || {};
    const v = {};
    for (const [k, , , kind] of data.measures) {
      const x = s[k];
      v[k] = x == null ? "" : kind === "pct" ? String(Math.round(x * 100)) : kind === "usd" ? String(Math.round(x * 10) / 10) : String(Math.round(x));
    }
    setVals(v);
  }, [data.page.id]);
  const save = async () => {
    setBusy(true); setErr(null);
    const targets = {};
    for (const [k, , , kind] of data.measures) {
      const raw = String(vals[k] ?? "").replace(",", ".").trim();
      if (raw === "") continue;
      targets[k] = kind === "pct" ? Number(raw) / 100 : Number(raw);
    }
    const r = await fetch("/api/admin/scaletta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prova", prova: { creator_id: data.page.id, start, targets, note } }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Salvataggio non riuscito");
    onSaved();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Text>Una prova fissa da quando si misura e cosa ci aspettiamo. Il punto di partenza sono le 4 settimane prima dell'inizio; da lì ogni lunedì si vede la settimana appena chiusa. Gli obiettivi proposti vanno verso il riferimento senza pretenderlo tutto: cambiali se serve.</Text>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted }}>
          Inizio (lunedì)
          <input id="scal-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted, flex: "1 1 260px" }}>
          Nota (facoltativa)
          <input id="scal-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. caso di studio condiviso con il sales manager il 19/10" style={input} />
        </label>
      </div>
      <Table head={["Misura", "Oggi (4 settimane)", "Obiettivo"]} minWidth={460} rows={data.measures.map(([k, label, dir, kind]) => {
        const cur = k === "payers" ? data.series.slice(-4).reduce((a, s, _, arr) => a + (s.payers || 0) / arr.length, 0) : k in (data.page || {}) ? data.page[k] : data.mass?.page?.[k];
        return (
          <tr key={k}>
            <td style={tdL}>{label}<span style={{ color: CP.textMuted }}> · {dir === "su" ? "più alto è meglio" : "più basso è meglio"}</span></td>
            <td style={td}>{fmtVal(kind, cur)}</td>
            <td style={td}>
              <input id={`scal-t-${k}`} inputMode="decimal" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} aria-label={`Obiettivo ${label}`}
                style={{ ...input, width: 90, textAlign: "right" }} />
              <span style={{ color: CP.textMuted, marginLeft: 6 }}>{kind === "pct" ? "%" : kind === "usd" ? "$" : ""}</span>
            </td>
          </tr>
        );
      })} />
      {err && <Notice danger>{err}</Notice>}
      <div><button style={btnPrimary} onClick={save} disabled={busy}>{busy ? "Salvo…" : "Avvia la prova"}</button></div>
    </div>
  );
}

function ProvaView({ prova, onEnd }) {
  const weeks = prova.measures[0]?.weeks?.map(([wk]) => wk) || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Text>Prova iniziata il {fmtDay(prova.start)}{prova.note ? ` · ${prova.note}` : ""}. {prova.weeks_running ? `Settimane misurate: ${prova.weeks_running}.` : "La prima settimana si legge il lunedì dopo l'inizio."}</Text>
      <Table head={["Misura", "Partenza", "Obiettivo", ...weeks.map((w) => `Sett. ${fmtDay(w)}`), "Esito"]} minWidth={560 + weeks.length * 80} rows={prova.measures.map((m) => (
        <tr key={m.key}>
          <td style={tdL}>{m.label}</td>
          <td style={td}>{fmtVal(m.kind, m.base)}</td>
          <td style={td}>{m.target == null ? "—" : `${m.dir === "su" ? "≥" : "≤"} ${fmtVal(m.kind, m.target)}`}</td>
          {m.weeks.map(([wk, v]) => <td key={wk} style={td}>{fmtVal(m.kind, v)}</td>)}
          <td style={{ ...td, color: m.hit == null ? CP.textMuted : CP.textPrimary }}>{m.hit == null ? "—" : m.hit ? "raggiunto" : "non ancora"}</td>
        </tr>
      ))} />
      <Text muted>Per non scambiare la stagione per un miglioramento, confronta con l'andamento dei profili di riferimento nelle stesse settimane (tabella «Settimana per settimana»). Se i fan che pagano o il prezzo per contenuto scendono, fermarsi e capire perché prima di andare avanti.</Text>
      <div><button style={btn} onClick={onEnd}>Chiudi la prova</button></div>
    </div>
  );
}

export default function ScalettaPage() {
  const [creator, setCreator] = useState(null);
  const url = `/api/admin/scaletta${creator ? `?creator=${creator}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false, refreshInterval: (d) => (d?.computing ? 8000 : 0) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const wrap = { padding: "28px 20px 64px", maxWidth: 1100, margin: "0 auto", fontFamily: FONTS.body };

  const post = async (body) => {
    setBusy(true);
    const r = await fetch("/api/admin/scaletta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? null : d.error || "Operazione non riuscita");
    mutate();
  };

  const recentLabel = useMemo(() => {
    const w = data?.meta?.weeks || [];
    const r = w.slice(-4);
    if (!r.length) return "";
    const end = new Date(`${r[r.length - 1]}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${fmtDay(r[0])} – ${fmtDay(end.toISOString())}`;
  }, [data?.meta?.weeks]);

  const p = data?.page;
  const ref = data?.reference;
  const line2 = p && ref && p.sold_rate != null
    ? `Vende in ${Math.round(p.sold_rate * 100)} conversazioni su 100. Il riferimento in ${Math.round((ref.sold_rate || 0) * 100)}.`
    : null;
  const header = (
    <PageHead
      crumbs={[{ label: "Agenzia" }, { label: "La scaletta" }]}
      title={p ? `La scaletta · ${p.name}` : "La scaletta"}
      line2={line2}
      subtitle="Come si vende nel sexting: il fan sblocca un contenuto, la scena continua e arriva il gradino dopo, a un prezzo più alto. Qui si vede, pagina per pagina, dove la scaletta si ferma e perché, con i profili più forti di HOC accanto."
    />
  );

  if (error) return <div style={wrap}>{header}<Notice danger>{String(error.message).includes("permesso") ? "Questa pagina è per chi guida una squadra di vendita." : error.message}</Notice></div>;
  if (isLoading || !data) return <div style={wrap}>{header}<Text muted>Caricamento…</Text></div>;
  if (data.bigquery === false) return <div style={wrap}>{header}<Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente.</Notice></div>;
  if (data.computing && !data.page) return <div style={wrap}>{header}<Notice>Sto leggendo le conversazioni delle ultime 8 settimane di tutta HOC (circa un minuto). La pagina si aggiorna da sola.</Notice></div>;
  if (data.empty) return <div style={wrap}>{header}<Notice>I dati non sono ancora stati calcolati. Il calcolo parte ogni settimana da solo, oppure lo avvia un amministratore aprendo questa pagina.</Notice></div>;
  if (data.noPages) return <div style={wrap}>{header}<Notice>Non hai creator assegnate, quindi qui non c'è niente da mostrare. Le creator visibili si assegnano da Membri.</Notice></div>;

  const st = data.stops.page;
  const stRef = data.stops.reference;
  const few = p.few;

  return (
    <div style={wrap}>
      {header}
      {msg && <Notice danger>{msg}</Notice>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <label htmlFor="scal-page" style={{ fontSize: 13, color: CP.textSecondary }}>Profilo</label>
        <select id="scal-page" value={p.id} onChange={(e) => { setMsg(null); setCreator(e.target.value); }} style={{ ...input, minWidth: 240 }}>
          {data.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}{pg.prova ? " · prova in corso" : ""}</option>)}
        </select>
        <span style={{ fontSize: 12, color: CP.textMuted }}>Ultime 4 settimane chiuse: {recentLabel}</span>
      </div>

      {few && <Notice>In queste 4 settimane questo profilo ha poche conversazioni con proposta ({int(p.sessions)}): le percentuali sono indicative.</Notice>}

      <HeroMetric
        label="Conversazioni con proposta che vendono"
        value={pct(p.sold_rate)}
        compare={`Riferimento: ${pct(ref.sold_rate)} · ${ref.label}`}
        hint={`${int(p.sold)} su ${int(p.sessions)} conversazioni`}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Metric label="Dopo il 1° acquisto propone ancora" value={pct(p.cont_rate)} note={`riferimento ${pct(ref.cont_rate)}`} />
          <Metric label="Conversazioni con 3+ acquisti" value={pct(p.b3_rate)} note={`riferimento ${pct(ref.b3_rate)}`} />
          <Metric label="Incasso medio di una conversazione che vende" value={usd(p.rev_per_sold)} note="lordo" />
        </div>
      </HeroMetric>

      <section style={section}>
        <SectionTitle aside="ultime 4 settimane">Il primo acquisto non chiude la vendita: la apre</SectionTitle>
        <Funnel page={p} reference={ref} />
        <Concept title="Il concetto · la scaletta">Chi ha appena detto sì dice sì più facilmente alla richiesta dopo, per restare coerente con la scelta fatta (in psicologia: piede nella porta, Freedman e Fraser 1966). Nel sexting c'è un motivo in più: la scena è iniziata e il fan vuole sapere come va avanti. Su tutti i profili, quando il 2° gradino arriva, circa un fan su due lo compra.</Concept>
      </section>

      <section style={section}>
        <SectionTitle aside={`${int(st.total)} conversazioni in cui il fan ha comprato e non è arrivato altro`}>Perché la scaletta si ferma</SectionTitle>
        <Table head={["Cosa succede dopo l'acquisto", "Dipende da", p.name, "Riferimento"]} rows={st.reasons.map((r, i) => (
          <tr key={r.key}>
            <td style={tdL}>{r.label}</td>
            <td style={{ ...td, color: r.side === "noi" ? CP.textPrimary : CP.textMuted }}>{r.side === "noi" ? "noi" : "il fan"}</td>
            <td style={{ ...td, color: r.side === "noi" ? CP.textPrimary : CP.textSecondary }}>{pct(r.share)} <span style={{ color: CP.textMuted }}>({int(r.n)})</span></td>
            <td style={td}>{pct(stRef.reasons[i]?.share)}</td>
          </tr>
        ))} />
        <Text>
          Dipende da noi il <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{pct(st.ours_share)}</b> dei casi (riferimento {pct(stRef.ours_share)}).
          In {pct(st.asks_share)} delle conversazioni ferme il fan chiede esplicitamente un altro contenuto e non lo riceve; in {pct(st.gift_share)} dopo l'acquisto parte un contenuto gratis, ma non il gradino a pagamento.
          {st.lost != null && <> Stima onesta di quanto è rimasto sul tavolo in 4 settimane, contando solo i casi che dipendono da noi: <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{usd(st.lost)} lordi</b>.</>}
        </Text>
        <Concept title="Il concetto · il regalo è parte della scena, non la fine">Il contenuto gratis dopo un acquisto c'è anche nelle conversazioni che proseguono: tiene viva la scena. Il problema è quando al regalo non segue il gradino a pagamento. Se il fan resta e scrive, la scena ha ancora un seguito.</Concept>
        <Text muted>I motivi si leggono dalle parole del fan dopo l'acquisto (es. «sono venuto», «non ho soldi», «devo andare»): sono indicativi, non una lettura riga per riga.</Text>
      </section>

      <section style={section}>
        <SectionTitle aside="a parità di quanto scrive il fan">La foto gratis scalda chi è freddo, non chi è già caldo</SectionTitle>
        <Table head={["Messaggi del fan nella conversazione", "Vendono senza contenuto gratis prima", "Vendono con contenuto gratis prima", "Quanto spesso lo usa"]} rows={data.warm.page.map((r) => (
          <tr key={r.eng}>
            <td style={tdL}>{r.label}</td>
            <td style={td}>{r.n_without < 20 ? "pochi dati" : pct(r.without, 1)}</td>
            <td style={td}>{r.n_with < 20 ? "pochi dati" : pct(r.with, 1)}</td>
            <td style={td}>{pct(r.warm_share)}</td>
          </tr>
        ))} />
        <Text muted>Riferimento, stesso confronto: {data.warm.reference.map((r) => `${r.label.split(" ")[0]} ${pct(r.without, 1)} → ${pct(r.with, 1)}`).join(" · ")}.</Text>
        <Concept title="Il concetto · non quanto, ma con chi">Con chi scrive poco il gratis aiuta a scaldare. Con chi è già dentro la conversazione non aggiunge niente e rimanda la proposta. Quello che si vende nella scaletta è il video: le foto servono a scaldare.</Concept>
      </section>

      <section style={section}>
        <SectionTitle aside="conversazioni con 3+ acquisti">I gradini</SectionTitle>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Metric label="Prezzo medio 1° → 2° → 3°" value={p.ladder ? p.ladder.map((x) => usd(x)).join(" → ") : "—"} note={ref.ladder ? `riferimento ${ref.ladder.map((x) => usd(x)).join(" → ")}` : "lordi"} />
          <Metric label="Scalette di 2+ acquisti fatte solo di video" value={pct(p.video_share)} note={ref.video_share != null ? `riferimento ${pct(ref.video_share)}` : null} />
        </div>
      </section>

      <section style={section}>
        <SectionTitle aside="ultime 4 settimane">Le mass: il prezzo regge solo se non lo smentisci</SectionTitle>
        {data.mass.page ? (
          <Table head={["", p.name, "Riferimento"]} minWidth={420} rows={[
            ["Mass al giorno", (m) => (m ? m.per_day.toFixed(0) : "—")],
            ["Mass a pagamento", (m) => pct(m?.paid_share)],
            ["Prezzo tipico", (m) => usd(m?.price_p50)],
            ["Prezzo per contenuto", (m) => usd1(m?.ppc_p50)],
            ["Tanti contenuti a prezzo scontato", (m) => pct(m?.cheap_share)],
            ["Con la parola «sconto»", (m) => pct(m?.sconto_share)],
            ["Mandate a liste mirate", (m) => pct(m?.liste_share)],
          ].map(([label, f]) => (
            <tr key={label}><td style={tdL}>{label}</td><td style={td}>{f(data.mass.page)}</td><td style={td}>{f(data.mass.reference)}</td></tr>
          ))} />
        ) : <Text muted>Nessuna mass registrata nelle ultime 4 settimane.</Text>}
        <Concept title="Il concetto · valore percepito">Nelle settimane dopo i pacchetti scontati i prezzi delle mass successive scendono e per ogni mass compra meno gente: il fan impara ad aspettare l'offerta. La parola «sconto» dice che il prezzo si tratta; «solo stasera» dà lo stesso motivo per comprare senza abbassare il listino. In chat, dopo un no, scendere di prezzo funziona se è un gesto personale («questo te lo lascio a meno»).</Concept>
      </section>

      <section style={section}>
        <SectionTitle aside="solo turni in cui l'operatore lavorava da solo">Gli operatori</SectionTitle>
        {data.operators.length ? (
          <DataTable minWidth={640} defaultSort={{ key: "sessions", dir: -1 }} rows={data.operators} columns={[
            { key: "op", label: "Operatore", sortable: true, render: (r) => <Link href={`/leaderboard/operational/${encodeURIComponent(r.op.trim())}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>{r.op.trim()}</Link> },
            { key: "sessions", label: "Conversazioni con proposta", align: "right", sortable: true, render: (r) => int(r.sessions) },
            { key: "sold_rate", label: "Vendono", align: "right", sortable: true, render: (r) => (r.few ? "pochi dati" : pct(r.sold_rate)) },
            { key: "cont_rate", label: "Propone ancora dopo il 1°", align: "right", sortable: true, render: (r) => (r.few ? "—" : pct(r.cont_rate)) },
            { key: "b3_rate", label: "3+ acquisti", align: "right", sortable: true, render: (r) => (r.few ? "—" : pct(r.b3_rate)) },
            { key: "ours_share", label: "Ferme per noi", align: "right", sortable: true, render: (r) => (r.few ? "—" : pct(r.ours_share)) },
          ]} />
        ) : <Text muted>Nessun turno a operatore singolo in queste settimane: i turni in coppia non si possono attribuire.</Text>}
        <Text muted>Serve a capire su cosa allenare ciascuno, non è una classifica da mostrare agli operatori. Sotto {data.meta.min_sessions} conversazioni le percentuali non sono affidabili.</Text>
      </section>

      <section style={section}>
        <SectionTitle>{data.prova ? "La prova in corso" : "Avvia una prova"}</SectionTitle>
        {data.prova
          ? <ProvaView prova={data.prova} onEnd={() => post({ action: "end_prova", creator_id: p.id })} />
          : <ProvaForm data={data} onSaved={() => mutate()} />}
      </section>

      <section style={section}>
        <SectionTitle aside="settimane chiuse">Settimana per settimana</SectionTitle>
        <Table head={["Settimana", "Conversazioni", "Vendono", "Propone ancora", "3+ acquisti", "Pacchetti scontati", "«Sconto» nelle mass", "Fan che pagano"]} minWidth={760}
          rows={data.series.map((s) => (
            <tr key={s.wk}>
              <td style={tdL}>{fmtDay(s.wk)}</td>
              <td style={td}>{int(s.sessions)}</td>
              <td style={td}>{pct(s.sold_rate)}</td>
              <td style={td}>{pct(s.cont_rate)}</td>
              <td style={td}>{pct(s.b3_rate)}</td>
              <td style={td}>{pct(s.cheap_share)}</td>
              <td style={td}>{pct(s.sconto_share)}</td>
              <td style={td}>{int(s.payers)}</td>
            </tr>
          ))} />
        {ref.pages?.length > 0 && (
          <Text muted>Riferimento nelle ultime 4 settimane: {ref.pages.map((r) => `${r.name} ${pct(r.sold_rate)} vendono, ${pct(r.cont_rate)} propone ancora`).join(" · ")}.</Text>
        )}
      </section>

      <section style={section}>
        <SectionTitle>Come sono fatti i conti</SectionTitle>
        <Text muted>Conversazione: messaggi tra la creator e un fan senza pause di più di 60 minuti. Proposta: contenuto a pagamento mandato in chat, escluse mass, benvenuto e messaggi automatici (lo stesso testo a 20 o più fan nello stesso giorno). Acquisto: un pagamento dello stesso importo entro 24 ore, assegnato alla proposta più recente con quel prezzo. Riscaldamento: un contenuto gratis prima della prima proposta. Pacchetto scontato: mass con 7 o più contenuti sotto il prezzo solito della pagina. I numeri mostrano cosa va insieme a più incasso, non provano da soli la causa: per questo esiste la prova.</Text>
        <Text muted>
          Aggiornato il {new Date(data.meta.generated_at).toLocaleDateString("it-IT")}{data.meta.stale ? " (da ricalcolare)" : ""} · si ricalcola da solo una volta a settimana · ultimo giro {((data.meta.bytes || 0) / 1e9).toFixed(0)} GB letti.
        </Text>
        {data.canRecompute && <div><button style={btn} disabled={busy || data.computing} onClick={() => post({ action: "recompute" })}>{data.computing ? "Ricalcolo in corso…" : "Ricalcola adesso"}</button></div>}
      </section>
    </div>
  );
}
