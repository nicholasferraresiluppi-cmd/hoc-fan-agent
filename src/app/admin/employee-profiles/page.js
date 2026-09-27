"use client";

// Profili operatori (redesign DS 26/09/2026): anagrafica minima — data di
// ingresso + nota. Numero principale = quanti profili sono compilati rispetto
// agli operatori che risultano nei dati Infloww del mese; modulo di inserimento
// prima della tabella (è l'azione principale quando i profili sono pochi).
// API, validazioni e azioni invariate.
import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, SectionTitle, Notice, DataTable, card } from "@/components/ds";

const fetcher = (url) => fetch(url).then((r) => r.json());

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsSince(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44) * 10) / 10);
}
function fmtTenure(m) {
  if (m == null) return "—";
  if (m < 1) return "meno di 1 mese";
  if (m < 12) return `${Math.round(m)} mes${Math.round(m) === 1 ? "e" : "i"}`;
  const y = Math.floor(m / 12);
  const r = Math.round(m - y * 12);
  return r === 0 ? `${y} ann${y === 1 ? "o" : "i"}` : `${y} ann${y === 1 ? "o" : "i"} e ${r} mes${r === 1 ? "e" : "i"}`;
}
const fmtDay = (s) => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—");

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 };
const inp = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" };
const btn = { padding: "8px 14px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body };
const btnPrimary = { ...btn, background: CP.accent, border: `1px solid ${CP.accent}`, color: CP.accentInk, fontWeight: 500 };

export default function EmployeeProfilesPage() {
  const [formEmployee, setFormEmployee] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [periodId] = useState(currentMonthId());

  const profilesUrl = "/api/admin/employee-profile";
  const employeesUrl = `/api/leaderboard/operational?period_type=monthly&period_id=${periodId}&include_excluded=1&include_zero=1`;

  const { data: profilesData, isLoading: profilesLoading } = useSWR(profilesUrl, fetcher);
  const { data: employeesData } = useSWR(employeesUrl, fetcher);

  const profiles = profilesData?.profiles || [];
  const profilesByName = useMemo(() => Object.fromEntries(profiles.map((p) => [p.employee, p])), [profiles]);

  const allEmployees = useMemo(() => {
    const set = new Set();
    for (const r of employeesData?.ranking || []) if (r.employee) set.add(r.employee);
    return Array.from(set).sort();
  }, [employeesData]);

  const employeesWithoutProfile = useMemo(
    () => allEmployees.filter((n) => !profilesByName[n]),
    [allEmployees, profilesByName]
  );

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (!formEmployee.trim()) { setError("Scegli o scrivi il nome dell'operatore."); return; }
    if (formStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(formStartDate)) { setError("La data non è valida."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(profilesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: formEmployee.trim(),
          start_date: formStartDate || null,
          note: formNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Errore");
      } else {
        setFormEmployee(""); setFormStartDate(""); setFormNote(""); setEditing(null);
        await mutate(profilesUrl);
      }
    } catch (err) {
      setError(String(err));
    } finally { setSubmitting(false); }
  }

  async function handleDelete(employee) {
    if (!confirm(`Rimuovere il profilo di "${employee}"?\nLa scheda operatore resta visibile, ma senza data di ingresso né tempo in agenzia.`)) return;
    const res = await fetch(`${profilesUrl}?employee=${encodeURIComponent(employee)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || data.error) alert(data.error || "Errore");
    else await mutate(profilesUrl);
  }

  function startEdit(profile) {
    setEditing(profile.employee);
    setFormEmployee(profile.employee);
    setFormStartDate(profile.start_date || "");
    setFormNote(profile.note || "");
    window.scrollTo({ top: 350, behavior: "smooth" });
  }

  const monthName = `${MONTHS_IT[Number(periodId.slice(5)) - 1]} ${periodId.slice(0, 4)}`;
  const withDate = profiles.filter((p) => p.start_date).length;

  const columns = [
    {
      key: "employee", label: "Operatore",
      render: (p) => <Link href={`/leaderboard/operational/${encodeURIComponent(p.employee)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{p.employee}</Link>,
    },
    { key: "start_date", label: "In agenzia dal", render: (p) => <span style={{ whiteSpace: "nowrap" }}>{fmtDay(p.start_date)}</span> },
    { key: "tenure", label: "Da quanto", align: "right", sort: (p) => monthsSince(p.start_date), render: (p) => <span style={{ whiteSpace: "nowrap" }}>{fmtTenure(monthsSince(p.start_date))}</span> },
    { key: "note", label: "Nota", muted: true, render: (p) => <span style={{ fontSize: 13 }}>{p.note || "—"}</span> },
    { key: "updated_at", label: "Aggiornato", align: "right", render: (p) => <span style={{ color: CP.textMuted, fontSize: 13 }}>{p.updated_at ? new Date(p.updated_at).toLocaleDateString("it-IT") : "—"}</span> },
    {
      key: "actions", label: "", sortable: false,
      render: (p) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
          <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={() => startEdit(p)}>Modifica</button>
          <button style={{ ...btn, padding: "5px 10px", fontSize: 12, color: CP.accentRed, background: "transparent" }} onClick={() => handleDelete(p.employee)}>Rimuovi</button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Profili operatori" }]}
        title="Profili operatori"
        subtitle="Quando ogni operatore è entrato in agenzia, più una nota libera. La data serve alla scheda operatore per mostrare da quanto lavora con noi e il valore generato nel tempo; il resto dello storico arriva da solo dagli import."
      />

      {profilesData?.error && <Notice danger>{String(profilesData.error)}</Notice>}
      {profilesLoading && !profilesData && <div style={{ color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}

      {profilesData && !profilesData.error && (
        <HeroMetric
          label="Profili compilati"
          value={fmtInt(profiles.length)}
          compare={employeesData?.ranking
            ? `${fmtInt(employeesWithoutProfile.length)} operatori dei dati Infloww di ${monthName} non hanno ancora un profilo.`
            : null}
          hint={profiles.length > 0 ? `${fmtInt(withDate)} con la data di ingresso.` : "Parti dagli operatori che segui di più: bastano nome e data di ingresso."}
        />
      )}

      <section style={{ ...card, padding: "18px 20px", marginBottom: 20 }}>
        <SectionTitle>{editing ? `Modifica il profilo di ${editing}` : "Aggiungi un profilo"}</SectionTitle>
        {error && <Notice danger>{error}</Notice>}
        <form onSubmit={handleSave}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl} htmlFor="ep-employee">Operatore</label>
              <input id="ep-employee" list="emp-list" value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)}
                placeholder="Inizia a scrivere il nome…" style={{ ...inp, opacity: editing ? 0.7 : 1 }} disabled={!!editing} />
              <datalist id="emp-list">
                {employeesWithoutProfile.map((n) => <option key={n} value={n} />)}
              </datalist>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 5 }}>I suggerimenti mostrano solo chi non ha ancora un profilo.</div>
            </div>
            <div>
              <label style={lbl} htmlFor="ep-start">In agenzia dal</label>
              <input id="ep-start" type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl} htmlFor="ep-note">Nota (facoltativa)</label>
              <input id="ep-note" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Es. mentor per i nuovi" style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
              {submitting ? "Salvataggio…" : editing ? "Salva modifiche" : "Aggiungi profilo"}
            </button>
            {editing && (
              <button type="button" style={btn} onClick={() => { setEditing(null); setFormEmployee(""); setFormStartDate(""); setFormNote(""); }}>
                Annulla
              </button>
            )}
          </div>
        </form>
      </section>

      <SectionTitle aside={profiles.length ? `${fmtInt(profiles.length)} operatori` : null}>Profili salvati</SectionTitle>
      <DataTable
        columns={columns}
        rows={profiles.map((p) => ({ ...p, id: p.employee }))}
        defaultSort={{ key: "employee", dir: 1 }}
        minWidth={760}
        maxHeight={640}
        empty="Nessun profilo ancora: aggiungi il primo con il modulo qui sopra."
      />
    </div>
  );
}
