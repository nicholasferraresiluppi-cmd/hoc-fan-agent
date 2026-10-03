"use client";
/**
 * Centro HR — archivio (03/10/2026): solo "Ripristina". Da procedura non si
 * elimina mai una persona (chi va via si segna "Uscita", vedi hr-phase.js):
 * l'archivio è una rete di sicurezza per i task cancellati su ClickUp.
 * Usato dall'elenco (/admin/hr, vista Archiviate) e dalla scheda (/admin/hr/[id]).
 */
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { CP } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { btnPrimary, btnGhost, fmtDateTime, postJson } from "@/components/hr-ui";

const SOURCE = { app: "da HOC Pro", clickup: "da ClickUp", sistema: "dal sistema" };

/** "Archiviata il 03/10/2026 da ClickUp: Task cancellato su ClickUp" */
export function archivedSummary(p) {
  const a = p?.archived;
  if (!a) return "";
  return `Archiviata il ${fmtDateTime(a.at)} ${SOURCE[a.source] || ""}: ${a.reason || "—"}`.replace(/\s+:/, ":");
}

/** "Ripristina" (scheda archiviata). */
export function RestoreButton({ person, onDone, compact }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // schede del vecchio "Elimina" il cui task non è mai stato cancellato: si ricollegano a quello
  const keepTask = Boolean(person.archived?.pendingTaskDelete && !person.archived?.taskDeletedAt);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await postJson(`/api/admin/hr/people/${person.id}/restore`, {});
      setOpen(false);
      onDone?.(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={() => { setErr(null); setOpen(true); }} style={compact ? { ...btnGhost, padding: "5px 10px", fontSize: 12 } : btnGhost}><RotateCcw size={compact ? 13 : 14} /> Ripristina</button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Ripristinare la scheda di ${person.name}?`}>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          {keepTask ? (
            <p style={{ margin: 0 }}>La scheda torna nell'elenco. Il suo task su ClickUp c'è ancora: si ricollega a quello e lo riallinea.</p>
          ) : (
            <p style={{ margin: 0 }}>La scheda torna nell'elenco e alla prima sincronizzazione si crea un <b>task nuovo</b> su ClickUp. Il task cancellato su ClickUp <b>non</b> viene recuperato: se lo ripristini anche dal cestino di ClickUp avrai due task per la stessa persona.</p>
          )}
          {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={go} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}><RotateCcw size={14} /> {busy ? "Ripristino…" : "Ripristina"}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={btnGhost}>Annulla</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
