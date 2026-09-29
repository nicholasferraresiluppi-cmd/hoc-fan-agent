"use client";
/** Modale "Link di compilazione" del Centro HR: crea il link del modulo pubblico e lo mostra da copiare (nessuna email). */
import { useState } from "react";
import { CP } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { lbl, input, btnPrimary, CopyLink, postJson } from "@/components/hr-ui";

export default function HrFormLinkModal({ target, onClose, onCreated }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [link, setLink] = useState(null);
  const close = () => { setLink(null); setErr(null); setLabel(""); onClose(); };
  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await postJson("/api/admin/hr/form-links", { personId: target.personId, label });
      setLink({ url: `${window.location.origin}${j.path}`, expiresAt: j.expiresAt });
      onCreated?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!target) return null;
  return (
    <Modal open={Boolean(target)} onClose={close} title="Link di compilazione" maxWidth={560}>
      {!link ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, lineHeight: 1.5 }}>
            {target.personId ? <>La persona (<b>{target.name}</b>) aprirà un modulo con i suoi dati da controllare e completare.</> : "Il modulo crea una scheda nuova con i dati che la persona inserisce."}
            {" "}Il link vale 14 giorni e si usa una volta. Non parte nessuna email: lo copi e lo mandi tu.
          </p>
          {!target.personId && <label><span style={lbl}>Per chi è (lo vedete solo voi)</span><input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Es. nuova chatter di ottobre" /></label>}
          {err && <div style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
          <div><button type="button" onClick={create} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>{busy ? "Creo…" : "Crea il link"}</button></div>
        </div>
      ) : (
        <CopyLink link={link.url} note={`Link pronto: scade il ${new Date(link.expiresAt).toLocaleDateString("it-IT")}. Mandalo solo alla persona interessata: chi ha il link vede i suoi dati.`} />
      )}
    </Modal>
  );
}
