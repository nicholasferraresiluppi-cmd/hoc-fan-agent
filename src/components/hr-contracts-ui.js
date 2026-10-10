"use client";

/**
 * Pezzi condivisi dei contratti Dropbox Sign nel Centro HR (09/10/2026): etichetta dello
 * stato, riga del contratto con «Apri PDF», scheda «Contratto» della persona.
 */
import { FileText, ExternalLink, Check, FilePen } from "lucide-react";
import { CP } from "@/lib/brand";
import { card } from "@/components/ds";
import { FLAG_LABEL, KIND_LABEL, statusSentence } from "@/lib/hr-contracts-core";
import { fmtDate } from "@/components/hr-ui";

// colori: verde = a posto, rosso = da fare (manca / mansione cambiata / risolto), viola = in corso, grigio = niente da fare
export const FLAG_TONE = {
  ok: [CP.accentGreen, "rgba(74,222,128,.10)"],
  cambiata: [CP.accentRed, "rgba(240,140,140,.12)"],
  mancante: [CP.accentRed, "rgba(240,140,140,.12)"],
  risolto: [CP.accentRed, "rgba(240,140,140,.12)"],
  cambiata_in_firma: [CP.accentSoftText, CP.accentSoft],
  in_firma: [CP.accentSoftText, CP.accentSoft],
  da_verificare: [CP.textSecondary, CP.surfaceAlt],
  non_richiesto: [CP.textMuted, "transparent"],
};

export function ContractPill({ flag }) {
  if (!flag) return <span style={{ color: CP.textMuted, fontSize: 12.5 }}>—</span>;
  const [fg, bg] = FLAG_TONE[flag] || [CP.textMuted, "transparent"];
  return <span style={{ display: "inline-block", fontSize: 12.5, padding: "2px 9px", borderRadius: 999, color: fg, background: bg, whiteSpace: "nowrap" }}>{FLAG_LABEL[flag] || flag}</span>;
}

const STATE_LABEL = { firmato: "firmato", in_firma: "in attesa di firma", rifiutato: "rifiutato", scaduto: "scaduto" };

/** Una riga: titolo, mansione letta, stato, data, PDF. */
export function ContractLine({ c, compact = false }) {
  const when = c.signedAt || c.createdAt;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14 }}>
      <FileText size={15} color={CP.textMuted} style={{ marginTop: 2, flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: CP.textPrimary, overflowWrap: "anywhere" }}>{c.title || "Contratto"}</div>
        <div style={{ fontSize: 12.5, color: CP.textMuted }}>
          {c.role || KIND_LABEL[c.kind] || "mansione non letta"}
          {" · "}{STATE_LABEL[c.state] || c.state}{when ? ` il ${fmtDate(when)}` : ""}
          {c.readFrom === "titolo" && c.kind !== "risoluzione" ? " · mansione presa dal titolo" : ""}
          {c.attached ? <> · <Check size={11} style={{ verticalAlign: "-1px" }} /> allegato su ClickUp</> : null}
          {c.match?.how && !compact ? ` · abbinato per ${c.match.how}` : ""}
        </div>
      </div>
      {c.state === "firmato" && (
        <a href={`/api/admin/hr/contracts/${c.id}/pdf`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: CP.accentSoftText, whiteSpace: "nowrap", textDecoration: "none" }}>
          Apri PDF <ExternalLink size={12} style={{ verticalAlign: "-1px" }} />
        </a>
      )}
    </div>
  );
}

/** Scheda «Contratto» della persona: cosa succede, cosa fare, i documenti. */
export function PersonContractCard({ contracts, personId }) {
  if (!contracts) {
    return (
      <section style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Contratto</h2>
        <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>Contratti Dropbox Sign non ancora collegati.</p>
        {personId && <PrepareLink personId={personId} />}
      </section>
    );
  }
  const { status, list } = contracts;
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const shown = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const urgent = ["cambiata", "mancante", "risolto"].includes(status.flag);
  return (
    <section style={{ ...card, padding: "14px 16px", marginBottom: 14, borderLeft: urgent ? `3px solid ${CP.accentRed}` : undefined }} aria-labelledby="hr-contract-h">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <h2 id="hr-contract-h" style={{ margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Contratto</h2>
        <ContractPill flag={status.flag} />
        {personId && <span style={{ marginLeft: "auto" }}><PrepareLink personId={personId} primary={urgent} /></span>}
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>{statusSentence(status, byId, fmtDate)}</p>
      {shown.map((c) => <ContractLine key={c.id} c={c} compact />)}
      <p style={{ fontSize: 12, color: CP.textMuted, margin: "8px 0 0" }}>
        Da Dropbox Sign, aggiornato il {fmtDate(contracts.syncedAt)}. Contratto mancante o sbagliato? Si collega a mano dal <a href="/admin/hr/contratti" style={{ color: CP.accentSoftText }}>controllo contratti</a>.
      </p>
    </section>
  );
}

/** Pulsante verso il percorso «prepara e invia» (/admin/hr/[id]/contratto). */
export function PrepareLink({ personId, primary = false, label = "Prepara contratto" }) {
  return (
    <a href={`/admin/hr/${personId}/contratto`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap",
      background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, border: primary ? "1px solid transparent" : `1px solid ${CP.border}` }}>
      <FilePen size={13} /> {label}
    </a>
  );
}
