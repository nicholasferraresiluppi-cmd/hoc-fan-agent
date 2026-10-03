"use client";
/**
 * Centro HR — archivio (03/10/2026): pulsanti "Elimina", "Ripristina" ed
 * "Elimina definitivamente", ognuno con la sua conferma che spiega cosa succede.
 * Usati dall'elenco (/admin/hr, vista Archiviate) e dalla scheda (/admin/hr/[id]).
 */
import { useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { CP } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { btnPrimary, btnGhost, input, lbl, fmtDateTime, postJson } from "@/components/hr-ui";

const SOURCE = { app: "da HOC Pro", clickup: "da ClickUp", sistema: "dal sistema" };
const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const btnDanger = { ...btnGhost, color: CP.accentRed, borderColor: CP.accentRed };

/** "Archiviata il 03/10/2026 da ClickUp: Task cancellato su ClickUp" */
export function archivedSummary(p) {
  const a = p?.archived;
  if (!a) return "";
  return `Archiviata il ${fmtDateTime(a.at)} ${SOURCE[a.source] || ""}: ${a.reason || "—"}`.replace(/\s+:/, ":");
}
/** Giorno in cui la scheda archiviata si cancella da sola. */
export function archiveDeleteDay(p) {
  return fmtDay(p?.archiveExpiresAt);
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (fn) => {
    setBusy(true); setErr(null);
    try { return await fn(); } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

/** "Elimina" (scheda attiva): archivio + task ClickUp nel cestino. */
export function ArchiveButton({ person, syncEnabled, onDone }) {
  const [open, setOpen] = useState(false);
  const { busy, err, setErr, run } = useAction();
  const go = () => run(async () => {
    const j = await postJson(`/api/admin/hr/people/${person.id}/archive`, {});
    setOpen(false);
    onDone?.(j);
  });
  return (
    <>
      <button type="button" onClick={() => { setErr(null); setOpen(true); }} style={btnDanger}><Trash2 size={14} /> Elimina</button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Eliminare la scheda di ${person.name}?`}>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>Cosa succede:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>la scheda va tra le <b>Archiviate</b>: sparisce dall'elenco e non si sincronizza più con ClickUp;</li>
            {person.clickupTaskId ? (
              <li>il task su ClickUp va nel <b>cestino</b>: da ClickUp si può recuperare per 30 giorni{syncEnabled ? "" : " (ora la sincronizzazione è spenta: lo si cestina quando si riaccende)"};</li>
            ) : (
              <li>questa scheda non ha un task su ClickUp: lì non cambia niente;</li>
            )}
            <li>dalle Archiviate puoi <b>ripristinarla</b> o eliminarla per sempre; dopo 30 giorni si cancella da sola, storico compreso.</li>
          </ul>
          <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>Se ClickUp non risponde, la scheda va comunque in archivio e il task viene cestinato dalla sincronizzazione della notte.</p>
          {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={go} disabled={busy} style={{ ...btnDanger, opacity: busy ? 0.5 : 1 }}><Trash2 size={14} /> {busy ? "Elimino…" : "Elimina"}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={btnGhost}>Annulla</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** "Ripristina" (scheda archiviata). */
export function RestoreButton({ person, onDone, compact }) {
  const [open, setOpen] = useState(false);
  const { busy, err, setErr, run } = useAction();
  const queued = Boolean(person.archived?.pendingTaskDelete && !person.archived?.taskDeletedAt);
  const go = () => run(async () => {
    const j = await postJson(`/api/admin/hr/people/${person.id}/restore`, {});
    setOpen(false);
    onDone?.(j);
  });
  return (
    <>
      <button type="button" onClick={() => { setErr(null); setOpen(true); }} style={compact ? { ...btnGhost, padding: "5px 10px", fontSize: 12 } : btnGhost}><RotateCcw size={compact ? 13 : 14} /> Ripristina</button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Ripristinare la scheda di ${person.name}?`}>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          {queued ? (
            <p style={{ margin: 0 }}>La scheda torna nell'elenco. Il suo task su ClickUp non era ancora stato cancellato: si ricollega a quello e lo riallinea.</p>
          ) : (
            <p style={{ margin: 0 }}>La scheda torna nell'elenco e alla prima sincronizzazione si crea un <b>task nuovo</b> su ClickUp. Il task che è nel cestino di ClickUp <b>non</b> viene recuperato: se lo ripristini anche da ClickUp avrai due task per la stessa persona.</p>
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

/** "Elimina definitivamente" (scheda archiviata): conferma scrivendo ELIMINA. */
export function PurgeButton({ person, onDone, compact }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const { busy, err, setErr, run } = useAction();
  const ready = word.trim().toUpperCase() === "ELIMINA";
  const go = () => run(async () => {
    const j = await postJson(`/api/admin/hr/people/${person.id}`, { confirm: true }, "DELETE");
    setOpen(false);
    onDone?.(j);
  });
  return (
    <>
      <button type="button" onClick={() => { setErr(null); setWord(""); setOpen(true); }} style={compact ? { ...btnDanger, padding: "5px 10px", fontSize: 12 } : btnDanger}><Trash2 size={compact ? 13 : 14} /> Elimina definitivamente</button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Eliminare per sempre la scheda di ${person.name}?`}>
        <div style={{ display: "grid", gap: 10, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>Cancella da HOC Pro la scheda e <b>tutto il suo storico</b>. Non si può annullare. Su ClickUp non cambia niente (il task, se c'era, è già nel cestino o ci finisce stanotte).</p>
          <label>
            <span style={lbl}>Per confermare scrivi ELIMINA</span>
            <input style={input} value={word} onChange={(e) => setWord(e.target.value)} autoFocus autoComplete="off" />
          </label>
          {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={go} disabled={busy || !ready} style={{ ...btnDanger, opacity: busy || !ready ? 0.5 : 1 }}><Trash2 size={14} /> {busy ? "Elimino…" : "Elimina per sempre"}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={btnGhost}>Annulla</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
