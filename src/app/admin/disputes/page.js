"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquareWarning, AlertTriangle, Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, PillTab } from "@/components/cp-style";

/**
 * /admin/disputes — coda contestazioni (CAREER_LADDER §8.2).
 * Risoluzione con motivazione obbligatoria (l'operatore la legge); se accolta,
 * la correzione dei dati va fatta coi flussi tracciati — mai edit silenziosi.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());
const SLA_MS = 10 * 24 * 3600 * 1000;

const STATUS_LABEL = { open: "aperte", accepted: "accolte", partial: "parziali", rejected: "respinte" };

export default function DisputesAdminPage() {
  const [status, setStatus] = useState("open");
  const { data, mutate, isLoading } = useSWR(`/api/admin/disputes?status=${status}`, fetcher, { revalidateOnFocus: false });
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("accepted");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const forbidden = data?.error;

  async function onResolve(id) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/disputes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: outcome, resolution_note: note }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Errore.");
      else {
        setResolving(null);
        setNote("");
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1080, margin: "0 auto" }}>
      <PageHeader
        section="People"
        title="Contestazioni"
        subtitle="Le contestazioni degli operatori su score e compensi (career ladder §8.2). Regole: risposta entro 10 giorni, motivazione scritta sempre, e se la contestazione è fondata la correzione passa dai flussi tracciati (re-import / sync) — mai edit a mano."
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <PillTab key={k} active={status === k} onClick={() => { setStatus(k); setResolving(null); }}>{l}</PillTab>
        ))}
      </div>

      {forbidden && (
        <CpCard accent={CP.accentRed}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textSecondary, fontSize: 14 }}>
            <AlertTriangle size={18} color={CP.accentRed} /> Accesso riservato (scope "all"). {String(forbidden)}
          </div>
        </CpCard>
      )}

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && (data?.disputes || []).length === 0 && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "26px 16px" }}>
            <MessageSquareWarning size={28} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14, margin: "10px 0 0" }}>Nessuna contestazione {STATUS_LABEL[status]}.</p>
          </div>
        </CpCard>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(data?.disputes || []).map((d) => {
          const overdue = d.status === "open" && Date.now() - d.created_at > SLA_MS;
          const isOpen = resolving === d.id;
          return (
            <CpCard key={d.id} accent={overdue ? CP.accentRed : undefined}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, color: CP.textPrimary }}>{d.employee}</span>
                <span style={{ fontSize: 12, color: CP.accent, background: CP.accentSoft, borderRadius: 99, padding: "2px 9px" }}>{d.type}{d.period_id ? ` · ${d.period_id}` : ""}</span>
                {overdue && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 650, color: CP.accentRed }}>
                    <Clock size={13} /> oltre SLA 10gg
                  </span>
                )}
                <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{new Date(d.created_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p style={{ fontSize: 13.5, color: CP.textSecondary, margin: 0 }}>{d.message}</p>

              {d.resolution_note && (
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "8px 0 0", paddingTop: 8, borderTop: `1px solid ${CP.borderSoft}` }}>
                  <b style={{ color: CP.textPrimary }}>Esito ({STATUS_LABEL[d.status] || d.status}):</b> {d.resolution_note}
                </p>
              )}

              {d.status === "open" && !isOpen && (
                <button onClick={() => { setResolving(d.id); setNote(""); setOutcome("accepted"); }}
                  style={{ marginTop: 10, padding: "6px 14px", background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12.5, color: CP.textPrimary, cursor: "pointer" }}>
                  Risolvi
                </button>
              )}

              {isOpen && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {[["accepted", "Accolta"], ["partial", "In parte"], ["rejected", "Respinta"]].map(([v, l]) => (
                      <button key={v} onClick={() => setOutcome(v)}
                        style={{ padding: "5px 12px", borderRadius: 99, border: `1px solid ${outcome === v ? CP.accent : CP.border}`, background: outcome === v ? CP.accentSoft : "transparent", color: outcome === v ? CP.accent : CP.textMuted, fontSize: 12.5, cursor: "pointer" }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                    placeholder="Motivazione (obbligatoria — l'operatore la leggerà). Se accolta: indica quale flusso tracciato corregge il dato."
                    style={{ width: "100%", background: CP.bgSunken, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: CP.textPrimary, resize: "vertical", boxSizing: "border-box", fontFamily: FONTS.body }} />
                  {err && <p style={{ color: CP.accentRed, fontSize: 12.5, margin: "6px 0 0" }}>{err}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => onResolve(d.id)} disabled={busy || note.trim().length < 10}
                      style={{ padding: "7px 14px", background: note.trim().length >= 10 ? CP.accent : CP.surfaceAlt, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: note.trim().length >= 10 ? CP.accentInk : CP.textMuted, cursor: note.trim().length >= 10 ? "pointer" : "not-allowed" }}>
                      Registra esito
                    </button>
                    <button onClick={() => setResolving(null)} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textMuted, cursor: "pointer" }}>Annulla</button>
                  </div>
                </div>
              )}
            </CpCard>
          );
        })}
      </div>
    </div>
  );
}
