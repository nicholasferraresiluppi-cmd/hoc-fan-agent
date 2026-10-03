"use client";

/**
 * /admin/hr — Centro HR, fase 1: elenco persone (SEED).
 *
 * HOC Pro è il master; ClickUp (lista HR_CLICKUP_LIST_ID) è lo specchio
 * sincronizzato. Qui: filtri per stato/reparto/creator/tipo rapporto,
 * ricerca, badge "da ripulire" (doppioni probabili e schede spazzatura:
 * segnalati, mai cancellati), il link UNICO del modulo da copiare (nessuna email).
 *
 * 03/10/2026: un solo link, uguale per tutti (decisione del titolare). I link
 * personali già mandati funzionano finché scadono, ma da qui non se ne creano più.
 * 03/10/2026: fasi della persona (In ingresso, Attiva, In riassegnazione, In
 * uscita, Uscita) e stato del contratto, due assi separati. Di base l'elenco
 * mostra tutti tranne chi è "Uscita"; filtro per fase con i conteggi; i numeri in
 * alto ragionano per fase. Da procedura non si elimina mai una persona.
 * Vista "Archiviate" = rete di sicurezza per i task cancellati su ClickUp: fuori
 * da elenco, doppioni e numeri; si ripristinano, non si cancellano mai.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Link2, RefreshCw, Power } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Metric, Notice, DataTable, FilterChip, Disclosure, card } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { PHASE_LABELS, PHASE_EXITED, CONTRACT_LABELS } from "@/lib/hr-fields";
import { SKILL_AREAS, SKILL_LEVELS, PAST_ROLES, normalizeSkillMap, normalizePastRoles, hasSkillAtLeast, pastRoleText } from "@/lib/hr-skills";
import { lbl, input, btnPrimary, btnGhost, chip, SYNC_LABEL, fetcher, postJson, CopyLink, fmtDateTime } from "@/components/hr-ui";
import { RestoreButton } from "@/components/hr-archive";
import { TutorialVideoButton } from "@/components/TutorialVideo";

const NONE = "__none__";
const ALL_PHASES = "__all__"; // filtro "tutte, anche le uscite"

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
  const [contract, setContract] = useState("");
  const [onlyCleanup, setOnlyCleanup] = useState(false);
  const [skill, setSkill] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [pastRole, setPastRole] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [view, setView] = useState("attive");
  const [archNotice, setArchNotice] = useState(null);
  // ?vista=archiviate (link diretto alla vista)
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("vista") === "archiviate") setView("archiviate");
  }, []);

  const items = data?.items || [];
  const archivedItems = data?.archived || [];
  const flags = data?.cleanup?.byId || {};
  const byId = useMemo(() => Object.fromEntries(items.map((p) => [p.id, p])), [items]);

  // conteggi per fase calcolati sull'elenco INTERO (le pill non cambiano coi filtri).
  // "" = di base: tutti tranne chi è "Uscita"
  const statusCounts = useMemo(() => {
    const m = { "": 0, [ALL_PHASES]: items.length, [NONE]: 0 };
    for (const s of PHASE_LABELS) m[s] = 0;
    for (const p of items) {
      const s = p.fields?.collaborationStatus;
      if (s !== PHASE_EXITED) m[""] += 1;
      if (s && s in m) m[s] += 1; else if (s) m[s] = (m[s] || 0) + 1; else m[NONE] += 1;
    }
    return m;
  }, [items]);
  const contracts = useMemo(() => {
    const got = uniq(items, (p) => p.fields?.hvContractStatus);
    const order = (v) => (v === NONE ? 99 : CONTRACT_LABELS.includes(v) ? CONTRACT_LABELS.indexOf(v) : 50);
    return got.sort((a, b) => order(a[0]) - order(b[0]));
  }, [items]);
  const depts = useMemo(() => uniq(items, (p) => p.fields?.department), [items]);
  const projects = useMemo(() => uniq(items, (p) => p.fields?.project), [items]);
  const emps = useMemo(() => uniq(items, (p) => p.fields?.employmentType), [items]);
  const cleanupCount = Object.keys(flags).length;
  // competenze e ruoli passati: conteggi sull'elenco intero (chiavi vecchie già tradotte)
  const skillCounts = useMemo(() => {
    const m = {};
    for (const p of items) for (const k of Object.keys(normalizeSkillMap(p.fields?.skillLevels))) m[k] = (m[k] || 0) + 1;
    return m;
  }, [items]);
  const roleCounts = useMemo(() => {
    const m = {};
    for (const p of items) for (const r of normalizePastRoles(p.fields?.pastRoles)) m[r.role] = (m[r.role] || 0) + 1;
    return m;
  }, [items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((p) => {
      const f = p.fields || {};
      if (!status && f.collaborationStatus === PHASE_EXITED) return false;
      if (status && status !== ALL_PHASES && (status === NONE ? f.collaborationStatus : f.collaborationStatus !== status)) return false;
      if (contract && !has(f.hvContractStatus, contract)) return false;
      if (dept && !has(f.department, dept)) return false;
      if (project && !has(f.project, project)) return false;
      if (emp && !has(f.employmentType, emp)) return false;
      if (onlyCleanup && !flags[p.id]) return false;
      if (skill && !hasSkillAtLeast(f.skillLevels, skill, minLevel)) return false;
      if (pastRole && !normalizePastRoles(f.pastRoles).some((r) => r.role === pastRole)) return false;
      if (needle) {
        const hay = [p.name, f.personalEmail, f.companyEmail, f.personalPhone, f.currentJob, ...(f.project || []), ...(f.role || [])].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, status, contract, dept, project, emp, onlyCleanup, flags, skill, minLevel, pastRole]);

  const filtered = Boolean(q || status || contract || dept || project || emp || onlyCleanup || skill || pastRole);
  const reset = () => { setQ(""); setStatus(""); setContract(""); setDept(""); setProject(""); setEmp(""); setOnlyCleanup(false); setSkill(""); setMinLevel(""); setPastRole(""); };
  const shownBase = statusCounts[""]; // l'elenco di base: tutti tranne le uscite
  // fasi fuori dalle 5 (es. "Da verificare" arrivato da ClickUp, o un'opzione sconosciuta)
  const otherPhases = Object.keys(statusCounts).filter((s) => s && s !== NONE && s !== ALL_PHASES && !PHASE_LABELS.includes(s));
  const toFix = statusCounts[NONE] + otherPhases.reduce((a, s) => a + statusCounts[s], 0);

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
    { key: "status", label: "Fase", sort: (p) => { const i = PHASE_LABELS.indexOf(p.fields?.collaborationStatus); return i < 0 ? 99 : i; }, render: (p) => p.fields?.collaborationStatus || <span style={{ color: CP.textMuted }}>—</span> },
    { key: "contract", label: "Contratto", sort: (p) => { const i = CONTRACT_LABELS.indexOf(p.fields?.hvContractStatus); return i < 0 ? 99 : i; }, render: (p) => p.fields?.hvContractStatus || <span style={{ color: CP.textMuted }}>—</span>, muted: true },
    { key: "dept", label: "Reparto", sort: (p) => (p.fields?.department || []).join(","), render: (p) => (p.fields?.department || []).join(", ") || <span style={{ color: CP.textMuted }}>—</span>, muted: true },
    { key: "project", label: "Creator / progetto", sortable: false, render: (p) => (p.fields?.project || []).slice(0, 3).map((x) => <span key={x} style={chip}>{x.replace(/^Model - /, "")}</span>).concat((p.fields?.project || []).length > 3 ? [<span key="more" style={{ fontSize: 12, color: CP.textMuted }}>+{p.fields.project.length - 3}</span>] : []) },
    { key: "emp", label: "Rapporto", sort: (p) => p.fields?.employmentType || "", render: (p) => p.fields?.employmentType || <span style={{ color: CP.textMuted }}>—</span>, muted: true },
    ...(skill ? [{ key: "lvl", label: "Livello", sort: (p) => SKILL_LEVELS.indexOf(normalizeSkillMap(p.fields?.skillLevels)[skill]), render: (p) => normalizeSkillMap(p.fields?.skillLevels)[skill] || "—" }] : []),
    ...(pastRole ? [{ key: "prole", label: "Ruolo passato", sortable: false, render: (p) => pastRoleText(normalizePastRoles(p.fields?.pastRoles).find((r) => r.role === pastRole)), muted: true }] : []),
    { key: "sync", label: "ClickUp", sort: (p) => p.sync?.status || "", render: (p) => <span style={{ fontSize: 13, color: ["error", "deleted", "missing"].includes(p.sync?.status) ? CP.accentRed : CP.textSecondary }}>{SYNC_LABEL[p.sync?.status] || "—"}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1240, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Persone HR" }]}
        title="Persone HR"
        subtitle="L'anagrafica di chi lavora con noi. HOC Pro è la fonte principale: ogni modifica fatta qui arriva su ClickUp, e quelle fatte su ClickUp tornano qui. I dati li può compilare anche la persona, dal link del modulo."
        actions={!error && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TutorialVideoButton id="persone-hr" />
            <button type="button" onClick={() => setNewOpen(true)} style={btnPrimary}><Plus size={15} /> Nuova persona</button>
          </div>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare le persone: ${error.message}`}</Notice>}

      {data && <SharedLinkBox onChanged={() => mutate()} />}

      {data && !data.sync?.enabled && (
        <Notice>
          Sincronizzazione con ClickUp <b>spenta</b>: manca la lista (<code>HR_CLICKUP_LIST_ID</code>) o il token. Le schede si salvano comunque in HOC Pro e verranno portate su ClickUp quando la sync si accende. <Link href="/admin/hr/sync" style={{ color: CP.accentSoftText }}>Stato della sincronizzazione →</Link>
        </Notice>
      )}
      {data?.sync?.isRealList && <Notice danger>La lista configurata è quella <b>reale</b> del CRM HR: ogni salvataggio modifica i task veri.</Notice>}
      {data && !data.crypto && <Notice>Chiave di cifratura (<code>HR_ENCRYPTION_KEY</code>) assente: i codici fiscali non si possono salvare né leggere. Il resto funziona.</Notice>}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && (archivedItems.length > 0 || view === "archiviate") && (
        <div role="group" aria-label="Quale elenco" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <FilterChip label={`Persone · ${items.length}`} active={view === "attive"} onClick={() => setView("attive")} />
          <FilterChip label={`Archiviate · ${archivedItems.length}`} active={view === "archiviate"} onClick={() => setView("archiviate")} />
        </div>
      )}

      {data && view === "archiviate" && (
        <ArchivedView rows={archivedItems} notice={archNotice} onChanged={(text) => { setArchNotice(text); mutate(); }} />
      )}

      {data && view === "attive" && items.length === 0 && (
        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Nessuna persona ancora. Per iniziare:</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
            <li>se la lista ClickUp è configurata, <Link href="/admin/hr/sync" style={{ color: CP.accentSoftText }}>importa le persone da ClickUp</Link>;</li>
            <li>oppure crea una scheda con “Nuova persona”;</li>
            <li>oppure manda il link del modulo qui sopra: ognuno compila i suoi dati.</li>
          </ol>
        </section>
      )}

      {view === "attive" && items.length > 0 && (
        <>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }} aria-label="Persone per fase">
            <Metric label="Con noi" value={fmtInt(shownBase)} note="tutti tranne le uscite" />
            {PHASE_LABELS.map((ph) => <Metric key={ph} label={ph} value={fmtInt(statusCounts[ph] || 0)} />)}
            {toFix > 0 && <Metric label="Fase da sistemare" attn value={fmtInt(toFix)} note="senza fase o da verificare" />}
            <Metric label="Da ripulire" value={fmtInt(cleanupCount)} attn={cleanupCount > 0} note="doppioni o schede vuote" />
            <Metric label="Problemi con ClickUp" value={fmtInt(syncErrors)} danger={syncErrors > 0} />
          </section>

          <div role="group" aria-label="Filtra per fase" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Tutti tranne le uscite · ${statusCounts[""]}`} active={!status} onClick={() => setStatus("")} />
            {PHASE_LABELS.map((s) => <FilterChip key={s} label={`${s} · ${statusCounts[s] || 0}`} active={status === s} onClick={() => setStatus(status === s ? "" : s)} />)}
            {otherPhases.map((s) => <FilterChip key={s} attn label={`${s} · ${statusCounts[s]}`} active={status === s} onClick={() => setStatus(status === s ? "" : s)} />)}
            <FilterChip label={`Senza fase · ${statusCounts[NONE]}`} active={status === NONE} onClick={() => setStatus(status === NONE ? "" : NONE)} />
            <FilterChip label={`Tutte le fasi · ${statusCounts[ALL_PHASES]}`} active={status === ALL_PHASES} onClick={() => setStatus(status === ALL_PHASES ? "" : ALL_PHASES)} />
            <FilterChip label={`Da ripulire · ${cleanupCount}`} attn={cleanupCount > 0} active={onlyCleanup} onClick={() => setOnlyCleanup(!onlyCleanup)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10, marginBottom: 12 }}>
            <label><span style={lbl}>Cerca</span><input style={{ ...input, borderRadius: 999 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, email, telefono, mansione…" /></label>
            <FilterSelect label="Stato del contratto" value={contract} onChange={setContract} options={contracts} />
            <FilterSelect label="Reparto" value={dept} onChange={setDept} options={depts} />
            <FilterSelect label="Creator / progetto" value={project} onChange={setProject} options={projects} />
            <FilterSelect label="Tipo di rapporto" value={emp} onChange={setEmp} options={emps} />
            <label>
              <span style={lbl}>Ha la competenza</span>
              <select style={input} value={skill} onChange={(e) => { setSkill(e.target.value); if (!e.target.value) setMinLevel(""); }}>
                <option value="">Qualunque</option>
                {SKILL_AREAS.map((a) => (
                  <optgroup key={a.key} label={a.area}>
                    {a.skills.map((x) => <option key={x.key} value={x.key}>{x.name} · {skillCounts[x.key] || 0}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span style={lbl}>Livello minimo</span>
              <select style={{ ...input, opacity: skill ? 1 : 0.6 }} disabled={!skill} value={minLevel} onChange={(e) => setMinLevel(e.target.value)}>
                <option value="">Qualunque livello</option>
                {SKILL_LEVELS.slice(1).map((l) => <option key={l} value={l}>Almeno {l}</option>)}
              </select>
            </label>
            <label>
              <span style={lbl}>Ha ricoperto il ruolo</span>
              <select style={input} value={pastRole} onChange={(e) => setPastRole(e.target.value)}>
                <option value="">Qualunque</option>
                {PAST_ROLES.map(([k, name]) => <option key={k} value={k}>{name} · {roleCounts[k] || 0}</option>)}
              </select>
            </label>
          </div>
          {filtered && (
            <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>
              {rows.length} su {status ? items.length : shownBase} · <button type="button" onClick={reset} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>togli i filtri</button>
            </div>
          )}
          <DataTable columns={columns} rows={rows} defaultSort={{ key: "name", dir: 1 }} onRowClick={(p) => router.push(`/admin/hr/${p.id}`)} minWidth={900} maxHeight={620}
            empty={<span>Nessuna persona con questi filtri. <button type="button" onClick={reset} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer" }}>Togli i filtri</button></span>} />

          {cleanupCount > 0 && (
            <div style={{ marginTop: 14 }}>
              <Disclosure open={cleanupOpen} onToggle={() => setCleanupOpen(!cleanupOpen)} title="Da ripulire"
                summary={`${data.cleanup.duplicates.length} gruppi di doppioni probabili · ${data.cleanup.junk.length} schede quasi vuote`}>
                <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                  Niente viene cancellato: in HOC Pro le schede non si eliminano. Apri le schede e decidi quale tenere; il doppione si sistema su ClickUp (se cancelli lì il task in più, qui la sua scheda va tra le Archiviate).
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
    </div>
  );
}

/**
 * Vista "Archiviate": rete di sicurezza per i task cancellati su ClickUp (anche
 * per errore). Non si sincronizzano e non contano nei numeri; non si cancellano
 * mai, si ripristinano.
 */
function ArchivedView({ rows, notice, onChanged }) {
  const SOURCE = { app: "HOC Pro", clickup: "ClickUp", sistema: "Sistema" };
  const columns = [
    { key: "name", label: "Persona", sort: (p) => p.name.toLowerCase(), render: (p) => <Link href={`/admin/hr/${p.id}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{p.name}</Link> },
    { key: "at", label: "Archiviata il", sort: (p) => p.archived?.at || 0, render: (p) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(p.archived?.at)}</span> },
    { key: "why", label: "Perché", sortable: false, render: (p) => <span>{p.archived?.reason || "—"} <span style={{ color: CP.textMuted, fontSize: 12 }}>· {SOURCE[p.archived?.source] || p.archived?.source}</span>{p.archived?.pendingTaskDelete && !p.archived?.taskDeletedAt ? <div style={{ fontSize: 12, color: CP.textMuted }}>il suo task su ClickUp c'è ancora: ripristinando si ricollega a quello</div> : null}</span> },
    {
      key: "act", label: "", sortable: false,
      render: (p) => (
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
          <RestoreButton compact person={p} onDone={() => onChanged(`${p.name}: scheda ripristinata.`)} />
        </span>
      ),
    },
  ];
  return (
    <section aria-label="Schede archiviate">
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
        Da procedura non si elimina nessuno: chi va via si segna «{PHASE_EXITED}» e resta nell'elenco con quella fase.
        Qui finiscono solo le schede il cui task è stato cancellato su ClickUp, anche per errore: non si sincronizzano, non contano nei numeri né nei doppioni e non si cancellano mai.
        Ripristinando una scheda, su ClickUp si crea un task nuovo: quello cancellato non viene recuperato.
      </p>
      {notice && <Notice>{notice}</Notice>}
      <DataTable columns={columns} rows={rows} defaultSort={{ key: "at", dir: -1 }} minWidth={820} maxHeight={620} empty="Nessuna scheda archiviata." />
    </section>
  );
}

/**
 * Il link UNICO del modulo: uguale per tutti, senza scadenza. Copia, disattiva,
 * rigenera (il vecchio smette subito di funzionare). Ogni invio crea una scheda
 * nuova: chi è già in elenco comparirà come doppione in "Da ripulire".
 */
function SharedLinkBox({ onChanged }) {
  const { data, error, mutate } = useSWR("/api/admin/hr/form-links/shared", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const link = data?.link || null;
  const act = async (action) => {
    if (action === "regenerate" && link && !confirm("Rigenero il link? Quello di adesso smette subito di funzionare: chi lo ha ricevuto e non ha ancora compilato dovrà avere quello nuovo.")) return;
    if (action === "disable" && !confirm("Disattivo il link? Nessuno potrà più compilare il modulo finché non ne crei uno nuovo.")) return;
    setBusy(true); setErr(null);
    try {
      const j = await postJson("/api/admin/hr/form-links/shared", { action });
      await mutate({ ok: true, link: j.link }, { revalidate: false });
      onChanged?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (error) return error.status === 403 ? null : <Notice danger>Non riesco a leggere il link del modulo: {error.message}</Notice>;
  if (!data) return null;
  const url = link && typeof window !== "undefined" ? `${window.location.origin}${link.path}` : "";
  const shortUrl = link && typeof window !== "undefined" ? `${window.location.origin}/tessera` : "";
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }} aria-labelledby="hr-shared-link">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Link2 size={15} color={CP.textMuted} />
        <h2 id="hr-shared-link" style={{ margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Link del modulo</h2>
        <span style={{ fontSize: 12, color: link ? CP.textSecondary : CP.textMuted }}>{link ? "· attivo" : "· nessun link attivo"}</span>
      </div>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        Un solo link, uguale per tutti: lo mandi tu (non parte nessuna email). Non scade. Chi lo apre trova il modulo vuoto e ogni invio crea una scheda nuova.
        Se la persona era già in elenco, la vedrai tra i doppioni in “Da ripulire”.
      </p>
      {link ? (
        <div style={{ display: "grid", gap: 10 }}>
          <CopyLink link={shortUrl} note="Il link da mandare: corto e sempre aggiornato (se rigeneri, punta da solo a quello nuovo)." />
          <details style={{ fontSize: 12.5, color: CP.textMuted }}>
            <summary style={{ cursor: "pointer" }}>Link completo{link.createdAt ? ` · creato il ${fmtDateTime(link.createdAt)}` : ""}</summary>
            <div style={{ marginTop: 8 }}><CopyLink link={url} /></div>
          </details>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => act("regenerate")} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}><RefreshCw size={14} /> Rigenera</button>
            <button type="button" onClick={() => act("disable")} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}><Power size={14} /> Disattiva</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => act("regenerate")} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}><Link2 size={14} /> {busy ? "Creo…" : "Crea il link"}</button>
      )}
      {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </section>
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
