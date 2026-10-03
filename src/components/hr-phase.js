"use client";
/**
 * Centro HR — fase della persona (03/10/2026): "Segna come uscita" e "Riattiva".
 * Da procedura non si elimina mai una persona: chi va via resta nel CRM con la
 * fase "Uscita" e la sua "Fine collaborazione". La scheda resta e si sincronizza
 * normalmente con ClickUp (tendina, stato del task, data).
 */
import { useState } from "react";
import { LogOut, UserCheck } from "lucide-react";
import { CP } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PHASE_EXITED, PHASE_ACTIVE } from "@/lib/hr-fields";
import { btnPrimary, btnGhost, input, lbl, fmtDate, postJson } from "@/components/hr-ui";

/** Oggi a Roma (YYYY-MM-DD). */
function todayRome() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "Segna come uscita": conferma con la data di fine, modificabile. */
export function ExitButton({ person, onDone }) {
  const current = person.fields?.endDate || null;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const openModal = () => { setErr(null); setDate(current || todayRome()); setOpen(true); };
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await postJson(`/api/admin/hr/people/${person.id}/phase`, { action: "exit", endDate: date || null });
      setOpen(false);
      onDone?.(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={openModal} style={btnGhost}><LogOut size={14} /> Segna come uscita</button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Segnare ${person.name} come uscita?`}>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>
            La fase diventa <b>{PHASE_EXITED}</b> e si salva la data di fine collaborazione. La scheda resta nel CRM con tutto il suo storico
            e si aggiorna anche su ClickUp. Nell'elenco non compare più, ma la ritrovi col filtro «{PHASE_EXITED}».
          </p>
          <label>
            <span style={lbl}>Fine collaborazione</span>
            <input type="date" style={input} value={date} onChange={(e) => setDate(e.target.value)} />
            <span style={{ display: "block", fontSize: 12, color: CP.textMuted, marginTop: 4 }}>
              {current ? `Già indicata in scheda: ${fmtDate(current)}.` : "Era vuota: di base oggi."} Puoi cambiarla.
            </span>
          </label>
          {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={go} disabled={busy || !date} style={{ ...btnPrimary, opacity: busy || !date ? 0.5 : 1 }}><LogOut size={14} /> {busy ? "Salvo…" : `Segna come uscita il ${fmtDate(date)}`}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={btnGhost}>Annulla</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** "Riattiva": la fase torna "Attiva". */
export function ReactivateButton({ person, onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await postJson(`/api/admin/hr/people/${person.id}/phase`, { action: "reactivate" });
      setOpen(false);
      onDone?.(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={() => { setErr(null); setOpen(true); }} style={btnGhost}><UserCheck size={14} /> Riattiva</button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Riattivare ${person.name}?`}>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>
            La fase torna <b>{PHASE_ACTIVE}</b> e la scheda ricompare nell'elenco. La data di fine collaborazione
            {person.fields?.endDate ? ` (${fmtDate(person.fields.endDate)})` : ""} resta com'è: se non vale più, cambiala nella sezione Rapporto.
          </p>
          {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={go} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}><UserCheck size={14} /> {busy ? "Salvo…" : "Riattiva"}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={btnGhost}>Annulla</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
