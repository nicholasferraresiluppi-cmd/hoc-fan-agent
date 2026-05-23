"use client";

import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

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
  if (m < 1) return "< 1 mese";
  if (m < 12) return `${Math.round(m)} mes${Math.round(m) === 1 ? "e" : "i"}`;
  const y = Math.floor(m / 12);
  const r = Math.round(m - y * 12);
  return r === 0 ? `${y} ann${y === 1 ? "o" : "i"}` : `${y}a ${r}m`;
}

export default function EmployeeProfilesPage() {
  const [formEmployee, setFormEmployee] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [periodId, setPeriodId] = useState(currentMonthId());

  const profilesUrl = "/api/admin/employee-profile";
  const employeesUrl = `/api/leaderboard/operational?period_type=monthly&period_id=${periodId}&include_excluded=1&include_zero=1`;

  const { data: profilesData } = useSWR(profilesUrl, fetcher);
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
    if (!formEmployee.trim()) { setError("Operatore richiesto."); return; }
    if (formStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(formStartDate)) { setError("Data formato YYYY-MM-DD"); return; }
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
    if (!confirm(`Rimuovere il profilo di "${employee}"?\nLo storico operatore resta visibile ma senza start_date/LTV.`)) return;
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

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1200, margin: "0 auto" },
    title: { fontFamily: FONTS.display, fontSize: 28, margin: "0 0 6px 0", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 24, maxWidth: 900, lineHeight: 1.55 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 22, marginBottom: 22 },
    h2: { fontFamily: FONTS.display, fontSize: 18, margin: "0 0 14px 0", fontWeight: 500 },
    label: { fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "block" },
    input: { width: "100%", padding: "9px 14px", background: COLORS.charcoal, border: `1px solid ${COLORS.steel}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, marginBottom: 12, outline: "none" },
    btn: { padding: "9px 18px", background: COLORS.champagne, color: COLORS.obsidian, border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body },
    btnGhost: { padding: "9px 14px", background: "transparent", color: COLORS.alabaster, border: `1px solid ${COLORS.steel}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body, marginLeft: 8 },
    btnDanger: { padding: "5px 12px", background: "transparent", color: COLORS.signal, border: `1px solid ${COLORS.signal}66`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: FONTS.body, marginLeft: 6 },
    error: { background: COLORS.signal + "20", color: COLORS.signal, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "10px 12px", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${COLORS.charcoal}88`, verticalAlign: "middle" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <AdminNav />
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Profili Operatori</span>
            </div>
          }
          section="People · Anagrafica"
          title="Profili Operatori"
          subtitle={'Data di ingresso in agency (per il calcolo "tempo in agency" e LTV) + note libere. Lo storico KPI è derivato automaticamente dai periodi importati.'}
        />

        {/* PROFILI ESISTENTI */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Profili salvati ({profiles.length})</h2>
          {profiles.length === 0 ? (
            <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessun profilo. Aggiungi sotto.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Operatore</th>
                  <th style={styles.th}>Start date</th>
                  <th style={styles.th}>Tempo in agency</th>
                  <th style={styles.th}>Nota</th>
                  <th style={styles.th}>Aggiornato</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.employee}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      <Link href={`/leaderboard/operational/${encodeURIComponent(p.employee)}`} style={{ color: COLORS.alabaster, textDecoration: "none" }}>
                        {p.employee}
                      </Link>
                    </td>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono }}>{p.start_date || "—"}</td>
                    <td style={{ ...styles.td, fontFamily: FONTS.mono, color: COLORS.champagne }}>{fmtTenure(monthsSince(p.start_date))}</td>
                    <td style={{ ...styles.td, color: COLORS.fog, fontSize: 12, fontStyle: p.note ? "italic" : "normal" }}>{p.note || "—"}</td>
                    <td style={{ ...styles.td, color: COLORS.mist, fontSize: 11 }}>{p.updated_at ? new Date(p.updated_at).toLocaleDateString("it-IT") : "—"}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <button style={styles.btnGhost} onClick={() => startEdit(p)}>Modifica</button>
                      <button style={styles.btnDanger} onClick={() => handleDelete(p.employee)}>Rimuovi</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* FORM */}
        <div style={styles.card}>
          <h2 style={styles.h2}>{editing ? `Modifica profilo: ${editing}` : "Aggiungi profilo"}</h2>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleSave}>
            <label style={styles.label}>Operatore</label>
            <input
              list="emp-list"
              value={formEmployee}
              onChange={(e) => setFormEmployee(e.target.value)}
              placeholder="Mario Rossi"
              style={styles.input}
              disabled={!!editing}
            />
            <datalist id="emp-list">
              {employeesWithoutProfile.map((n) => <option key={n} value={n} />)}
            </datalist>
            <p style={{ fontSize: 11, color: COLORS.mist, marginTop: -8, marginBottom: 14 }}>
              {employeesWithoutProfile.length} operatori senza profilo (periodo {periodId}).
            </p>

            <label style={styles.label}>Data inizio in agency (YYYY-MM-DD)</label>
            <input
              type="date"
              value={formStartDate}
              onChange={(e) => setFormStartDate(e.target.value)}
              style={styles.input}
            />

            <label style={styles.label}>Nota (opzionale)</label>
            <input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Veterano, mentor per i nuovi" style={styles.input} />

            <button type="submit" style={styles.btn} disabled={submitting}>
              {submitting ? "Salvataggio…" : editing ? "✓ Aggiorna" : "✓ Aggiungi profilo"}
            </button>
            {editing && (
              <button type="button" style={styles.btnGhost} onClick={() => { setEditing(null); setFormEmployee(""); setFormStartDate(""); setFormNote(""); }}>
                Annulla
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
