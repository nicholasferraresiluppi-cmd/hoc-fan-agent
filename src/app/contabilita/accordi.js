"use client";

/**
 * Schede «Accordi creator» ed «Ecosistemi» della Contabilità (15/10/2026).
 * Calcolo in lib/creator-deals-core (testato in tests/creator-deals.mjs).
 * Gli accordi li modifica solo il titolare; chi ha l'accesso contabilità li legge.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { Notice, DataTable, SectionTitle, Metric, card } from "@/components/ds";
import { parseDealText, describeTiers, computeDealsMonth } from "@/lib/creator-deals-core";
import { monthLabel } from "@/lib/compensi-core";

const eur = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const usd = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (f) => f === null || f === undefined ? "—" : `${(Math.round(f * 10000) / 100).toLocaleString("it-IT")}%`;
const input = { background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 10px", color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary });
const lbl = { fontSize: 12, color: CP.textMuted, marginBottom: 4, display: "block" };
const Field = ({ label, children, style }) => <label style={{ display: "block", ...style }}><span style={lbl}>{label}</span>{children}</label>;

function DealEditor({ deal, teams, revenueNames, onSave, onDelete, onClose }) {
  const [d, setD] = useState(() => ({ ...deal, text: deal.text || describeTiers(deal.tiers || []) }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const parsed = useMemo(() => parseDealText(d.text), [d.text]);
  const multi = parsed.tiers.length > 1;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Creator"><input style={input} value={d.creator} onChange={(e) => set("creator", e.target.value)} /></Field>
        <Field label="Ecosistema (squadra dei compensi)">
          <input style={input} list="deal-teams" value={d.ecosystem} onChange={(e) => set("ecosystem", e.target.value)} />
          <datalist id="deal-teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Revenue: nome del progetto (vuoto = nome creator)">
          <input style={input} list="deal-revs" value={d.revenueName} placeholder={d.creator} onChange={(e) => set("revenueName", e.target.value)} />
          <datalist id="deal-revs">{revenueNames.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      </div>
      <Field label="Percentuale HOC, come nel foglio (es. «30% <= 25k; 35% <= 50k; 45% > 50k» oppure «60% flat»)">
        <input style={input} value={d.text} onChange={(e) => set("text", e.target.value)} />
      </Field>
      <div style={{ fontSize: 13, color: parsed.tiers.length ? CP.textSecondary : CP.accentRed }}>
        {parsed.tiers.length ? `Letto: ${describeTiers(parsed.tiers)}` : "Non riesco a leggere la percentuale."}
      </div>
      {parsed.warnings.map((w) => <Notice key={w} danger>{w}</Notice>)}
      {multi && <div style={{ fontSize: 12, color: CP.textMuted }}>Vale la percentuale dello scaglione raggiunto, su tutta la revenue del mese.</div>}
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
        <input type="checkbox" checked={d.active !== false} onChange={(e) => set("active", e.target.checked)} /> Accordo attivo
      </label>
      <Field label="Nota"><textarea style={{ ...input, minHeight: 50 }} value={d.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        {onDelete ? <button style={{ ...btn(), color: CP.accentRed }} onClick={onDelete}><Trash2 size={14} />Elimina accordo</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn()} onClick={onClose}>Annulla</button>
          <button style={btn(true)} disabled={!d.creator?.trim() || !parsed.tiers.length} onClick={() => onSave({ ...d, tiers: parsed.tiers })}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

/** Scheda «Accordi creator»: la lista dei contratti + quanto valgono nel mese aperto. */
export function DealsTab({ dealsDoc, owner, month, monthDoc, byTeam, onSaved, send }) {
  const [list, setList] = useState(dealsDoc?.deals || []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);
  useEffect(() => { if (!dirty) setList(dealsDoc?.deals || []); }, [dealsDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => computeDealsMonth(list, monthDoc, byTeam, dealsDoc?.teamEcosystems), [list, monthDoc, byTeam, dealsDoc]);
  const teams = (byTeam || []).map((t) => t.team);
  const revenueNames = (monthDoc?.revenues || []).map((r) => r.name);
  const inactive = list.filter((d) => d.active === false);

  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await send("/api/contabilita/accordi", "PUT", { deals: list, rev: dealsDoc?.rev ?? 0 }); setDirty(false); onSaved(r); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const put = (d, isNew) => { setList((l) => (isNew ? [...l, { ...d, id: `d_${Math.random().toString(16).slice(2, 14)}` }] : l.map((x) => (x.id === d.id ? d : x)))); setDirty(true); setEditing(null); };
  const del = (id) => { if (!confirm("Eliminare questo accordo?")) return; setList((l) => l.filter((x) => x.id !== id)); setDirty(true); setEditing(null); };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Notice>
        Solo le creator dello split. Quota HOC sulle revenue della creator in dollari (scaglione raggiunto, su tutta la revenue), convertita in euro al cambio di {monthLabel(month)}. Le revenue del mese sono quelle della scheda «Revenue e cambio».
        {owner ? " Gli accordi li modifichi solo tu." : " Gli accordi li modifica solo il titolare."}
      </Notice>
      {err && <Notice danger>{err}</Notice>}
      {owner && (
        <div style={{ display: "flex", gap: 8 }}>
          {dirty && <button style={btn(true)} onClick={save} disabled={busy}>{busy ? <Loader2 size={14} /> : <Check size={14} />}Salva accordi</button>}
          <button style={btn()} onClick={() => setEditing({ deal: { creator: "", text: "", tiers: [], mode: "raggiunto", ecosystem: "", revenueName: "", active: true, note: "" }, isNew: true })}><Plus size={14} />Nuovo accordo</button>
        </div>
      )}
      <DataTable
        minWidth={900}
        defaultSort={{ key: "revenueUsd", dir: -1 }}
        onRowClick={owner ? (r) => setEditing({ deal: list.find((x) => x.id === r.id), isNew: false }) : undefined}
        rows={m.creators}
        columns={[
          { key: "creator", label: "Creator", render: (r) => <div><div style={{ color: CP.textPrimary }}>{r.creator}</div><div style={{ fontSize: 12, color: CP.textMuted }}>{r.ecosystem ? `ecosistema ${r.ecosystem}` : "nessun ecosistema"}</div></div> },
          { key: "tiers", label: "Accordo", sort: (r) => r.tiers?.[0]?.pct, render: (r) => <span style={{ fontSize: 13 }}>{describeTiers(r.tiers)}</span> },
          { key: "revenueUsd", label: "Revenue", align: "right", render: (r) => usd(r.revenueUsd) },
          { key: "pctApplied", label: "% applicata", align: "right", render: (r) => pct(r.pctApplied) },
          { key: "shareEur", label: "Quota HOC", align: "right", render: (r) => (
            <div><strong style={{ fontWeight: 500 }}>{eur(r.shareEur)}</strong><div style={{ fontSize: 12, color: CP.textMuted }}>{usd(r.shareUsd)}</div></div>) },
          { key: "creatorEur", label: "Alla creator", align: "right", render: (r) => eur(r.creatorEur) },
          { key: "problems", label: "", sort: (r) => r.problems.length, render: (r) => (r.problems.length ? <span style={{ fontSize: 12, color: CP.accentSoftText }}>{r.problems.join(" · ")}</span> : r.note ? <span style={{ fontSize: 12, color: CP.textMuted }}>{r.note}</span> : null) },
        ]}
      />
      {inactive.length > 0 && (
        <section style={{ ...card, padding: 14 }}>
          <SectionTitle aside={inactive.length}>Accordi non attivi (fuori dallo split o staccati)</SectionTitle>
          {inactive.map((d) => (
            <div key={d.id} onClick={owner ? () => setEditing({ deal: d, isNew: false }) : undefined} style={{ fontSize: 13, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}`, color: CP.textSecondary, cursor: owner ? "pointer" : "default" }}>
              <span style={{ color: CP.textPrimary }}>{d.creator}</span> · {describeTiers(d.tiers)}{d.note ? ` · ${d.note}` : ""}
            </div>
          ))}
        </section>
      )}
      {m.revenuesWithoutDeal.length > 0 && (
        <Notice>Revenue inserite nel mese senza un accordo: {m.revenuesWithoutDeal.map((r) => r.name).join(", ")}.</Notice>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.isNew ? "Nuovo accordo" : `Accordo · ${editing?.deal?.creator || ""}`} maxWidth={720}>
        {editing && <DealEditor deal={editing.deal} teams={teams} revenueNames={revenueNames} onClose={() => setEditing(null)} onSave={(d) => put(d, editing.isNew)} onDelete={editing.isNew ? null : () => del(editing.deal.id)} />}
      </Modal>
    </div>
  );
}

/** Scheda «Ecosistemi»: per ecosistema, quanto entra dalle sue creator meno quanto costano le sue squadre. */
export function EcosystemsTab({ dealsDoc, owner, month, monthDoc, byTeam, send, onSaved }) {
  const [assign, setAssign] = useState(dealsDoc?.teamEcosystems || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (!dirty) setAssign(dealsDoc?.teamEcosystems || {}); }, [dealsDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => computeDealsMonth(dealsDoc?.deals || [], monthDoc, byTeam, assign), [dealsDoc, monthDoc, byTeam, assign]);
  const T = m.totals;
  const names = [...new Set([...(dealsDoc?.deals || []).filter((d) => d.active !== false).map((d) => d.ecosystem), ...Object.values(assign)].filter(Boolean))].sort();
  const ecoOfTeam = (team) => (team in assign ? assign[team] : m.ecosystems.find((e) => e.teams.some((t) => t.team === team))?.ecosystem || "");
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await send("/api/contabilita/accordi", "PUT", { deals: dealsDoc?.deals || [], rev: dealsDoc?.rev ?? 0, teamEcosystems: assign }); setDirty(false); onSaved(r); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <div style={{ ...card, padding: 14 }}><Metric label="Quota HOC dalle creator" value={eur(T.shareEur)} note={`${usd(T.shareUsd)} su ${usd(T.revenueUsd)} di revenue`} /></div>
        <div style={{ ...card, padding: 14 }}><Metric label="Costo squadre degli ecosistemi" value={eur(T.ecoCost)} /></div>
        <div style={{ ...card, padding: 14 }}><Metric label={`Netto ecosistemi · ${monthLabel(month)}`} value={eur(T.ecoNet)} danger={T.ecoNet < 0} /></div>
      </div>
      <Notice>
        Costo = compensi del team in {monthLabel(month)} delle squadre assegnate all'ecosistema. Non sono inclusi il costo degli operatori in chat, le spese non di personale e le squadre non assegnate (elenco in fondo).
        {T.problems > 0 && ` ${T.problems} creator senza quota calcolabile (manca revenue o cambio): contano zero.`}
      </Notice>
      <DataTable
        minWidth={820}
        defaultSort={{ key: "netEur", dir: -1 }}
        rows={m.ecosystems.map((e) => ({ ...e, id: e.key }))}
        columns={[
          { key: "ecosystem", label: "Ecosistema", render: (e) => <div><div style={{ color: CP.textPrimary }}>{e.ecosystem}</div><div style={{ fontSize: 12, color: CP.textMuted }}>{e.creators.length ? e.creators.map((c) => c.creator).join(" · ") : "nessuna creator con accordo"}</div></div> },
          { key: "shareEur", label: "Quota HOC", align: "right", render: (e) => <div>{eur(e.shareEur)}{e.missingShare > 0 && <div style={{ fontSize: 12, color: CP.accentSoftText }}>{e.missingShare} senza revenue</div>}</div> },
          { key: "costEur", label: "Costo squadre", align: "right", render: (e) => <div>{e.teams.length ? eur(e.costEur) : <span style={{ fontSize: 12, color: CP.accentSoftText }}>nessuna squadra</span>}<div style={{ fontSize: 12, color: CP.textMuted }}>{e.teams.map((t) => t.team).join(" · ")}</div></div> },
          { key: "netEur", label: "Netto", align: "right", render: (e) => <strong style={{ fontWeight: 500, color: e.netEur < 0 ? CP.accentRed : CP.textPrimary }}>{eur(e.netEur)}</strong> },
          { key: "margin", label: "Margine", align: "right", sort: (e) => (e.shareEur ? e.netEur / e.shareEur : -Infinity), render: (e) => (e.shareEur > 0 ? pct(e.netEur / e.shareEur) : "—") },
        ]}
      />
      {m.unlinkedCreators.length > 0 && <Notice>Creator senza ecosistema (la loro quota conta solo nel totale): {m.unlinkedCreators.map((c) => c.creator).join(", ")}. Si collegano dalla scheda «Accordi creator».</Notice>}
      <section style={{ ...card, padding: 14 }}>
        <SectionTitle aside={owner ? "a quale ecosistema va il costo di ogni squadra" : null}>Squadre</SectionTitle>
        {err && <Notice danger>{err}</Notice>}
        <datalist id="eco-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        {(byTeam || []).slice().sort((a, b) => b.totalEur - a.totalEur).map((t) => (
          <div key={t.team} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 2fr) 110px minmax(160px, 2fr)", gap: 8, alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}`, color: CP.textSecondary }}>
            <span style={{ color: CP.textPrimary }}>{t.team}</span>
            <span style={{ textAlign: "right" }}>{eur(t.totalEur)}</span>
            {owner
              ? <input style={{ ...input, padding: "5px 8px", fontSize: 13 }} list="eco-names" placeholder="nessun ecosistema" value={ecoOfTeam(t.team)} onChange={(e) => { setAssign((a) => ({ ...a, [t.team]: e.target.value })); setDirty(true); }} />
              : <span>{ecoOfTeam(t.team) || "—"}</span>}
          </div>
        ))}
        {owner && dirty && <button style={{ ...btn(true), marginTop: 10 }} onClick={save} disabled={busy}>{busy ? <Loader2 size={14} /> : <Check size={14} />}Salva assegnazioni</button>}
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Non assegnate, fuori dal netto: {eur(T.otherCost)}.</div>
      </section>
    </div>
  );
}
