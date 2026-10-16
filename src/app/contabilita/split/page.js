"use client";

/**
 * /contabilita/split — Conto dello split (15/10/2026, Nicholas).
 *
 * Il foglio "Team & Stipendi" in app: per ogni team (= una creator dello split)
 * la fee HOC sulla sua revenue, meno chi ci lavora (accordi persona), chatter ed
 * extra del mese = il netto. Calcolo in lib/split-core (testato in tests/split.mjs,
 * rifà agosto 2026 al centesimo). Accesso: lo stesso della Contabilità (admin no);
 * gli accordi li modifica solo il titolare, i numeri del mese chi ha l'accesso.
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Loader2, Lock, Trash2, Check, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, FilterChip, Notice, card } from "@/components/ds";
import { computeSplitMonth, applyBusteExclusions, activeIn } from "@/lib/split-core";
import { describeTiers, parseDealText } from "@/lib/creator-deals-core";
import { monthLabel, nextMonthId } from "@/lib/compensi-core";

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
const usd = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct = (f) => `${(Math.round(f * 10000) / 100).toLocaleString("it-IT")}%`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const tmpId = () => `s_${Math.random().toString(16).slice(2, 14)}`;

const input = { background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 10px", color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const small = { ...input, padding: "5px 8px", fontSize: 13 };
const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary });
const lbl = { fontSize: 12, color: CP.textMuted, marginBottom: 4, display: "block" };
const muted = { fontSize: 12, color: CP.textMuted };
const Field = ({ label, children, style }) => <label style={{ display: "block", ...style }}><span style={lbl}>{label}</span>{children}</label>;
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : v);

/** "min 2.200€ · 3% sopra 80.000$ · tetto 100.000$" */
function describeDeal(d) {
  const parts = [];
  if (d.fixedEur) parts.push(`${eur(d.fixedEur)} fisso`);
  if (d.min) parts.push(`minimo ${d.minCur === "USD" ? usd(d.min) : eur(d.min)}`);
  if (d.tiers?.length) parts.push(describeTiers(d.tiers));
  if (d.capUsd) parts.push(`fino a ${usd(d.capUsd)} di revenue`);
  return parts.join(" · ") || "da impostare";
}
const period = (x) => (x.from || x.to ? `${x.from ? `da ${monthLabel(x.from)}` : ""}${x.from && x.to ? " " : ""}${x.to ? `fino a ${monthLabel(x.to)}` : ""}` : "");

// ── Stile fintech (15/10/2026): schede con un numero grande, etichetta a pillola, dettagli piccoli ──
const tint = (c) => `color-mix(in srgb, ${c} 14%, transparent)`;
const fcard = (clickable) => ({ textAlign: "left", cursor: clickable ? "pointer" : "default", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 16, color: CP.textPrimary, fontFamily: FONTS.body, display: "grid", gap: 6, alignContent: "start" });
const addCard = { textAlign: "left", cursor: "pointer", background: "transparent", border: `1px dashed ${CP.border}`, borderRadius: 14, padding: 16, color: CP.textSecondary, fontFamily: FONTS.body, display: "flex", alignItems: "center", gap: 8, minHeight: 90, fontSize: 14 };
const cardGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 };
const bigNum = { fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" };
const Pill = ({ children, tone }) => <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 20, background: tint(tone || CP.textMuted), color: tone || CP.textSecondary }}>{children}</span>;
const Head = ({ title, aside }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "4px 0 10px" }}><span style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{title}</span>{aside != null && <span style={{ fontSize: 13, color: CP.textMuted }}>{aside}</span>}</div>;
/** Il numero da mettere in grande per un accordo persona. */
function dealHeadline(d) {
  if (d.fixedEur && !d.tiers?.length) return eur(d.fixedEur);
  if (d.fixedEur) return `${eur(d.fixedEur)} + %`;
  if (d.min) return `min ${d.minCur === "USD" ? usd(d.min) : eur(d.min)}`;
  if (d.tiers?.length) return d.tiers.length === 1 && !d.tiers[0].fromUsd ? pct(d.tiers[0].pct) : "a scaglioni";
  return "—";
}
/** Stato temporale di un team o accordo rispetto al mese aperto. */
function periodPill(x, m) {
  if (x.from && m && x.from > m) return <Pill tone={CP.accentSoftText}>da {monthLabel(x.from)}</Pill>;
  if (x.to && m && x.to < m) return <Pill>finito a {monthLabel(x.to)}</Pill>;
  if (x.to) return <Pill tone={CP.accentSoftText}>fino a {monthLabel(x.to)}</Pill>;
  if (x.from) return <Pill tone={CP.accentGreen}>da {monthLabel(x.from)}</Pill>;
  return null;
}

// ── Accordo persona ──────────────────────────────────────────────────────────
function PersonEditor({ deal, teams, onSave, onDelete, onClose }) {
  const [d, setD] = useState(() => ({ alloc: "uguale", minCur: "EUR", teamIds: [], ...deal }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const parsed = useMemo(() => (d.pctText?.trim() ? parseDealText(d.pctText) : { tiers: [], warnings: [] }), [d.pctText]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Persona"><input style={input} value={d.person || ""} onChange={(e) => set("person", e.target.value)} /></Field>
        <Field label="Ruolo"><input style={input} value={d.role || ""} onChange={(e) => set("role", e.target.value)} /></Field>
      </div>
      <div>
        <span style={lbl}>Su quali team lavora (la % si calcola sulla revenue sommata di questi team)</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {teams.map((t) => {
            const on = d.teamIds.includes(t.id);
            return <FilterChip key={t.id} label={t.name} active={on} onClick={() => set("teamIds", on ? d.teamIds.filter((i) => i !== t.id) : [...d.teamIds, t.id])} />;
          })}
        </div>
        {d.teamIds.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={muted}>Il costo si divide</span>
            <FilterChip label="in parti uguali" active={d.alloc !== "revenue"} onClick={() => set("alloc", "uguale")} />
            <FilterChip label="in proporzione alla revenue" active={d.alloc === "revenue"} onClick={() => set("alloc", "revenue")} />
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Fisso al mese (€)"><input style={input} inputMode="decimal" value={d.fixedEur ?? ""} onChange={(e) => set("fixedEur", e.target.value)} /></Field>
        <Field label="Minimo garantito">
          <div style={{ display: "flex", gap: 6 }}>
            <input style={input} inputMode="decimal" value={d.min ?? ""} onChange={(e) => set("min", e.target.value)} />
            <select style={{ ...input, width: 70 }} value={d.minCur} onChange={(e) => set("minCur", e.target.value)}><option value="EUR">€</option><option value="USD">$</option></select>
          </div>
        </Field>
        <Field label="Tetto revenue ($, facoltativo)"><input style={input} inputMode="decimal" value={d.capUsd ?? ""} onChange={(e) => set("capUsd", e.target.value)} /></Field>
      </div>
      <Field label="Percentuale sulla revenue (es. «15% flat», «10% <= 30k; 7,5% <= 50k; 5% > 50k», «3% > 80k; 3,5% > 100k»)">
        <input style={input} value={d.pctText || ""} onChange={(e) => set("pctText", e.target.value)} />
      </Field>
      <div style={muted}>
        {parsed.tiers.length ? `Letto: ${describeTiers(parsed.tiers)}. ` : ""}
        Vale lo scaglione raggiunto, su tutta la revenue. Con un minimo: prende il più alto tra minimo e percentuale; il fisso si somma sempre.
      </div>
      {parsed.warnings.map((w) => <Notice key={w} danger>{w}</Notice>)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Da (mese, facoltativo)"><input style={input} type="month" value={d.from || ""} onChange={(e) => set("from", e.target.value || null)} /></Field>
        <Field label="Fino a (mese, facoltativo)"><input style={input} type="month" value={d.to || ""} onChange={(e) => set("to", e.target.value || null)} /></Field>
      </div>
      <Field label="Nota"><textarea style={{ ...input, minHeight: 50 }} value={d.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        {onDelete ? <button style={{ ...btn(), color: CP.accentRed }} onClick={onDelete}><Trash2 size={14} />Elimina accordo</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn()} onClick={onClose}>Annulla</button>
          <button style={btn(true)} disabled={!(d.person || d.role)?.trim()} onClick={() => onSave({ ...d, fixedEur: numOrNull(d.fixedEur), min: numOrNull(d.min), capUsd: numOrNull(d.capUsd), tiers: parsed.tiers })}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────
function TeamEditor({ team, onSave, onDelete, onClose }) {
  const [t, setT] = useState(() => ({ ...team, idsText: (team.creatorIds || []).join(", "), aliasText: (team.cpAliases || []).join("; ") }));
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const parsed = useMemo(() => (t.dealText?.trim() ? parseDealText(t.dealText) : { tiers: [], warnings: [] }), [t.dealText]);
  const save = () => onSave({
    ...t, tiers: parsed.tiers,
    creatorIds: t.idsText.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0),
    cpAliases: t.aliasText.split(";").map((s) => s.trim()).filter(Boolean),
  });
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Nome del team"><input style={input} value={t.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Creator (vuoto = team senza creator, es. Academy)"><input style={input} value={t.creator || ""} onChange={(e) => set("creator", e.target.value)} /></Field>
        <Field label="Sales manager di riferimento"><input style={input} value={t.manager || ""} onChange={(e) => set("manager", e.target.value)} /></Field>
      </div>
      {t.creator?.trim() && (<>
        <Field label="Accordo HOC sulla revenue della creator (es. «60% flat», «35% <= 25k; 40% <= 55k; 50% > 55k»)">
          <input style={input} value={t.dealText || ""} onChange={(e) => set("dealText", e.target.value)} />
        </Field>
        <div style={muted}>{parsed.tiers.length ? `Letto: ${describeTiers(parsed.tiers)} — scaglione raggiunto, su tutta la revenue.` : "Accordo non ancora impostato."}</div>
        {parsed.warnings.map((w) => <Notice key={w} danger>{w}</Notice>)}
      </>)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Attivo da (mese)"><input style={input} type="month" value={t.from || ""} onChange={(e) => set("from", e.target.value || null)} /></Field>
        <Field label="Fino a (mese)"><input style={input} type="month" value={t.to || ""} onChange={(e) => set("to", e.target.value || null)} /></Field>
      </div>
      <details>
        <summary style={{ ...muted, cursor: "pointer" }}>Collegamento ai dati (per «Prendi dai dati»)</summary>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <Field label="Pagine OnlyFans (creator_id, separati da virgola) → revenue dal warehouse"><input style={input} value={t.idsText} onChange={(e) => set("idsText", e.target.value)} /></Field>
          <Field label="Alias CreatorsPro (separati da ;) → costo chatter"><input style={input} value={t.aliasText} onChange={(e) => set("aliasText", e.target.value)} /></Field>
        </div>
      </details>
      <Field label="Nota"><textarea style={{ ...input, minHeight: 50 }} value={t.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        {onDelete ? <button style={{ ...btn(), color: CP.accentRed }} onClick={onDelete}><Trash2 size={14} />Elimina team</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn()} onClick={onClose}>Annulla</button>
          <button style={btn(true)} disabled={!t.name?.trim()} onClick={save}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

// ── Dettaglio di un team nel mese ────────────────────────────────────────────
function TeamDetail({ t, fx, onExclude }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {t.creator && <div style={{ fontSize: 13, color: CP.textSecondary }}>Accordo: {t.tiers?.length ? describeTiers(t.tiers) : "non impostato"} → {t.revenueUsd !== null ? `${usd(t.revenueUsd)} × ${pct(t.feePct)} = ${usd(t.feeUsd)} × ${fx ?? "?"} = ${eur(t.feeEur)}` : "revenue mancante"}</div>}
      {t.members.map((x) => (
        <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
          <div>
            <div style={{ color: CP.textPrimary }}>{x.person || "(da assegnare)"} <span style={muted}>{x.role}</span></div>
            <div style={muted}>
              {describeDeal(x.deal)}
              {x.deal.tiers?.length ? ` → su ${usd(x.deal.baseUsd)}: ${x.deal.cost.minApplied ? "vale il minimo" : `${pct(x.deal.cost.pct)} = ${eur(x.deal.cost.commissionEur)}`}` : ""}
              {x.share < 1 ? ` · quota di questo team ${pct(x.share)} di ${eur(x.deal.cost.eur)}` : ""}
            </div>
          </div>
          <span style={{ whiteSpace: "nowrap" }}>{eur(x.eur)}</span>
        </div>
      ))}
      {t.chatterUsd !== null && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 6 }}><span>Chatter {usd(t.chatterUsd)}{t.chatterSource ? <span style={muted}> · {t.chatterSource}</span> : null}</span><span>{eur(t.chatterEur)}</span></div>}
      {t.chatterBuste?.length > 0 && (
        <details>
          <summary style={{ ...muted, cursor: "pointer" }}>Le {t.chatterBuste.length} buste del chatter</summary>
          <div style={{ marginTop: 6 }}>
            {t.chatterBuste.map((b, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0", color: CP.textSecondary }}>
                <span>{b.name} <span style={{ color: ["PAID", "CLOSED", "PAYABLE"].includes(b.status) ? CP.textMuted : CP.accentSoftText }}>{b.status === "OPEN" ? "aperta" : b.status === "PAID" ? "pagata" : b.status === "CLOSED" ? "chiusa" : b.status === "PAYABLE" ? "da pagare" : b.status.toLowerCase()}</span>{b.usd < b.wageUsd - 1 ? <span style={{ color: CP.textMuted }}> · divisa: {usd(b.usd)} su {usd(b.wageUsd)}</span> : null}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{usd(b.usd)}{onExclude && <button style={{ ...btn(), padding: "2px 8px", fontSize: 11 }} onClick={() => onExclude(b.name)}>Escludi</button>}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {t.extras.map((x) => <div key={x.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Extra: {x.label}{x.person ? ` (${x.person})` : ""}</span><span>{eur(x.eur)}</span></div>)}
      {t.problems.length > 0 && <div style={{ fontSize: 12, color: CP.accentSoftText }}>{t.problems.join(" · ")}</div>}
      {t.note && <div style={muted}>{t.note}</div>}
    </div>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────
export default function SplitPage() {
  const { data: home, error: homeErr, mutate: mutateHome } = useSWR("/api/contabilita/split", fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [month, setMonth] = useState(null);
  const months = home?.months || [];
  useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);
  const { data: md, error: mErr, mutate: mutateMonth } = useSWR(month ? `/api/contabilita/split/mese?m=${month}` : null, fetcher, { revalidateOnFocus: false });

  const [cfg, setCfg] = useState(null);       // accordi (bozza)
  const [cfgDirty, setCfgDirty] = useState(false);
  const [doc, setDoc] = useState(null);       // mese (bozza)
  const [docDirty, setDocDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState("conto");
  const [open, setOpen] = useState(null);     // team aperto nel conto
  const [updating, setUpdating] = useState(false); // finestra «Aggiorna il mese»
  const [editTeam, setEditTeam] = useState(null);
  const [editDeal, setEditDeal] = useState(null);

  useEffect(() => { if (home?.config && !cfgDirty) setCfg(home.config); }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (md?.doc && !(docDirty && doc?.month === md.doc.month)) { setDoc(md.doc); setDocDirty(false); } }, [md]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cfgDirty && !docDirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cfgDirty, docDirty]);

  const calc = useMemo(() => (cfg && doc ? computeSplitMonth(cfg, doc) : null), [cfg, doc]);

  if (homeErr) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        <PageHead title="Conto dello split" />
        <div style={{ ...card, padding: 24, display: "flex", gap: 12, alignItems: "center", color: CP.textSecondary }}>
          <Lock size={18} /> {homeErr.status === 403 || homeErr.status === 401 ? "Non hai accesso alla contabilità." : homeErr.message}
        </div>
      </div>
    );
  }
  if (!home || !cfg) return <div style={{ padding: 24, color: CP.textMuted }}>Carico…</div>;
  const owner = home.owner;

  const upd = (fn) => { setDoc((d) => fn(d)); setDocDirty(true); };
  const updCfg = (fn) => { setCfg((c) => fn(c)); setCfgDirty(true); };
  const setTeamInput = (teamId, k, v) => upd((d) => ({ ...d, teams: { ...d.teams, [teamId]: { ...(d.teams?.[teamId] || {}), [k]: v === "" ? null : v, [k === "revenueUsd" ? "revenueSource" : "chatterSource"]: "a mano" } } }));

  const run = async (what, fn) => { setBusy(what); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(null); } };
  const saveDoc = () => run("doc", async () => { const r = await send(`/api/contabilita/split/mese?m=${month}`, "PUT", { doc, rev: doc.rev ?? null }); setDoc(r.doc); setDocDirty(false); mutateMonth({ doc: r.doc }, { revalidate: false }); });
  const saveCfg = () => run("cfg", async () => { const r = await send("/api/contabilita/split", "PUT", { config: cfg, rev: home.config.rev ?? 0 }); setCfg(r.config); setCfgDirty(false); mutateHome({ ...home, config: r.config }, { revalidate: false }); });
  const newMonth = () => run("new", async () => {
    if (docDirty && !confirm("Modifiche non salvate nel mese aperto. Continuare?")) return;
    const target = months.length ? nextMonthId(months[0]) : thisMonth();
    if (!confirm(`Creare ${monthLabel(target)}? Gli accordi sono quelli attuali; revenue, chatter ed extra si inseriscono nel mese.`)) return;
    await send(`/api/contabilita/split/mese?m=${target}`, "POST");
    await mutateHome(); setMonth(target);
  });
  const fromData = () => run("dati", async () => {
    const r = await fetcher(`/api/contabilita/split/dati?m=${month}`);
    upd((d) => {
      const teams = { ...(d.teams || {}) };
      for (const [id, v] of Object.entries(r.revenue || {})) teams[id] = { ...(teams[id] || {}), revenueUsd: v, revenueSource: `warehouse${r.partial ? " (parziale)" : ""}` };
      const bs = r.busteStatus;
      const src = bs ? `buste CreatorsPro${bs.open ? ` · ${bs.open} su ${bs.total} non chiuse` : " · tutte chiuse"}` : "CreatorsPro";
      for (const [id, v] of Object.entries(r.chatter || {})) teams[id] = { ...(teams[id] || {}), chatterUsd: v, chatterSource: src, chatterBuste: r.buste?.[id] || [] };
      return { ...d, teams: d.excludedBuste?.length ? applyBusteExclusions(teams, d.excludedBuste) : teams };
    });
    setInfo([`Presi: revenue di ${Object.keys(r.revenue || {}).length} team, chatter di ${Object.keys(r.chatter || {}).length}. Controlla e salva.`, ...(r.notes || [])].join(" "));
  });
  const excludeBusta = (name) => {
    const note = prompt(`Togliere la busta di ${name} dal conto di ${monthLabel(month)}? Motivo (facoltativo):`);
    if (note === null) return;
    upd((d) => {
      const excludedBuste = [...(d.excludedBuste || []), { name, note, at: Date.now() }];
      return { ...d, excludedBuste, teams: applyBusteExclusions(d.teams, excludedBuste) };
    });
  };
  const includeBusta = (name) => upd((d) => ({ ...d, excludedBuste: (d.excludedBuste || []).filter((x) => x.name !== name) }));
  const fetchFx = () => run("fx", async () => { const r = await fetcher(`/api/contabilita/tasso?m=${month}`); upd((d) => ({ ...d, fx: { rate: r.rate, source: r.source } })); });

  const teamsAll = cfg.teams || [];
  const teamName = (id) => teamsAll.find((t) => t.id === id)?.name || "agenzia";
  const putTeam = (t, isNew) => { updCfg((c) => ({ ...c, teams: isNew ? [...c.teams, { ...t, id: tmpId() }] : c.teams.map((x) => (x.id === t.id ? t : x)) })); setEditTeam(null); };
  const delTeam = (id) => { if (!confirm("Eliminare il team? Gli accordi persona perdono questo team.")) return; updCfg((c) => ({ ...c, teams: c.teams.filter((x) => x.id !== id), people: c.people.map((p) => ({ ...p, teamIds: p.teamIds.filter((i) => i !== id) })) })); setEditTeam(null); };
  const putDeal = (d, isNew) => { updCfg((c) => ({ ...c, people: isNew ? [...c.people, { ...d, id: tmpId() }] : c.people.map((x) => (x.id === d.id ? d : x)) })); setEditDeal(null); };
  const delDeal = (id) => { if (!confirm("Eliminare questo accordo?")) return; updCfg((c) => ({ ...c, people: c.people.filter((x) => x.id !== id) })); setEditDeal(null); };

  const T = calc?.totals;
  const tabs = [["conto", "Conto del mese"], ["extra", "Spese extra"], ["persone", "Persone"], ["accordi", owner ? "Team e accordi" : "Accordi"]];

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1280, margin: "0 auto" }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Contabilità", href: "/contabilita" }, { label: "Conto dello split" }]}
        title="Conto dello split"
        subtitle="Per ogni creator: quanto entra a HOC dal suo accordo, quanto costa chi ci lavora, il netto. Revenue in dollari, tutto il resto in euro al cambio del mese. Visibile solo a chi ha l'accesso contabilità."
        actions={<>
          {docDirty && <button style={btn(true)} onClick={saveDoc} disabled={busy === "doc"}>{busy === "doc" ? <Loader2 size={14} /> : <Check size={14} />}Salva il mese</button>}
          {cfgDirty && <button style={btn(true)} onClick={saveCfg} disabled={busy === "cfg"}>{busy === "cfg" ? <Loader2 size={14} /> : <Check size={14} />}Salva accordi</button>}
          <button style={btn()} onClick={newMonth} disabled={busy === "new"}><Plus size={14} />Nuovo mese</button>
        </>}
      />
      {err && <Notice danger>{err}</Notice>}
      {months.length === 0 && <Notice>Nessun mese ancora: crealo con «Nuovo mese».</Notice>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {months.map((m) => <FilterChip key={m} label={monthLabel(m)} active={m === month} onClick={() => { if (docDirty && !confirm("Modifiche non salvate: cambiare mese le perde. Continuare?")) return; setDocDirty(false); setMonth(m); }} />)}
      </div>
      {mErr && <Notice danger>{mErr.message}</Notice>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map(([k, l]) => <FilterChip key={k} label={l} active={tab === k} onClick={() => setTab(k)} />)}
      </div>

      {calc && doc && (<>
        {/* Stile fintech (scelto da Nicholas 15/10/2026): un riquadro protagonista col netto, una scheda per creator. */}
        <div style={{ background: CP.textPrimary, color: CP.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>Netto {monthLabel(month)}</div>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{eur(T.netEur)}</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>{usd(T.revenueUsd)} di revenue delle creator · cambio {calc.fx ? String(calc.fx).replace(".", ",") : "da inserire"}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 18, rowGap: 3, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ opacity: 0.65 }}>Fee HOC</span><span style={{ textAlign: "right" }}>{eur(T.feeEur)}</span>
            <span style={{ opacity: 0.65 }}>Persone</span><span style={{ textAlign: "right" }}>− {eur(T.staffEur)}</span>
            <span style={{ opacity: 0.65 }}>Chatter</span><span style={{ textAlign: "right" }}>− {eur(T.chatterEur)}</span>
            {T.extrasEur > 0 && <><span style={{ opacity: 0.65 }}>Extra</span><span style={{ textAlign: "right" }}>− {eur(T.extrasEur)}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <span style={muted}>{(() => { const src = calc.teams.find((t) => t.chatterSource)?.chatterSource; return src ? `Chatter: ${src.replace(/^buste CreatorsPro · /, "buste ")}` : "Chatter non ancora preso dalle buste"; })()}</span>
          <button style={{ ...btn(), marginLeft: "auto" }} onClick={() => setUpdating(true)}><RefreshCw size={14} />Aggiorna il mese</button>
        </div>
        {info && <Notice>{info}</Notice>}
        {T.problems > 0 && <Notice danger>{T.problems} team con dati mancanti (revenue, cambio o accordo): contano zero finché non si completano.</Notice>}

        {tab === "conto" && (() => {
          const creators = calc.teams.filter((t) => t.creator).sort((a, b) => b.netEur - a.netEur);
          const struttura = calc.teams.filter((t) => !t.creator);
          const Card = ({ t }) => {
            const missing = t.problems.length > 0;
            const loss = t.netEur < 0;
            const keep = t.feeEur > 0 ? Math.round((t.netEur / t.feeEur) * 100) : null;
            const tone = missing ? CP.accentSoftText : loss ? CP.accentRed : CP.accentGreen;
            return (
              <button onClick={() => setOpen(t.id)} style={{ textAlign: "left", cursor: "pointer", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 16, color: CP.textPrimary, fontFamily: FONTS.body, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>{t.name}</span>
                  {t.manager && <span style={{ fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.manager.split(" ")[0]}</span>}
                </div>
                <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", color: loss ? CP.accentRed : CP.textPrimary }}>{eur(t.netEur)}</div>
                <div><span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 20, background: tint(tone), color: tone }}>{missing ? "dati mancanti" : loss ? "in perdita" : `${keep}% della fee resta`}</span></div>
                <div style={{ fontSize: 12, color: CP.textMuted, fontVariantNumeric: "tabular-nums" }}>Fee {eur(t.feeEur)} · costi {eur(t.costEur)}</div>
              </button>
            );
          };
          return (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
              {creators.map((t) => <Card key={t.id} t={t} />)}
            </div>
            {struttura.length > 0 && (<>
              <div style={{ ...muted, margin: "18px 0 8px" }}>Struttura (senza creator): {eur(struttura.reduce((s, t) => s + t.costEur, 0))}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                {struttura.map((t) => (
                  <button key={t.id} onClick={() => setOpen(t.id)} style={{ textAlign: "left", cursor: "pointer", background: "transparent", border: `1px dashed ${CP.border}`, borderRadius: 14, padding: 14, color: CP.textPrimary, fontFamily: FONTS.body }}>
                    <div style={{ fontSize: 13, color: CP.textSecondary }}>{t.name}</div>
                    <div style={{ fontSize: 20, fontWeight: 500, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>− {eur(t.costEur)}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted }}>{t.members.length} persone</div>
                  </button>
                ))}
              </div>
            </>)}
          </>);
        })()}

        {tab === "extra" && (<>
          <Head title={`Spese extra di ${monthLabel(month)}`} aside={eur(T.extrasEur)} />
          <div style={{ ...muted, margin: "-4px 0 10px" }}>Spese una tantum: valgono solo per questo mese (es. un token da 250 € a Eleonora).</div>
          <div style={cardGrid}>
            {(doc.extras || []).map((x, i) => {
              const set = (k, v) => upd((d) => ({ ...d, extras: d.extras.map((y, j) => (j === i ? { ...y, [k]: v } : y)) }));
              return (
                <div key={x.id || i} style={fcard(false)}>
                  <input style={{ ...small, fontSize: 22, fontWeight: 500, textAlign: "left", padding: "4px 8px" }} inputMode="decimal" placeholder="€" value={x.eur} onChange={(e) => set("eur", e.target.value)} />
                  <input style={small} placeholder="Cosa (es. token)" value={x.label} onChange={(e) => set("label", e.target.value)} />
                  <input style={small} placeholder="A chi" value={x.person || ""} onChange={(e) => set("person", e.target.value)} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <select style={{ ...small, flex: 1 }} value={x.teamId || ""} onChange={(e) => set("teamId", e.target.value)}>
                      <option value="">Agenzia (nessun team)</option>
                      {teamsAll.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button style={{ ...btn(), padding: "4px 8px" }} onClick={() => upd((d) => ({ ...d, extras: d.extras.filter((_, j) => j !== i) }))} aria-label="Togli"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
            <button style={addCard} onClick={() => upd((d) => ({ ...d, extras: [...(d.extras || []), { id: tmpId(), teamId: "", label: "", person: "", eur: "" }] }))}><Plus size={16} />Aggiungi spesa</button>
          </div>
          {(doc.excludedBuste || []).length > 0 && (<>
            <div style={{ height: 22 }} />
            <Head title="Buste escluse dal chatter" aside={doc.excludedBuste.length} />
            <div style={cardGrid}>
              {doc.excludedBuste.map((x) => (
                <div key={x.name} style={fcard(false)}>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>{x.name}</span>
                  <div><Pill tone={CP.accentSoftText}>esclusa da {monthLabel(month)}</Pill></div>
                  {x.note && <div style={{ fontSize: 12, color: CP.textMuted }}>{x.note}</div>}
                  <button style={{ ...btn(), padding: "4px 10px", fontSize: 12, justifySelf: "start" }} onClick={() => includeBusta(x.name)}>Rimetti (poi «Prendi dai dati»)</button>
                </div>
              ))}
            </div>
          </>)}
        </>)}

        {tab === "persone" && (<>
          <Head title={`Chi costa quanto a ${monthLabel(month)}`} aside={`${calc.people.length} persone · ${eur(T.staffEur)}`} />
          <div style={cardGrid}>
            {calc.people.map((p) => (
              <div key={p.key} style={fcard(false)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>{p.person}</span>
                  <span style={{ fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.roles[0] || ""}</span>
                </div>
                <div style={bigNum}>{eur(p.eur)}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {p.deals.some((d) => d.cost.minApplied) && <Pill tone={CP.accentSoftText}>vale il minimo</Pill>}
                  {p.deals.some((d) => d.cost.commissionEur > 0 && !d.cost.minApplied) && <Pill tone={CP.accentGreen}>con percentuale</Pill>}
                  {p.deals.length > 1 && <Pill>{p.deals.length} accordi</Pill>}
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  {p.deals.map((d) => <div key={d.id} style={{ fontSize: 12, color: CP.textMuted, display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.teamIds.map(teamName).join(" + ") || "agenzia"}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{eur(d.cost.eur)}</span></div>)}
                </div>
              </div>
            ))}
          </div>
        </>)}
      </>)}

      {tab === "accordi" && (
        <div style={{ display: "grid", gap: 10 }}>
          {!owner && <Notice>Gli accordi li modifica solo il titolare.</Notice>}
          <Head title="Creator e accordi" aside={`${teamsAll.length} team`} />
          <div style={cardGrid}>
            {teamsAll.map((t) => (
              <button key={t.id} onClick={owner ? () => setEditTeam({ team: t, isNew: false }) : undefined} style={fcard(owner)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>{t.name}</span>
                  {t.manager && <span style={{ fontSize: 12, color: CP.textMuted }}>{t.manager.split(" ")[0]}</span>}
                </div>
                <div style={{ ...bigNum, fontSize: t.tiers?.length > 1 ? 18 : 24 }}>{t.creator ? (t.tiers?.length ? (t.tiers.length === 1 ? pct(t.tiers[0].pct) : "a scaglioni") : "—") : "struttura"}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {t.creator && !t.tiers?.length ? <Pill tone={CP.accentSoftText}>accordo da impostare</Pill> : null}
                  {periodPill(t, month)}
                  {t.creator && t.tiers?.length === 1 && <Pill>flat</Pill>}
                </div>
                {t.creator && t.tiers?.length > 1 && <div style={{ fontSize: 12, color: CP.textMuted }}>{describeTiers(t.tiers)}</div>}
                <div style={{ fontSize: 12, color: CP.textMuted }}>{cfg.people.filter((d) => d.teamIds.includes(t.id) && activeIn(d, month)).length} persone su questo team</div>
              </button>
            ))}
            {owner && <button style={addCard} onClick={() => setEditTeam({ team: { name: "", creator: "", dealText: "", manager: "", creatorIds: [], cpAliases: [], from: null, to: null, note: "" }, isNew: true })}><Plus size={16} />Nuovo team</button>}
          </div>
          <div style={{ height: 14 }} />
          <Head title="Accordi con le persone" aside={`${cfg.people.length} accordi`} />
          <div style={{ ...muted, margin: "-4px 0 10px" }}>Una scheda per accordo: la stessa persona può averne più di uno (una % diversa per creator, o un extra a tempo).</div>
          <div style={cardGrid}>
            {[...cfg.people].sort((a, b) => (a.person || "").localeCompare(b.person || "", "it")).map((d) => (
              <button key={d.id} onClick={owner ? () => setEditDeal({ deal: d, isNew: false }) : undefined} style={{ ...fcard(owner), opacity: d.to && month && d.to < month ? 0.55 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, color: CP.textSecondary }}>{d.person || "(da assegnare)"}</span>
                  <span style={{ fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "50%" }}>{d.role}</span>
                </div>
                <div style={bigNum}>{dealHeadline(d)}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{periodPill(d, month)}<Pill>{d.teamIds.map(teamName).join(" + ") || "agenzia"}</Pill></div>
                <div style={{ fontSize: 12, color: CP.textMuted }}>{describeDeal(d)}</div>
                {d.note && <div style={{ fontSize: 12, color: CP.textMuted, fontStyle: "italic" }}>{d.note}</div>}
              </button>
            ))}
            {owner && <button style={addCard} onClick={() => setEditDeal({ deal: { person: "", role: "", teamIds: [], alloc: "uguale", fixedEur: null, pctText: "", capUsd: null, min: null, minCur: "EUR", from: null, to: null, note: "" }, isNew: true })}><Plus size={16} />Nuovo accordo persona</button>}
          </div>
        </div>
      )}

      <Modal open={updating && Boolean(doc)} onClose={() => setUpdating(false)} title={`Aggiorna ${month ? monthLabel(month) : ""}`} maxWidth={820}>
        {updating && doc && calc && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <Field label="Cambio: 1 $ = … €" style={{ width: 150 }}>
                <input style={input} inputMode="decimal" value={doc.fx?.rate ?? ""} onChange={(e) => upd((d) => ({ ...d, fx: { rate: e.target.value === "" ? null : e.target.value, source: "inserito a mano" } }))} />
              </Field>
              <button style={btn()} onClick={fetchFx} disabled={busy === "fx"}>{busy === "fx" ? <Loader2 size={14} /> : null}Media BCE del mese</button>
              <span style={muted}>{doc.fx?.source || ""}</span>
              <button style={{ ...btn(true), marginLeft: "auto" }} onClick={fromData} disabled={busy === "dati"}>{busy === "dati" ? <Loader2 size={14} /> : <RefreshCw size={14} />}Prendi revenue e chatter dai dati</button>
            </div>
            {info && <Notice>{info}</Notice>}
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.4fr) 130px 130px", gap: 8, ...muted, padding: "0 0 6px" }}><span>Creator</span><span style={{ textAlign: "right" }}>Revenue $</span><span style={{ textAlign: "right" }}>Chatter $</span></div>
              {calc.teams.filter((t) => t.creator).map((t) => (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.4fr) 130px 130px", gap: 8, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                  <span style={{ fontSize: 13 }}>{t.name}<span style={{ ...muted, display: "block" }}>{[t.revenueSource, t.chatterSource && t.chatterSource.replace(/^buste CreatorsPro · /, "buste ")].filter(Boolean).join(" · ")}</span></span>
                  <input style={{ ...small, textAlign: "right" }} inputMode="decimal" value={doc.teams?.[t.id]?.revenueUsd ?? ""} onChange={(e) => setTeamInput(t.id, "revenueUsd", e.target.value)} />
                  <input style={{ ...small, textAlign: "right" }} inputMode="decimal" value={doc.teams?.[t.id]?.chatterUsd ?? ""} onChange={(e) => setTeamInput(t.id, "chatterUsd", e.target.value)} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={btn()} onClick={() => setUpdating(false)}>Chiudi</button>
              <button style={btn(true)} onClick={async () => { await saveDoc(); setUpdating(false); }} disabled={!docDirty || busy === "doc"}>{busy === "doc" ? <Loader2 size={14} /> : <Check size={14} />}Salva il mese</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={calc?.teams.find((t) => t.id === open)?.name || ""} maxWidth={760}>
        {open && calc?.teams.find((t) => t.id === open) && <TeamDetail t={calc.teams.find((t) => t.id === open)} fx={calc.fx} onExclude={excludeBusta} />}
      </Modal>
      <Modal open={Boolean(editTeam)} onClose={() => setEditTeam(null)} title={editTeam?.isNew ? "Nuovo team" : `Team · ${editTeam?.team?.name || ""}`} maxWidth={760}>
        {editTeam && <TeamEditor team={editTeam.team} onClose={() => setEditTeam(null)} onSave={(t) => putTeam(t, editTeam.isNew)} onDelete={editTeam.isNew ? null : () => delTeam(editTeam.team.id)} />}
      </Modal>
      <Modal open={Boolean(editDeal)} onClose={() => setEditDeal(null)} title={editDeal?.isNew ? "Nuovo accordo persona" : `Accordo · ${editDeal?.deal?.person || ""}`} maxWidth={760}>
        {editDeal && <PersonEditor deal={editDeal.deal} teams={teamsAll} onClose={() => setEditDeal(null)} onSave={(d) => putDeal(d, editDeal.isNew)} onDelete={editDeal.isNew ? null : () => delDeal(editDeal.deal.id)} />}
      </Modal>
    </div>
  );
}
