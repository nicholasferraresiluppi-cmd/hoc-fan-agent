"use client";

// Admin — chi ha i poteri da amministratore e da dove li prende.
// Ridisegno 26/09/2026 (design system): tabella con email (due persone con lo
// stesso nome ora si distinguono), "perché è admin" a parole invece di
// Env/Clerk metadata, e il motivo per cui "Rimuovi" a volte è spento o non
// basta. API, conferme e regole (non ci si toglie da soli, env non rimovibile
// da qui) invariate.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, UserPlus } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, DataTable, Disclosure, card } from "@/components/ds";

const SOURCE_LABEL = {
  env: { label: "Configurazione del server", desc: "Scritto nelle impostazioni Vercel (HOC_ADMIN_USER_IDS). Si toglie solo da lì, con un nuovo deploy." },
  kv: { label: "Aggiunto da questa pagina", desc: "Si toglie qui con Rimuovi." },
  clerk_metadata: { label: "Ruolo admin nel profilo account", desc: "role=admin nei dati del profilo (Clerk). Rimuovi qui non basta: va tolto anche lì." },
};

const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" });
const smallBtn = { ...btn(false), padding: "5px 10px", fontSize: 12, fontWeight: 400 };

export default function AccessPage() {
  const [me, setMe] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = async () => {
    try {
      const [w, a] = await Promise.all([
        fetch("/api/whoami").then((r) => r.json()),
        fetch("/api/admin/access").then((r) => r.json()),
      ]);
      setMe(w);
      setAdmins(a.admins || []);
      if (a.error) setMsg({ type: "error", text: a.error });
    } catch (e) { setMsg({ type: "error", text: e.message }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!input.trim()) return;
    setMsg(null);
    const isEmail = input.includes("@");
    const body = isEmail ? { action: "add", email: input.trim() } : { action: "add", userId: input.trim() };
    const res = await fetch("/api/admin/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) setMsg({ type: "error", text: data.error });
    else { setMsg({ type: "success", text: `Admin aggiunto: ${data.userId}` }); setInput(""); load(); }
  };

  const remove = async (userId) => {
    if (!confirm(`Rimuovere ${userId} dagli admin?`)) return;
    setMsg(null);
    const res = await fetch("/api/admin/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", userId }) });
    const data = await res.json();
    if (data.error) setMsg({ type: "error", text: data.error });
    else { setMsg({ type: data.warning ? "warning" : "success", text: data.warning || `Rimosso: ${userId}` }); load(); }
  };

  const copy = (s) => navigator.clipboard.writeText(s).then(() => setMsg({ type: "success", text: "Copiato" }));

  const envOnly = (a) => a.sources?.includes("env") && a.sources.length === 1;
  const isMe = (a) => me?.userId && a.userId === me.userId;

  const columns = [
    {
      key: "name", label: "Admin", sort: (a) => (a.name || a.email || a.userId || "").toLowerCase(),
      render: (a) => (
        <div>
          <div style={{ color: CP.textPrimary }}>{a.name || a.email || a.userId}{isMe(a) && <span style={{ color: CP.textMuted, fontSize: 12 }}> · tu</span>}</div>
          {a.email && a.email !== a.name && <div style={{ fontSize: 12, color: CP.textMuted }}>{a.email}</div>}
        </div>
      ),
    },
    {
      key: "sources", label: "Perché è admin", sort: (a) => (a.sources || []).join(","),
      render: (a) => (
        <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
          {(a.sources || []).map((s) => {
            const cfg = SOURCE_LABEL[s] || { label: s };
            return <div key={s} title={cfg.desc}>{cfg.label}</div>;
          })}
        </div>
      ),
    },
    {
      key: "actions", label: "", sortable: false, align: "right",
      render: (a) => (
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <button
            onClick={() => remove(a.userId)}
            disabled={envOnly(a)}
            title={envOnly(a) ? SOURCE_LABEL.env.desc : undefined}
            style={{ ...smallBtn, color: envOnly(a) ? CP.textMuted : CP.accentRed, cursor: envOnly(a) ? "not-allowed" : "pointer", opacity: envOnly(a) ? 0.6 : 1 }}
          >
            Rimuovi
          </button>
          {envOnly(a) && <span style={{ fontSize: 11, color: CP.textMuted }}>si toglie da Vercel</span>}
          {!envOnly(a) && a.sources?.includes("clerk_metadata") && <span style={{ fontSize: 11, color: CP.textMuted }}>va tolto anche dal profilo</span>}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Accessi" }]}
        title="Accessi admin"
        subtitle="Chi ha i poteri da amministratore (vede i dati di tutti e cambia le impostazioni). Per invitare persone o dare gli altri ruoli usa Membri."
        actions={<Link href="/admin/ruoli" style={{ ...btn(false), textDecoration: "none" }}>Vai a Membri</Link>}
      />

      {msg && <Notice danger={msg.type === "error" || msg.type === "warning"}>{msg.text}</Notice>}

      {/* Il tuo account */}
      {me && (
        <div style={{ ...card, padding: "12px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{ color: CP.textMuted }}>Il tuo account</span>
          <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{me.name || me.email || "—"}</span>
          <span style={{ padding: "2px 9px", borderRadius: 999, background: me.admin ? CP.accentSoft : CP.surfaceAlt, color: me.admin ? CP.accentSoftText : CP.textSecondary, fontSize: 12 }}>{me.admin ? "admin" : "non admin"}</span>
          {me.userId && <span style={{ color: CP.textMuted, fontSize: 12, wordBreak: "break-all" }}>ID {me.userId}</span>}
          {me.userId && <button onClick={() => copy(me.userId)} style={smallBtn}><Copy size={12} /> Copia ID</button>}
        </div>
      )}

      {loading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!loading && !me?.admin && (
        <Notice>
          Non sei admin. Per diventarlo la prima volta, il tuo ID <code>{me?.userId}</code> va aggiunto nelle impostazioni Vercel (Settings → Environment Variables → HOC_ADMIN_USER_IDS) con un nuovo deploy. Dopo, gli admin si gestiscono da qui.
        </Notice>
      )}

      {/* Aggiungi */}
      {me?.admin && (
        <section style={{ ...card, padding: "14px 16px", marginBottom: 20 }}>
          <SectionTitle aside="deve avere già un account in HOC Pro">Aggiungi un admin</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="email@houseofcreators.com oppure ID utente (user_…)"
              aria-label="Email o ID utente"
              style={{ flex: "1 1 280px", minWidth: 0, padding: "8px 12px", background: CP.bg, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 14, fontFamily: FONTS.body }}
            />
            <button onClick={add} disabled={!input.trim()} style={{ ...btn(true), opacity: input.trim() ? 1 : 0.6 }}><UserPlus size={14} /> Aggiungi</button>
          </div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Con l&apos;email cerchiamo l&apos;account da soli. Effetto immediato, senza deploy.</div>
        </section>
      )}

      {!loading && me?.admin && (
        <section style={{ marginBottom: 20 }}>
          <SectionTitle aside="passa sopra la voce per il dettaglio">Admin attivi · {admins.length}</SectionTitle>
          <DataTable columns={columns} rows={admins.map((a) => ({ ...a, id: a.userId }))} defaultSort={{ key: "name", dir: 1 }} minWidth={620} maxHeight={560} empty="Nessun admin trovato." />
        </section>
      )}

      <Disclosure open={helpOpen} onToggle={() => setHelpOpen((v) => !v)} title="Come si diventa admin" summary="tre strade, valgono tutte">
        <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
          Una persona è admin se vale almeno una di queste:
          <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
            <li><b style={{ fontWeight: 500 }}>Aggiunta da questa pagina</b> (elenco <code>admins:set</code>): la via normale, senza deploy.</li>
            <li><b style={{ fontWeight: 500 }}>Ruolo admin nel profilo account</b> (<code>publicMetadata.role = &quot;admin&quot;</code> su Clerk).</li>
            <li><b style={{ fontWeight: 500 }}>Configurazione del server</b> (<code>HOC_ADMIN_USER_IDS</code> su Vercel): serve solo per il primo admin.</li>
          </ul>
          Per togliere del tutto i poteri a qualcuno, vanno tolte tutte le strade che ha.
        </div>
      </Disclosure>
    </div>
  );
}
