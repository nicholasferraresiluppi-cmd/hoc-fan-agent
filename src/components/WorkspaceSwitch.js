"use client";

/**
 * Selettore della mansione ("Vista: Board ▾") per menu classico e menu Casa (03/10/2026).
 * Cambia solo menu e hub (lib/workspaces): i permessi restano quelli dei ruoli.
 * Salva lato server (/api/me/workspace) così la scelta segue la persona su ogni dispositivo.
 */
import { useState } from "react";
import { mutate } from "swr";
import { WORKSPACES, WORKSPACE_IDS } from "@/lib/workspaces";
import { CP, FONTS } from "@/lib/brand";

export default function WorkspaceSwitch({ me, className, style }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const current = me?.workspace?.id;
  if (!me?.authenticated || !current) return null; // operatori: nessuna mansione, menu personale
  // in "Vedi come…" si guarda la mansione del membro, non si cambia (il middleware blocca comunque le scritture)
  const locked = Boolean(me?.view_as);

  const change = async (e) => {
    const id = e.target.value;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/me/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: id }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Non riesco a cambiare vista.");
      await mutate("/api/whoami");
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className={className} style={{ display: "grid", gap: 4, ...style }}>
      <label htmlFor="hoc-workspace" style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: CP.textMuted, fontFamily: FONTS.body, fontWeight: 500 }}>
        La mia vista
      </label>
      <select id="hoc-workspace" value={current} onChange={change} disabled={busy || locked}
        title={locked ? "In anteprima vedi la vista del membro guardato" : WORKSPACES[current]?.hint}
        style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, cursor: busy || locked ? "default" : "pointer" }}>
        {WORKSPACE_IDS.map((id) => <option key={id} value={id}>{WORKSPACES[id].label}</option>)}
      </select>
      {err && <span role="alert" style={{ fontSize: 11.5, color: CP.accentRed }}>{err}</span>}
    </div>
  );
}
