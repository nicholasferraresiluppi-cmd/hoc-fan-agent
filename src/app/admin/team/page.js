"use client";

// Team (redesign DS 26/09/2026). Chi sta in quale team e chi ne è il lead:
// il team lead vede le sessioni di training dei propri operatori.
// Numero principale = persone ancora senza team (è il lavoro da fare qui).
// Nomi uguali su account diversi (es. vecchio e nuovo account dopo la
// migrazione Clerk) ora mostrano un pezzo dell'id per distinguerli.
// API e azioni invariate.
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, card } from "@/components/ds";

const ctl = { padding: "7px 10px", background: CP.surface, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, fontSize: 13, fontFamily: FONTS.body };
const btn = { padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };

export default function TeamsAdminPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newTeamId, setNewTeamId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/teams");
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (action, payload = {}) => {
    setBusy(true);
    try {
      await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const teams = data?.teams || [];
  const unassigned = data?.unassigned || [];
  const allMembers = [
    ...teams.flatMap((t) => t.members || []),
    ...unassigned,
  ];
  // Stesso nome su più account: mostra la coda dell'id per distinguerli.
  const dupNames = useMemo(() => {
    const c = {};
    for (const m of allMembers) c[m.name] = (c[m.name] || 0) + 1;
    return new Set(Object.keys(c).filter((n) => c[n] > 1));
  }, [allMembers]);
  const idTail = (m) => (dupNames.has(m.name) ? ` · id …${String(m.userId).slice(-6)}` : "");
  const assigned = teams.reduce((s, t) => s + (t.members || []).length, 0);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Team" }]}
        title="Team"
        subtitle="Chi sta in quale team e chi lo guida. Ogni persona sta in un solo team; il lead vede le sessioni di training dei suoi operatori."
      />

      {data?.error && <Notice danger>{String(data.error)}</Notice>}
      {loading && !data && <div style={{ color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}

      {data && !data.error && (
        <HeroMetric
          label="Persone senza team"
          value={fmtInt(unassigned.length)}
          compare={unassigned.length ? "Assegnale in fondo alla pagina: finché non hanno un team, nessun lead vede le loro sessioni." : "Tutti hanno un team."}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Team" value={fmtInt(teams.length)} />
            <Metric label="Persone in un team" value={fmtInt(assigned)} />
          </div>
        </HeroMetric>
      )}

      {dupNames.size > 0 && (
        <Notice>
          Alcuni nomi compaiono più volte: sono account diversi con lo stesso nome (per esempio un vecchio account e quello nuovo). Accanto al nome vedi la parte finale dell'id per distinguerli.
        </Notice>
      )}

      {/* Nuovo team */}
      <section style={{ ...card, padding: "14px 16px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13, color: CP.textSecondary, flex: "1 1 240px" }}>
          Nuovo team (nome breve, senza spazi)
          <input value={newTeamId} onChange={(e) => setNewTeamId(e.target.value)} placeholder="es. team-alessia" style={{ ...ctl, fontSize: 14, padding: "8px 12px" }} />
        </label>
        <button
          disabled={busy || !newTeamId.trim()}
          onClick={async () => { await act("create_team", { teamId: newTeamId.trim() }); setNewTeamId(""); }}
          style={{ ...btn, padding: "8px 14px", background: CP.accent, border: `1px solid ${CP.accent}`, color: CP.accentInk, fontWeight: 500, opacity: busy || !newTeamId.trim() ? 0.5 : 1, cursor: busy || !newTeamId.trim() ? "default" : "pointer" }}
        >
          Crea team
        </button>
      </section>

      {!loading && teams.length === 0 && data && !data.error && (
        <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary, marginBottom: 20 }}>
          Nessun team ancora. Creane uno qui sopra, poi assegna le persone e scegli il lead.
        </div>
      )}

      {/* Team */}
      {!loading && teams.map((t) => {
        const leadName = t.lead ? (t.members.find((m) => m.userId === t.lead)?.name || t.lead) : null;
        return (
          <section key={t.teamId} style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{t.teamId}</h2>
                <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 2 }}>
                  {t.members.length} {t.members.length === 1 ? "persona" : "persone"} · {leadName ? `lead: ${leadName}` : "nessun lead scelto"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ color: CP.textSecondary, fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}>
                  Lead
                  <select value={t.lead || ""} onChange={(e) => act("set_lead", { teamId: t.teamId, userId: e.target.value || null })} disabled={busy} style={ctl}>
                    <option value="">nessuno</option>
                    {t.members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.name}{idTail(m)}</option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy}
                  onClick={() => { if (confirm(`Eliminare il team "${t.teamId}"? Gli operatori diventano non assegnati.`)) act("delete_team", { teamId: t.teamId }); }}
                  style={{ ...btn, background: "transparent", color: CP.accentRed }}
                >
                  Elimina team
                </button>
              </div>
            </div>

            {t.members.length === 0 ? (
              <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuno in questo team: assegna le persone dall'elenco «Senza team».</div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.members.map((m) => (
                  <div key={m.userId} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "5px 6px 5px 10px", background: CP.bg, borderRadius: 8, border: `1px solid ${CP.border}`, fontSize: 14 }}>
                    <span style={{ color: CP.textPrimary }}>{m.name}</span>
                    {m.userId === t.lead && <span style={{ fontSize: 12, color: CP.accentSoftText, background: CP.accentSoft, padding: "1px 7px", borderRadius: 999 }}>lead</span>}
                    <span style={{ color: CP.textMuted, fontSize: 12 }}>{m.role}{idTail(m)}</span>
                    <button
                      disabled={busy}
                      onClick={() => act("assign_member", { userId: m.userId, teamId: null })}
                      title="Togli dal team" aria-label={`Togli ${m.name} dal team`}
                      style={{ display: "inline-flex", padding: 3, background: "transparent", border: "none", color: CP.textMuted, cursor: "pointer", borderRadius: 4 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Senza team */}
      {!loading && unassigned.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionTitle aside={teams.length ? "Scegli il team dal menu accanto al nome." : "Crea prima un team qui sopra."}>Senza team · {unassigned.length}</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {unassigned.map((m) => (
              <div key={m.userId} style={{ ...card, display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: CP.textPrimary, overflowWrap: "anywhere" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: CP.textMuted, overflowWrap: "anywhere" }}>{m.role}{idTail(m)}</div>
                </div>
                <select
                  onChange={(e) => { if (e.target.value) act("assign_member", { userId: m.userId, teamId: e.target.value }); }}
                  disabled={busy || teams.length === 0}
                  defaultValue=""
                  aria-label={`Assegna ${m.name} a un team`}
                  style={{ ...ctl, fontSize: 12, flexShrink: 0, maxWidth: "100%" }}
                >
                  <option value="">Assegna a…</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>{t.teamId}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
