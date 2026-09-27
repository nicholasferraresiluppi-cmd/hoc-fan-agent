"use client";

/**
 * Anagrafica del team progetto della città (SEED): ruolo, costo, accordo e palazzi di chi
 * lavora ai progetti. Le persone arrivano da ClickUp (assegnatari); qui si completa la scheda.
 */
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, DataTable, FilterChip, Notice } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { fmtInt } from "@/lib/format";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};
const inp = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const lbl = { display: "block", fontSize: 12.5, color: CP.textSecondary, margin: "12px 0 5px" };

function Editor({ person, roles, towers, onClose, onSaved }) {
  const c = person.card || {};
  const cuTowers = Object.keys(person.clickup || {});
  const [f, setF] = useState({
    name: c.name || person.name || "", email: c.email || person.email || "", phone: c.phone || "", role: c.role || "",
    cost: c.cost ?? "", deal: c.deal || "", follow: !Array.isArray(c.projects), projects: c.projects || cuTowers, hidden: Boolean(c.hidden),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (extra = {}) => {
    setBusy(true); setErr(null);
    const body = { person: { key: person.key, cuId: person.cuId, name: f.name, email: f.email, phone: f.phone, role: f.role, cost: f.cost === "" ? null : f.cost, deal: f.deal, projects: f.follow ? null : f.projects, hidden: f.hidden, ...extra } };
    const r = await fetch("/api/admin/citta/persone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error || "Errore");
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={person.name || person.email || "Nuova persona"} maxWidth={560}>
      <label style={lbl}>Nome</label><input style={inp} value={f.name} onChange={set("name")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={lbl}>Email aziendale (serve per la presenza)</label><input style={inp} value={f.email} onChange={set("email")} /></div>
        <div><label style={lbl}>Telefono</label><input style={inp} value={f.phone} onChange={set("phone")} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={lbl}>Ruolo</label>
          <select style={inp} value={f.role} onChange={set("role")}><option value="">—</option>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div><label style={lbl}>Costo totale (€ al mese)</label><input style={inp} inputMode="numeric" value={f.cost} onChange={set("cost")} placeholder="es. 1800" /></div>
      </div>
      <label style={lbl}>Accordo (com'è pagato)</label><input style={inp} value={f.deal} onChange={set("deal")} placeholder="es. fisso 1.500 € + 2% sul venduto delle sue creator" />
      <label style={lbl}>Palazzi su cui lavora</label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, color: CP.textPrimary, marginBottom: 8 }}>
        <input type="checkbox" checked={f.follow} onChange={set("follow")} /> Segui ClickUp {cuTowers.length ? `(oggi: ${cuTowers.join(", ")})` : "(nessuna attività assegnata)"}
      </label>
      {!f.follow && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {towers.map((t) => <FilterChip key={t} label={t} active={f.projects.includes(t)} onClick={() => setF({ ...f, projects: f.projects.includes(t) ? f.projects.filter((x) => x !== t) : [...f.projects, t] })} />)}
        </div>
      )}
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, color: CP.textSecondary, marginTop: 14 }}>
        <input type="checkbox" checked={f.hidden} onChange={set("hidden")} /> Non mostrarla negli uffici (es. non fa parte dei team)
      </label>
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ ...inp, width: "auto", cursor: "pointer" }}>Annulla</button>
        <button disabled={busy} onClick={() => save()} style={{ ...inp, width: "auto", cursor: "pointer", background: CP.textPrimary, color: CP.bg, border: "none" }}>{busy ? "Salvo…" : "Salva"}</button>
      </div>
    </Modal>
  );
}

function People() {
  const sp = useSearchParams();
  const { data, mutate, isLoading } = useSWR("/api/admin/citta/persone", fetcher, { revalidateOnFocus: false });
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  useEffect(() => {
    const k = sp.get("p");
    if (k && data?.people && !edit) { const p = data.people.find((x) => x.key === k); if (p) setEdit(p); }
  }, [sp, data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading && !data) return <PageHead title="Persone dei progetti" subtitle="Carico…" />;
  if (data?.error) return <><PageHead title="Persone dei progetti" /><Notice danger>{data.error}</Notice></>;
  const todo = data.people.filter((p) => !p.card?.role || p.card?.cost == null).length;
  const rows = data.people
    .filter((p) => filter === "all" || (filter === "todo" ? !p.card?.role || p.card?.cost == null : p.projects.includes(filter)))
    .filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase()));
  const cols = [
    { key: "name", label: "Persona", render: (p) => <span>{p.name || p.email}<div style={{ fontSize: 12, color: CP.textMuted }}>{p.email || "email da indicare"}</div></span> },
    { key: "role", label: "Ruolo", sort: (p) => p.card?.role || "", render: (p) => p.card?.role || <span style={{ color: CP.textMuted }}>da indicare</span> },
    { key: "cost", label: "€/mese", align: "right", sort: (p) => p.card?.cost ?? -1, render: (p) => (p.card?.cost != null ? `€${fmtInt(p.card.cost)}` : <span style={{ color: CP.textMuted }}>—</span>) },
    { key: "projects", label: "Palazzi", sortable: false, render: (p) => <span style={{ fontSize: 13, color: CP.textSecondary }}>{p.projects.join(", ") || "—"}{Array.isArray(p.card?.projects) ? "" : p.projects.length ? " · da ClickUp" : ""}</span> },
    { key: "open", label: "Attività aperte", align: "right", sort: (p) => Object.values(p.clickup).reduce((s, x) => s + x.open, 0), render: (p) => fmtInt(Object.values(p.clickup).reduce((s, x) => s + x.open, 0)) },
  ];
  return (
    <>
      <PageHead crumbs={[{ label: "La città", href: "/admin/citta" }, { label: "Persone" }]} title="Persone dei progetti"
        line2={todo ? `${todo} schede da completare` : "Schede complete"}
        subtitle="Chi lavora ai palazzi della città. L'elenco parte da ClickUp (chi ha attività assegnate); qui aggiungi ruolo, costo e accordo. Visibile solo agli admin."
        actions={<button onClick={() => setEdit({ key: null, name: "", email: "", clickup: {}, projects: [] })} style={{ ...inp, width: "auto", cursor: "pointer" }}>Aggiungi persona</button>} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <FilterChip label={`Tutti (${data.people.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip label={`Da completare (${todo})`} attn={todo > 0} active={filter === "todo"} onClick={() => setFilter("todo")} />
        {data.towers.map((t) => <FilterChip key={t} label={t} active={filter === t} onClick={() => setFilter(t)} />)}
        <input style={{ ...inp, width: 220, marginLeft: "auto" }} placeholder="Cerca per nome o email" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <DataTable columns={cols} rows={rows} onRowClick={(p) => setEdit(p)} defaultSort={{ key: "open", dir: -1 }} empty="Nessuna persona." minWidth={720} />
      {data.hidden?.length > 0 && <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 12 }}>Nascoste dagli uffici: {data.hidden.map((h) => h.name || h.email).join(", ")}.</p>}
      {edit && <Editor person={edit} roles={data.roles} towers={data.towers} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); mutate(); }} />}
    </>
  );
}

export default function PersonePage() {
  return (
    <div style={{ padding: "28px 28px 64px", fontFamily: FONTS.body, maxWidth: 1180 }}>
      <Suspense fallback={null}><People /></Suspense>
    </div>
  );
}
