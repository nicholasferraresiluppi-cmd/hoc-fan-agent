"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Link2, AlertTriangle, CheckCircle2, Sparkles, Unlink, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /admin/user-mapping — collega gli utenti Clerk al loro operatore.
 * Suggerimento dal roster Infloww (per email), collegamento ancorato all'employeeId.
 * Completa la storia del mapping via API (PR #38).
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function UserMappingPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/user-mapping", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(null);
  const [pageErr, setPageErr] = useState(null);

  const forbidden = data?.error;
  const users = data?.users || [];
  const unmapped = users.filter((u) => u.mapping.status === "none").length;

  async function link(u, employee, employee_id) {
    setBusy(u.userId);
    setPageErr(null);
    try {
      const r = await fetch("/api/me/employee", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: u.userId, employee, employee_id: employee_id || null }),
      });
      const j = await r.json();
      if (!r.ok) setPageErr(j.error || "Errore.");
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  async function unlink(u) {
    if (!window.confirm(`Scollegare ${u.name} da ${u.mapping.employee}?`)) return;
    setBusy(u.userId);
    setPageErr(null);
    try {
      const r = await fetch(`/api/me/employee?user_id=${encodeURIComponent(u.userId)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) setPageErr(j.error || "Errore.");
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1080, margin: "0 auto" }}>
      <PageHeader
        section="Data & Integrations"
        title="Collega utenti a operatori"
        subtitle="Chi ha un account HOC Pro e a quale operatore corrisponde. Il collegamento si ancora all'employeeId ufficiale Infloww (sopravvive a refusi e cambi nome). L'auto-collegamento avviene solo su match esatto di email: tutti gli altri li colleghi qui, con un click sul suggerimento."
        toolbar={
          <>
            <Link href="/admin/debug-mapping" style={{ textDecoration: "none" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, fontFamily: FONTS.body }}>
                <Link2 size={15} /> Debug mapping CP
              </span>
            </Link>
            <button onClick={() => mutate()} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, cursor: "pointer" }}>
              <RefreshCw size={15} /> Ricarica
            </button>
          </>
        }
      />

      {forbidden && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textSecondary, fontSize: 14 }}>
            <AlertTriangle size={18} color={CP.accentRed} /> {String(forbidden)} {data?.reason ? `(${data.reason})` : ""}
          </div>
        </CpCard>
      )}
      {pageErr && (
        <CpCard accent={CP.accentRed} style={{ marginBottom: 16 }}>
          <div style={{ color: CP.textSecondary, fontSize: 14 }}>{pageErr}</div>
        </CpCard>
      )}

      {!isLoading && !forbidden && (
        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <Tile label="Utenti" value={users.length} />
          <Tile label="Non collegati" value={unmapped} accent={unmapped > 0 ? CP.accentBlue : CP.accentGreen} />
        </div>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && (
        <div style={{ overflowX: "auto", border: `1px solid ${CP.border}`, borderRadius: 12, background: CP.surface }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780, fontSize: 13.5, fontFamily: FONTS.body }}>
            <thead>
              <tr>
                {["Utente", "Email", "Operatore collegato", "Suggerimento", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${CP.border}`, color: CP.textMuted, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const m = u.mapping;
                const s = u.suggestion;
                return (
                  <tr key={u.userId}>
                    <td style={{ padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textPrimary }}>{u.name}</td>
                    <td style={{ padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>{u.email || "—"}</td>
                    <td style={{ padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}` }}>
                      {m.status === "none" && <span style={{ color: CP.textMuted }}>— non collegato</span>}
                      {m.status === "override_anchored" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CP.accentGreen }}>
                          <CheckCircle2 size={13} /> {m.employee}
                          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.textMuted }}>#{m.employee_id}</span>
                        </span>
                      )}
                      {m.status === "override_legacy" && (
                        <span style={{ color: CP.textSecondary }}>{m.employee} <span style={{ fontSize: 11, color: "#d9a44a" }}>(nome, non ancorato)</span></span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}` }}>
                      {s?.employee && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CP.accent }}>
                          <Sparkles size={13} /> {s.employee}
                          <span style={{ fontSize: 11, color: CP.textMuted }}>{s.match === "exact" ? "esatto" : s.match}</span>
                        </span>
                      )}
                      {s?.ambiguous && <span style={{ fontSize: 12, color: "#d9a44a" }}>ambiguo: {s.candidates.join(", ")}</span>}
                      {!s && m.status === "none" && <span style={{ color: CP.textMuted, fontSize: 12 }}>nessun match roster</span>}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}`, whiteSpace: "nowrap" }}>
                      {s?.employee && (
                        <button onClick={() => link(u, s.employee, s.employee_id)} disabled={busy === u.userId}
                          style={{ padding: "5px 12px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: CP.accentInk, cursor: "pointer", marginRight: 6 }}>
                          Collega
                        </button>
                      )}
                      {m.status !== "none" && (
                        <button onClick={() => unlink(u)} disabled={busy === u.userId}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12, color: CP.accentRed, cursor: "pointer" }}>
                          <Unlink size={12} /> Scollega
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 16, lineHeight: 1.6 }}>
        Gli account "<b>nome MASS</b>" (mass-messaging) sono esclusi dal roster: non compaiono mai come suggerimento. Per collegare a un operatore non suggerito, usa Debug mapping o l'API con l'employeeId dal roster.
      </p>
    </div>
  );
}

function Tile({ label, value, accent }) {
  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "12px 18px", minWidth: 130 }}>
      <div style={{ fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, color: accent || CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
