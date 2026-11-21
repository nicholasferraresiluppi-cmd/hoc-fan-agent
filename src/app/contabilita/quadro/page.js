"use client";

/**
 * /contabilita/quadro — Conti dell'impresa (18/11/2026, Nicholas: «vorrei avere un quadro molto
 * chiaro delle spese, dei deal delle varie persone e creator, così da avere ampia visione su tutti
 * i costi aziendali… stiamo facendo impresa»). Perimetro: lo split di Nicholas.
 *
 * Una pagina sola che risponde a «come stiamo?»: quanto entra dagli accordi creator, quanto costano
 * persone, operatori e spese, quanto resta — mese per mese, dove vanno i soldi, per creator, tutti
 * gli accordi in parole e le cose da sistemare. Entrate, persone e operatori vengono dal Conto dello
 * split (stessa funzione, split-core); le spese non-persona dal registro (spese-core). Calcolo nel
 * browser, testato in tests/spese.mjs. Accesso: lo stesso della Contabilità (admin no).
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Loader2, Lock, Trash2, Check, Download } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, FilterChip, Notice, Tabs, DataTable, SectionTitle, Spiega, EmptyState, card } from "@/components/ds";
import { computeQuadro, computeExpensesMonth, moneyFlow, quadroChecks, sanitizeExpense, CATEGORIES, CADENCES } from "@/lib/spese-core";
import { activeIn } from "@/lib/split-core";
import { describeTiers } from "@/lib/creator-deals-core";
import { monthLabel } from "@/lib/compensi-core";
import { confirmDialog } from "@/components/AppDialogs";
import { buildQuadroExport, exportFileName } from "@/lib/quadro-export";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};
const send = async (url, method, body) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};

const eur = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const usd = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const money = (n, cur) => new Intl.NumberFormat("it-IT", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", maximumFractionDigits: 2, useGrouping: "always" }).format(n || 0);
const pctOf = (f) => (f === null || f === undefined ? "—" : `${Math.round(f * 100)}%`);
const tmpId = () => `e_${Math.random().toString(16).slice(2, 14)}`;

const input = { background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 10px", color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", minHeight: 38, borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, textDecoration: "none", border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary });
const lbl = { fontSize: 12, color: CP.textMuted, marginBottom: 4, display: "block" };
const muted = { fontSize: 12, color: CP.textMuted };
const Field = ({ label, children, style }) => <label style={{ display: "block", ...style }}><span style={lbl}>{label}</span>{children}</label>;
const tint = (c) => `color-mix(in srgb, ${c} 14%, transparent)`;
const Pill = ({ children, tone }) => <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 20, background: tint(tone || CP.textMuted), color: tone || CP.textSecondary, whiteSpace: "nowrap" }}>{children}</span>;
const Gap = () => <div style={{ height: 22 }} />;
const neg = (n) => (n < 0 ? { color: CP.accentRed } : null);

/** "min 2.000 € · 2% · da dic 2026" — un accordo persona in parole. */
function describeDeal(d) {
  const parts = [];
  if (d.fixedEur) parts.push(`${eur(d.fixedEur)} fisso`);
  if (d.min) parts.push(`minimo ${d.minCur === "USD" ? usd(d.min) : eur(d.min)}`);
  if (d.tiers?.length) parts.push(describeTiers(d.tiers));
  if (d.capUsd) parts.push(`fino a ${usd(d.capUsd)} di revenue`);
  let s = parts.join(" · ") || "da impostare";
  if (d.min && d.tiers?.length && !d.fixedEur) s += " (vale il più alto)";
  return s;
}
const period = (x) => [x.from && `da ${monthLabel(x.from)}`, x.to && `fino a ${monthLabel(x.to)}`].filter(Boolean).join(" ");

// ── Editor di una spesa ──────────────────────────────────────────────────────
function ExpenseEditor({ item, teams, onSave, onDelete, onClose }) {
  const [x, setX] = useState(() => ({ currency: "EUR", cadence: "mese", category: CATEGORIES[0], quota: 100, teamId: "", confirmed: false, ...item }));
  const set = (k, v) => setX((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Fornitore"><input style={input} value={x.vendor || ""} onChange={(e) => set("vendor", e.target.value)} /></Field>
        <Field label="Cos'è"><input style={input} value={x.what || ""} onChange={(e) => set("what", e.target.value)} /></Field>
        <Field label="Categoria">
          <select style={input} value={x.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Field label="Importo">
          <div style={{ display: "flex", gap: 6 }}>
            <input style={input} inputMode="decimal" value={x.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
            <select style={{ ...input, width: 70 }} value={x.currency} onChange={(e) => set("currency", e.target.value)}><option value="EUR">€</option><option value="USD">$</option></select>
          </div>
        </Field>
        <Field label="Ogni quanto">
          <select style={input} value={x.cadence} onChange={(e) => set("cadence", e.target.value)}>{Object.entries(CADENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label={x.cadence === "una_tantum" ? "Mese della spesa" : "Da (mese, facoltativo)"}><input style={input} type="month" value={x.from || ""} onChange={(e) => set("from", e.target.value || null)} /></Field>
        {x.cadence !== "una_tantum" && <Field label="Fino a (mese, facoltativo)"><input style={input} type="month" value={x.to || ""} onChange={(e) => set("to", e.target.value || null)} /></Field>}
      </div>
      <div style={muted}>
        {x.cadence === "anno" ? "Annuale: pesa un dodicesimo ogni mese, così il quadro dice quanto costa davvero al mese (non quando esce il bonifico)." : x.cadence === "una_tantum" ? "Una volta: pesa tutta nel mese indicato." : "Mensile: pesa l'importo pieno ogni mese attivo. Per le spese a consumo metti la media e lasciala «da confermare»."}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="Su chi pesa">
          <select style={input} value={x.teamId || ""} onChange={(e) => set("teamId", e.target.value)}>
            <option value="">Generale (nessuna creator)</option>
            {teams.filter((t) => t.creator).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Quota dello split (%)"><input style={input} inputMode="decimal" value={x.quota ?? 100} onChange={(e) => set("quota", e.target.value)} /></Field>
        <Field label="Società"><input style={input} placeholder="es. Superbia" value={x.company || ""} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Chi la paga"><input style={input} placeholder="es. carta ····0442, Asja" value={x.payer || ""} onChange={(e) => set("payer", e.target.value)} /></Field>
      </div>
      <div style={muted}>Quota: una spesa in comune con tutta HOC (es. ClickUp) pesa sul tuo split solo per la parte tua.</div>
      <Field label="Da dove viene (ricevuta, fattura…)"><input style={input} value={x.source || ""} onChange={(e) => set("source", e.target.value)} /></Field>
      <Field label="Nota"><textarea style={{ ...input, minHeight: 50 }} value={x.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: CP.textPrimary }}>
        <input type="checkbox" checked={Boolean(x.confirmed)} onChange={(e) => set("confirmed", e.target.checked)} />Importo e quota verificati
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        {onDelete ? <button style={{ ...btn(), color: CP.accentRed }} onClick={onDelete}><Trash2 size={14} />Elimina spesa</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn()} onClick={onClose}>Annulla</button>
          <button style={btn(true)} disabled={!(x.vendor || x.what)?.trim()} onClick={() => onSave(x)}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────
export default function QuadroPage() {
  const { data, error, mutate } = useSWR("/api/contabilita/quadro", fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [items, setItems] = useState(null);   // registro spese (bozza)
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("quadro");
  const [month, setMonth] = useState(null);
  const [edit, setEdit] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (data?.expenses && !dirty) setItems(data.expenses.items || []); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const today = data?.today || new Date().toISOString().slice(0, 10);
  const quadro = useMemo(() => (data && items ? computeQuadro(data.config, data.months, items, today) : null), [data, items, today]);
  const months = quadro?.months || [];
  // di default l'ultimo mese CHIUSO (il mese in corso è parziale); se non c'è, l'ultimo
  useEffect(() => {
    if (month || !months.length) return;
    setMonth(([...months].reverse().find((m) => !m.partial) || months[months.length - 1]).month);
  }, [months, month]);
  const checks = useMemo(() => (quadro ? quadroChecks(data.config, quadro, items, today) : []), [quadro, data, items, today]);

  if (error) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        <PageHead title="Conti dell'impresa" />
        <div style={{ ...card, padding: 24, display: "flex", gap: 12, alignItems: "center", color: CP.textSecondary }}>
          <Lock size={18} /> {error.status === 403 || error.status === 401 ? "Non hai accesso alla contabilità." : error.message}
        </div>
      </div>
    );
  }
  if (!data || !quadro) return <div style={{ padding: 24, color: CP.textMuted }}>Carico…</div>;

  const cfg = data.config;
  const teamName = (id) => cfg.teams.find((t) => t.id === id)?.name || "agenzia";
  const idx = months.findIndex((m) => m.month === month);
  const qm = months[idx] || null;
  const prev = idx > 0 ? months[idx - 1] : null;
  const fxNow = qm?.fx || [...months].reverse().find((m) => m.fx)?.fx || null;
  const expMonth = qm ? qm.expenses : computeExpensesMonth(items, today.slice(0, 7), fxNow);

  const putItem = (x, isNew) => { const clean = sanitizeExpense(isNew ? { ...x, id: tmpId() } : x, tmpId); setItems((l) => (isNew ? [...l, clean] : l.map((y) => (y.id === clean.id ? clean : y)))); setDirty(true); setEdit(null); };
  const delItem = async (id) => { if (!(await confirmDialog({ title: "Eliminare questa spesa?", ok: "Elimina", danger: true }))) return; setItems((l) => l.filter((y) => y.id !== id)); setDirty(true); setEdit(null); };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await send("/api/contabilita/spese", "PUT", { items, rev: data.expenses.rev ?? 0 });
      setItems(r.doc.items); setDirty(false);
      mutate({ ...data, expenses: r.doc }, { revalidate: false });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // Scarica: gli stessi numeri della pagina in un .xlsx (per un foglio o per Claude). SheetJS al click.
  const download = async () => {
    setExporting(true); setErr(null);
    try {
      const XLSX = await import("xlsx"); // dep pesante: caricata solo qui
      const wb = XLSX.utils.book_new();
      for (const sh of buildQuadroExport(quadro, { today })) {
        const ws = XLSX.utils.aoa_to_sheet(sh.rows);
        for (let r = 1; r < sh.rows.length; r++) {
          for (const [c, z] of Object.entries(sh.formats)) {
            const cell = ws[XLSX.utils.encode_cell({ r, c: Number(c) })];
            if (cell && cell.t === "n") cell.z = z;
          }
        }
        ws["!cols"] = sh.widths.map((wch) => ({ wch }));
        if (sh.name !== "Leggimi") ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.rows.length - 1, c: sh.rows[0].length - 1 } }) };
        XLSX.utils.book_append_sheet(wb, ws, sh.name);
      }
      XLSX.writeFile(wb, exportFileName(today), { compression: true });
      send("/api/contabilita/quadro", "POST", { event: "scaricato" }).catch(() => {});
    } catch (e) { setErr(`Download non riuscito: ${e.message}`); } finally { setExporting(false); }
  };

  const tabs = [["quadro", "Quadro"], ["spese", "Spese"], ["accordi", "Accordi"], ["sistemare", `Da sistemare${checks.length ? ` · ${checks.length}` : ""}`]];
  const delta = qm && prev ? qm.utileEur - prev.utileEur : null;

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1400, margin: "0 auto" }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Contabilità", href: "/contabilita" }, { label: "Conti dell'impresa" }]}
        title="Conti dell'impresa"
        riservato="Riservato: tu e chi autorizzi in «Accessi»"
        subtitle="Il tuo split in una pagina: quanto entra dagli accordi con le creator, quanto costano persone, operatori e spese, quanto resta."
        actions={<>
          {dirty && <button style={btn(true)} onClick={save} disabled={busy}>{busy ? <Loader2 size={14} /> : <Check size={14} />}Salva spese</button>}
          {months.length > 0 && (
            <button style={{ ...btn(), opacity: dirty ? 0.5 : 1, cursor: dirty ? "not-allowed" : "pointer" }} onClick={download} disabled={dirty || exporting} title={dirty ? "Salva le spese prima di scaricare" : "Netti per progetto, mese per mese e totali in un file Excel: si apre in Fogli Google e si può dare a Claude"}>
              {exporting ? <Loader2 size={14} /> : <Download size={14} />}Scarica
            </button>
          )}
          <a href="/contabilita/split" style={btn()}>Conto dello split</a>
        </>}
      />
      {err && <Notice danger>{err}</Notice>}
      {months.length === 0 && <EmptyState title="Nessun mese nel conto">Il quadro parte dai mesi del Conto dello split: creane uno lì con «Nuovo mese».</EmptyState>}
      {months.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {months.map((m) => <FilterChip key={m.month} label={`${monthLabel(m.month)}${m.partial ? " · in corso" : ""}`} active={m.month === month} onClick={() => setMonth(m.month)} />)}
        </div>
      )}
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <div style={{ height: 14 }} />

      {tab === "quadro" && qm && (<>
        <div style={{ background: CP.textPrimary, color: CP.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>Utile di {monthLabel(qm.month)}{qm.partial ? " (mese in corso, fino a oggi)" : ""}</div>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{eur(qm.utileEur)}</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
              Su 100 € che entrano ne restano {qm.marginPct === null ? "—" : Math.round(qm.marginPct * 100)}
              {delta !== null && ` · ${delta >= 0 ? "+" : "−"}${eur(Math.abs(delta))} su ${monthLabel(prev.month)}`}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 18, rowGap: 3, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ opacity: 0.65 }}>Venduto delle creator</span><span style={{ textAlign: "right" }}>{usd(qm.revenueUsd)}</span>
            <span style={{ opacity: 0.65 }}>Entra a HOC</span><span style={{ textAlign: "right" }}>{eur(qm.feeEur)}</span>
            <span style={{ opacity: 0.65 }}>Persone</span><span style={{ textAlign: "right" }}>− {eur(qm.staffEur)}</span>
            <span style={{ opacity: 0.65 }}>Operatori</span><span style={{ textAlign: "right" }}>− {eur(qm.chatterEur)}</span>
            <span style={{ opacity: 0.65 }}>Spese</span><span style={{ textAlign: "right" }}>− {eur(qm.speseEur)}</span>
            {qm.extrasEur > 0 && <><span style={{ opacity: 0.65 }}>Extra</span><span style={{ textAlign: "right" }}>− {eur(qm.extrasEur)}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <Spiega>
            <div><b style={{ fontWeight: 500 }}>Entra a HOC</b> = venduto netto di ogni creator (dopo la quota OnlyFans) × la percentuale del suo accordo, in euro al cambio del mese.</div>
            <div><b style={{ fontWeight: 500 }}>Persone</b> = gli accordi del Conto dello split (sales manager, social, formazione, struttura). <b style={{ fontWeight: 500 }}>Operatori</b> = le buste CreatorsPro del mese.</div>
            <div><b style={{ fontWeight: 500 }}>Spese</b> = il registro spese: le mensili pesano intere, le annuali un dodicesimo al mese, le una tantum nel loro mese; quelle in comune con tutta HOC solo per la quota del tuo split.</div>
            <div>Prima dei costi societari non ancora registrati (commercialista, fiduciari, struttura): finché non sono nel registro, l&apos;utile è più alto del vero.</div>
          </Spiega>
          {expMonth.toConfirm > 0 && <span style={muted}>{expMonth.toConfirm} spese di questo mese sono ancora da confermare.</span>}
        </div>
        {qm.partial && <Notice>Mese in corso: il venduto e le buste degli operatori arrivano fino a oggi, mentre i fissi delle persone e le spese mensili contano già il mese intero. L&apos;utile vero si legge a mese chiuso.</Notice>}
        {qm.problems > 0 && <Notice danger>{qm.problems} creator con dati mancanti in questo mese (venduto, cambio o accordo): contano zero finché non si completano nel Conto dello split.</Notice>}

        <SectionTitle aside="ogni riga è un mese del conto">Mese per mese</SectionTitle>
        <DataTable
          minWidth={820}
          rows={[...months].reverse().map((m) => ({ ...m, id: m.month }))}
          onRowClick={(r) => setMonth(r.month)}
          selected={(r) => r.month === month}
          columns={[
            { key: "month", label: "Mese", render: (r) => <span>{monthLabel(r.month)}{r.partial && <span style={muted}> · in corso</span>}</span> },
            { key: "revenueUsd", label: "Venduto", align: "right", render: (r) => usd(r.revenueUsd) },
            { key: "feeEur", label: "Entra a HOC", align: "right", render: (r) => eur(r.feeEur) },
            { key: "staffEur", label: "Persone", align: "right", render: (r) => eur(r.staffEur) },
            { key: "chatterEur", label: "Operatori", align: "right", render: (r) => eur(r.chatterEur) },
            { key: "speseEur", label: "Spese", align: "right", render: (r) => eur(r.speseEur + r.extrasEur) },
            { key: "utileEur", label: "Utile", align: "right", render: (r) => <strong style={{ fontWeight: 500, ...neg(r.utileEur) }}>{eur(r.utileEur)}</strong> },
            { key: "marginPct", label: "Resta", align: "right", render: (r) => pctOf(r.marginPct) },
          ]}
        />
        {quadro.missing.length > 0 && <div style={{ ...muted, marginTop: 6 }}>Mancano nel conto: {quadro.missing.map(monthLabel).join(", ")}. Si aggiungono dal Conto dello split con «Nuovo mese».</div>}
        <Gap />

        <SectionTitle aside={`${monthLabel(qm.month)} · su ${eur(qm.feeEur)} che entrano`}>Dove vanno i soldi</SectionTitle>
        <DataTable
          minWidth={560}
          rows={moneyFlow(qm).map((r) => ({ ...r, id: r.key }))}
          columns={[
            { key: "label", label: "Voce", render: (r) => <span>{r.label} <span style={muted}>{r.kind}</span></span> },
            { key: "eur", label: "Costo del mese", align: "right", render: (r) => eur(r.eur) },
            { key: "share", label: "Su 100 € che entrano", align: "right", render: (r) => (r.share === null ? "—" : `${Math.round(r.share * 100)} €`) },
          ]}
        />
        <Gap />

        <SectionTitle aside="ordinate per quanto resta; le spese generali non sono divise sulle creator">Per creator</SectionTitle>
        <DataTable
          minWidth={820}
          rows={qm.creators}
          columns={[
            { key: "name", label: "Creator", render: (r) => <span>{r.name}{r.manager && <span style={muted}> · {r.manager.split(" ")[0]}</span>}</span> },
            { key: "revenueUsd", label: "Venduto", align: "right", render: (r) => usd(r.revenueUsd) },
            { key: "feeEur", label: "Entra a HOC", align: "right", render: (r) => eur(r.feeEur) },
            { key: "costEur", label: "Costa", align: "right", render: (r) => eur(r.costEur) },
            { key: "speseEur", label: "di cui spese", align: "right", render: (r) => (r.speseEur ? eur(r.speseEur) : "") },
            { key: "utileEur", label: "Resta", align: "right", render: (r) => <strong style={{ fontWeight: 500, ...neg(r.utileEur) }}>{eur(r.utileEur)}</strong> },
            { key: "pct", label: "%", align: "right", sort: (r) => (r.feeEur > 0 ? r.utileEur / r.feeEur : -Infinity), render: (r) => (r.problems.length ? <Pill tone={CP.accentSoftText}>dati mancanti</Pill> : pctOf(r.feeEur > 0 ? r.utileEur / r.feeEur : null)) },
          ]}
        />
        {(() => {
          const gen = qm.calc.teams.filter((t) => !t.creator).reduce((s, t) => s + t.costEur, 0) + qm.calc.orphans.reduce((s, d) => s + d.cost.eur, 0) + (qm.expenses.byTeam[""] || 0) + qm.calc.agencyExtras.reduce((s, x) => s + Number(x.eur || 0), 0);
          return <div style={{ ...muted, marginTop: 6 }}>Costi che non stanno su nessuna creator (struttura, Academy, spese generali): {eur(gen)}.</div>;
        })()}
      </>)}

      {tab === "spese" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: CP.textSecondary }}>Spese di {monthLabel(qm?.month || today.slice(0, 7))}</div>
            <div style={{ fontSize: 32, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: CP.textPrimary }}>{eur(expMonth.totalEur)}</div>
            <div style={muted}>{items.length} voci nel registro · {expMonth.lines.length} pesano su questo mese · {expMonth.toConfirm} da confermare</div>
          </div>
          <button style={btn(true)} onClick={() => setEdit({ item: { vendor: "", what: "", amount: "", from: null, to: null, note: "", source: "", company: "", payer: "" }, isNew: true })}><Plus size={14} />Aggiungi spesa</button>
        </div>
        <Spiega label="Cosa va qui">
          <div>Tutto quello che si paga e non è una persona: software, servizi tecnici, AI, pubblicità, consulenti e avvocati, banca. Compensi e operatori stanno nel Conto dello split.</div>
          <div>«Da confermare» = importo stimato o letto a metà (per esempio dentro un PDF non aperto), oppure quota del tuo split non decisa. Spunta «verificati» quando lo sai.</div>
        </Spiega>
        <div style={{ height: 10 }} />
        {items.length === 0 && <EmptyState title="Registro vuoto">Aggiungi la prima spesa.</EmptyState>}
        {CATEGORIES.map((cat) => {
          const rows = items.filter((x) => x.category === cat);
          if (!rows.length) return null;
          const lineOf = (x) => expMonth.lines.find((l) => l.id === x.id);
          const tot = rows.reduce((s, x) => s + (lineOf(x)?.eur || 0), 0);
          return (
            <div key={cat} style={{ marginBottom: 18 }}>
              <SectionTitle aside={`${eur(tot)} nel mese`}>{cat}</SectionTitle>
              <DataTable
                minWidth={820}
                rows={rows}
                defaultSort={{ key: "month", dir: -1 }}
                onRowClick={(r) => setEdit({ item: r, isNew: false })}
                columns={[
                  { key: "vendor", label: "Fornitore", render: (r) => <div><div>{r.vendor}</div>{r.what && <div style={muted}>{r.what}</div>}</div> },
                  { key: "amount", label: "Importo", align: "right", render: (r) => (r.amount ? <span>{money(r.amount, r.currency)} <span style={muted}>{CADENCES[r.cadence]}</span></span> : <span style={{ color: CP.accentSoftText }}>importo da inserire</span>) },
                  { key: "teamId", label: "Su chi", sort: (r) => teamName(r.teamId), render: (r) => <span style={{ fontSize: 13 }}>{r.teamId ? teamName(r.teamId) : "generale"}{r.quota < 100 && <span style={muted}> · quota {String(r.quota).replace(".", ",")}%</span>}</span> },
                  { key: "period", label: "Quando", sortable: false, render: (r) => <span style={muted}>{r.cadence === "una_tantum" ? (r.from ? monthLabel(r.from) : "mese mancante") : period(r) || "sempre"}</span> },
                  { key: "month", label: "Questo mese", align: "right", sort: (r) => lineOf(r)?.eur || 0, render: (r) => (lineOf(r) ? eur(lineOf(r).eur) : <span style={muted}>—</span>) },
                  { key: "confirmed", label: "Stato", sort: (r) => (r.confirmed ? 1 : 0), render: (r) => (r.confirmed ? <Pill tone={CP.accentGreen}>verificata</Pill> : <Pill tone={CP.accentSoftText}>da confermare</Pill>) },
                ]}
              />
            </div>
          );
        })}
      </>)}

      {tab === "accordi" && (<>
        <SectionTitle aside={`${cfg.teams.filter((t) => t.creator).length} creator · si modificano nel Conto dello split`}>Accordi con le creator</SectionTitle>
        <DataTable
          minWidth={760}
          rows={cfg.teams.filter((t) => t.creator)}
          columns={[
            { key: "name", label: "Creator", render: (r) => <span style={{ opacity: r.to && r.to < today.slice(0, 7) ? 0.55 : 1 }}>{r.name}</span> },
            { key: "deal", label: "A HOC va", sort: (r) => r.tiers?.[0]?.pct || 0, render: (r) => (r.tiers?.length ? describeTiers(r.tiers) : <Pill tone={CP.accentSoftText}>da impostare</Pill>) },
            { key: "manager", label: "Sales manager", render: (r) => r.manager || "—" },
            { key: "people", label: "Persone", align: "right", sort: (r) => cfg.people.filter((d) => d.teamIds.includes(r.id) && activeIn(d, month || today.slice(0, 7))).length, render: (r) => cfg.people.filter((d) => d.teamIds.includes(r.id) && activeIn(d, month || today.slice(0, 7))).length },
            { key: "period", label: "Quando", sortable: false, render: (r) => <span style={muted}>{period(r)}</span> },
          ]}
        />
        <Gap />
        {(() => {
          const m = month || today.slice(0, 7);
          const costOf = new Map((qm?.calc.deals || []).map((d) => [d.id, d.cost.eur]));
          const rows = cfg.people.filter((d) => !(d.to && d.to < m)).map((d) => ({ ...d, cost: costOf.get(d.id) ?? null, onTeams: d.teamIds.map(teamName).join(" + ") || "agenzia" }));
          return (<>
            <SectionTitle aside={`${rows.length} accordi validi da ${monthLabel(m)} in poi · costo calcolato su ${monthLabel(m)}`}>Accordi con le persone</SectionTitle>
            <DataTable
              minWidth={900}
              rows={rows}
              defaultSort={{ key: "cost", dir: -1 }}
              columns={[
                { key: "person", label: "Persona", render: (r) => <div><div>{r.person || "(da assegnare)"}</div><div style={muted}>{r.role}</div></div> },
                { key: "onTeams", label: "Su chi", render: (r) => <span style={{ fontSize: 13 }}>{r.onTeams}</span> },
                { key: "deal", label: "Accordo", sortable: false, render: (r) => <span style={{ fontSize: 13 }}>{describeDeal(r)}</span> },
                { key: "period", label: "Quando", sortable: false, render: (r) => <span style={muted}>{period(r)}</span> },
                { key: "cost", label: `Costo ${monthLabel(m)}`, align: "right", render: (r) => (r.cost === null ? <span style={muted}>non attivo</span> : eur(r.cost)) },
              ]}
            />
          </>);
        })()}
      </>)}

      {tab === "sistemare" && (<>
        <SectionTitle aside="controlli automatici sui dati, ricalcolati a ogni apertura">Da sistemare</SectionTitle>
        {checks.length === 0 && <EmptyState title="Niente da sistemare">Accordi coerenti, spese verificate, mesi completi.</EmptyState>}
        <div style={{ display: "grid", gap: 8 }}>
          {checks.map((c) => (
            <div key={c.id} style={{ ...card, padding: "12px 14px", display: "grid", gap: 4 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Pill>{c.kind}</Pill><span style={{ fontSize: 14, color: CP.textPrimary }}>{c.title}</span></div>
              <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{c.detail}</div>
            </div>
          ))}
        </div>
      </>)}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.isNew ? "Nuova spesa" : `Spesa · ${edit?.item?.vendor || ""}`} maxWidth={760}>
        {edit && <ExpenseEditor item={edit.item} teams={cfg.teams} onClose={() => setEdit(null)} onSave={(x) => putItem(x, edit.isNew)} onDelete={edit.isNew ? null : () => delItem(edit.item.id)} />}
      </Modal>
    </div>
  );
}
