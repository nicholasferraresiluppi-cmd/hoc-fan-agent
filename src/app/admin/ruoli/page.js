"use client";

// Membri — chi ha accesso a HOC Pro, con che ruolo, e "Aggiungi membro".
// Dal 25/09/2026 l'app è solo su invito: si entra SOLO da qui (niente dashboard
// Clerk). Due permessi distinti, controllati lato API:
//  - gestire i ruoli dei membri → ACCESS_MGMT (admin)
//  - invitare nuove persone     → USERS_INVITE (admin; assegnabile con un ruolo
//    custom, con i limiti anti-escalation di lib/invitations)
// La pagina mostra solo le parti per cui l'API risponde: chi non ha nessuno dei
// due vede un messaggio, non una tabella vuota.
//
// Ridisegno 26/09/2026 (design system): ordine per frequenza d'uso — invitare
// (singolo in testata, in blocco subito sotto), inviti in attesa, elenco membri
// come tabella ordinabile con il pannello ruoli sotto; in fondo le impostazioni
// che si toccano di rado (attestato di benvenuto, verifica in due passaggi), con
// lo stato visibile anche da chiuse. Funzioni, API e conferme invariate.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, UserPlus } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { CAP_LABELS, SCOPE_LABELS } from "@/lib/capability-labels";
import WelcomeCertificate, { certButton } from "@/components/WelcomeCertificate";
import { WELCOME_FIELDS, composeWelcome, welcomeVars } from "@/lib/welcome-card";
import { PageHead, SectionTitle, Disclosure, Notice, DataTable, card } from "@/components/ds";

const btn = (primary) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${primary ? CP.accent : CP.border}`,
  background: primary ? CP.accent : CP.surface,
  color: primary ? CP.accentInk : CP.textPrimary,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: FONTS.body,
  cursor: "pointer",
});
const smallBtn = { ...btn(false), padding: "5px 10px", fontSize: 12, fontWeight: 400 };
const field = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.bg, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };

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
  const editRef = useRef(null);

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

  // "Vedi come…": anteprima dell'app con i permessi di un membro o di un ruolo (sola lettura)
  const viewAs = async (body) => {
    const r = await fetch("/api/admin/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ type: "error", text: j.error || "Anteprima non disponibile" });
    window.location.href = "/";
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

  const openEditor = (userId) => {
    setEditing(editing === userId ? null : userId);
    if (editing !== userId) setTimeout(() => editRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  const allRows = roles?.rows || [];
  const rows = allRows.filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (r.name || "").toLowerCase().includes(f) || (r.email || "").toLowerCase().includes(f);
  });
  const allRoleIds = [...(roles?.predefined || []), ...(roles?.custom || []).map((c) => c.id)];
  const pending = invites?.pending || [];
  const neverIn = allRows.filter((r) => !r.last_sign_in_at).length;
  const editRow = allRows.find((r) => r.userId === editing) || null;

  const columns = [
    {
      key: "name", label: "Persona", sort: (r) => (r.name || "").toLowerCase(),
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: CP.textPrimary }}>{r.name}</div>
          <div style={{ fontSize: 12, color: CP.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>{r.email || "—"}</div>
        </div>
      ),
    },
    { key: "roles", label: "Ruoli", sort: (r) => (r.roles || []).map(roleLabel).join(", "), render: (r) => <RoleChips ids={r.roles} label={roleLabel} /> },
    {
      key: "last", label: "Ultimo accesso", sort: (r) => r.last_sign_in_at || 0,
      render: (r) => (r.last_sign_in_at ? <span style={{ color: CP.textSecondary }}>{fmtDate(r.last_sign_in_at)}</span> : <span style={{ color: CP.textMuted }}>mai entrato</span>),
    },
    {
      key: "actions", label: "", sortable: false, align: "right",
      render: (r) => (
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "nowrap" }}>
          <button style={smallBtn} onClick={() => viewAs({ userId: r.userId })} title="Guarda l'app con i suoi permessi (sola lettura)"><Eye size={13} /> Vedi come</button>
          <button style={{ ...smallBtn, ...(editing === r.userId ? { borderColor: CP.accent, color: CP.accentSoftText } : {}) }} onClick={() => openEditor(r.userId)}>
            {editing === r.userId ? "Chiudi" : "Ruoli e accessi"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Membri" }]}
        title="Membri"
        subtitle="Chi può entrare in HOC Pro e cosa può fare. L'app è solo su invito: per dare accesso a una persona usa Aggiungi membro, per gli operatori usa l'invito in blocco qui sotto."
        actions={<>
          {canManage && (
            <select defaultValue="" onChange={(e) => e.target.value && viewAs({ roles: [e.target.value] })} style={{ ...btn(false), fontWeight: 400 }} title="Guarda l'app con i permessi di un ruolo (sola lettura)" aria-label="Vedi l'app come un ruolo">
              <option value="" disabled>Vedi come un ruolo…</option>
              {allRoleIds.map((rid) => <option key={rid} value={rid}>{roleLabel(rid)}</option>)}
            </select>
          )}
          {canInvite && <button style={btn(true)} onClick={() => { setMsg(null); setShowAdd(true); }}><UserPlus size={14} /> Aggiungi membro</button>}
        </>}
      />

      {msg && <Notice danger={msg.type === "error"}>{msg.text}</Notice>}

      {loading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!loading && !canManage && !canInvite && (
        <Notice>Non hai i permessi per gestire i membri. Se ti serve, chiedi a un admin.</Notice>
      )}

      {!loading && canManage && (
        <div style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 16px" }}>
          {allRows.length} {allRows.length === 1 ? "membro" : "membri"}
          {canInvite && ` · ${pending.length} ${pending.length === 1 ? "invito in attesa" : "inviti in attesa"}`}
          {` · ${neverIn} ${neverIn === 1 ? "non è mai entrato" : "non sono mai entrati"}`}
        </div>
      )}

      {!loading && canInvite && <OperatorInvites onSent={() => load()} />}

      {/* Inviti in attesa */}
      {!loading && canInvite && pending.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <SectionTitle aside="hanno ricevuto l'email ma non hanno ancora creato l'account">Inviti in attesa · {pending.length}</SectionTitle>
          <div style={card}>
            {pending.map((inv, i) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.email}</div>
                  <div style={{ fontSize: 12, color: CP.textMuted }}>
                    Invitato il {fmtDate(inv.created_at)}{inv.invited_by ? ` da ${inv.invited_by}` : ""}
                  </div>
                </div>
                <RoleChips ids={inv.roles} label={roleLabel} />
                <button style={smallBtn} disabled={busy === inv.id} onClick={() => revoke(inv)}>Annulla invito</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Membri */}
      {!loading && canManage && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <SectionTitle aside="clic sulle intestazioni per ordinare">Membri · {allRows.length}</SectionTitle>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Cerca per nome o email"
              aria-label="Cerca membro"
              style={{ ...field, marginLeft: "auto", fontSize: 13, width: 260, maxWidth: "100%", background: CP.surface }}
            />
          </div>
          <DataTable
            columns={columns}
            rows={rows.map((r) => ({ ...r, id: r.userId }))}
            defaultSort={{ key: "name", dir: 1 }}
            selected={(r) => r.userId === editing}
            minWidth={720}
            maxHeight={560}
            empty="Nessun membro trovato."
          />

          {editRow && (
            <div ref={editRef} style={{ ...card, padding: "14px 16px", marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Ruoli e accessi di {editRow.name}</div>
                <div style={{ fontSize: 12, color: CP.textMuted }}>{editRow.email}</div>
                <button style={{ ...smallBtn, marginLeft: "auto" }} onClick={() => setEditing(null)}>Chiudi</button>
              </div>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Ruoli: clic per aggiungere o togliere (si salva subito)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {allRoleIds.map((rid) => {
                  const on = (editRow.roles || []).includes(rid);
                  return (
                    <button
                      key={rid}
                      disabled={busy === editRow.userId}
                      onClick={() => toggleRole(editRow.userId, editRow.roles, rid)}
                      aria-pressed={on}
                      style={{
                        padding: "5px 11px", borderRadius: 999, fontSize: 13, fontFamily: FONTS.body, cursor: busy === editRow.userId ? "wait" : "pointer",
                        border: `1px solid ${on ? CP.accent : CP.border}`,
                        background: on ? CP.accentSoft : CP.surface,
                        color: on ? CP.accentSoftText : CP.textSecondary,
                      }}
                    >
                      {on ? "✓ " : "+ "}{roleLabel(rid)}
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 8, background: CP.bg, border: `1px solid ${CP.borderSoft}` }}>
                <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Cosa può fare oggi (somma dei suoi ruoli)</div>
                {Object.keys(editRow.caps || {}).length === 0 ? <div style={{ fontSize: 13, color: CP.textSecondary }}>Nessun permesso oltre all&apos;accesso di base.</div> : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "4px 16px" }}>
                    {Object.entries(editRow.caps).sort().map(([cap, scope]) => (
                      <div key={cap} style={{ fontSize: 13, color: CP.textSecondary }}>
                        {CAP_LABELS[cap] || cap} <span style={{ color: CP.textMuted }}>· {SCOPE_LABELS[scope] || scope}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
            Un membro può avere più ruoli: i permessi si sommano. «Vedi come» apre l&apos;app con i suoi permessi, in sola lettura. I ruoli personalizzati si creano in <Link href="/admin/ruoli-custom" style={{ color: CP.accentSoftText }}>Ruoli custom</Link>.
          </p>
        </section>
      )}

      {/* Impostazioni: si toccano di rado */}
      {!loading && (canInvite || canManage) && <SectionTitle>Impostazioni</SectionTitle>}
      {!loading && canInvite && <WelcomeEditor />}
      {!loading && canManage && <AdminSecurityCard />}

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
        <span key={rid} style={{ padding: "3px 9px", borderRadius: 999, background: CP.surfaceAlt, color: CP.textSecondary, fontSize: 12, whiteSpace: "nowrap" }}>{label(rid)}</span>
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: alpha(CP.bgSunken, "BF"), display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={send} role="dialog" aria-modal="true" aria-label="Aggiungi membro"
        style={{ width: "100%", maxWidth: 460, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 22, fontFamily: FONTS.body }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>Aggiungi membro</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>
          La persona riceve un&apos;email da HOC Pro con il link per registrarsi. Entra già con i ruoli che scegli qui.
        </p>

        <label style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Email</label>
        <input
          type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@houseofcreators.com"
          style={{ ...field, width: "100%", marginBottom: 16 }}
        />

        <label style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Ruolo</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {assignable.map((r) => {
            const on = picked.includes(r.id);
            return (
              <button type="button" key={r.id} onClick={() => toggle(r.id)} aria-pressed={on} style={{
                padding: "6px 11px", borderRadius: 999, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body,
                border: `1px solid ${on ? CP.accent : CP.border}`,
                background: on ? CP.accentSoft : CP.surface,
                color: on ? CP.accentSoftText : CP.textSecondary,
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
// Chiusa di default, ma lo stato (obbligatoria/facoltativa, quanti l'hanno) si
// legge nel riepilogo senza aprirla.
function AdminSecurityCard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => fetch("/api/admin/security").then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const exempt = d.admins.filter((a) => a.exempt);
  const without = d.admins.filter((a) => !a.mfa && !a.exempt);
  const withMfa = d.admins.length - without.length;
  const toggle = async () => {
    setErr(null);
    const r = await fetch("/api/admin/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ required: !d.required }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Errore");
    load();
  };
  const summary = `${d.required ? "obbligatoria" : "facoltativa"} · ${withMfa} admin su ${d.admins.length} l'hanno attivata`;
  return (
    <Disclosure open={open} onToggle={() => setOpen((v) => !v)} title="Verifica in due passaggi per gli admin" summary={summary}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px", fontSize: 13, color: CP.textSecondary, lineHeight: 1.55 }}>
          <div style={{ marginBottom: 6 }}>
            Oggi è <b style={{ fontWeight: 500, color: CP.textPrimary }}>{d.required ? "obbligatoria" : "facoltativa"}</b>. {withMfa} admin su {d.admins.length} l&apos;hanno attivata.
          </div>
          {without.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ color: CP.textMuted }}>Senza verifica:</span> {without.map((a) => a.name).join(", ")}.</div>}
          {exempt.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ color: CP.textMuted }}>Esenti:</span> {exempt.map((a) => `${a.name} (${a.exempt})`).join("; ")}.</div>}
          <div style={{ color: CP.textMuted }}>
            {d.required ? "Chi non l'ha attivata non ha i poteri da admin finché non lo fa." : "Quando è obbligatoria, un admin senza verifica perde i poteri da admin finché non la attiva."}
          </div>
        </div>
        <button onClick={toggle} disabled={!d.required && !d.me_mfa} title={!d.required && !d.me_mfa ? "Prima attivala sul tuo account (in basso a sinistra: Account → Sicurezza)" : undefined}
          style={{ ...btn(!d.required), opacity: !d.required && !d.me_mfa ? 0.5 : 1, cursor: !d.required && !d.me_mfa ? "not-allowed" : "pointer" }}>
          {d.required ? "Rendi facoltativa" : "Rendi obbligatoria"}
        </button>
      </div>
      {!d.required && !d.me_mfa && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>Per renderla obbligatoria devi prima attivarla sul tuo account (in basso a sinistra: Account → Sicurezza), così non ti chiudi fuori.</div>}
      {err && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 8 }}>{err}</div>}
    </Disclosure>
  );
}


// "Porta gli operatori nell'app" (25/09/2026): gli operatori attivi dell'ultimo
// mese Infloww con la loro email; si scelgono e si invitano come "operatore".
// Al primo accesso l'account si collega da solo al nome operatore (lib/me).
function OperatorInvites({ onSent }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState("");
  const loadList = async () => {
    setErr(null);
    const r = await fetch("/api/admin/operator-invites");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Elenco non disponibile");
    setData(j);
    setSel(new Set(j.operators.filter((o) => o.status === "ready").map((o) => o.email)));
  };
  useEffect(() => { if (open && !data) loadList(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = (data?.operators || []).filter((o) => o.status === "ready");
  const needle = q.trim().toLowerCase();
  const shown = (data?.operators || []).filter((o) => !needle || `${o.employee} ${o.email || ""}`.toLowerCase().includes(needle));
  const toggle = (e) => setSel((s) => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n; });
  const chosen = [...sel];
  const send = async () => {
    if (!chosen.length) return;
    if (!window.confirm(`Mandare l'invito a ${chosen.length} operatori?\n\nRiceveranno un'email da HOC Pro per creare l'account. Al primo accesso vedranno solo le loro pagine personali (score, compenso, percorso).`)) return;
    setBusy(true); setResult(null);
    const all = [];
    for (let i = 0; i < chosen.length; i += 50) {
      const r = await fetch("/api/admin/operator-invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails: chosen.slice(i, i + 50) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { all.push({ ok: false, error: j.error || "errore" }); break; }
      all.push(...j.results);
    }
    setBusy(false);
    setResult({ ok: all.filter((x) => x.ok).length, ko: all.filter((x) => !x.ok) });
    await loadList(); onSent?.();
  };
  const label = { ready: "da invitare", invited: "invitato, in attesa", has_account: "ha già l'account", no_email: "senza email" };
  const summary = data
    ? `${data.counts.ready} da invitare · ${data.counts.invited} in attesa · ${data.counts.has_account} con account`
    : "inviti in blocco agli operatori attivi: l'account si collega da solo al loro nome";
  return (
    <Disclosure open={open} onToggle={() => setOpen((v) => !v)} title="Porta gli operatori nell'app" summary={summary}>
      {err && <Notice danger>{err}</Notice>}
      {!data && !err && <div style={{ color: CP.textMuted, fontSize: 13 }}>Caricamento…</div>}
      {data && (<>
        <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.55, margin: "0 0 12px" }}>
          Operatori dell&apos;ultimo mese Infloww ({data.period_id}), con l&apos;email dell&apos;export. Ognuno riceve un invito come <b style={{ fontWeight: 500 }}>operatore</b>: vede solo le sue pagine personali. Al primo accesso l&apos;account si collega da solo al suo nome, senza passare da un admin. Prima dell&apos;invio ti chiediamo conferma.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <button style={{ ...btn(true), opacity: busy || !chosen.length ? 0.6 : 1 }} disabled={busy || !chosen.length} onClick={send}>{busy ? "Invio in corso…" : `Invita ${chosen.length} operatori`}</button>
          <button style={btn(false)} onClick={() => setSel(new Set(ready.map((o) => o.email)))}>Seleziona tutti da invitare ({ready.length})</button>
          <button style={btn(false)} onClick={() => setSel(new Set())}>Nessuno</button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome o email" aria-label="Cerca operatore"
            style={{ ...field, fontSize: 13, width: 220, maxWidth: "100%" }} />
        </div>
        {result && (
          <Notice danger={result.ko.length > 0}>
            Inviti mandati: {result.ok}.{result.ko.length ? ` Non riusciti: ${result.ko.length} (${result.ko.slice(0, 3).map((x) => `${x.email || ""} ${x.error}`).join("; ")}).` : ""}
          </Notice>
        )}
        <div style={{ maxHeight: 420, overflow: "auto", border: `1px solid ${CP.borderSoft}`, borderRadius: 8 }}>
          {shown.length === 0 && <div style={{ padding: 12, fontSize: 13, color: CP.textMuted }}>Nessun operatore trovato.</div>}
          {shown.map((o, i) => (
            <label key={o.employee} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", fontSize: 14, cursor: o.status === "ready" ? "pointer" : "default", flexWrap: "wrap" }}>
              <input type="checkbox" disabled={o.status !== "ready"} checked={sel.has(o.email)} onChange={() => toggle(o.email)} />
              <span style={{ flex: "1 1 180px", color: o.status === "ready" ? CP.textPrimary : CP.textMuted }}>{o.employee}</span>
              <span style={{ flex: "1 1 220px", color: CP.textMuted, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{o.email || "—"}</span>
              <span style={{ fontSize: 12, color: o.status === "no_email" ? CP.accentRed : CP.textMuted, minWidth: 130, textAlign: "right" }}>{label[o.status]}</span>
            </label>
          ))}
        </div>
      </>)}
    </Disclosure>
  );
}


// Attestato di benvenuto (26/09/2026): il messaggio che accoglie gli operatori
// invitati, scritto qui. Anteprima dal vivo = esattamente ciò che arriva (email
// quando il dominio è verificato, schermata al primo accesso sempre).
// L'attestato (WelcomeCertificate) resta a colori FISSI by design: non si tocca.
function WelcomeEditor() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [sample, setSample] = useState("Mario Rossi");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await fetch("/api/admin/welcome");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ bad: true, text: j.error || "Non disponibile" });
    setData(j); setDraft(j.template);
  };
  useEffect(() => { if (open && !data) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (draft ? composeWelcome(draft, welcomeVars({ employee: sample, creator: "Gaja ITA", number: 7 })) : null), [draft, sample]);
  const dirty = data && draft && JSON.stringify(draft) !== JSON.stringify(data.template);
  const call = async (method, body, okText) => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/welcome", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ bad: true, text: j.error || "Errore" });
    if (j.template) { setData((d) => ({ ...d, template: j.template })); setDraft(j.template); }
    setMsg({ bad: false, text: okText(j) });
  };
  const summary = data?.updated_at
    ? `ultima modifica ${new Date(data.updated_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}${data.updated_by ? ` · ${data.updated_by}` : ""}`
    : "l'attestato che accoglie chi inviti: lo scrivi qui";
  return (
    <Disclosure open={open} onToggle={() => setOpen((v) => !v)} title="Messaggio di benvenuto" summary={summary}>
      {!draft && !msg && <div style={{ color: CP.textMuted, fontSize: 13 }}>Caricamento…</div>}
      {!draft && msg && <Notice danger={msg.bad}>{msg.text}</Notice>}
      {data && (
        <div style={{ fontSize: 13, lineHeight: 1.55, color: CP.textSecondary, padding: "10px 12px", borderRadius: 8, background: CP.bg, border: `1px solid ${CP.borderSoft}`, marginBottom: 14 }}>
          {data.mail.ready
            ? <>L&apos;attestato parte <b style={{ fontWeight: 500 }}>per email</b> con l&apos;invito (il link per entrare è dentro) e ricompare al primo accesso.</>
            : <>Per ora l&apos;email d&apos;invito resta quella standard: {String(data.mail.reason || "").toLowerCase()}. L&apos;attestato compare comunque <b style={{ fontWeight: 500 }}>al primo accesso</b> nell&apos;app. Appena il dominio è verificato, parte anche per email senza cambiare nulla qui.</>}
          {" "}Puoi usare <code>{"{nome}"}</code>, <code>{"{nome_completo}"}</code>, <code>{"{creator}"}</code>, <code>{"{mese}"}</code>.
          {data.updated_at && <> Ultima modifica {new Date(data.updated_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{data.updated_by ? ` · ${data.updated_by}` : ""}.</>}
        </div>
      )}
      {draft && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            {WELCOME_FIELDS.map((f) => (
              <label key={f.key} style={{ fontSize: 13, color: CP.textSecondary, display: "flex", flexDirection: "column", gap: 4 }}>
                {f.label}
                {f.multiline
                  ? <textarea value={draft[f.key]} maxLength={f.max} rows={12} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} style={{ ...field, width: "100%", resize: "vertical", lineHeight: 1.5 }} />
                  : <input value={draft[f.key]} maxLength={f.max} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} style={{ ...field, width: "100%" }} />}
              </label>
            ))}
            <div style={{ fontSize: 12, color: CP.textMuted }}>Nel messaggio, una riga vuota separa i paragrafi.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
              <button style={{ ...btn(true), opacity: busy || !dirty ? 0.6 : 1 }} disabled={busy || !dirty} onClick={() => call("PUT", { template: draft }, () => "Salvato: i prossimi inviti useranno questo testo.")}>Salva</button>
              <button style={btn(false)} disabled={busy || !dirty} onClick={() => setDraft(data.template)}>Annulla modifiche</button>
              <button style={btn(false)} disabled={busy} onClick={() => call("POST", { template: draft, sample }, (j) => `Prova mandata a ${j.to}.`)}>Mandami una prova</button>
              <button style={btn(false)} disabled={busy} onClick={() => window.confirm("Tornare al testo originale?") && call("PUT", { reset: true }, () => "Testo originale ripristinato.")}>Testo originale</button>
              {dirty && <span style={{ fontSize: 12, color: CP.accentSoftText }}>Modifiche non salvate</span>}
            </div>
            {msg && <div style={{ fontSize: 13, color: msg.bad ? CP.accentRed : CP.textSecondary }}>{msg.text}</div>}
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ fontSize: 13, color: CP.textSecondary, display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              Anteprima per
              <input value={sample} onChange={(e) => setSample(e.target.value)} style={{ ...field, width: 200, maxWidth: "100%" }} aria-label="Nome di esempio" />
            </label>
            <WelcomeCertificate card={preview} compact cta={<span style={certButton}>{preview.cta}</span>} />
          </div>
        </div>
      )}
    </Disclosure>
  );
}
