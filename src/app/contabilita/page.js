"use client";

/**
 * /contabilita — Compensi team (15/10/2026, Nicholas).
 *
 * Il foglio "Compensi Team" in HOC Pro: un mese alla volta, righe per squadra e
 * mansione, una voce di pagamento per persona (chi ha più righe le somma), fissi
 * e gamification (minimo garantito in euro oppure % sulle revenue in dollari →
 * cambio del mese, la cifra più alta). Gli operatori non ci sono: vanno tutti
 * tranne loro.
 *
 * Accesso: lib/compensi-access — NON passa dall'admin. Senza accesso la pagina
 * non riceve nulla (le API rispondono 403) e mostra solo "non hai accesso".
 * Il calcolo è compensi-core, lo stesso modulo puro testato in tests/compensi.mjs.
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Loader2, Lock, Trash2, Check } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, FilterChip, Notice, DataTable, SectionTitle, Metric, card } from "@/components/ds";
import { computeMonth, monthLabel, nextMonthId, personKey, normalizeTiers, namesMatch } from "@/lib/compensi-core";
import { DealsTab, EcosystemsTab } from "./accordi";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};
const send = async (url, method, body) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return j;
};

const eur = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const usd = (n) => n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (f) => `${(Math.round(f * 10000) / 100).toLocaleString("it-IT")}%`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

const input = { background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 10px", color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary });
const lbl = { fontSize: 12, color: CP.textMuted, marginBottom: 4, display: "block" };

function Field({ label, children, style }) {
  return <label style={{ display: "block", ...style }}><span style={lbl}>{label}</span>{children}</label>;
}

function AppliedTag({ calc }) {
  const t = { fisso: "fisso", minimo: "minimo garantito", variabile: "% sulle revenue", nessuno: "da configurare" }[calc.applied];
  return <span style={{ fontSize: 12, color: calc.applied === "variabile" ? CP.accentSoftText : CP.textMuted }}>{t}</span>;
}

// ── Modifica di una riga ─────────────────────────────────────────────────────
function LineEditor({ line, revenues, teams, onSave, onDelete, onClose }) {
  const [l, setL] = useState(() => JSON.parse(JSON.stringify(line)));
  const set = (k, v) => setL((x) => ({ ...x, [k]: v }));
  const rule = l.rule || { minEur: 0, tiers: [{ fromUsd: 0, pct: 0 }], projects: [] };
  const setRule = (k, v) => setL((x) => ({ ...x, rule: { ...rule, [k]: v } }));
  const projNames = revenues.map((r) => r.name);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="Persona"><input style={input} value={l.person} onChange={(e) => set("person", e.target.value)} /></Field>
        <Field label="Mansione"><input style={input} value={l.mansione} onChange={(e) => set("mansione", e.target.value)} /></Field>
        <Field label="Squadra">
          <input style={input} list="acct-teams" value={l.team} onChange={(e) => set("team", e.target.value)} />
          <datalist id="acct-teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Su chi lavora"><input style={input} value={l.projects} onChange={(e) => set("projects", e.target.value)} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <FilterChip label="Fisso" active={l.method === "fisso"} onClick={() => set("method", "fisso")} />
        <FilterChip label="Gamification" active={l.method === "gamification"} onClick={() => setL((x) => ({ ...x, method: "gamification", rule }))} />
      </div>
      {l.method === "fisso" ? (
        <Field label="Fisso mensile (€)" style={{ maxWidth: 220 }}><input style={input} inputMode="decimal" value={l.fixedEur ?? ""} onChange={(e) => set("fixedEur", e.target.value)} /></Field>
      ) : (
        <div style={{ ...card, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
            Prende la cifra più alta tra il minimo garantito e la percentuale sulle revenue dei progetti scelti. La percentuale si calcola sui dollari, poi si converte in euro al tasso del mese.
          </div>
          <Field label="Minimo garantito (€)" style={{ maxWidth: 220 }}><input style={input} inputMode="decimal" value={rule.minEur ?? ""} onChange={(e) => setRule("minEur", e.target.value)} /></Field>
          <div>
            <span style={lbl}>Percentuale (con scaglioni: vale lo scaglione più alto raggiunto, su tutta la revenue)</span>
            {(rule.tiers?.length ? rule.tiers : [{ fromUsd: 0, pct: 0 }]).map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: CP.textMuted }}>sopra $</span>
                <input style={{ ...input, width: 120 }} inputMode="decimal" value={t.fromUsd} onChange={(e) => setRule("tiers", rule.tiers.map((x, j) => (j === i ? { ...x, fromUsd: e.target.value } : x)))} />
                <span style={{ fontSize: 13, color: CP.textMuted }}>→</span>
                <input style={{ ...input, width: 80 }} inputMode="decimal" value={typeof t.pct === "number" ? (t.pct ? Math.round(t.pct * 10000) / 100 : "") : String(t.pct).replace("%", "")} onChange={(e) => setRule("tiers", (rule.tiers?.length ? rule.tiers : [{ fromUsd: 0, pct: 0 }]).map((x, j) => (j === i ? { ...x, pct: e.target.value === "" ? "" : `${e.target.value}%` } : x)))} />
                <span style={{ fontSize: 13, color: CP.textMuted }}>%</span>
                {rule.tiers?.length > 1 && <button style={btn()} onClick={() => setRule("tiers", rule.tiers.filter((_, j) => j !== i))}>Togli</button>}
              </div>
            ))}
            <button style={btn()} onClick={() => setRule("tiers", [...(rule.tiers || []), { fromUsd: 0, pct: 0 }])}><Plus size={14} />Scaglione</button>
          </div>
          <div>
            <span style={lbl}>Revenue di quali progetti (si inseriscono nella scheda «Revenue e cambio»)</span>
            {projNames.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun progetto ancora: aggiungilo in «Revenue e cambio».</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {projNames.map((n) => {
                const on = (rule.projects || []).some((p) => personKey(p) === personKey(n));
                return <FilterChip key={n} label={n} active={on} onClick={() => setRule("projects", on ? rule.projects.filter((p) => personKey(p) !== personKey(n)) : [...(rule.projects || []), n])} />;
              })}
            </div>
          </div>
          {l.ruleDraft && (
            <Notice>
              Regola trovata nel foglio: minimo {eur(l.ruleDraft.minEur)}{normalizeTiers(l.ruleDraft.tiers).map((t) => `, sopra ${usd(t.fromUsd)} ${pct(t.pct)}`).join("")} ({l.ruleDraft.source}). Da confermare: progetti e cifre possono essere cambiati da allora.
            </Notice>
          )}
        </div>
      )}
      <div>
        <span style={lbl}>Extra del mese (bonus, rimborsi; negativo per una trattenuta)</span>
        {(l.extras || []).map((x, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input style={{ ...input, flex: 2 }} placeholder="Motivo" value={x.label} onChange={(e) => set("extras", l.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
            <input style={{ ...input, flex: 1 }} inputMode="decimal" placeholder="€" value={x.eur} onChange={(e) => set("extras", l.extras.map((y, j) => (j === i ? { ...y, eur: e.target.value } : y)))} />
            <button style={btn()} onClick={() => set("extras", l.extras.filter((_, j) => j !== i))} aria-label="Togli"><Trash2 size={14} /></button>
          </div>
        ))}
        <button style={btn()} onClick={() => set("extras", [...(l.extras || []), { label: "", eur: "" }])}><Plus size={14} />Extra</button>
      </div>
      <Field label="Nota"><textarea style={{ ...input, minHeight: 60 }} value={l.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
        <input type="checkbox" checked={Boolean(l.keepNote)} onChange={(e) => set("keepNote", e.target.checked)} /> Tieni la nota anche nei mesi successivi
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        {onDelete ? <button style={{ ...btn(), color: CP.accentRed }} onClick={onDelete}><Trash2 size={14} />Elimina riga</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn()} onClick={onClose}>Annulla</button>
          <button style={btn(true)} onClick={() => onSave(l)} disabled={!l.person?.trim()}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

// ── Dati di pagamento (IBAN in chiaro: si apre una persona alla volta) ────────
function PayeeEditor({ person, onClose, onSaved }) {
  const { data, error, isLoading } = useSWR(`/api/contabilita/beneficiari?person=${encodeURIComponent(person)}`, fetcher, { revalidateOnFocus: false });
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (data) setP(data.payee || { address: "", zip: "", city: "", invoice: false, accounts: [{ label: "Conto", iban: "", bic: "" }], note: "" }); }, [data]);
  if (isLoading || !p) return <div style={{ color: CP.textMuted, fontSize: 13 }}>{error ? error.message : "Carico…"}</div>;
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    try { await send("/api/contabilita/beneficiari", "PUT", { person, payee: p }); onSaved?.(); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>Visto adesso: l'apertura è registrata nel registro della contabilità.</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
        <Field label="Indirizzo"><input style={input} value={p.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="CAP"><input style={input} value={p.zip || ""} onChange={(e) => set("zip", e.target.value)} /></Field>
        <Field label="Città"><input style={input} value={p.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
        <input type="checkbox" checked={Boolean(p.invoice)} onChange={(e) => set("invoice", e.target.checked)} /> Emette fattura
      </label>
      <span style={lbl}>Conti (più di uno se il pagamento è diviso, es. 60% personale / 40% tasse)</span>
      {(p.accounts || []).map((a, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 70px auto", gap: 6 }}>
          <input style={input} placeholder="Etichetta" value={a.label} onChange={(e) => set("accounts", p.accounts.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
          <input style={input} placeholder="IBAN" value={a.iban} onChange={(e) => set("accounts", p.accounts.map((y, j) => (j === i ? { ...y, iban: e.target.value } : y)))} />
          <input style={input} placeholder="BIC" value={a.bic} onChange={(e) => set("accounts", p.accounts.map((y, j) => (j === i ? { ...y, bic: e.target.value } : y)))} />
          <input style={input} placeholder="Quota" value={a.share || ""} onChange={(e) => set("accounts", p.accounts.map((y, j) => (j === i ? { ...y, share: e.target.value } : y)))} />
          <button style={btn()} onClick={() => set("accounts", p.accounts.filter((_, j) => j !== i))} aria-label="Togli"><Trash2 size={14} /></button>
        </div>
      ))}
      <div><button style={btn()} onClick={() => set("accounts", [...(p.accounts || []), { label: "", iban: "", bic: "" }])}><Plus size={14} />Conto</button></div>
      <Field label="Nota"><textarea style={{ ...input, minHeight: 50 }} value={p.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
      {err && <Notice danger>{err}</Notice>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={btn()} onClick={onClose}>Chiudi</button>
        <button style={btn(true)} onClick={save} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : null}Salva dati</button>
      </div>
    </div>
  );
}

// ── Accessi (solo titolare) ──────────────────────────────────────────────────
function AccessPanel() {
  const { data, error, mutate } = useSWR("/api/contabilita/accesso", fetcher, { revalidateOnFocus: false });
  const [email, setEmail] = useState("");
  const [err, setErr] = useState(null);
  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <div style={{ color: CP.textMuted }}>Carico…</div>;
  const grant = async () => { setErr(null); try { await send("/api/contabilita/accesso", "POST", { email }); setEmail(""); mutate(); } catch (e) { setErr(e.message); } };
  const revoke = async (id) => { if (!confirm("Togliere l'accesso alla contabilità?")) return; await send(`/api/contabilita/accesso?userId=${encodeURIComponent(id)}`, "DELETE"); mutate(); };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Notice>
        L'accesso alla contabilità è separato dai ruoli dell'app: gli admin NON la vedono. Lo dai e lo togli solo tu (titolare). Titolari: {data.owners.length}, impostati nelle variabili di Vercel.
      </Notice>
      <section style={{ ...card, padding: 16 }}>
        <SectionTitle aside={`${data.members.length} oltre ai titolari`}>Chi ha l'accesso</SectionTitle>
        {data.members.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Solo tu.</div>}
        {data.members.map((m) => (
          <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
            <span style={{ fontSize: 14, color: CP.textPrimary }}>{m.name || m.userId} <span style={{ color: CP.textMuted, fontSize: 12 }}>dal {new Date(m.grantedAt).toLocaleDateString("it-IT")}</span></span>
            <button style={btn()} onClick={() => revoke(m.userId)}>Togli accesso</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input style={{ ...input, maxWidth: 320 }} placeholder="email dell'account HOC Pro" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button style={btn(true)} onClick={grant} disabled={!email}>Dai accesso</button>
        </div>
        {err && <div style={{ marginTop: 8 }}><Notice danger>{err}</Notice></div>}
      </section>
      <section style={{ ...card, padding: 16 }}>
        <SectionTitle aside="ultime 150 voci">Registro</SectionTitle>
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {data.audit.map((a, i) => (
            <div key={i} style={{ fontSize: 13, color: CP.textSecondary, padding: "5px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
              <span style={{ color: CP.textMuted }}>{a.at ? new Date(a.at).toLocaleString("it-IT") : "—"}</span> · {a.what}{a.month ? ` · ${a.month}` : ""}{a.person ? ` · ${a.person}` : ""}{a.name ? ` · ${a.name}` : ""} <span style={{ color: CP.textMuted }}>({a.userId?.slice(-6)})</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────
export default function ContabilitaPage() {
  const { data: home, error: homeErr, mutate: mutateHome } = useSWR("/api/contabilita", fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [month, setMonth] = useState(null);
  const months = home?.months || [];
  useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);

  const { data: md, error: mErr, mutate: mutateMonth } = useSWR(month ? `/api/contabilita/mese?m=${month}` : null, fetcher, { revalidateOnFocus: false });
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [tab, setTab] = useState("persone");
  const [editing, setEditing] = useState(null); // { line, isNew }
  const [payeeFor, setPayeeFor] = useState(null);
  const [fxBusy, setFxBusy] = useState(false);
  const [q, setQ] = useState("");
  // ricarica dal server (es. dopo aver salvato un IBAN): non buttare le modifiche non salvate dello stesso mese
  useEffect(() => {
    if (!md?.doc) return;
    if (dirty && draft?.month === md.doc.month && draft?.rev === md.doc.rev) return;
    setDraft(md.doc); setDirty(false); setSaveErr(null);
  }, [md]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => (draft ? computeMonth(draft) : null), [draft]);
  const teams = useMemo(() => (calc ? calc.byTeam.map((t) => t.team) : []), [calc]);
  const { data: crm } = useSWR(tab === "crm" && home ? "/api/contabilita/crm" : null, fetcher, { revalidateOnFocus: false });
  const { data: dealsDoc, error: dealsErr, mutate: mutateDeals } = useSWR((tab === "accordi" || tab === "ecosistemi") && home ? "/api/contabilita/accordi" : null, fetcher, { revalidateOnFocus: false });

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (homeErr) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        <PageHead title="Contabilità" />
        <div style={{ ...card, padding: 24, display: "flex", gap: 12, alignItems: "center", color: CP.textSecondary }}>
          <Lock size={18} /> {homeErr.status === 403 || homeErr.status === 401 ? "Non hai accesso alla contabilità." : homeErr.message}
        </div>
      </div>
    );
  }
  if (!home) return <div style={{ padding: 24, color: CP.textMuted }}>Carico…</div>;

  const update = (fn) => { setDraft((d) => fn(d)); setDirty(true); };
  const save = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const r = await send(`/api/contabilita/mese?m=${month}`, "PUT", { doc: draft, rev: draft.rev ?? null });
      setDraft(r.doc); setDirty(false); mutateMonth({ ...md, doc: r.doc }, { revalidate: false });
    } catch (e) { setSaveErr(e.message); } finally { setSaving(false); }
  };
  const newMonth = async () => {
    if (dirty && !confirm("Ci sono modifiche non salvate in questo mese. Continuare?")) return;
    const latest = months[0];
    const target = latest ? nextMonthId(latest) : thisMonth();
    if (!confirm(`Creare ${monthLabel(target)}${latest ? ` copiando ${monthLabel(latest)} (righe e regole; pagato, extra, revenue e cambio da rifare)` : ""}?`)) return;
    try { await send(`/api/contabilita/mese?m=${target}`, "POST", { from: latest || null }); await mutateHome(); setMonth(target); } catch (e) { alert(e.message); }
  };
  const fetchFx = async () => {
    setFxBusy(true);
    try { const r = await fetcher(`/api/contabilita/tasso?m=${month}`); update((d) => ({ ...d, fx: { rate: r.rate, source: r.source } })); } catch (e) { alert(e.message); } finally { setFxBusy(false); }
  };
  const setPaidPerson = (key, paid) => update((d) => ({ ...d, lines: d.lines.map((l) => (personKey(l.person) === key ? { ...l, paid } : l)) }));
  const saveLine = (l, isNew) => { update((d) => ({ ...d, lines: isNew ? [...d.lines, { ...l, id: l.id || `l_${Math.random().toString(16).slice(2, 14)}` }] : d.lines.map((x) => (x.id === l.id ? l : x)) })); setEditing(null); };
  const delLine = (id) => { if (!confirm("Eliminare questa riga?")) return; update((d) => ({ ...d, lines: d.lines.filter((x) => x.id !== id) })); setEditing(null); };
  const blankLine = (team = "") => ({ id: null, team, mansione: "", person: "", projects: "", method: "fisso", fixedEur: "", rule: null, extras: [], note: "", paid: false });

  const ql = q.trim().toLowerCase();
  const match = (s) => !ql || String(s || "").toLowerCase().includes(ql);

  const tabs = [["persone", "Da pagare"], ["squadre", "Per squadra"], ["revenue", "Revenue e cambio"], ["accordi", "Accordi creator"], ["ecosistemi", "Ecosistemi"], ["crm", "Incrocio CRM"], ...(home.owner ? [["accessi", "Accessi"]] : [])];

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1280, margin: "0 auto" }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Contabilità" }]}
        title="Compensi team"
        subtitle="Quanto si paga a chi, mese per mese, gli accordi con le creator e quanto rende ogni ecosistema. Operatori esclusi. Visibile solo a chi ha l'accesso contabilità."
        actions={<>
          {dirty && <button style={btn(true)} onClick={save} disabled={saving}>{saving ? <Loader2 size={14} /> : <Check size={14} />}Salva modifiche</button>}
          <button style={btn()} onClick={newMonth}><Plus size={14} />Nuovo mese</button>
        </>}
      />

      {months.length === 0 && <Notice>Nessun mese ancora. Crea il primo con «Nuovo mese».</Notice>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {months.map((m) => <FilterChip key={m} label={monthLabel(m)} active={m === month} onClick={() => { if (dirty && !confirm("Modifiche non salvate: cambiare mese le perde. Continuare?")) return; setMonth(m); }} />)}
      </div>
      {saveErr && <Notice danger>{saveErr}</Notice>}
      {mErr && <Notice danger>{mErr.message}</Notice>}

      {draft && calc && (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div style={{ ...card, padding: 14 }}><Metric label={`Totale ${monthLabel(month)}`} value={eur(calc.totals.totalEur)} /></div>
          <div style={{ ...card, padding: 14 }}><Metric label="Da pagare" value={eur(calc.totals.toPayEur)} /></div>
          <div style={{ ...card, padding: 14 }}><Metric label="Già pagato" value={eur(calc.totals.paidEur)} /></div>
          <div style={{ ...card, padding: 14 }}><Metric label="Persone" value={calc.totals.people} note={`${calc.totals.lines} righe`} /></div>
          <div style={{ ...card, padding: 14 }}><Metric label="Cambio $→€" value={draft.fx?.rate ? Number(String(draft.fx.rate).replace(",", ".")).toLocaleString("it-IT", { maximumFractionDigits: 4 }) : "manca"} note={draft.fx?.source || ""} attn={!draft.fx?.rate && draft.lines.some((l) => l.method === "gamification")} /></div>
        </div>
        {calc.totals.problems > 0 && <Notice danger>{calc.totals.problems} righe in gamification non si possono calcolare per intero (manca il cambio o la revenue di un progetto): per ora vale il minimo garantito. Vedi «Revenue e cambio».</Notice>}
        {draft.importedFrom && <Notice>Importato da {draft.importedFrom}. Le righe sono quelle del foglio così com'erano; le regole di gamification trovate nel foglio «Calcolo» sono allegate alle righe dei sales manager come proposta da confermare.</Notice>}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {tabs.map(([k, t]) => <FilterChip key={k} label={t} active={tab === k} onClick={() => setTab(k)} />)}
          {(tab === "persone" || tab === "squadre") && <input style={{ ...input, maxWidth: 240, marginLeft: "auto" }} placeholder="Cerca persona, squadra, mansione" value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>

        {tab === "persone" && (
          <DataTable
            minWidth={760}
            defaultSort={{ key: "totalEur", dir: -1 }}
            rows={calc.byPerson.filter((p) => match(p.person) || p.teams.some(match) || p.mansioni.some(match)).map((p) => ({ ...p, id: p.key, pay: md?.payees?.[p.key] }))}
            columns={[
              { key: "person", label: "Persona", render: (r) => <div><div style={{ color: CP.textPrimary }}>{r.person}</div><div style={{ fontSize: 12, color: CP.textMuted }}>{r.mansioni.join(" · ")}</div></div> },
              { key: "teams", label: "Squadre", sort: (r) => r.teams.join(), render: (r) => <span style={{ fontSize: 13, color: CP.textSecondary }}>{r.teams.join(" · ")}</span> },
              { key: "lines", label: "Voci", sort: (r) => r.lines.length, render: (r) => <span style={{ fontSize: 13 }}>{r.lines.map((l) => `${eur(l.calc.totalEur)}`).join(" + ")}</span> },
              { key: "totalEur", label: "Totale", align: "right", render: (r) => <strong style={{ fontWeight: 500 }}>{eur(r.totalEur)}</strong> },
              { key: "pay", label: "Pagamento", sort: (r) => (r.pay?.accounts?.length ? 1 : 0), render: (r) => (
                <button style={{ ...btn(), padding: "4px 8px", fontSize: 12 }} onClick={() => setPayeeFor(r.person)}>
                  {r.pay?.accounts?.length ? r.pay.accounts.map((a) => a.iban || a.label).join(" + ") : "Aggiungi dati"}
                </button>) },
              { key: "paid", label: "Pagato", sort: (r) => (r.paid ? 1 : 0), render: (r) => <input type="checkbox" checked={r.paid} onChange={(e) => setPaidPerson(r.key, e.target.checked)} aria-label={`Pagato ${r.person}`} /> },
            ]}
          />
        )}

        {tab === "squadre" && (
          <div style={{ display: "grid", gap: 14 }}>
            {calc.byTeam.map((t) => {
              const rows = t.lines.filter((l) => match(l.person) || match(t.team) || match(l.mansione));
              if (!rows.length) return null;
              return (
                <section key={t.team} style={{ ...card, padding: 14 }}>
                  <SectionTitle aside={eur(t.totalEur)}>{t.team}</SectionTitle>
                  <DataTable
                    minWidth={760}
                    onRowClick={(l) => setEditing({ line: draft.lines.find((x) => x.id === l.id), isNew: false })}
                    rows={rows}
                    columns={[
                      { key: "mansione", label: "Mansione" },
                      { key: "person", label: "Persona" },
                      { key: "projects", label: "Su chi", render: (l) => <span style={{ fontSize: 13, color: CP.textSecondary }}>{l.projects}</span> },
                      { key: "method", label: "Come", render: (l) => <AppliedTag calc={l.calc} /> },
                      { key: "base", label: "Base", sort: (l) => l.calc.baseEur, render: (l) => eur(l.calc.baseEur) },
                      { key: "extra", label: "Extra", sort: (l) => l.calc.extrasEur, render: (l) => (l.calc.extrasEur ? eur(l.calc.extrasEur) : "") },
                      { key: "tot", label: "Totale", sort: (l) => l.calc.totalEur, render: (l) => <strong style={{ fontWeight: 500 }}>{eur(l.calc.totalEur)}</strong> },
                      { key: "note", label: "", render: (l) => (l.ruleDraft && l.method === "fisso" ? <span style={{ fontSize: 12, color: CP.accentSoftText }}>regola da confermare</span> : l.note ? <span style={{ fontSize: 12, color: CP.textMuted }}>{l.note}</span> : null) },
                    ]}
                  />
                  <button style={{ ...btn(), marginTop: 8 }} onClick={() => setEditing({ line: blankLine(t.team), isNew: true })}><Plus size={14} />Riga in {t.team}</button>
                </section>
              );
            })}
            <div><button style={btn()} onClick={() => setEditing({ line: blankLine(""), isNew: true })}><Plus size={14} />Nuova squadra / riga</button></div>
          </div>
        )}

        {tab === "revenue" && (
          <div style={{ display: "grid", gap: 14 }}>
            <section style={{ ...card, padding: 16 }}>
              <SectionTitle aside="vale per tutte le righe in gamification del mese">Cambio dollaro → euro</SectionTitle>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <Field label="1 $ = … €" style={{ width: 140 }}>
                  <input style={input} inputMode="decimal" value={draft.fx?.rate ?? ""} onChange={(e) => update((d) => ({ ...d, fx: { rate: e.target.value === "" ? null : e.target.value, source: "inserito a mano" } }))} />
                </Field>
                <button style={btn()} onClick={fetchFx} disabled={fxBusy}>{fxBusy ? <Loader2 size={14} /> : null}Usa la media BCE del mese</button>
                <span style={{ fontSize: 12, color: CP.textMuted }}>{draft.fx?.source || ""}</span>
              </div>
            </section>
            <section style={{ ...card, padding: 16 }}>
              <SectionTitle aside="in dollari, totale del mese per progetto">Revenue dei progetti</SectionTitle>
              {(draft.revenues || []).map((r, i) => {
                const users = draft.lines.filter((l) => l.method === "gamification" && (l.rule?.projects || []).some((p) => personKey(p) === personKey(r.name)));
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 2fr) minmax(120px, 1fr) 3fr auto", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <input style={input} value={r.name} placeholder="Progetto (es. Anastasia ITA)" onChange={(e) => update((d) => ({ ...d, revenues: d.revenues.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                    <input style={input} inputMode="decimal" value={r.usd ?? ""} placeholder="$" onChange={(e) => update((d) => ({ ...d, revenues: d.revenues.map((x, j) => (j === i ? { ...x, usd: e.target.value } : x)) }))} />
                    <span style={{ fontSize: 12, color: CP.textMuted }}>{users.length ? `usata da ${users.map((u) => u.person).join(", ")}` : "nessuno in gamification la usa"}</span>
                    <button style={btn()} onClick={() => update((d) => ({ ...d, revenues: d.revenues.filter((_, j) => j !== i) }))} aria-label="Togli"><Trash2 size={14} /></button>
                  </div>
                );
              })}
              <button style={btn()} onClick={() => update((d) => ({ ...d, revenues: [...(d.revenues || []), { name: "", usd: null }] }))}><Plus size={14} />Progetto</button>
            </section>
          </div>
        )}

        {tab === "crm" && (
          <CrmCross crm={crm} lines={draft.lines} />
        )}

        {(tab === "accordi" || tab === "ecosistemi") && (dealsErr ? <Notice danger>{dealsErr.message}</Notice> : !dealsDoc ? <div style={{ color: CP.textMuted }}>Carico gli accordi…</div>
          : tab === "accordi"
            ? <DealsTab dealsDoc={dealsDoc} owner={home.owner} month={month} monthDoc={draft} byTeam={calc.byTeam} send={send} onSaved={(d) => mutateDeals(d, { revalidate: false })} />
            : <EcosystemsTab dealsDoc={dealsDoc} owner={home.owner} month={month} monthDoc={draft} byTeam={calc.byTeam} send={send} onSaved={(d) => mutateDeals(d, { revalidate: false })} />)}

        {tab === "accessi" && home.owner && <AccessPanel />}
      </>)}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.isNew ? "Nuova riga" : "Modifica riga"} maxWidth={720}>
        {editing && <LineEditor line={editing.line} revenues={draft?.revenues || []} teams={teams} onClose={() => setEditing(null)} onSave={(l) => saveLine(l, editing.isNew)} onDelete={editing.isNew ? null : () => delLine(editing.line.id)} />}
      </Modal>
      <Modal open={Boolean(payeeFor)} onClose={() => setPayeeFor(null)} title={`Dati di pagamento · ${payeeFor || ""}`} maxWidth={760}>
        {payeeFor && <PayeeEditor person={payeeFor} onClose={() => setPayeeFor(null)} onSaved={() => mutateMonth()} />}
      </Modal>
    </div>
  );
}

function CrmCross({ crm, lines }) {
  if (!crm) return <div style={{ color: CP.textMuted }}>Carico il CRM…</div>;
  const payNames = [...new Map(lines.map((l) => [personKey(l.person), l.person])).values()].filter((n) => !n.startsWith("—"));
  const crmOf = (n) => crm.people.find((p) => namesMatch(p.name, n) === "esatto") || crm.people.find((p) => namesMatch(p.name, n) === "simile");
  const pairs = payNames.map((n) => ({ n, p: crmOf(n) }));
  const matchedCrm = new Set(pairs.filter((x) => x.p).map((x) => x.p.id));
  const different = pairs.filter((x) => x.p && personKey(x.p.name) !== personKey(x.n));
  const missingInCrm = pairs.filter((x) => !x.p).map((x) => x.n);
  const missingInPay = crm.people.filter((p) => !p.noMansione && !matchedCrm.has(p.id));
  const noMansione = crm.people.filter((p) => p.noMansione && !matchedCrm.has(p.id));
  const row = (p) => (
    <div key={p.id} style={{ fontSize: 13, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}`, color: CP.textSecondary }}>
      <span style={{ color: CP.textPrimary }}>{p.name}</span> · {p.mansioni.join(", ") || "senza mansione"} · {p.progetto.join(", ") || "senza progetto"} <span style={{ color: CP.textMuted }}>({p.fase || "fase?"})</span>
    </div>
  );
  const none = <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuno.</div>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Notice>Confronto per nome tra questo mese e il CRM persone (operatori e persone uscite esclusi): serve a non dimenticare nessuno e a tenere allineati i due. Abbinate {pairs.length - missingInCrm.length} persone su {pairs.length}.</Notice>
      <section style={{ ...card, padding: 16 }}>
        <SectionTitle aside={missingInPay.length}>Nel CRM con una mansione, ma non nei compensi</SectionTitle>
        {missingInPay.length ? missingInPay.map(row) : none}
      </section>
      <section style={{ ...card, padding: 16 }}>
        <SectionTitle aside={different.length}>Stessa persona, nome scritto diverso</SectionTitle>
        {different.length ? different.map(({ n, p }) => (
          <div key={n} style={{ fontSize: 13, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}`, color: CP.textSecondary }}>
            <span style={{ color: CP.textPrimary }}>{n}</span> qui · <span style={{ color: CP.textPrimary }}>{p.name}</span> nel CRM · {p.mansioni.join(", ") || "senza mansione"} · {p.progetto.join(", ") || "senza progetto"}
          </div>
        )) : none}
      </section>
      <section style={{ ...card, padding: 16 }}>
        <SectionTitle aside={missingInCrm.length}>Nei compensi ma non nel CRM</SectionTitle>
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          {missingInCrm.length ? missingInCrm.map((n) => <div key={n} style={{ fontSize: 13, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}`, color: CP.textPrimary }}>{n}</div>) : none}
        </div>
      </section>
      <section style={{ ...card, padding: 16 }}>
        <SectionTitle aside={noMansione.length}>Nel CRM senza mansione (forse operatori: da completare nel CRM)</SectionTitle>
        <div style={{ maxHeight: 280, overflow: "auto" }}>{noMansione.length ? noMansione.map(row) : none}</div>
      </section>
    </div>
  );
}
