"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquareWarning, Clock } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, Notice, card } from "@/components/ds";

/**
 * /admin/disputes — coda contestazioni (CAREER_LADDER §8.2).
 * Risoluzione con motivazione obbligatoria (l'operatore la legge); se accolta,
 * la correzione dei dati va fatta coi flussi tracciati — mai edit silenziosi.
 *
 * Redesign DS (26/09/2026): tono serio, nessuna azione cambiata. Numero
 * principale = contestazioni aperte con quante hanno superato i 10 giorni;
 * le regole spiegate in parole prima della coda.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());
const SLA_MS = 10 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const STATUS_LABEL = { open: "aperte", accepted: "accolte", partial: "accolte in parte", rejected: "respinte" };
const OUTCOME_LABEL = { open: "aperta", accepted: "accolta", partial: "accolta in parte", rejected: "respinta" };
const TYPE_LABEL = { score: "lo score", compenso: "il compenso", altro: "altro" };

const btn = { padding: "7px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };

export default function DisputesAdminPage() {
  const [status, setStatus] = useState("open");
  const { data, mutate, isLoading } = useSWR(`/api/admin/disputes?status=${status}`, fetcher, { revalidateOnFocus: false });
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("accepted");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const forbidden = data?.error;
  const disputes = data?.disputes || [];
  const overdue = status === "open" ? disputes.filter((d) => Date.now() - d.created_at > SLA_MS).length : 0;
  const oldestDays = status === "open" && disputes.length
    ? Math.floor((Date.now() - Math.min(...disputes.map((d) => d.created_at))) / DAY_MS)
    : null;

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

  const noteOk = note.trim().length >= 10;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Contestazioni" }]}
        title="Contestazioni"
        subtitle="Gli operatori che non sono d'accordo con il loro score o il loro compenso. Per ognuna decidi l'esito e scrivi il perché: l'operatore legge la tua motivazione così com'è."
      />

      <Notice>
        Tre regole (career ladder §8.2): si risponde <b style={{ color: CP.textPrimary, fontWeight: 500 }}>entro 10 giorni</b>; la motivazione scritta c'è sempre, anche quando la contestazione è respinta;
        se è fondata, il dato si corregge rifacendo l'import o la sincronizzazione da cui viene, <b style={{ color: CP.textPrimary, fontWeight: 500 }}>mai modificandolo a mano</b> (così resta traccia di cosa è cambiato e perché).
      </Notice>

      {forbidden && (
        <Notice danger>Questa pagina è riservata a chi vede i dati di tutti (admin, sales manager, QA). {String(forbidden)}</Notice>
      )}

      {!forbidden && status === "open" && !isLoading && (
        <HeroMetric
          label="Contestazioni aperte"
          value={fmtInt(disputes.length)}
          compare={disputes.length === 0 ? "Nessuna in attesa di risposta." : overdue > 0 ? `${overdue} ${overdue === 1 ? "ha" : "hanno"} superato i 10 giorni: vanno chiuse per prime.` : "Tutte entro i 10 giorni."}
        >
          {disputes.length > 0 && (
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Oltre 10 giorni" value={fmtInt(overdue)} danger={overdue > 0} />
              <Metric label="La più vecchia" value={oldestDays === 0 ? "oggi" : `${fmtInt(oldestDays)} ${oldestDays === 1 ? "giorno" : "giorni"}`} />
            </div>
          )}
        </HeroMetric>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <FilterChip key={k} label={k === "open" ? "Aperte" : l[0].toUpperCase() + l.slice(1)} active={status === k} onClick={() => { setStatus(k); setResolving(null); }} />
        ))}
      </div>

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!isLoading && !forbidden && disputes.length === 0 && (
        <div style={{ ...card, padding: "28px 20px", display: "flex", gap: 12, alignItems: "center" }}>
          <MessageSquareWarning size={22} color={CP.mutedIcons} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            {status === "open"
              ? "Nessuna contestazione in attesa. Quando un operatore ne apre una dalla sua pagina «Le mie contestazioni», compare qui."
              : `Nessuna contestazione ${STATUS_LABEL[status]} finora.`}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {disputes.map((d) => {
          const late = d.status === "open" && Date.now() - d.created_at > SLA_MS;
          const days = Math.floor((Date.now() - d.created_at) / DAY_MS);
          const isOpen = resolving === d.id;
          return (
            <section key={d.id} style={{ ...card, padding: "16px 18px", borderLeft: late ? `3px solid ${CP.accentRed}` : card.border }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{d.employee}</span>
                <span style={{ fontSize: 13, color: CP.textSecondary }}>
                  contesta {TYPE_LABEL[d.type] || d.type}{d.period_id ? ` · ${d.period_id}` : ""}
                </span>
                {late && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: CP.accentRed }}>
                    <Clock size={13} /> aperta da {days} giorni, oltre il limite di 10
                  </span>
                )}
                <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>
                  {new Date(d.created_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 3 }}>Cosa scrive l'operatore</div>
              <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{d.message}</p>

              {d.resolution_note && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 3 }}>Esito: {OUTCOME_LABEL[d.status] || d.status}</div>
                  <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, lineHeight: 1.55 }}>{d.resolution_note}</p>
                </div>
              )}

              {d.status === "open" && !isOpen && (
                <button onClick={() => { setResolving(d.id); setNote(""); setOutcome("accepted"); }} style={{ ...btn, marginTop: 12 }}>
                  Decidi l'esito
                </button>
              )}

              {isOpen && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>Esito</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    {[["accepted", "Accolta"], ["partial", "Accolta in parte"], ["rejected", "Respinta"]].map(([v, l]) => (
                      <FilterChip key={v} label={l} active={outcome === v} onClick={() => setOutcome(v)} />
                    ))}
                  </div>
                  <label style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>
                    Motivazione (obbligatoria, almeno 10 caratteri: l'operatore la leggerà)
                  </label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                    placeholder="Se accolta: scrivi quale import o sincronizzazione corregge il dato."
                    style={{ width: "100%", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, color: CP.textPrimary, resize: "vertical", boxSizing: "border-box", fontFamily: FONTS.body, lineHeight: 1.5 }} />
                  {err && <p style={{ color: CP.accentRed, fontSize: 13, margin: "6px 0 0" }}>{err}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={() => onResolve(d.id)} disabled={busy || !noteOk}
                      style={{ ...btn, background: noteOk ? CP.accent : CP.surfaceAlt, border: `1px solid ${noteOk ? CP.accent : CP.border}`, color: noteOk ? CP.accentInk : CP.textMuted, fontWeight: 500, cursor: noteOk ? "pointer" : "not-allowed" }}>
                      Registra esito
                    </button>
                    <button onClick={() => setResolving(null)} style={{ ...btn, background: "transparent", color: CP.textSecondary }}>Annulla</button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
