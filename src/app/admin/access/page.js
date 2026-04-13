"use client";

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  green: "#10B981",
  red: "#EF4444",
  yellow: "#F59E0B",
  white: "#F9FAFB",
  gray: "#9CA3AF",
};

const SOURCE_LABEL = {
  env: { label: "Env (Vercel)", color: C.gray, desc: "Definito in HOC_ADMIN_USER_IDS. Modificabile solo da Vercel." },
  kv: { label: "In-app", color: C.green, desc: "Aggiunto da questa UI. Rimuovibile qui." },
  clerk_metadata: { label: "Clerk metadata", color: C.purple, desc: "role=admin nei metadata Clerk. Modificabile da Clerk dashboard." },
};

export default function AccessPage() {
  const [me, setMe] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState(null);

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

  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
          <h1 style={{ margin: 0 }}>🔐 Gestione Accessi Admin</h1>
          <a href="/admin" style={{ color: C.orange, textDecoration: "none" }}>← Hub Admin</a>
        </div>

        <AdminNav />

        {/* Whoami card */}
        {me && (
          <div style={{ background: `${C.purple}15`, border: `1px solid ${C.purple}40`, borderRadius: "0.75rem", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ color: C.purple, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.35rem" }}>
              Il tuo account
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ fontWeight: 700 }}>{me.name || me.email || "—"}</div>
              {me.admin ? (
                <span style={{ padding: "0.2rem 0.5rem", background: `${C.green}25`, color: C.green, border: `1px solid ${C.green}`, borderRadius: "0.3rem", fontSize: "0.75rem", fontWeight: 700 }}>ADMIN</span>
              ) : (
                <span style={{ padding: "0.2rem 0.5rem", background: `${C.gray}25`, color: C.gray, border: `1px solid ${C.gray}`, borderRadius: "0.3rem", fontSize: "0.75rem", fontWeight: 700 }}>operatore</span>
              )}
              <code style={{ color: C.gray, fontSize: "0.8rem" }}>{me.userId}</code>
              {me.userId && (
                <button onClick={() => copy(me.userId)} style={{ padding: "0.2rem 0.5rem", background: "transparent", color: C.orange, border: `1px solid ${C.orange}60`, borderRadius: "0.3rem", fontSize: "0.7rem", cursor: "pointer" }}>Copia</button>
              )}
            </div>
          </div>
        )}

        {/* Add */}
        {me?.admin && (
          <div style={{ background: `${C.white}05`, border: `1px solid ${C.purple}30`, borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>➕ Aggiungi admin</div>
            <div style={{ color: C.gray, fontSize: "0.8rem", marginBottom: "0.75rem" }}>Incolla una email (si auto-risolve via Clerk) oppure direttamente uno user_id.</div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="email@houseofcreators.com  oppure  user_xxx"
                style={{ flex: 1, padding: "0.6rem 0.75rem", background: `${C.bgDark}`, color: C.white, border: `1px solid ${C.purple}40`, borderRadius: "0.5rem", fontSize: "0.9rem" }}
              />
              <button onClick={add} style={{ padding: "0.6rem 1.25rem", background: C.green, color: C.white, border: "none", borderRadius: "0.5rem", fontWeight: 700, cursor: "pointer" }}>
                Aggiungi
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div style={{ padding: "0.75rem 1rem", marginBottom: "1rem", background: msg.type === "error" ? `${C.red}15` : msg.type === "warning" ? `${C.yellow}15` : `${C.green}15`, border: `1px solid ${msg.type === "error" ? C.red : msg.type === "warning" ? C.yellow : C.green}`, borderRadius: "0.5rem", color: msg.type === "error" ? C.red : msg.type === "warning" ? C.yellow : C.green, fontSize: "0.9rem" }}>
            {msg.text}
          </div>
        )}

        {loading && <div style={{ color: C.gray }}>Caricamento...</div>}

        {!loading && !me?.admin && (
          <div style={{ padding: "1.5rem", background: `${C.yellow}15`, border: `1px solid ${C.yellow}`, borderRadius: "0.75rem", color: C.yellow }}>
            Non sei admin. Per bootstrapparti la prima volta, aggiungi il tuo userId <code>{me?.userId}</code> in <strong>Vercel → Settings → Env Vars → HOC_ADMIN_USER_IDS</strong> e rifa deploy. Dopo, tutto si gestisce qui.
          </div>
        )}

        {!loading && me?.admin && admins.length > 0 && (
          <div style={{ background: `${C.white}05`, border: `1px solid ${C.purple}30`, borderRadius: "0.75rem", overflow: "hidden" }}>
            <div style={{ padding: "0.85rem 1.25rem", borderBottom: `1px solid ${C.purple}30`, fontWeight: 700, fontSize: "0.9rem", color: C.gray, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Admin attivi ({admins.length})
            </div>
            {admins.map((a) => (
              <div key={a.userId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", padding: "0.85rem 1.25rem", borderTop: `1px solid ${C.purple}20` }}>
                <div style={{ flex: "1 1 220px" }}>
                  <div style={{ fontWeight: 700 }}>{a.name || a.email || a.userId}</div>
                  <code style={{ color: C.gray, fontSize: "0.75rem" }}>{a.userId}</code>
                </div>
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                  {(a.sources || []).map((s) => {
                    const cfg = SOURCE_LABEL[s] || { label: s, color: C.gray };
                    return (
                      <span key={s} title={cfg.desc} style={{ padding: "0.15rem 0.45rem", fontSize: "0.65rem", fontWeight: 700, color: cfg.color, background: `${cfg.color}15`, border: `1px solid ${cfg.color}50`, borderRadius: "0.3rem" }}>
                        {cfg.label}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={() => remove(a.userId)}
                  disabled={a.sources?.includes("env") && a.sources.length === 1}
                  style={{ padding: "0.35rem 0.75rem", background: "transparent", color: C.red, border: `1px solid ${C.red}60`, borderRadius: "0.4rem", fontSize: "0.8rem", cursor: "pointer", opacity: a.sources?.includes("env") && a.sources.length === 1 ? 0.4 : 1 }}
                >
                  Rimuovi
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "2rem", padding: "1rem", background: `${C.white}03`, borderRadius: "0.5rem", color: C.gray, fontSize: "0.8rem", lineHeight: 1.6 }}>
          <strong style={{ color: C.white }}>💡 Come funziona:</strong>
          <br />• Un utente è admin se compare in <code>HOC_ADMIN_USER_IDS</code> (env), nel set <code>admins:set</code> (KV gestito qui), o ha <code>publicMetadata.role = "admin"</code> su Clerk.
          <br />• La via più comoda è aggiungerli qui via email — nessun redeploy necessario.
          <br />• L'env è utile solo per il <strong>primo admin bootstrap</strong>.
        </div>
      </div>
    </div>
  );
}
