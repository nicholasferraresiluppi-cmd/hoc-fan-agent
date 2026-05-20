"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import { COLORS, FONTS } from "@/lib/brand";

const fetcher = (url) => fetch(url).then((r) => r.json());

const REASONS = [
  { value: "non_chatter", label: "Non-chatter", description: "SM, trainer, account servizio", color: "#4F8CCB" },
  { value: "manual", label: "Manuale", description: "Esclusione amministrativa esplicita", color: "#D4AF7A" },
  { value: "data_quality", label: "Data quality", description: "Dati incompleti o sospetti", color: "#E76F51" },
];

const REASON_LABEL = {
  non_chatter: "Non-chatter",
  manual: "Manuale",
  data_quality: "Data quality",
  mass_account: "Mass (auto)",
  no_group_data: "No group data",
};

const REASON_COLOR = {
  non_chatter: "#4F8CCB",
  manual: "#D4AF7A",
  data_quality: "#E76F51",
  mass_account: "#8F8A82",
  no_group_data: "#6B7080",
};

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function LeaderboardExclusionsPage() {
  const [periodId, setPeriodId] = useState(currentMonthId());
  const [formEmployee, setFormEmployee] = useState("");
  const [formReason, setFormReason] = useState("non_chatter");
  const [formNote, setFormNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1300, margin: "0 auto" },
    title: { fontFamily: FONTS.display, fontSize: 28, margin: "0 0 6px 0", letterSpacing: "-0.01em", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 24, maxWidth: 900, lineHeight: 1.55 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 22, marginBottom: 22 },
    h2: { fontFamily: FONTS.display, fontSize: 18, margin: "0 0 14px 0", fontWeight: 500 },
    label: { fontSize: 11, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "block" },
    input: { width: "100%", padding: "9px 14px", background: COLORS.charcoal, border: `1px solid ${COLORS.steel}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, marginBottom: 12, outline: "none" },
    btn: { padding: "9px 18px", background: COLORS.champagne, color: COLORS.obsidian, border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body },
    btnDanger: { padding: "5px 12px", background: "transparent", color: COLORS.signal, border: `1px solid ${COLORS.signal}66`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: FONTS.body },
    error: { background: COLORS.signal + "20", color: COLORS.signal, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    reasonPill: (active, color) => ({
      padding: "8px 14px",
      background: active ? color : "transparent",
      color: active ? COLORS.obsidian : COLORS.alabaster,
      border: `1px solid ${active ? color : COLORS.steel}`,
      borderRadius: 999,
      cursor: "pointer",
      fontSize: 12, fontWeight: active ? 600 : 500,
      fontFamily: FONTS.body,
      marginRight: 6,
    }),
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "10px 12px", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${COLORS.charcoal}88`, verticalAlign: "middle" },
    reasonBadge: (reason) => ({
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      background: (REASON_COLOR[reason] || COLORS.mist) + "26",
      color: REASON_COLOR[reason] || COLORS.mist,
      border: `1px solid ${REASON_COLOR[reason] || COLORS.mist}55`,
    }),
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <AdminNav />
        <h1 style={styles.title}>Esclusioni Leaderboard Operativa</h1>
        <p style={styles.sub}>
          Gestisci la denylist degli operatori da escludere dalla classifica e visualizza
          chi non vi compare (automatici "Mass", esclusi manuali, score zero, dati mancanti).
          Le modifiche hanno effetto al successivo caricamento della leaderboard.
        </p>

        {/* Esclusioni attive */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Esclusioni manuali attive ({exclusionEntries.length})</h2>
          {exclErr && <div style={styles.error}>Errore caricamento: {String(exclErr)}</div>}
          {exclData?.error && <div style={styles.error}>{exclData.error}</div>}
          {exclusionEntries.length === 0 ? (
            <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessuna esclusione manuale. Account "Mass" sono filtrati automaticamente in pipeline.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Operatore</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Nota</th>
                  <th style={styles.th}>Aggiunto da</th>
                  <th style={styles.th}>Quando</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {exclusionEntries.map(([name, entry]) => (
                  <tr key={name}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{name}</td>
                    <td style={styles.td}><span style={styles.reasonBadge(entry.reason)}>{REASON_LABEL[entry.reason] || entry.reason}</span></td>
                    <td style={{ ...styles.td, color: COLORS.fog, fontSize: 12 }}>{entry.note || "—"}</td>
                    <td style={{ ...styles.td, color: COLORS.mist, fontSize: 11, fontFamily: FONTS.mono }}>{(entry.added_by || "").slice(-8)}</td>
                    <td style={{ ...styles.td, color: COLORS.mist, fontSize: 11 }}>
                      {entry.added_at ? new Date(entry.added_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <button style={styles.btnDanger} onClick={() => handleRemove(name)}>Rimuovi</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Form aggiunta */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Aggiungi esclusione</h2>
          {error && <div style={styles.error}>{error}</div>}
          <form onSubmit={handleAdd}>
            <label style={styles.label}>Nome operatore (esatto come in Infloww)</label>
            <input
              list="employees-list"
              value={formEmployee}
              onChange={(e) => setFormEmployee(e.target.value)}
              placeholder="Es. Mario Rossi"
              style={styles.input}
            />
            <datalist id="employees-list">
              {allEmployeesInPeriod.map((n) => <option key={n} value={n} />)}
            </datalist>
            <p style={{ fontSize: 11, color: COLORS.mist, marginTop: -8, marginBottom: 14 }}>
              {allEmployeesInPeriod.length} nomi disponibili dal periodo {periodId}. Cambia periodo sotto se non trovi l'operatore.
            </p>

            <label style={styles.label}>Reason</label>
            <div style={{ marginBottom: 12 }}>
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  style={styles.reasonPill(formReason === r.value, r.color)}
                  onClick={() => setFormReason(r.value)}
                  title={r.description}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <label style={styles.label}>Nota (opzionale)</label>
            <input
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Es. SM, non opera in chat"
              style={styles.input}
            />

            <button type="submit" style={styles.btn} disabled={submitting}>
              {submitting ? "Salvataggio…" : "✓ Aggiungi esclusione"}
            </button>
          </form>
        </div>

        {/* Audit — non in classifica */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Audit: chi non compare in classifica</h2>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={styles.label}>Periodo:</span>
            <input
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              placeholder="2026-05"
              style={{ ...styles.input, width: 140, marginBottom: 0 }}
            />
            <Link href="/leaderboard/operational" style={{ color: COLORS.champagne, fontSize: 12, marginLeft: "auto" }}>
              Vai alla leaderboard →
            </Link>
          </div>

          {auditErr && <div style={styles.error}>Errore: {String(auditErr)}</div>}
          {auditData?.error && <div style={styles.error}>{auditData.error}</div>}
          {!auditData?.error && (
            <>
              <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", fontSize: 12, color: COLORS.fog }}>
                <span>Totale esclusi: <b style={{ color: COLORS.alabaster }}>{auditAll.length}</b></span>
                <span>· Mass: <b style={{ color: COLORS.alabaster }}>{auditAll.filter(r => r._excluded_reason === "mass_account").length}</b></span>
                <span>· Manuali: <b style={{ color: COLORS.alabaster }}>{auditAll.filter(r => ["non_chatter","manual","data_quality"].includes(r._excluded_reason)).length}</b></span>
                <span>· No group data: <b style={{ color: COLORS.alabaster }}>{auditAll.filter(r => r._excluded_reason === "no_group_data").length}</b></span>
              </div>

              {auditAll.length === 0 ? (
                <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessun operatore escluso in questo periodo.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Operatore</th>
                      <th style={styles.th}>Group</th>
                      <th style={styles.th}>Reason</th>
                      <th style={styles.th}>Sales</th>
                      <th style={styles.th}>Msg</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditAll.map((r, i) => {
                      const isManual = ["non_chatter", "manual", "data_quality"].includes(r._excluded_reason);
                      return (
                        <tr key={`${r.employee}-${r.group}-${i}`}>
                          <td style={{ ...styles.td, fontWeight: 600 }}>{r.employee}</td>
                          <td style={{ ...styles.td, color: COLORS.fog, fontSize: 12 }}>{r.group}</td>
                          <td style={styles.td}>
                            <span style={styles.reasonBadge(r._excluded_reason)}>{REASON_LABEL[r._excluded_reason] || r._excluded_reason}</span>
                            {r._exclusion_note && <span style={{ marginLeft: 6, color: COLORS.mist, fontSize: 11 }}>{r._exclusion_note}</span>}
                          </td>
                          <td style={{ ...styles.td, fontFamily: FONTS.mono }}>{r.sales != null ? `$${Number(r.sales).toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}</td>
                          <td style={{ ...styles.td, fontFamily: FONTS.mono }}>{r.direct_messages_sent ?? "—"}</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>
                            {isManual ? (
                              <button style={styles.btnDanger} onClick={() => handleRemove(r.employee)}>Rimuovi</button>
                            ) : r._excluded_reason === "mass_account" ? (
                              <span style={{ fontSize: 11, color: COLORS.mist }}>auto</span>
                            ) : (
                              <button
                                style={{ ...styles.btnDanger, color: COLORS.fog, borderColor: COLORS.steel }}
                                onClick={() => { setFormEmployee(r.employee); window.scrollTo({ top: 400, behavior: "smooth" }); }}
                              >
                                Aggiungi
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
