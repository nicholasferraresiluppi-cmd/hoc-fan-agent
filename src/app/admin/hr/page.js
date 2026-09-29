"use client";

/**
 * /admin/hr — Centro HR, fase 1: elenco persone (SEED).
 *
 * HOC Pro è il master; ClickUp (lista HR_CLICKUP_LIST_ID) è lo specchio
 * sincronizzato. Qui: filtri per stato/reparto/creator/tipo rapporto,
 * ricerca, badge "da ripulire" (doppioni probabili e schede spazzatura:
 * segnalati, mai cancellati), link di compilazione da copiare (nessuna email).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Link2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Metric, Notice, DataTable, FilterChip, Disclosure, card } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { COLLAB_STATUSES } from "@/lib/hr-fields";
import { lbl, input, btnPrimary, btnGhost, chip, SYNC_LABEL, fetcher, postJson } from "@/components/hr-ui";
import HrFormLinkModal from "@/components/HrFormLinkModal";

const NONE = "__none__";

function uniq(items, get) {
  const m = new Map();
  for (const it of items) {
    const vals = [].concat(get(it) ?? []).filter(Boolean);
    if (!vals.length) m.set(NONE, (m.get(NONE) || 0) + 1);
    for (const v of vals) m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => (a[0] === NONE ? 1 : b[0] === NONE ? -1 : a[0].localeCompare(b[0], "it")));
}
const has = (vals, want) => (want === NONE ? ![].concat(vals ?? []).filter(Boolean).length : [].concat(vals ?? []).includes(want));

export default function HrPeoplePage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR("/api/admin/hr/people", fetcher, { revalidateOnFocus: false });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dept, setDept] = useState("");
  const [project, setProject] = useState("");
  const [emp, setEmp] = useState("");
  const [onlyCleanup, setOnlyCleanup] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [linkFor, setLinkFor] = useState(null); // { personId|null, name }
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const items = data?.items || [];
  const flags = data?.cleanup?.byId || {};
  const byId = useMemo(() => Object.fromEntries(items.map((p) => [p.id, p])), [items]);

  // conteggi calcolati sull'elenco INTERO (le pill non cambiano coi filtri)
  const statusCounts = useMemo(() => {
    const m = { "": items.length, [NONE]: 0 };
    for (const s of COLLAB_STATUSES) m[s] = 0;
    for (const p of items) {
      const s = p.fields?.collaborationStatus;
      if (s && s in m) m[s] += 1; else if (s) m[s] = (m[s] || 0) + 1; else m[NONE] += 1;
    }
    return m;
  }, [items]);
  const depts = useMemo(() => uniq(items, (p) => p.fields?.department), [items]);
  const projects = useMemo(() => uniq(items, (p) => p.fields?.project), [items]);
  const emps = useMemo(() => uniq(items, (p) => p.fields?.employmentType), [items]);
  const cleanupCount = Object.keys(flags).length;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((p) => {
      const f = p.fields || {};
      if (status && (status === NONE ? f.collaborationStatus : f.collaborationStatus !== status)) return false;
      if (dept && !has(f.department, dept)) return false;
      if (project && !has(f.project, project)) return false;
      if (emp && !has(f.employmentType, emp)) return false;
      if (onlyCleanup && !flags[p.id]) return false;
      if (needle) {
        const hay = [p.name, f.personalEmail, f.companyEmail, f.personalPhone, f.currentJob, ...(f.project || []), ...(f.role || [])].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, status, dept, project, emp, onlyCleanup, flags]);

  const filtered = Boolean(q || status || dept || project || emp || onlyCleanup);
  const reset = () => { setQ(""); setStatus(""); setDept(""); setProject(""); setEmp(""); setOnlyCleanup(false); };

  const active = statusCounts.Active || 0;
  const syncErrors = items.filter((p) => ["error", "partial", "deleted", "missing"].includes(p.sync?.status)).length;

  const columns = [
    {
      key: "name", label: "Persona", sort: (p) => p.name.toLowerCase(),
      render: (p) => (
        <span>
          <Link href={`/admin/hr/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{p.name}</Link>
          {(flags[p.id] || []).map((f) => <span key={f} style={{ ...chip, marginLeft: 6, color: CP.attn }}>{f === "doppione" ? "doppione?" : "da ripulire"}</span>)}
          {p.fields?.currentJob && <div style={{ fontSize: 12, color: CP.textMuted }}>{p.fields.currentJob}</div>}
        </span>
      ),
    },
    { key: "status", label: "Stato", sort: (p) => p.fields?.collaborationStatus || "", render: (p) => p.fields?.collaborationStatus || <span style={{ color: CP.textMuted }}>—</span> },
    { key: "dept", label: "Reparto", sort: (p) => (p.fields?.department || []).join(","), render: (p) => (p.fields?.department || []).join(", ") || <span style={{ color: CP.textMuted }}>—</span>, muted: true },
    { key: "project", label: "Creator / progetto", sortable: false, render: (p) => (p.fields?.project || []).slice(0, 3).map((x) => <span key={x} style={chip}>{x.replace(/^Model - /, "")}</span>).concat((p.fields?.project || []).length > 3 ? [<span key="more" style={{ fontSize: 12, color: CP.textMuted }}>+{p.fields.project.length - 3}</span>] : []) },
    { key: "emp", label: "Rapporto", sort: (p) => p.fields?.employmentType || "", render: (p) => p.fields?.employmentType || <span style={{ color: CP.textMuted }}>—</span>, muted: true },
    { key: "sync", label: "ClickUp", sort: (p) => p.sync?.status || "", render: (p) => <span style={{ fontSize: 13, color: ["error", "deleted", "missing"].includes(p.sync?.status) ? CP.accentRed : CP.textSecondary }}>{SYNC_LABEL[p.sync?.status] || "—"}</span> },
    {
      key: "link", label: "", sortable: false, align: "right",
      render: (p) => <button type="button" onClick={(e) => { e.stopPropagation(); setLinkFor({ personId: p.id, name: p.name }); }} style={{ ...btnGhost, padding: "5px 9px", fontSize: 12 }}><Link2 size={13} /> Link di compilazione</button>,
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1240, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Persone HR" }]}
        title="Persone HR"
        subtitle="L'anagrafica di chi lavora con noi. HOC Pro è la fonte principale: ogni modifica fatta qui arriva su ClickUp, e quelle fatte su ClickUp tornano qui. I dati li può compilare anche la persona, da un link."
        actions={!error && (
          <>
            <button type="button" onClick={() => setLinkFor({ personId: null, name: "" })} style={btnGhost}><Link2 size={14} /> Link per una persona nuova</button>
            <button type="button" onClick={() => setNewOpen(true)} style={btnPrimary}><Plus size={15} /> Nuova persona</button>
          </>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare le persone: ${error.message}`}</Notice>}

      {data && !data.sync?.enabled && (
        <Notice>
          Sincronizzazione con ClickUp <b>spenta</b>: manca la lista (<code>HR_CLICKUP_LIST_ID</code>) o il token. Le schede si salvano comunque in HOC Pro e verranno portate su ClickUp quando la sync si accende. <Link href="/admin/hr/sync" style={{ color: CP.accentSoftText }}>Stato della sincronizzazione →</Link>
        </Notice>
      )}
      {data?.sync?.isRealList && <Notice danger>La lista configurata è quella <b>reale</b> del CRM HR: ogni salvataggio modifica i task veri.</Notice>}
      {data && !data.crypto && <Notice>Chiave di cifratura (<code>HR_ENCRYPTION_KEY</code>) assente: i codici fiscali non si possono salvare né leggere. Il resto funziona.</Notice>}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && items.length === 0 && (
        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Nessuna persona ancora. Per iniziare:</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
            <li>se la lista ClickUp è configurata, <Link href="/admin/hr/sync" style={{ color: CP.accentSoftText }}>importa le persone da ClickUp</Link>;</li>
            <li>oppure crea una scheda con “Nuova persona”;</li>
            <li>oppure manda a qualcuno un “Link per una persona nuova”: compila lui i suoi dati.</li>
          </ol>
        </section>
      )}

      {items.length > 0 && (
        <>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Persone" value={fmtInt(items.length)} />
            <Metric label="Attive" value={fmtInt(active)} note="stato Active" />
            <Metric label="Da ripulire" value={fmtInt(cleanupCount)} attn={cleanupCount > 0} note="doppioni o schede vuote" />
            <Metric label="Problemi con ClickUp" value={fmtInt(syncErrors)} danger={syncErrors > 0} />
          </section>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Tutti · ${statusCounts[""]}`} active={!status} onClick={() => setStatus("")} />
            {COLLAB_STATUSES.map((s) => <FilterChip key={s} label={`${s} · ${statusCounts[s] || 0}`} active={status === s} onClick={() => setStatus(status === s ? "" : s)} />)}
            {Object.keys(statusCounts).filter((s) => s && s !== NONE && !COLLAB_STATUSES.includes(s)).map((s) => <FilterChip key={s} label={`${s} · ${statusCounts[s]}`} active={status === s} onClick={() => setStatus(status === s ? "" : s)} />)}
            <FilterChip label={`Senza stato · ${statusCounts[NONE]}`} active={status === NONE} onClick={() => setStatus(status === NONE ? "" : NONE)} />
            <FilterChip label={`Da ripulire · ${cleanupCount}`} attn={cleanupCount > 0} active={onlyCleanup} onClick={() => setOnlyCleanup(!onlyCleanup)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10, marginBottom: 12 }}>
            <label><span style={lbl}>Cerca</span><input style={{ ...input, borderRadius: 999 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, email, telefono, mansione…" /></label>
            <FilterSelect label="Reparto" value={dept} onChange={setDept} options={depts} />
            <FilterSelect label="Creator / progetto" value={project} onChange={setProject} options={projects} />
            <FilterSelect label="Tipo di rapporto" value={emp} onChange={setEmp} options={emps} />
          </div>
          {filtered && (
            <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>
              {rows.length} su {items.length} · <button type="button" onClick={reset} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>togli i filtri</button>
            </div>
          )}
          <DataTable columns={columns} rows={rows} defaultSort={{ key: "name", dir: 1 }} onRowClick={(p) => router.push(`/admin/hr/${p.id}`)} minWidth={900} maxHeight={620}
            empty={<span>Nessuna persona con questi filtri. <button type="button" onClick={reset} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer" }}>Togli i filtri</button></span>} />

          {cleanupCount > 0 && (
            <div style={{ marginTop: 14 }}>
              <Disclosure open={cleanupOpen} onToggle={() => setCleanupOpen(!cleanupOpen)} title="Da ripulire"
                summary={`${data.cleanup.duplicates.length} gruppi di doppioni probabili · ${data.cleanup.junk.length} schede quasi vuote`}>
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                  Niente viene cancellato da solo. Apri le schede, decidi quale tenere e sistema su ClickUp (unisci o archivia il task): alla prossima sincronizzazione l'elenco si aggiorna.
                </p>
                {data.cleanup.duplicates.map((g) => (
                  <div key={g.ids.join()} style={{ padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14 }}>
                    <span style={{ color: CP.textMuted, fontSize: 12, marginRight: 8 }}>stesso {g.reasons.join(" + ")}</span>
                    {g.ids.map((id, i) => <span key={id}>{i > 0 && " · "}<Link href={`/admin/hr/${id}`} style={{ color: CP.textPrimary }}>{byId[id]?.name || id}</Link></span>)}
                  </div>
                ))}
                {data.cleanup.junk.length > 0 && (
                  <div style={{ padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14 }}>
                    <span style={{ color: CP.textMuted, fontSize: 12, marginRight: 8 }}>nome di 1-2 lettere e nessuna email</span>
                    {data.cleanup.junk.map((id, i) => <span key={id}>{i > 0 && " · "}<Link href={`/admin/hr/${id}`} style={{ color: CP.textPrimary }}>{byId[id]?.name || "(vuota)"}</Link></span>)}
                  </div>
                )}
              </Disclosure>
            </div>
          )}
        </>
      )}

      <NewPersonModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(p) => { setNewOpen(false); mutate(); router.push(`/admin/hr/${p.id}`); }} />
      <HrFormLinkModal target={linkFor} onClose={() => setLinkFor(null)} onCreated={() => mutate()} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label>
      <span style={lbl}>{label}</span>
      <select style={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tutti</option>
        {options.map(([v, n]) => <option key={v} value={v}>{v === NONE ? "Non indicato" : v.replace(/^Model - /, "")} · {n}</option>)}
      </select>
    </label>
  );
}

function NewPersonModal({ open, onClose, onCreated }) {
  const [f, setF] = useState({ firstName: "", surname: "", personalEmail: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await postJson("/api/admin/hr/people", f);
      setF({ firstName: "", surname: "", personalEmail: "" });
      onCreated(j.person);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nuova persona">
      <div style={{ display: "grid", gap: 10 }}>
        <label><span style={lbl}>Nome</span><input style={input} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} autoFocus /></label>
        <label><span style={lbl}>Cognome</span><input style={input} value={f.surname} onChange={(e) => setF({ ...f, surname: e.target.value })} /></label>
        <label><span style={lbl}>Email personale</span><input type="email" style={input} value={f.personalEmail} onChange={(e) => setF({ ...f, personalEmail: e.target.value })} /></label>
        <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>Il resto si compila nella scheda, oppure lo compila la persona dal link.</p>
        {err && <div style={{ color: CP.accentRed, fontSize: 13 }}>{err}</div>}
        <div><button type="button" onClick={save} disabled={busy || !f.firstName.trim()} style={{ ...btnPrimary, opacity: busy || !f.firstName.trim() ? 0.5 : 1 }}>{busy ? "Salvo…" : "Crea la scheda"}</button></div>
      </div>
    </Modal>
  );
}
