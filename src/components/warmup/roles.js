"use client";

// Ruoli della dashboard Clipping (13/11/2026) — scheda visibile solo agli admin.
// Un ruolo dice quali account vede una persona e, per ognuno, quali finestre può usare.
// I permessi sono controllati anche dalle API (lib/clipping-access): qui si gestiscono e basta.

import { useState } from "react";
import useSWR from "swr";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CP } from "@/lib/brand";
import { Notice } from "@/components/ds";
import { btn, btnPrimary, btnDanger, btnSm, input, cardBox, hint, Field, ModalBox, SectionHead, Chip } from "@/components/warmup/ui";
import { WINDOWS, WINDOW_KEYS } from "@/lib/clipping-access-core";

const API = "/api/admin/clipping-roles";
const fetcher = (u) => fetch(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Errore di caricamento"); return d; });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Errore");
  return d;
}
const WLABEL = Object.fromEntries(WINDOWS);
const platLabel = (p) => (p === "x" ? "X" : "Instagram");
const check = { width: 16, height: 16, margin: 0, accentColor: CP.accent, flexShrink: 0 };
const row = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" };

export default function ClippingRoles({ toast }) {
  const { data, error, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [edit, setEdit] = useState(null); // null | {} (nuovo) | ruolo
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const say = (m) => (toast ? toast(m) : null);

  async function run(body, okMsg) {
    setBusy(true);
    // la risposta ha solo ruoli e interruttore: si fonde con account e persone già caricati
    try { const d = await post(body); await mutate((cur) => (cur ? { ...cur, ...d } : cur), { revalidate: true }); say(okMsg); return true; }
    catch (e) { say(e.message); return false; }
    finally { setBusy(false); }
  }

  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={{ ...hint, fontSize: 14 }}>Carico…</p>;
  const accById = Object.fromEntries(data.accounts.map((a) => [a.id, a]));
  const personName = (id) => data.people.find((p) => p.id === id)?.name || "persona non più presente";

  return (
    <>
      <SectionHead aside="Chi vede quali account, e in quali finestre">Ruoli</SectionHead>
      <div style={{ ...cardBox, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...row, fontWeight: 500 }}>
          <input type="checkbox" style={check} checked={data.active} disabled={busy}
            onChange={(e) => run({ action: "active", on: e.target.checked }, e.target.checked ? "Ruoli attivi" : "Ruoli spenti")} />
          Ruoli attivi
        </label>
        <span style={{ ...hint, flex: 1, minWidth: 220 }}>
          {data.active
            ? "Chi non è amministratore vede solo gli account e le finestre dei suoi ruoli; senza ruoli non vede nessun account."
            : "Spenti: tutti vedono tutto, come prima. Prepara i ruoli e accendili quando sono pronti."}
        </span>
      </div>

      <div style={{ margin: "4px 0 14px" }}>
        <button type="button" style={btnPrimary} onClick={() => setEdit({})}><Plus size={15} />Aggiungi ruolo</button>
      </div>

      {!data.roles.length && (
        <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500 }}>Nessun ruolo</h3>
          <p style={{ ...hint, margin: 0 }}>Crea un ruolo, scegli gli account e le finestre, assegnalo alle persone.</p>
        </div>
      )}
      {data.roles.map((r) => {
        const ids = Object.keys(r.grants || {});
        return (
          <div key={r.id} style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontWeight: 500, fontSize: 15, flex: 1, minWidth: 160 }}>{r.name}</b>
              <button type="button" style={btnSm} onClick={() => setEdit(r)}><Pencil size={13} />Modifica</button>
              <button type="button" style={btnSm} onClick={() => setDel(r)}><Trash2 size={13} />Elimina</button>
            </div>
            <p style={{ ...hint, margin: "8px 0 6px" }}>
              {r.users?.length ? r.users.map(personName).join(", ") : "Nessuna persona assegnata"}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ids.length ? ids.map((id) => (
                <Chip key={id} title={(r.grants[id] || []).map((k) => WLABEL[k]).join(", ")}>
                  {accById[id]?.username || "account non più nel warm-up"} · {(r.grants[id] || []).length === WINDOW_KEYS.length ? "tutte le finestre" : `${r.grants[id].length} ${r.grants[id].length === 1 ? "finestra" : "finestre"}`}
                </Chip>
              )) : <span style={hint}>Nessun account</span>}
            </div>
          </div>
        );
      })}

      {edit && <RoleForm role={edit} accounts={data.accounts} people={data.people} busy={busy} onClose={() => setEdit(null)}
        onSave={async (role) => { if (await run({ action: "save", role }, edit.id ? "Ruolo aggiornato" : "Ruolo creato")) setEdit(null); }} />}
      {del && (
        <ModalBox title={`Eliminare «${del.name}»?`} onClose={() => setDel(null)}
          foot={<><button type="button" style={btn} onClick={() => setDel(null)}>Annulla</button>
            <button type="button" style={btnDanger} disabled={busy} onClick={async () => { if (await run({ action: "delete", id: del.id }, "Ruolo eliminato")) setDel(null); }}>Elimina</button></>}>
          <p style={{ fontSize: 14.5, color: CP.textSecondary, lineHeight: 1.55, margin: 0 }}>
            {del.users?.length ? `Le persone assegnate (${del.users.length}) perdono gli account di questo ruolo, se non li hanno da un altro ruolo.` : "Il ruolo non ha persone assegnate."} I dati dei profili non si toccano.
          </p>
        </ModalBox>
      )}
    </>
  );
}

function RoleForm({ role, accounts, people, busy, onClose, onSave }) {
  const [name, setName] = useState(role.name || "");
  const [grants, setGrants] = useState(() => structuredClone(role.grants || {}));
  const [users, setUsers] = useState(() => new Set(role.users || []));
  const allIds = accounts.map((a) => a.id);
  const allOn = allIds.length > 0 && allIds.every((id) => grants[id]);

  const toggleAcc = (id, on) => setGrants((g) => { const n = { ...g }; if (on) n[id] = n[id] || [...WINDOW_KEYS]; else delete n[id]; return n; });
  const toggleAll = (on) => setGrants((g) => (on ? Object.fromEntries(allIds.map((id) => [id, g[id] || [...WINDOW_KEYS]])) : {}));
  const toggleWin = (id, k, on) => setGrants((g) => { const cur = new Set(g[id] || []); if (on) cur.add(k); else cur.delete(k); return { ...g, [id]: WINDOW_KEYS.filter((x) => cur.has(x)) }; });
  const toggleUser = (id, on) => setUsers((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const empty = Object.entries(grants).filter(([, t]) => !t.length).map(([id]) => accounts.find((a) => a.id === id)?.username).filter(Boolean);

  const save = () => onSave({ id: role.id, name: name.trim(), grants: Object.fromEntries(Object.entries(grants).filter(([, t]) => t.length)), users: [...users] });

  return (
    <ModalBox title={role.id ? `Modifica «${role.name}»` : "Nuovo ruolo"} sub="Spunta gli account e, per ognuno, le finestre che il ruolo può usare. Una persona con più ruoli ha la somma dei permessi." onClose={onClose}
      foot={<><button type="button" style={btn} onClick={onClose}>Annulla</button><button type="button" style={btnPrimary} disabled={busy || !name.trim()} onClick={save}>Salva</button></>}>
      <Field label="Nome del ruolo">
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Editor Juli, Clipper team A" maxLength={60} />
      </Field>

      <div style={{ fontSize: 12.5, color: CP.textSecondary, fontWeight: 500, margin: "4px 0 6px" }}>Account</div>
      {!accounts.length ? <p style={hint}>Nessun profilo nel warm-up.</p> : (
        <label style={{ ...row, padding: "6px 0 10px", borderBottom: `1px solid ${CP.borderSoft}`, marginBottom: 6 }}>
          <input type="checkbox" style={check} checked={allOn} onChange={(e) => toggleAll(e.target.checked)} />Seleziona tutti
        </label>
      )}
      {accounts.map((a) => {
        const t = grants[a.id];
        const on = Boolean(t);
        return (
          <div key={a.id} style={{ padding: "6px 0", borderBottom: `1px solid ${CP.borderSoft}` }}>
            <label style={row}>
              <input type="checkbox" style={check} checked={on} onChange={(e) => toggleAcc(a.id, e.target.checked)} />
              <span style={{ fontWeight: 500 }}>{a.username}</span>
              <span style={hint}>{platLabel(a.platform)}{a.creator ? ` · ${a.creator}` : ""}</span>
            </label>
            {on && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "8px 0 4px 24px" }}>
                <label style={{ ...row, fontSize: 13 }}>
                  <input type="checkbox" style={check} checked={t.length === WINDOW_KEYS.length} onChange={(e) => setGrants((g) => ({ ...g, [a.id]: e.target.checked ? [...WINDOW_KEYS] : [] }))} />Tutte le finestre
                </label>
                {WINDOWS.filter(([k]) => !(k === "contenuti" && a.platform === "x") && !(k === "xrefs" && a.platform !== "x")).map(([k, l]) => (
                  <label key={k} style={{ ...row, fontSize: 13 }}>
                    <input type="checkbox" style={check} checked={t.includes(k)} onChange={(e) => toggleWin(a.id, k, e.target.checked)} />{l}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {empty.length > 0 && <p style={{ ...hint, color: CP.attn, margin: "6px 0 0" }}>Senza finestre non si salvano: {empty.join(", ")}.</p>}

      <div style={{ fontSize: 12.5, color: CP.textSecondary, fontWeight: 500, margin: "16px 0 6px" }}>Persone</div>
      {!people.length && <p style={hint}>Nessuno ha ancora aperto la dashboard.</p>}
      {people.map((p) => (
        <label key={p.id} style={{ ...row, padding: "5px 0" }}>
          <input type="checkbox" style={check} checked={users.has(p.id)} onChange={(e) => toggleUser(p.id, e.target.checked)} />{p.name}
          {people.filter((x) => x.name === p.name).length > 1 && <span style={hint} title={p.id}>account …{p.id.slice(-6)}</span>}
        </label>
      ))}
      <p style={{ ...hint, margin: "8px 0 0" }}>Compare chi ha aperto la dashboard Clipping almeno una volta.</p>
    </ModalBox>
  );
}
