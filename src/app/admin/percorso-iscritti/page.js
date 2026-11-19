"use client";

/**
 * /admin/percorso-iscritti — Percorso dei nuovi iscritti (14/11/2026).
 * L'identikit di come entra e spende un fan nuovo, pagina per pagina dello split:
 * quando si iscrive, dopo quanto e con quanto spende la prima volta, quanto resta fermo,
 * dopo quanto torna e con quanto. Calcolo in lib/percorso-iscritti (warehouse, solo HOC).
 * In cima il percorso in parole e a tappe; sotto il dettaglio (orari, fasce, provenienza)
 * e il confronto tra pagine o tra mesi, sempre con numeri veri.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, FilterBar, EmptyState, Spiega, DataTable, BTN } from "@/components/ds";
import { alertDialog } from "@/components/AppDialogs";
import { Panel, Bars } from "@/components/VetroCharts";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};

// ── Formati ──────────────────────────────────────────────────────────────────
const nf = (d = 0) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: "always" });
const int = (n) => nf().format(Math.round(n || 0));
const usd = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `$${nf(Number(n) < 100 ? 2 : 0).format(Number(n))}`);
const usd0 = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `$${nf().format(Math.round(Number(n)))}`);
const pct = (f) => (f == null || !Number.isFinite(f) ? "—" : `${nf(f < 0.1 && f > 0 ? 1 : 0).format(f * 100)}%`);
const rate = (a, b, min = 1) => (b >= min ? a / b : null);
/** Ore → parole: «12 min», «1 h 25 min», «2 giorni», «7,5 giorni». */
function dur(h) {
  if (h == null || !Number.isFinite(Number(h))) return "—";
  const v = Number(h);
  if (v < 1) return `${Math.max(1, Math.round(v * 60))} min`;
  if (v < 24) { const hh = Math.floor(v), mm = Math.round((v - hh) * 60); return mm >= 5 && hh < 10 ? `${hh} h ${mm} min` : `${Math.round(v)} h`; }
  const d = v / 24;
  return d < 10 ? `${nf(1).format(d)} ${d < 1.05 ? "giorno" : "giorni"}` : `${Math.round(d)} giorni`;
}
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const mese = (m) => { const [y, mm] = m.split("-").map(Number); return `${MESI[mm - 1]} ${y}`; };
const meseBreve = (m) => { const [y, mm] = m.split("-").map(Number); return `${MESI[mm - 1].slice(0, 3)} ${String(y).slice(2)}`; };
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"]; // dow 1 = domenica
const muted = { fontSize: 12.5, color: CP.textMuted };
const NUM = { fontVariantNumeric: "tabular-nums" };
const input = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13.5, fontFamily: FONTS.body, maxWidth: "100%" };

const MIN_RATE = 30;   // sotto i 30 fan osservati una percentuale non si legge
const MIN_TIMES = 20;  // sotto i 20 fan i tempi e gli importi tipici sono rumore

// Fasce (stessi limiti della query: lib/percorso-iscritti-sql)
const FIRST_LABELS = ["entro 1 ora", "1-6 ore", "6-24 ore", "1-3 giorni", "3-7 giorni", "7-30 giorni"];
const AMOUNT_LABELS = ["meno di $10", "$10-25", "$25-50", "$50-100", "$100-250", "$250 e oltre"];
const PAUSE_LABELS = ["6-24 ore", "1-3 giorni", "3-7 giorni", "7-14 giorni", "14-30 giorni"];
const FASCE_ORARIE = [["Notte", 0, 6], ["Mattina", 6, 12], ["Pomeriggio", 12, 18], ["Sera", 18, 24]];

/** Le misure di una riga «main» già lette (rapporti, quante su 1.000, valore per iscritto). */
function measures(r) {
  if (!r) return null;
  const spend = rate(r.spent, r.ripe1, MIN_RATE), back = rate(r.back2, r.ripe2, MIN_RATE), back3 = rate(r.back3, r.ripe3, MIN_RATE);
  return {
    r, spend, back, back3,
    perSub: r.ripe1 >= MIN_RATE ? r.net30 / r.ripe1 : null,
    times1: r.spent >= MIN_TIMES, times2: r.back2 >= MIN_TIMES, times3: r.back3 >= MIN_TIMES,
    partial: r.ripe1 < r.subs,
  };
}

/** L'identikit in parole: regole fisse che citano il numero. */
function readings(m, hours) {
  const r = m.r;
  const out = [];
  if (m.spend != null) out.push(`Su 100 nuovi iscritti ne spendono ${nf(1).format(m.spend * 100)} nei primi 30 giorni${m.perSub != null ? `: in media ${usd(m.perSub)} per iscritto` : ""}.`);
  if (m.times1) out.push(`La prima spesa arriva di solito dopo ${dur(r.h_first_p50)}: un quarto compra entro ${dur(r.h_first_p25)}, un altro quarto aspetta più di ${dur(r.h_first_p75)}. Il primo giro vale di solito ${usd(r.a1_p50)} (metà tra ${usd(r.a1_p25)} e ${usd(r.a1_p75)}; la media, ${usd(r.a1_avg)}, è tirata su da pochi che spendono molto).`);
  if (m.back != null) {
    const ferma = 1 - m.back;
    out.push(`Dopo il primo giro ${pct(ferma)} non torna a spendere entro 30 giorni.${m.times2 ? ` Chi torna resta fermo di solito ${dur(r.h_pause1_p50)} (metà tra ${dur(r.h_pause1_p25)} e ${dur(r.h_pause1_p75)}) e al secondo giro spende di solito ${usd(r.a2_p50)}.` : ""}`);
  }
  if (m.back3 != null && m.times3) out.push(`Di chi torna, ${pct(m.back3)} torna anche una terza volta, dopo una pausa tipica di ${dur(r.h_pause2_p50)}, con ${usd(r.a3_p50)}.`);
  if (hours) {
    const tot = hours.reduce((s, h) => s + h.subs, 0);
    if (tot >= 100) {
      let best = 0, bi = 0;
      for (let i = 0; i < 24; i++) { const s = hours[i].subs + hours[(i + 1) % 24].subs + hours[(i + 2) % 24].subs; if (s > best) { best = s; bi = i; } }
      out.push(`Le iscrizioni si concentrano tra le ${bi} e le ${(bi + 3) % 24} (ora italiana): ${pct(best / tot)} del totale in 3 ore.`);
    }
  }
  return out;
}

/** Le tappe del percorso, su 1.000 iscritti: iscrizione → 1ª spesa → 2ª → 3ª, con il tempo tra una e l'altra. */
function Percorso({ m }) {
  const r = m.r;
  const n1 = m.spend != null ? 1000 * m.spend : null;
  const n2 = n1 != null && m.back != null ? n1 * m.back : null;
  const n3 = n2 != null && m.back3 != null ? n2 * m.back3 : null;
  const stops = [
    { t: "Si iscrivono", big: "1.000", sub: "nuovi iscritti", note: m.perSub != null ? `valgono ${usd(m.perSub)} a testa nei primi 30 giorni` : null },
    { t: "Prima spesa", big: n1 != null ? int(n1) : "—", sub: "spendono entro 30 giorni", note: m.times1 ? `primo giro di solito ${usd(r.a1_p50)}` : null },
    { t: "Tornano", big: n2 != null ? int(n2) : "—", sub: "spendono di nuovo entro 30 giorni", note: m.times2 ? `secondo giro di solito ${usd(r.a2_p50)}` : null },
    { t: "Terza volta", big: n3 != null ? int(n3) : "—", sub: "un terzo giro entro 30 giorni", note: m.times3 ? `terzo giro di solito ${usd(r.a3_p50)}` : null },
  ];
  const gaps = [
    m.times1 ? `dopo ${dur(r.h_first_p50)}` : null,
    m.times2 ? `fermi ${dur(r.h_pause1_p50)}` : null,
    m.times3 ? `fermi ${dur(r.h_pause2_p50)}` : null,
  ];
  return (
    <div className="pi-path">
      {stops.map((s, i) => (
        <div key={s.t} style={{ display: "contents" }}>
          <div className="pi-stop" style={{ background: i === 0 ? CP.accent : CP.surface, color: i === 0 ? CP.accentInk : CP.textPrimary, border: `1px solid ${i === 0 ? CP.accent : CP.border}` }}>
            <div style={{ fontSize: 12.5, opacity: 0.7 }}>{s.t}</div>
            <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.15, ...NUM }}>{s.big}</div>
            <div style={{ fontSize: 12.5, opacity: 0.75 }}>{s.sub}</div>
            {s.note && <div style={{ fontSize: 13, marginTop: 6, ...NUM }}>{s.note}</div>}
          </div>
          {i < stops.length - 1 && (
            <div className="pi-gap" aria-hidden={!gaps[i]}>
              <span className="pi-line" style={{ background: CP.borderStrong }} />
              {gaps[i] && <span className="pi-glabel" style={{ fontSize: 12, color: CP.textSecondary, whiteSpace: "nowrap", ...NUM }}>{gaps[i]}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Tabella di fasce: etichetta, fan, % sul totale (con una barra sottile accanto al numero). */
function Fasce({ labels, counts, total, totalLabel, tail }) {
  const max = Math.max(1, ...counts);
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {labels.map((l, i) => (
        <div key={l} style={{ display: "grid", gridTemplateColumns: "minmax(96px, 1fr) 64px 52px minmax(40px, 1.2fr)", gap: 10, alignItems: "center", fontSize: 13.5, padding: "5px 0", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", ...NUM }}>
          <span style={{ color: CP.textSecondary }}>{l}</span>
          <span style={{ textAlign: "right" }}>{int(counts[i])}</span>
          <span style={{ textAlign: "right", color: CP.textMuted }}>{pct(total ? counts[i] / total : null)}</span>
          <span style={{ height: 6, borderRadius: 3, background: CP.track }}><span style={{ display: "block", height: "100%", width: `${(counts[i] / max) * 100}%`, borderRadius: 3, background: "var(--vt-c0)" }} /></span>
        </div>
      ))}
      {tail}
      <div style={{ ...muted, marginTop: 4 }}>{totalLabel}</div>
    </div>
  );
}
const bucketsOf = (r, prefix, n) => Array.from({ length: n }, (_, i) => Number(r?.[`${prefix}${i}`]) || 0);

/** Righe per fascia oraria o giorno: iscritti, quota, quanti spendono, valore per iscritto. */
function GroupTable({ rows }) {
  const tot = rows.reduce((s, x) => s + x.subs, 0);
  return (
    <div style={{ display: "grid", gap: 0, fontSize: 13.5, ...NUM }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(80px, 1fr) repeat(4, minmax(60px, 0.8fr))", gap: 8, ...muted, paddingBottom: 4 }}>
        <span /><span style={{ textAlign: "right" }}>Iscritti</span><span style={{ textAlign: "right" }}>Quota</span><span style={{ textAlign: "right" }}>Spendono</span><span style={{ textAlign: "right" }}>$ a iscritto</span>
      </div>
      {rows.map((x) => (
        <div key={x.label} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 1fr) repeat(4, minmax(60px, 0.8fr))", gap: 8, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
          <span style={{ color: CP.textSecondary }}>{x.label}</span>
          <span style={{ textAlign: "right" }}>{int(x.subs)}</span>
          <span style={{ textAlign: "right", color: CP.textMuted }}>{pct(tot ? x.subs / tot : null)}</span>
          <span style={{ textAlign: "right" }}>{pct(rate(x.spent, x.ripe1, MIN_RATE))}</span>
          <span style={{ textAlign: "right" }}>{x.ripe1 >= MIN_RATE ? usd(x.net30 / x.ripe1) : "—"}</span>
        </div>
      ))}
    </div>
  );
}
const sumGroup = (arr, label) => arr.reduce((a, x) => ({ label, subs: a.subs + x.subs, ripe1: a.ripe1 + x.ripe1, spent: a.spent + x.spent, net30: a.net30 + x.net30 }), { label, subs: 0, ripe1: 0, spent: 0, net30: 0 });

/** Colonne del confronto (tra pagine o tra mesi): stesse misure del percorso, una riga ciascuno. */
function compareColumns(first) {
  const t = (fn) => (x) => (x.m ? fn(x.m) : null);
  return [
    first,
    { key: "subs", label: "Nuovi iscritti", align: "right", render: (x) => int(x.m.r.subs), sort: (x) => x.m.r.subs },
    { key: "spend", label: "Spendono", align: "right", render: (x) => pct(x.m.spend), sort: t((m) => m.spend) },
    { key: "first", label: "Prima spesa dopo", align: "right", render: (x) => (x.m.times1 ? dur(x.m.r.h_first_p50) : "—"), sort: t((m) => (m.times1 ? m.r.h_first_p50 : null)) },
    { key: "a1", label: "Primo giro", align: "right", render: (x) => (x.m.times1 ? usd(x.m.r.a1_p50) : "—"), sort: t((m) => (m.times1 ? m.r.a1_p50 : null)) },
    { key: "back", label: "Tornano", align: "right", render: (x) => pct(x.m.back), sort: t((m) => m.back) },
    { key: "pause", label: "Fermi per", align: "right", render: (x) => (x.m.times2 ? dur(x.m.r.h_pause1_p50) : "—"), sort: t((m) => (m.times2 ? m.r.h_pause1_p50 : null)) },
    { key: "a2", label: "Secondo giro", align: "right", render: (x) => (x.m.times2 ? usd(x.m.r.a2_p50) : "—"), sort: t((m) => (m.times2 ? m.r.a2_p50 : null)) },
    { key: "per", label: "$ a iscritto (30 gg)", align: "right", render: (x) => (x.m.perSub != null ? usd(x.m.perSub) : "—"), sort: t((m) => m.perSub) },
  ];
}

const PATH_CSS = `
.pi-path{display:flex;align-items:stretch;gap:0}
.pi-stop{flex:1 1 0;min-width:0;border-radius:16px;padding:16px 16px 14px}
.pi-gap{flex:0 0 120px;display:flex;align-items:center;justify-content:center;position:relative}
.pi-line{position:absolute;left:0;right:0;top:50%;height:1px}
.pi-glabel{position:relative;transform:translateY(-11px)}
@media (max-width:899px){
  .pi-path{flex-direction:column}
  .pi-gap{flex:0 0 40px}
  .pi-gap{justify-content:flex-start;padding-left:34px}
  .pi-line{left:22px;right:auto;top:0;bottom:0;width:1px;height:auto}
  .pi-glabel{transform:none}
}
.pi-two{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))}
`;

export default function PercorsoIscrittiPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/percorso-iscritti", fetcher, { revalidateOnFocus: false });
  const [page, setPage] = useState("all");
  const [month, setMonth] = useState("all");
  const [busy, setBusy] = useState(false);
  const refresh = async () => { setBusy(true); try { await mutate(await fetcher("/api/admin/percorso-iscritti?refresh=1"), { revalidate: false }); } catch (e) { alertDialog(e.message); } finally { setBusy(false); } };

  const pages = data?.pages || [];
  const months = data?.months || [];
  const nameOf = useMemo(() => Object.fromEntries(pages.map((p) => [p.creator_id, p.name])), [pages]);
  const row = data?.main?.[page]?.[month] || null;
  const m = measures(row);
  const hours = data?.hour?.[page]?.[month] || null;
  const days = data?.dow?.[page]?.[month] || null;
  const links = page !== "all" ? data?.link?.[page]?.[month] || [] : [];
  const lines = m ? readings(m, hours) : [];

  const compareRows = useMemo(() => {
    if (!data) return [];
    if (page === "all") return pages.map((p) => ({ id: p.creator_id, name: p.name, m: measures(data.main?.[p.creator_id]?.[month]) })).filter((x) => x.m && x.m.r.subs > 0);
    return months.map((mo) => ({ id: mo, mo, m: measures(data.main?.[page]?.[mo]) })).filter((x) => x.m && x.m.r.subs > 0);
  }, [data, page, month, pages, months]);

  const scope = `${page === "all" ? "tutte le pagine dello split" : nameOf[page] || "pagina"} · ${month === "all" ? `iscritti degli ultimi ${months.length} mesi` : `iscritti di ${mese(month)}`}`;
  const lastMonth = months[months.length - 1];

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1400, margin: "0 auto" }}>
      <style>{PATH_CSS}</style>
      <PageHead
        crumbs={[{ label: "Comp & Ben" }, { label: "Percorso nuovi iscritti" }]}
        title="Percorso dei nuovi iscritti"
        subtitle="Come entra e spende un fan nuovo: quando si iscrive, dopo quanto e con quanto compra la prima volta, quanto resta fermo, dopo quanto torna e con quanto. Pagine del tuo split, dati del warehouse, solo HOC, aggiornati una volta al giorno."
        actions={<button style={BTN} onClick={refresh} disabled={busy}>{busy ? <Loader2 size={14} /> : <RefreshCw size={14} />}Ricalcola</button>}
      />
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} />Ricostruisco il percorso fan per fan dal warehouse (qualche secondo la prima volta del giorno)…</div>}
      {data && !pages.length && <EmptyState title="Nessuna pagina">Nessuna creator nello split, oppure nessun nuovo iscritto nel warehouse.</EmptyState>}

      {pages.length > 0 && (<>
        <FilterBar>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textMuted }}>Pagina
            <select style={input} value={page} onChange={(e) => setPage(e.target.value)}>
              <option value="all">Tutto lo split</option>
              {pages.map((p) => <option key={p.creator_id} value={p.creator_id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textMuted }}>Iscritti di
            <select style={input} value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">Ultimi {months.length} mesi</option>
              {[...months].reverse().map((mo) => <option key={mo} value={mo}>{mese(mo)}{mo === lastMonth ? " (in corso)" : ""}</option>)}
            </select>
          </label>
          <Spiega style={{ marginLeft: "auto" }}>
            <div><b>Nuovo iscritto</b> = la prima volta che quel fan si iscrive a quella pagina. Chi si era già iscritto in passato e torna non conta: è un ritorno, non un ingresso. Le pagine ITA ed ENG della stessa creator sono separate (fan diversi).</div>
            <div><b>Spesa</b> = messaggi a pagamento, mance e post a pagamento. L'abbonamento e il rinnovo no: sono l'ingresso, non una spesa.</div>
            <div><b>Giro di acquisti</b> = acquisti a meno di {data.rules?.giroGapHours ?? 6} ore l'uno dall'altro: la stessa serata conta come un giro solo. La <b>pausa</b> va dalla fine di un giro all'inizio del successivo.</div>
            <div>Ogni passo si guarda per {data.rules?.stageDays ?? 30} giorni: la prima spesa entro 30 giorni dall'iscrizione, il ritorno entro 30 giorni dalla fine del giro prima. Si contano solo i fan osservati abbastanza: per questo il mese in corso e quello prima hanno ancora pochi numeri, e crescono giorno per giorno.</div>
            <div><b>Di solito</b> = il valore centrale (metà dei fan sta sopra, metà sotto); «metà tra X e Y» = la metà centrale dei fan. Sotto {MIN_RATE} fan osservati le percentuali non si mostrano, sotto {MIN_TIMES} i tempi e gli importi tipici.</div>
            <div>Orari e giorni in ora italiana. Dati aggregati: nessun fan nominato.</div>
          </Spiega>
        </FilterBar>

        {!m || m.r.subs === 0 ? (
          <EmptyState title="Nessun nuovo iscritto">Nessuna iscrizione per {scope}.</EmptyState>
        ) : m.r.ripe1 === 0 ? (
          <EmptyState title="Ancora troppo presto">{int(m.r.subs)} nuovi iscritti per {scope}, ma nessuno ha ancora 30 giorni: il percorso si legge da quando li compiono. Scegli un mese precedente.</EmptyState>
        ) : (<>
          <Panel i={0} title="L'identikit" aside={scope}>
            <Percorso m={m} />
            <div style={{ display: "grid", gap: 6, marginTop: 16 }}>
              {lines.map((l, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.55, color: CP.textSecondary }}>{l}</div>)}
            </div>
            {m.partial && <div style={{ ...muted, marginTop: 8 }}>{int(m.r.subs - m.r.ripe1)} dei {int(m.r.subs)} iscritti non hanno ancora 30 giorni: per ora il percorso si legge sui {int(m.r.ripe1)} che li hanno compiuti.</div>}
          </Panel>

          <div style={{ height: 12 }} />
          <Panel i={1} title="Quando si iscrivono" aside="ora italiana · le colonne sono gli iscritti per ora del giorno">
            {hours && <Bars data={hours.map((h) => h.subs)} labels={hours.map((_, i) => String(i))} hi={hours.reduce((bi, h, i, a) => (h.subs > a[bi].subs ? i : bi), 0)} format={int} unit=" iscritti" height={140} />}
            <div className="pi-two" style={{ marginTop: 14 }}>
              {hours && <GroupTable rows={FASCE_ORARIE.map(([l, a, b]) => sumGroup(hours.slice(a, b), `${l} (${a}-${b})`))} />}
              {days && <GroupTable rows={[1, 2, 3, 4, 5, 6, 0].map((i) => ({ ...days[i], label: GIORNI[i][0].toUpperCase() + GIORNI[i].slice(1) }))} />}
            </div>
            <div style={{ ...muted, marginTop: 8 }}>«Spendono» = quanti fanno almeno un acquisto nei primi 30 giorni; «$ a iscritto» = quanto spendono in media nei primi 30 giorni, contando anche chi non spende.</div>
          </Panel>

          <div style={{ height: 12 }} />
          <div className="pi-two">
            <Panel i={2} title="La prima spesa: dopo quanto" aside={`su ${int(m.r.spent)} che hanno speso entro 30 giorni`}>
              <Fasce labels={FIRST_LABELS} counts={bucketsOf(m.r, "hf", FIRST_LABELS.length)} total={m.r.spent}
                totalLabel={`Non hanno speso nei primi 30 giorni: ${int(m.r.ripe1 - m.r.spent)} su ${int(m.r.ripe1)} (${pct(rate(m.r.ripe1 - m.r.spent, m.r.ripe1))}).`} />
            </Panel>
            <Panel i={3} title="La prima spesa: quanto" aside="il primo giro di acquisti">
              <Fasce labels={AMOUNT_LABELS} counts={bucketsOf(m.r, "a1b", AMOUNT_LABELS.length)} total={m.r.spent}
                totalLabel={m.times1 ? `Di solito ${usd(m.r.a1_p50)}, metà tra ${usd(m.r.a1_p25)} e ${usd(m.r.a1_p75)}, media ${usd(m.r.a1_avg)}.` : "Pochi fan: importo tipico non mostrato."} />
            </Panel>
            <Panel i={4} title="Fermi dopo la prima spesa" aside={`su ${int(m.r.ripe2)} che hanno speso, osservati 30 giorni dopo`}>
              <Fasce labels={PAUSE_LABELS} counts={bucketsOf(m.r, "hp", PAUSE_LABELS.length)} total={m.r.ripe2}
                tail={(
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, 1fr) 64px 52px minmax(40px, 1.2fr)", gap: 10, alignItems: "center", fontSize: 13.5, padding: "5px 0", borderTop: `1px solid ${CP.borderSoft}`, ...NUM }}>
                    <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Non tornano</span>
                    <span style={{ textAlign: "right", fontWeight: 500 }}>{int(m.r.ripe2 - m.r.back2)}</span>
                    <span style={{ textAlign: "right", color: CP.textMuted }}>{pct(rate(m.r.ripe2 - m.r.back2, m.r.ripe2))}</span>
                    <span />
                  </div>
                )}
                totalLabel={m.times2 ? `Chi torna resta fermo di solito ${dur(m.r.h_pause1_p50)} (metà tra ${dur(m.r.h_pause1_p25)} e ${dur(m.r.h_pause1_p75)}). «Non tornano» = nessun acquisto nei 30 giorni dopo il primo giro.` : "«Non tornano» = nessun acquisto nei 30 giorni dopo il primo giro."} />
            </Panel>
            <Panel i={5} title="Quando tornano: quanto" aside={`il secondo giro, su ${int(m.r.back2)} che sono tornati`}>
              <Fasce labels={AMOUNT_LABELS} counts={bucketsOf(m.r, "a2b", AMOUNT_LABELS.length)} total={m.r.back2}
                totalLabel={m.times2 ? `Di solito ${usd(m.r.a2_p50)}, metà tra ${usd(m.r.a2_p25)} e ${usd(m.r.a2_p75)}, media ${usd(m.r.a2_avg)}.${m.times3 ? ` Il terzo giro: di solito ${usd(m.r.a3_p50)}, dopo ${dur(m.r.h_pause2_p50)} di pausa.` : ""}` : "Pochi fan: importo tipico non mostrato."} />
            </Panel>
          </div>

          {page !== "all" && links.length > 0 && (<>
            <div style={{ height: 12 }} />
            <Panel i={6} title="Da dove arrivano" aside="il link della prima iscrizione · i primi 8 per iscritti">
              <GroupTable rows={links.map((l) => ({ ...l, label: l.link }))} />
            </Panel>
          </>)}
        </>)}

        {compareRows.length > 1 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "0 0 10px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{page === "all" ? "Le pagine a confronto" : "Mese per mese"}</h2>
              <span style={muted}>{page === "all" ? `${month === "all" ? `iscritti degli ultimi ${months.length} mesi` : `iscritti di ${mese(month)}`} · tocca una pagina per il suo percorso` : `${nameOf[page] || ""} · tocca un mese per il suo percorso`}</span>
            </div>
            <DataTable
              key={page === "all" ? "pagine" : "mesi"}
              columns={compareColumns(page === "all"
                ? { key: "name", label: "Pagina", render: (x) => x.name, sort: (x) => x.name }
                : { key: "mo", label: "Mese di iscrizione", render: (x) => <span>{meseBreve(x.mo)}{x.mo === lastMonth ? <span style={muted}> · in corso</span> : x.m.partial ? <span style={muted}> · in osservazione</span> : null}</span>, sort: (x) => x.mo })}
              rows={compareRows}
              defaultSort={page === "all" ? { key: "subs", dir: -1 } : { key: "mo", dir: -1 }}
              onRowClick={(x) => { if (page === "all") setPage(x.id); else setMonth(x.mo); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              selected={(x) => (page === "all" ? false : x.mo === month)}
              minWidth={980}
            />
            <div style={{ ...muted, marginTop: 6 }}>Percentuali e valori solo sui fan osservati abbastanza; «—» = troppo pochi fan per dirlo. Tempi e importi = il valore di solito (centrale).</div>
          </div>
        )}
        {data?.cached && <div style={{ ...muted, marginTop: 14 }}>Calcolato oggi.</div>}
      </>)}
    </div>
  );
}
