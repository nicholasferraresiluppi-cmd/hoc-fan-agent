"use client";

// Esclusioni dalla leaderboard operativa.
// Ridisegno 26/09/2026 (design system): il modulo per escludere in alto e
// compatto; l'elenco delle esclusioni manuali con ricerca; il controllo "chi non
// compare" con filtri per motivo — gli account Mass automatici (~160) non
// annegano più le esclusioni fatte a mano (~15), e l'elenco è ordinato per
// venduto così salta all'occhio un "non fa chat" che in realtà vende. Motivi in
// italiano, periodo scelto da menu. API, conferme e azioni invariate.

import { useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { FONTS, CP } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, DataTable, FilterChip, card } from "@/components/ds";
import { fmt$, fmtInt, MONTHS_IT } from "@/lib/format";

const fetcher = (url) => fetch(url).then((r) => r.json());

const REASONS = [
  { value: "non_chatter", label: "Non fa chat", description: "Sales manager, trainer, account di servizio" },
  { value: "manual", label: "Altro motivo", description: "Esclusione decisa a mano (scrivi il perché nella nota)" },
  { value: "data_quality", label: "Dati sbagliati", description: "Dati incompleti o sospetti per questo operatore" },
];

const REASON_LABEL = {
  non_chatter: "Non fa chat",
  manual: "Altro motivo",
  data_quality: "Dati sbagliati",
  mass_account: "Account Mass (automatico)",
  no_group_data: "Gruppo senza dati",
};
const MANUAL = ["non_chatter", "manual", "data_quality"];

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthOpts(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` };
  });
}

const field = { width: "100%", boxSizing: "border-box", padding: "8px 12px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 };
const smallBtn = { padding: "5px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 12, fontFamily: FONTS.body, cursor: "pointer" };
const badge = { display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 12, background: CP.surfaceAlt, color: CP.textSecondary, whiteSpace: "nowrap" };

export default function LeaderboardExclusionsPage() {
  const [periodId, setPeriodId] = useState(currentMonthId());
  const [formEmployee, setFormEmployee] = useState("");
  const [formReason, setFormReason] = useState("non_chatter");
  const [formNote, setFormNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [auditFilter, setAuditFilter] = useState(null);
  const formRef = useRef(null);
  const periodOptions = useMemo(() => monthOpts(), []);

  const exclUrl = "/api/admin/leaderboard-exclusions";
  const auditUrl = `/api/leaderboard/operational?period_type=monthly&period_id=${periodId}&include_excluded=1&include_zero=1`;

  const { data: exclData, error: exclErr } = useSWR(exclUrl, fetcher, { revalidateOnFocus: false });
  const { data: auditData, error: auditErr } = useSWR(auditUrl, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const exclusions = exclData?.exclusions || {};
  const exclusionEntries = useMemo(
    () => Object.entries(exclusions).sort((a, b) => (b[1].added_at || 0) - (a[1].added_at || 0)),
    [exclusions]
  );

  const auditAll = (auditData?.ranking || []).filter((r) => r._excluded_reason);
  const allEmployeesInPeriod = useMemo(() => {
    const names = new Set();
    for (const r of auditData?.ranking || []) {
      if (r.employee) names.add(r.employee);
    }
    return Array.from(names).sort();
  }, [auditData]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!formEmployee.trim()) {
      setError("Seleziona o digita un nome operatore.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(exclUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: formEmployee.trim(),
          reason: formReason,
          note: formNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Errore nel salvataggio");
      } else {
        setFormEmployee("");
        setFormNote("");
        setFormReason("non_chatter");
        await mutate(exclUrl);
        await mutate(auditUrl);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(employee) {
    if (!confirm(`Rimuovere l'esclusione per "${employee}"?\nTornerà visibile nella leaderboard al prossimo calcolo.`)) return;
    try {
      const res = await fetch(`${exclUrl}?employee=${encodeURIComponent(employee)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Errore nella rimozione");
      } else {
        await mutate(exclUrl);
        await mutate(auditUrl);
      }
    } catch (err) {
      alert(String(err));
    }
  }

  // Filtri del controllo "chi non compare"
  const counts = {
    all: auditAll.length,
    manual: auditAll.filter((r) => MANUAL.includes(r._excluded_reason)).length,
    mass: auditAll.filter((r) => r._excluded_reason === "mass_account").length,
    nogroup: auditAll.filter((r) => r._excluded_reason === "no_group_data").length,
  };
  const af = auditFilter ?? (counts.manual > 0 ? "manual" : "all");
  const auditRows = auditAll
    .filter((r) => af === "all" || (af === "manual" ? MANUAL.includes(r._excluded_reason) : af === "mass" ? r._excluded_reason === "mass_account" : r._excluded_reason === "no_group_data"))
    .map((r, i) => ({ ...r, id: `${r.employee}-${r.group}-${i}` }));

  const needle = q.trim().toLowerCase();
  const activeRows = exclusionEntries
    .filter(([name, e]) => !needle || `${name} ${e.note || ""}`.toLowerCase().includes(needle))
    .map(([name, entry]) => ({ id: name, name, ...entry }));

  const activeCols = [
    { key: "name", label: "Operatore", sort: (r) => r.name.toLowerCase() },
    { key: "reason", label: "Motivo", sort: (r) => REASON_LABEL[r.reason] || r.reason, render: (r) => <span style={badge}>{REASON_LABEL[r.reason] || r.reason}</span> },
    { key: "note", label: "Nota", muted: true, render: (r) => r.note || "—" },
    {
      key: "added_at", label: "Quando", sort: (r) => r.added_at || 0,
      render: (r) => (
        <div style={{ fontSize: 13, color: CP.textSecondary, whiteSpace: "nowrap" }}>
          {r.added_at ? new Date(r.added_at).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
          {r.added_by && <div style={{ fontSize: 11, color: CP.textMuted }}>da …{String(r.added_by).slice(-8)}</div>}
        </div>
      ),
    },
    { key: "actions", label: "", sortable: false, align: "right", render: (r) => <button style={{ ...smallBtn, color: CP.accentRed }} onClick={() => handleRemove(r.name)}>Rimuovi</button> },
  ];

  const auditCols = [
    { key: "employee", label: "Operatore", sort: (r) => (r.employee || "").toLowerCase() },
    { key: "group", label: "Gruppo", muted: true },
    {
      key: "reason", label: "Motivo", sort: (r) => REASON_LABEL[r._excluded_reason] || r._excluded_reason,
      render: (r) => (
        <div>
          <span style={badge}>{REASON_LABEL[r._excluded_reason] || r._excluded_reason}</span>
          {r._exclusion_note && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{r._exclusion_note}</div>}
        </div>
      ),
    },
    { key: "sales", label: "Venduto", align: "right", sort: (r) => (r.sales == null ? null : Number(r.sales)), render: (r) => (r.sales != null ? fmt$(r.sales) : "—") },
    { key: "msg", label: "Messaggi", align: "right", sort: (r) => r.direct_messages_sent ?? null, render: (r) => fmtInt(r.direct_messages_sent) },
    {
      key: "actions", label: "", sortable: false, align: "right",
      render: (r) => MANUAL.includes(r._excluded_reason) ? (
        <button style={{ ...smallBtn, color: CP.accentRed }} onClick={() => handleRemove(r.employee)}>Rimuovi</button>
      ) : r._excluded_reason === "mass_account" ? (
        <span style={{ fontSize: 12, color: CP.textMuted }}>automatico</span>
      ) : (
        <button style={smallBtn} onClick={() => { setFormEmployee(r.employee); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          Escludi
        </button>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Esclusioni" }]}
        title="Esclusioni dalla leaderboard"
        subtitle="Chi non deve comparire nella leaderboard operativa perché non fa chat o ha dati sbagliati. Chi escludi qui non riceve score né fascia; l'effetto si vede al prossimo caricamento della leaderboard."
        actions={<Link href="/leaderboard/operational" style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, textDecoration: "none" }}>Vai alla leaderboard</Link>}
      />

      {/* Aggiungi */}
      <section ref={formRef} style={{ ...card, padding: "14px 16px", marginBottom: 20, scrollMarginTop: 16 }}>
        <SectionTitle aside={`${allEmployeesInPeriod.length} nomi suggeriti da ${periodOptions.find((p) => p.value === periodId)?.label || periodId}`}>Escludi un operatore</SectionTitle>
        {error && <Notice danger>{error}</Notice>}
        <form onSubmit={handleAdd}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
            <label>
              <span style={lbl}>Nome operatore (esatto come in Infloww)</span>
              <input list="employees-list" value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)} placeholder="Es. Mario Rossi" style={field} />
              <datalist id="employees-list">
                {allEmployeesInPeriod.map((n) => <option key={n} value={n} />)}
              </datalist>
            </label>
            <label>
              <span style={lbl}>Nota (facoltativa)</span>
              <input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Es. sales manager, non opera in chat" style={field} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: CP.textSecondary }}>Motivo</span>
            {REASONS.map((r) => (
              <FilterChip key={r.value} label={r.label} active={formReason === r.value} onClick={(e) => { e.preventDefault(); setFormReason(r.value); }} />
            ))}
            <span style={{ fontSize: 12, color: CP.textMuted }}>{REASONS.find((r) => r.value === formReason)?.description}</span>
            <span style={{ flex: 1 }} />
            <button type="submit" disabled={submitting} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Salvataggio…" : "Escludi"}
            </button>
          </div>
        </form>
      </section>

      {/* Esclusioni attive */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <SectionTitle aside="valgono per tutti i mesi finché non le togli">Esclusioni fatte a mano · {exclusionEntries.length}</SectionTitle>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome o nota" aria-label="Cerca esclusione" style={{ ...field, width: 240, maxWidth: "100%", marginLeft: "auto", fontSize: 13, background: CP.surface }} />
        </div>
        {exclErr && <Notice danger>Errore nel caricamento: {String(exclErr)}</Notice>}
        {exclData?.error && <Notice danger>{exclData.error}</Notice>}
        {!exclData && !exclErr && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
        {exclData && !exclData.error && (
          <DataTable
            columns={activeCols}
            rows={activeRows}
            defaultSort={{ key: "added_at", dir: -1 }}
            minWidth={720}
            maxHeight={420}
            empty={exclusionEntries.length === 0 ? "Nessuna esclusione fatta a mano. Gli account «Mass» sono tolti in automatico." : "Nessuna esclusione con questo nome."}
          />
        )}
      </section>

      {/* Audit — non in classifica */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <SectionTitle aside="per controllare che le esclusioni siano ancora giuste">Chi non compare nella leaderboard</SectionTitle>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Mese" style={{ ...field, width: "auto", marginLeft: "auto", fontSize: 13, background: CP.surface }}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {auditErr && <Notice danger>Errore: {String(auditErr)}</Notice>}
        {auditData?.error && <Notice danger>{auditData.error}</Notice>}
        {!auditData && !auditErr && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
        {auditData && !auditData.error && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <FilterChip label={`Esclusi a mano (${counts.manual})`} active={af === "manual"} disabled={!counts.manual} onClick={() => setAuditFilter("manual")} />
              <FilterChip label={`Gruppo senza dati (${counts.nogroup})`} active={af === "nogroup"} disabled={!counts.nogroup} onClick={() => setAuditFilter("nogroup")} />
              <FilterChip label={`Account Mass automatici (${counts.mass})`} active={af === "mass"} disabled={!counts.mass} onClick={() => setAuditFilter("mass")} />
              <FilterChip label={`Tutti (${counts.all})`} active={af === "all"} onClick={() => setAuditFilter("all")} />
            </div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
              Ordinati per venduto: se qualcuno escluso come «non fa chat» ha vendite alte, controlla che l&apos;esclusione sia ancora giusta. «Gruppo senza dati» = il suo gruppo non ha medie con cui confrontarlo; «Escludi» lo porta nel modulo in alto.
            </div>
            <DataTable
              columns={auditCols}
              rows={auditRows}
              defaultSort={{ key: "sales", dir: -1 }}
              minWidth={760}
              maxHeight={560}
              empty={auditAll.length === 0 ? "Nessun operatore escluso in questo mese." : "Nessuno in questa vista."}
            />
          </>
        )}
      </section>
    </div>
  );
}
