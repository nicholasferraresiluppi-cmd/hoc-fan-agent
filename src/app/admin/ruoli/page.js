"use client";

// Membri — chi ha accesso a HOC Pro, con che ruolo, e "Aggiungi membro".
// Dal 25/09/2026 l'app è solo su invito: si entra SOLO da qui (niente dashboard
// Clerk). Due permessi distinti, controllati lato API:
//  - gestire i ruoli dei membri → ACCESS_MGMT (admin)
//  - invitare nuove persone     → USERS_INVITE (admin; assegnabile con un ruolo
//    custom, con i limiti anti-escalation di lib/invitations)
// La pagina mostra solo le parti per cui l'API risponde: chi non ha nessuno dei
// due vede un messaggio, non una tabella vuota.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const btn = (primary) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${primary ? CP.accent : CP.border}`,
  background: primary ? CP.accent : "transparent",
  color: primary ? CP.accentInk : CP.textSecondary,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
});

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—");

async function getJson(url) {
  const r = await fetch(url);
  let j = null;
  try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data: j };
}

export default function MembersPage() {
  const [roles, setRoles] = useState(null);      // /api/admin/roles (o {denied})
  const [invites, setInvites] = useState(null);  // /api/admin/invitations (o {denied})
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const [r, i] = await Promise.all([getJson("/api/admin/roles"), getJson("/api/admin/invitations")]);
    setRoles(r.ok ? r.data : { denied: true, error: r.data?.error });
    setInvites(i.ok ? i.data : { denied: true, error: i.data?.error });
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const canManage = roles && !roles.denied;
  const canInvite = invites && !invites.denied;

  const customMap = Object.fromEntries((roles?.custom || []).map((c) => [c.id, c]));
  const roleLabel = (rid) => roles?.meta?.[rid]?.label || customMap[rid]?.name
    || (invites?.assignable || []).find((r) => r.id === rid)?.label || rid;

  const toggleRole = async (userId, current, rid) => {
    const set = new Set(current || []);
    set.has(rid) ? set.delete(rid) : set.add(rid);
    setBusy(userId);
    try {
      const r = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, roles: Array.from(set) }),
      });
      if (!r.ok) setMsg({ type: "error", text: (await r.json().catch(() => ({}))).error || "Modifica non riuscita" });
      await load();
    } finally { setBusy(null); }
  };

  const revoke = async (inv) => {
    if (!confirm(`Annullare l'invito a ${inv.email}? Il link nell'email smetterà di funzionare.`)) return;
    setBusy(inv.id);
    const r = await fetch(`/api/admin/invitations?id=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { type: "ok", text: `Invito a ${inv.email} annullato` } : { type: "error", text: j.error || "Annullamento non riuscito" });
    setBusy(null);
    load();
  };

  const rows = (roles?.rows || []).filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (r.name || "").toLowerCase().includes(f) || (r.email || "").toLowerCase().includes(f);
  });
  const allRoleIds = [...(roles?.predefined || []), ...(roles?.custom || []).map((c) => c.id)];
  const pending = invites?.pending || [];

  return (
    <div style={{ background: CP.bg, minHeight: "100vh", color: CP.textPrimary, padding: "32px 28px 64px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Membri</span>
          </div>
        }
        section="People · Accessi"
        title="Membri"
        subtitle="Chi può entrare in HOC Pro e cosa può fare. L'app è solo su invito: per dare accesso a una persona usa Aggiungi membro."
        toolbar={canInvite ? <button style={btn(true)} onClick={() => { setMsg(null); setShowAdd(true); }}>Aggiungi membro</button> : null}
      />

      {msg && (
        <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, fontSize: 13, color: msg.type === "error" ? CP.accentRed : CP.accentGreen }}>
          {msg.text}
        </div>
      )}

      {loading && <p style={{ color: CP.textMuted }}>Caricamento…</p>}

      {!loading && !canManage && !canInvite && (
        <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textSecondary, fontSize: 14 }}>
          Non hai i permessi per gestire i membri. Se ti serve, chiedi a un admin.
        </div>
      )}

      {!loading && canManage && <AdminSecurityCard />}

      {/* Inviti in attesa */}
      {!loading && canInvite && pending.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, color: CP.textSecondary, margin: "0 0 10px" }}>Inviti in attesa · {pending.length}</h2>
          <div style={{ border: `1px solid ${CP.border}`, borderRadius: 12, background: CP.surface }}>
            {pending.map((inv, i) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.email}</div>
                  <div style={{ fontSize: 12, color: CP.textMuted }}>
                    Invitato il {fmtDate(inv.created_at)}{inv.invited_by ? ` da ${inv.invited_by}` : ""} · non ha ancora accettato
                  </div>
                </div>
                <RoleChips ids={inv.roles} label={roleLabel} />
                <button style={btn(false)} disabled={busy === inv.id} onClick={() => revoke(inv)}>Annulla invito</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Membri */}
      {!loading && canManage && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 10px", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, color: CP.textSecondary, margin: 0 }}>Membri · {roles.rows?.length || 0}</h2>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Cerca per nome o email"
              style={{ marginLeft: "auto", padding: "7px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, width: 260, maxWidth: "100%" }}
            />
          </div>
          <div style={{ border: `1px solid ${CP.border}`, borderRadius: 12, background: CP.surface }}>
            {rows.length === 0 && <div style={{ padding: 16, color: CP.textMuted, fontSize: 13 }}>Nessun membro trovato.</div>}
            {rows.map((r, i) => (
              <div key={r.userId} style={{ padding: "12px 16px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.email || "—"} · {r.last_sign_in_at ? `ultimo accesso ${fmtDate(r.last_sign_in_at)}` : "mai entrato"}
                    </div>
                  </div>
                  <RoleChips ids={r.roles} label={roleLabel} />
                  <button style={btn(false)} onClick={() => setEditing(editing === r.userId ? null : r.userId)}>
                    {editing === r.userId ? "Chiudi" : "Modifica ruoli"}
                  </button>
                </div>
                {editing === r.userId && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {allRoleIds.map((rid) => {
                      const on = (r.roles || []).includes(rid);
                      return (
                        <button
                          key={rid}
                          disabled={busy === r.userId}
                          onClick={() => toggleRole(r.userId, r.roles, rid)}
                          style={{
                            padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: busy === r.userId ? "wait" : "pointer",
                            border: `1px solid ${on ? CP.accent : CP.border}`,
                            background: on ? CP.accentSoft : "transparent",
                            color: on ? CP.accentSoftText : CP.textMuted,
                          }}
                        >
                          {on ? "✓ " : "+ "}{roleLabel(rid)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
            Un membro può avere più ruoli: i permessi si sommano. I ruoli personalizzati si creano in <Link href="/admin/ruoli-custom" style={{ color: CP.accentSoftText }}>Ruoli custom</Link>.
          </p>
        </section>
      )}

      {showAdd && (
        <AddMemberModal
          assignable={invites?.assignable || []}
          onClose={() => setShowAdd(false)}
          onDone={(text) => { setShowAdd(false); setMsg({ type: "ok", text }); load(); }}
        />
      )}
    </div>
  );
}

function RoleChips({ ids, label }) {
  if (!ids?.length) return <span style={{ fontSize: 12, color: CP.textMuted }}>nessun ruolo</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {ids.map((rid) => (
        <span key={rid} style={{ padding: "3px 9px", borderRadius: 999, background: CP.accentSoft, color: CP.accentSoftText, fontSize: 12 }}>{label(rid)}</span>
      ))}
    </div>
  );
}

function AddMemberModal({ assignable, onClose, onDone }) {
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState(assignable.some((r) => r.id === "operator") ? ["operator"] : []);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const send = async (e) => {
    e.preventDefault();
    setSending(true); setErr(null);
    const r = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, roles: picked }),
    });
    const j = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) return setErr(j.error || "Invito non riuscito");
    onDone(`Invito mandato a ${j.invitation?.email || email}. Riceverà un'email con il link per entrare.`);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={send} role="dialog" aria-modal="true" aria-label="Aggiungi membro"
        style={{ width: "100%", maxWidth: 460, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 22 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 500 }}>Aggiungi membro</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: CP.textMuted }}>
          La persona riceve un'email da HOC Pro con il link per registrarsi. Entra già con i ruoli che scegli qui.
        </p>

        <label style={{ display: "block", fontSize: 12, color: CP.textSecondary, marginBottom: 6 }}>Email</label>
        <input
          type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@houseofcreators.com"
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, marginBottom: 16 }}
        />

        <label style={{ display: "block", fontSize: 12, color: CP.textSecondary, marginBottom: 6 }}>Ruolo</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {assignable.map((r) => {
            const on = picked.includes(r.id);
            return (
              <button type="button" key={r.id} onClick={() => toggle(r.id)} style={{
                padding: "6px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                border: `1px solid ${on ? CP.accent : CP.border}`,
                background: on ? CP.accentSoft : "transparent",
                color: on ? CP.accentSoftText : CP.textMuted,
              }}>{on ? "✓ " : ""}{r.label}</button>
            );
          })}
        </div>

        {err && <div style={{ fontSize: 13, color: CP.accentRed, marginBottom: 14 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={btn(false)} onClick={onClose}>Annulla</button>
          <button type="submit" style={{ ...btn(true), opacity: sending || !picked.length ? 0.6 : 1 }} disabled={sending || !picked.length}>
            {sending ? "Invio…" : "Manda invito"}
          </button>
        </div>
      </form>
    </div>
  );
}


// Verifica in due passaggi per gli admin: chi l'ha attivata + interruttore.
function AdminSecurityCard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => fetch("/api/admin/security").then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const without = d.admins.filter((a) => !a.mfa);
  const toggle = async () => {
    setErr(null);
    const r = await fetch("/api/admin/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ required: !d.required }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Errore");
    load();
  };
  return (
    <section style={{ marginBottom: 28, border: `1px solid ${CP.border}`, borderRadius: 12, background: CP.surface, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Verifica in due passaggi per gli admin {d.required ? "· obbligatoria" : "· facoltativa"}</div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>
            {d.admins.length - without.length} admin su {d.admins.length} l'hanno attivata.
            {without.length ? ` Mancano: ${without.map((a) => a.name).join(", ")}.` : ""}
            {d.required ? " Chi non l'ha attivata non ha i poteri da admin finché non lo fa." : " Quando è obbligatoria, un admin senza verifica perde i poteri da admin finché non la attiva."}
          </div>
        </div>
        <button onClick={toggle} disabled={!d.required && !d.me_mfa} title={!d.required && !d.me_mfa ? "Prima attivala sul tuo account (in basso a sinistra: Account → Sicurezza)" : undefined}
          style={{ ...btn(!d.required), opacity: !d.required && !d.me_mfa ? 0.5 : 1 }}>
          {d.required ? "Rendi facoltativa" : "Rendi obbligatoria"}
        </button>
      </div>
      {!d.required && !d.me_mfa && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Per renderla obbligatoria devi prima attivarla sul tuo account, così non ti chiudi fuori.</div>}
      {err && <div style={{ fontSize: 12, color: CP.accentRed, marginTop: 8 }}>{err}</div>}
    </section>
  );
}
