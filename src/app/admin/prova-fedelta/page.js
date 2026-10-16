"use client";

/**
 * /admin/prova-fedelta — prova fedeltà su Martina Scavo (16/10/2026).
 * Per il sales manager: le regole da dare agli operatori, la lista dei fan del gruppo prova
 * con cosa fare oggi, e la misura gruppo prova contro gruppo controllo.
 * Calcolo in lib/prova-fedelta (warehouse quasi in tempo reale, solo HOC).
 */
import { useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};
const usd = (n) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 0, useGrouping: "always" }).format(n));
const pct = (f) => (f === null || f === undefined ? "—" : `${Math.round(f * 100)}%`);
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const giorno = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MESI[d.getMonth()]}`; };
const tint = (c) => `color-mix(in srgb, ${c} 14%, transparent)`;
const Pill = ({ children, tone }) => <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 20, background: tint(tone || CP.textMuted), color: tone || CP.textSecondary }}>{children}</span>;
const muted = { fontSize: 12, color: CP.textMuted };
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
const box = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 18 };
const h2 = { fontSize: 16, fontWeight: 500, margin: "0 0 10px" };

const PAGE = 30; // prima pagina della lista: chi la usa in turno parte dall'alto

const REGOLE = [
  "Fan che scrive tanto: scena entro un'ora dal suo messaggio.",
  "La prima sera al massimo 2-3 proposte, poi un appuntamento per il giorno dopo («domani ti faccio vedere…»).",
  "Se dice di no o parla di soldi (non può, è a fine mese, ha già speso): niente nuove proposte. Si continua a parlare, la vendita torna un altro giorno.",
  "Dal 7° giorno, ogni pochi giorni un messaggio personale senza vendita che riprende qualcosa che ti ha raccontato (lavoro, una partita, il viaggio).",
  "I fan «segnalati» (almeno 100 $ e acquisti in 2 giorni diversi nella prima settimana) li segue la persona migliore del turno.",
  "Vale solo per i fan in questa lista. Con tutti gli altri si lavora come sempre: è il confronto che ci dice se funziona.",
];

function nextMonday() {
  const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

function Phase({ phase }) {
  if (!phase || phase.key === "non-avviata") return <Notice>La prova non è ancora avviata. La avvia un admin dal riquadro in fondo alla pagina.</Notice>;
  const lines = {
    "in-partenza": `Parte il ${giorno(phase.start)}. Da quel giorno ogni fan nuovo e caldo di Martina entra a caso in uno dei due gruppi.`,
    raccolta: `Raccolta dei fan: giorno ${phase.day} di ${phase.days}, fino al ${giorno(phase.enrollEnd)}. Poi 60 giorni per vedere chi continua a comprare: risultato definitivo il ${giorno(phase.end)}.`,
    seguito: `La raccolta dei fan è finita il ${giorno(phase.enrollEnd)}. Continuano le azioni sui fan già in lista; risultato definitivo il ${giorno(phase.end)}.`,
    conclusa: `Prova conclusa il ${giorno(phase.end)}: i numeri qui sotto sono quelli definitivi.`,
    fermata: "Prova fermata da un admin. I numeri restano visibili, la lista non dà più azioni.",
  };
  return <div style={{ ...box, background: CP.textPrimary, color: CP.bg, border: "none" }}><div style={{ fontSize: 15, lineHeight: 1.5 }}>{lines[phase.key]}</div></div>;
}

function Regole() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText("Prova fedeltà · Martina Scavo — regole per i fan in lista\n" + REGOLE.map((r, i) => `${i + 1}. ${r}`).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard negata: il testo resta selezionabile */ }
  };
  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={h2}>Le regole per gli operatori</h2>
        <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={copy}><Copy size={13} />{copied ? "Copiate" : "Copia le regole"}</button>
      </div>
      <ol style={{ margin: 0, paddingLeft: 22, listStyle: "decimal", display: "grid", gap: 6, fontSize: 14, lineHeight: 1.5, color: CP.textSecondary }}>
        {REGOLE.map((r) => <li key={r}>{r}</li>)}
      </ol>
    </div>
  );
}

function FanRow({ f, stopped }) {
  const first = stopped ? null : f.todo[0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {f.name || f.username || f.userId}{f.username ? <span style={{ color: CP.textMuted, fontSize: 12 }}> @{f.username}</span> : null}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
          {f.flagged && <Pill tone={CP.accentSoftText}>segnalato</Pill>}
          <Pill tone={f.sub === "attivo" ? CP.accentGreen : f.sub === "scaduto" ? CP.accentRed : null}>abbonamento {f.sub}</Pill>
        </div>
        {first && <div style={{ fontSize: 14, lineHeight: 1.45, color: CP.textPrimary }}>{first.text}</div>}
        {!stopped && f.todo.length > 1 && <div style={{ ...muted, marginTop: 2 }}>Poi: {f.todo.slice(1).map((t) => t.text).join(" ")}</div>}
        <div style={{ ...muted, marginTop: 4 }}>Arrivato da {f.ageDays} gg · {f.fanAll} messaggi suoi · speso {usd(f.spAll)} in tutto, {usd(f.sp7)} nella prima settimana</div>
      </div>
      <a href={`https://onlyfans.com/my/chats/chat/${f.userId}/`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: CP.accentSoftText, display: "inline-flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>Apri chat<ExternalLink size={11} /></a>
    </div>
  );
}

function Lista({ fans, stopped }) {
  const [all, setAll] = useState(false);
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const withTodo = fans.filter((f) => f.todo.length).sort((a, b) => a.todo[0].prio - b.todo[0].prio || Number(b.flagged) - Number(a.flagged));
  const shown = stopped || all ? [...fans].sort((a, b) => b.spAll - a.spAll) : withTodo;
  const copy = async () => {
    const lines = withTodo.map((f) => `${f.username ? "@" + f.username : f.name || f.userId}${f.flagged ? " [segnalato]" : ""} — ${f.todo[0].text}`);
    try { await navigator.clipboard.writeText(`Prova fedeltà · Martina Scavo — da fare adesso\n${lines.join("\n")}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard negata */ }
  };
  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={h2}>{stopped || all ? `Tutti i fan del gruppo prova (${fans.length})` : `Da fare adesso (${withTodo.length})`}</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!stopped && withTodo.length > 0 && <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={copy}><Copy size={13} />{copied ? "Copiata" : "Copia la lista per gli operatori"}</button>}
          {!stopped && <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={() => setAll((v) => !v)}>{all ? "Solo da fare adesso" : `Tutti (${fans.length})`}</button>}
        </div>
      </div>
      <div style={{ ...muted, marginBottom: 6 }}>
        Fan nuovi di Martina entrati nel gruppo prova: caldi (almeno 15 messaggi nelle prime 48 ore) o segnalati. Prima chi aspetta una risposta, poi chi ha già comprato tanto oggi, poi i nuovi arrivati, poi i messaggi personali.
      </div>
      {shown.length === 0 && <div style={muted}>{fans.length ? "Nessuna azione da fare adesso." : "Ancora nessun fan nel gruppo prova."}</div>}
      {(more ? shown : shown.slice(0, PAGE)).map((f) => <FanRow key={f.userId} f={f} stopped={stopped} />)}
      {!more && shown.length > PAGE && <button style={{ ...btn, marginTop: 10 }} onClick={() => setMore(true)}>Mostra gli altri {shown.length - PAGE}</button>}
    </div>
  );
}

function Misura({ m, controlCount }) {
  if (!m) return null;
  const rows = [
    ["Fan nella prova", m.prova.fans, m.controllo.fans, (v) => v, null, ""],
    ["di cui segnalati", m.prova.flagged, m.controllo.flagged, (v) => v, null, ""],
    ["Spesa media nella prima settimana", m.prova.sp7, m.controllo.sp7, usd, null, `${m.prova.n7} + ${m.controllo.n7} fan arrivati da almeno 7 giorni`],
    ["Tornati a comprare dopo il primo giorno", m.prova.backAfterD1, m.controllo.backAfterD1, pct, m.z.backAfterD1, `${m.prova.n7} + ${m.controllo.n7} fan`],
    ["Comprano ancora tra il giorno 8 e il 30", m.prova.still8_30, m.controllo.still8_30, pct, m.z.still8_30, `${m.prova.n30} + ${m.controllo.n30} fan arrivati da almeno 30 giorni`],
    ["Comprano ancora tra il giorno 8 e il 60", m.prova.still8_60, m.controllo.still8_60, pct, m.z.still8_60, `${m.prova.n60} + ${m.controllo.n60} fan arrivati da almeno 60 giorni`],
    ["Spesa media nei primi 60 giorni", m.prova.sp60, m.controllo.sp60, usd, null, ""],
    ["Arrivati a 500 $ in 60 giorni", m.prova.big500, m.controllo.big500, pct, null, ""],
  ];
  const verdict = (z) => (z === null || z === undefined ? "" : Math.abs(z) >= 2 ? (z > 0 ? "meglio la prova, difficilmente è il caso" : "meglio il controllo, difficilmente è il caso") : "differenza ancora alla portata del caso");
  return (
    <div style={box}>
      <h2 style={h2}>La misura: gruppo prova contro gruppo controllo</h2>
      <div style={{ ...muted, marginBottom: 8 }}>I due gruppi sono divisi a caso, quindi sono confrontabili. Il gruppo controllo ({controlCount} fan) non compare in lista: con loro si lavora come sempre. Ogni numero conta solo i fan arrivati da abbastanza giorni per averlo.</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          <thead><tr style={{ color: CP.textMuted, textAlign: "left" }}><th style={{ padding: "6px 8px 6px 0", fontWeight: 400 }}></th><th style={{ padding: 6, fontWeight: 400, textAlign: "right" }}>Prova</th><th style={{ padding: 6, fontWeight: 400, textAlign: "right" }}>Controllo</th><th style={{ padding: 6, fontWeight: 400 }}>Lettura</th></tr></thead>
          <tbody>
            {rows.map(([l, a, b, fmt, z, note]) => (
              <tr key={l} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                <td style={{ padding: "8px 8px 8px 0" }}>{l}{note ? <div style={muted}>{note}</div> : null}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{a === null ? "—" : fmt(a)}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{b === null ? "—" : fmt(b)}</td>
                <td style={{ padding: 6, color: CP.textSecondary }}>{verdict(z)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...muted, marginTop: 8 }}>Senza prova (fan di Martina arrivati a settembre 2026, stesse regole di conteggio): torna a comprare dopo il primo giorno circa il 13% dei fan in lista, compra ancora tra il giorno 8 e il 30 circa il 6%. Con circa 400 fan per gruppo in 6 settimane, si distingue dal caso un passaggio dal 6% al 10%.</div>
    </div>
  );
}

function Gestione({ config, phase, onDone }) {
  const [date, setDate] = useState(nextMonday());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const act = async (body) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/prova-fedelta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const running = config && !config.stopped_at && phase?.key !== "conclusa";
  return (
    <div style={{ ...box, borderStyle: "dashed" }}>
      <h2 style={h2}>Gestione (solo admin)</h2>
      {err && <Notice danger>{err}</Notice>}
      {running ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={muted}>Avviata dal {giorno(Date.parse(config.start))}.</span>
          <button style={btn} disabled={busy} onClick={() => act({ action: "stop" })}>{busy ? <Loader2 size={14} /> : null}Ferma la prova</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="pf-start" style={muted}>Data di avvio</label>
          <input id="pf-start" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...btn, cursor: "text" }} />
          <button style={btn} disabled={busy || !date} onClick={() => act({ action: "start", start: date })}>{busy ? <Loader2 size={14} /> : null}Avvia la prova su Martina</button>
        </div>
      )}
    </div>
  );
}

export default function ProvaFedeltaPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/prova-fedelta", fetcher, { revalidateOnFocus: false, refreshInterval: 10 * 60e3 });
  const [busy, setBusy] = useState(false);
  const refresh = async () => { setBusy(true); try { await mutate(await fetcher("/api/admin/prova-fedelta?refresh=1"), { revalidate: false }); } catch { /* l'errore lo mostra SWR al prossimo giro */ } finally { setBusy(false); } };
  const stopped = data?.phase?.key === "fermata" || data?.phase?.key === "conclusa";
  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 14 }}>
      <PageHead
        crumbs={[{ label: "Agenzia" }, { label: "Prova fedeltà" }]}
        title="Prova fedeltà · Martina Scavo"
        subtitle="Metà dei fan nuovi e caldi di Martina, scelti a caso, riceve un trattamento diverso: meno proposte la prima sera, niente insistenza, attenzione personale nei giorni dopo. L'altra metà come sempre. Così vediamo se diventano clienti più fedeli."
        actions={<button style={btn} onClick={refresh} disabled={busy || !data?.config}>{busy ? <Loader2 size={14} /> : <RefreshCw size={14} />}Aggiorna</button>}
      />
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} />Leggo le chat di Martina (fino a mezzo minuto)…</div>}
      {data && (<>
        <Phase phase={data.phase} />
        {data.computing && <Notice>Calcolo in corso da un'altra apertura: riprova tra un minuto.</Notice>}
        <Regole />
        {data.config && data.phase?.key !== "in-partenza" && <Lista fans={data.fans || []} stopped={stopped} />}
        {data.metrics && <Misura m={data.metrics} controlCount={data.controlCount} />}
        {data.computed_at && <div style={muted}>Dati aggiornati alle {new Date(data.computed_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} (si aggiornano da soli ogni 20 minuti).</div>}
        {data.canManage && <Gestione config={data.config} phase={data.phase} onDone={() => mutate()} />}
      </>)}
    </div>
  );
}
