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
import { Plus, Link2, RefreshCw, Power, SlidersHorizontal } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, DataTable, card } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { PHASE_LABELS, PHASE_EXITED, CONTRACT_LABELS } from "@/lib/hr-fields";
import { SKILL_AREAS, SKILL_LEVELS, PAST_ROLES, normalizeSkillMap, normalizePastRoles, hasSkillAtLeast, pastRoleText } from "@/lib/hr-skills";
import { lbl, input, btnPrimary, btnGhost, chip, SYNC_LABEL, fetcher, postJson, CopyLink, fmtDateTime } from "@/components/hr-ui";
import { RestoreButton } from "@/components/hr-archive";
import { readiness, initials, avatarColor } from "@/lib/hr-readiness";

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
  const [tab, setTab] = useState("con-noi");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dept, setDept] = useState("");
  const [project, setProject] = useState("");
  const [emp, setEmp] = useState("");
  const [contract, setContract] = useState("");
  const [skill, setSkill] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [pastRole, setPastRole] = useState("");
  const [lang, setLang] = useState("");
  const [source, setSource] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [archNotice, setArchNotice] = useState(null);
  // ?vista=archiviate (link diretto alla vista)
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("vista") === "archiviate") setTab("archiviate");
  }, []);

  const items = data?.items || [];
  const archivedItems = data?.archived || [];
  const flags = data?.cleanup?.byId || {};
  const byId = useMemo(() => Object.fromEntries(items.map((p) => [p.id, p])), [items]);
  const ready = useMemo(() => Object.fromEntries(items.map((p) => [p.id, readiness(p.fields)])), [items]);

  const contracts = useMemo(() => {
    const got = uniq(items, (p) => p.fields?.hvContractStatus);
    const order = (v) => (v === NONE ? 99 : CONTRACT_LABELS.includes(v) ? CONTRACT_LABELS.indexOf(v) : 50);
    return got.sort((a, b) => order(a[0]) - order(b[0]));
  }, [items]);
  const depts = useMemo(() => uniq(items, (p) => p.fields?.department), [items]);
  const langs = useMemo(() => uniq(items, (p) => p.fields?.spokenLanguages), [items]);
  const projects = useMemo(() => uniq(items, (p) => p.fields?.project), [items]);
  const emps = useMemo(() => uniq(items, (p) => p.fields?.employmentType), [items]);
  const sources = useMemo(() => uniq(items, (p) => p.fields?.source), [items]);
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

  // Viste (05/10/2026, redesign): le domande di tutti i giorni come schede in alto, con il conteggio.
  const phase = (p) => p.fields?.collaborationStatus || "";
  const TABS = useMemo(() => [
    { key: "con-noi", label: "Con noi", test: (p) => phase(p) !== PHASE_EXITED },
    { key: "da-completare", label: "Da completare", test: (p) => phase(p) !== PHASE_EXITED && ready[p.id]?.missing.length > 0 },
    { key: "ingresso", label: "In ingresso", test: (p) => phase(p) === "In ingresso" },
    { key: "attive", label: "Attive", test: (p) => phase(p) === "Attiva" },
    { key: "cambio", label: "In riassegnazione o in uscita", test: (p) => ["In riassegnazione", "In uscita"].includes(phase(p)) },
    { key: "uscite", label: "Uscite", test: (p) => phase(p) === PHASE_EXITED },
    { key: "senza-fase", label: "Fase da sistemare", attn: true, hideEmpty: true, test: (p) => !PHASE_LABELS.includes(phase(p)) },
    { key: "ripulire", label: "Da ripulire", attn: true, hideEmpty: true, test: (p) => Boolean(flags[p.id]) },
  ], [ready, flags]);
  const tabCounts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, items.filter(t.test).length])), [TABS, items]);
  const curTab = TABS.find((t) => t.key === tab);

  const activeFilters = [contract, dept, project, emp, lang, skill, pastRole, source].filter(Boolean).length;
  const rows = useMemo(() => {
    if (!curTab) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((p) => {
      const f = p.fields || {};
      if (!curTab.test(p)) return false;
      if (lang && !has(f.spokenLanguages, lang)) return false;
      if (contract && !has(f.hvContractStatus, contract)) return false;
      if (dept && !has(f.department, dept)) return false;
      if (project && !has(f.project, project)) return false;
      if (emp && !has(f.employmentType, emp)) return false;
      if (source && !has(f.source, source)) return false;
      if (skill && !hasSkillAtLeast(f.skillLevels, skill, minLevel)) return false;
      if (pastRole && !normalizePastRoles(f.pastRoles).some((r) => r.role === pastRole)) return false;
      if (needle) {
        const hay = [p.name, f.personalEmail, f.companyEmail, f.personalPhone, f.currentJob, f.referredBy, ...(f.project || []), ...(f.role || []), ...(f.referent || []).map((u) => u.name)].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, curTab, q, contract, dept, project, emp, lang, source, skill, minLevel, pastRole]);
  const resetFilters = () => { setContract(""); setDept(""); setProject(""); setEmp(""); setLang(""); setSkill(""); setMinLevel(""); setPastRole(""); setSource(""); };

  const syncProblems = items.filter((p) => ["error", "partial", "deleted", "missing", "drift"].includes(p.sync?.status));

  const columns = [
    {
      key: "name", label: "Persona", sort: (p) => p.name.toLowerCase(),
      render: (p) => {
        const bad = ["error", "partial", "deleted", "missing", "drift"].includes(p.sync?.status);
        const sub = [p.fields?.currentJob, ...(p.fields?.role || [])].filter(Boolean)[0];
        return (
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: avatarColor(p.id), color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, flex: "0 0 auto" }}>{initials(p.name)}</span>
            <span style={{ minWidth: 0 }}>
              <Link href={`/admin/hr/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{p.name}</Link>
              {bad && <span title={`ClickUp: ${SYNC_LABEL[p.sync?.status] || p.sync?.status}`} style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: CP.accentRed, marginLeft: 6, verticalAlign: "middle" }} />}
              {(flags[p.id] || []).map((f) => <span key={f} style={{ ...chip, marginLeft: 6, color: CP.attn }}>{f === "doppione" ? "doppione?" : "da ripulire"}</span>)}
              {sub && <div style={{ fontSize: 12, color: CP.textMuted }}>{sub}</div>}
            </span>
          </span>
        );
      },
    },
    { key: "status", label: "Fase", sort: (p) => { const i = PHASE_LABELS.indexOf(phase(p)); return i < 0 ? 99 : i; }, render: (p) => <PhasePill phase={phase(p)} /> },
    { key: "project", label: "Progetto", sortable: false, render: (p) => (p.fields?.project || []).length ? (p.fields.project.slice(0, 2).map((x) => x.replace(/^Model ?- ?/, "")).join(", ") + (p.fields.project.length > 2 ? ` +${p.fields.project.length - 2}` : "")) : <span style={{ color: CP.textMuted }}>—</span> },
    { key: "referent", label: "Referente", sort: (p) => (p.fields?.referent || [])[0]?.name || "", render: (p) => (p.fields?.referent || []).map((u) => u.name).join(", ") || <span style={{ color: CP.textMuted }}>—</span> },
    {
      key: "ready", label: "Pronta", sort: (p) => ready[p.id]?.done ?? 0,
      render: (p) => { const r = ready[p.id]; return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ width: 56, height: 6, borderRadius: 3, background: CP.borderSoft || CP.border, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(r.done / r.total) * 100}%`, background: r.done === r.total ? CP.accentGreen : CP.scale || CP.accent }} /></span>
          <span style={{ fontSize: 12.5, color: CP.textSecondary }}>{r.done}/{r.total}</span>
        </span>
      ); },
    },
    { key: "missing", label: "Manca", sortable: false, render: (p) => { const m = ready[p.id]?.missing || []; return m.length ? <span style={{ fontSize: 12.5, color: CP.textSecondary }}>{m.map((x) => x.label).join(" · ")}</span> : <span style={{ fontSize: 12.5, color: CP.accentGreen }}>tutto pronto</span>; } },
    ...(skill ? [{ key: "lvl", label: "Livello", sort: (p) => SKILL_LEVELS.indexOf(normalizeSkillMap(p.fields?.skillLevels)[skill]), render: (p) => normalizeSkillMap(p.fields?.skillLevels)[skill] || "—" }] : []),
    ...(pastRole ? [{ key: "prole", label: "Ruolo passato", sortable: false, render: (p) => pastRoleText(normalizePastRoles(p.fields?.pastRoles).find((r) => r.role === pastRole)), muted: true }] : []),
  ];

  const tabBtn = (key, label, count, attn) => (
    <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
      style={{ background: "none", border: 0, borderBottom: `2px solid ${tab === key ? CP.accent : "transparent"}`, padding: "9px 12px", marginBottom: -1, cursor: "pointer", fontFamily: FONTS.body, fontSize: 14, whiteSpace: "nowrap",
        color: tab === key ? CP.textPrimary : CP.textSecondary, fontWeight: tab === key ? 500 : 400 }}>
      {label} <span style={{ color: attn && count ? CP.attn : CP.textMuted, fontSize: 12.5 }}>{count}</span>
    </button>
  );

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1240, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Persone" }]}
        title="Persone"
        subtitle="Chi lavora con noi. Si aggiorna da sola con ClickUp."
        actions={!error && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setLinkOpen(true)} style={btnGhost}><Link2 size={15} /> Link del modulo</button>
            <button type="button" onClick={() => setNewOpen(true)} style={btnPrimary}><Plus size={15} /> Nuova persona</button>
          </div>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare le persone: ${error.message}`}</Notice>}
      {data && !data.sync?.enabled && (
        <Notice>Sincronizzazione con ClickUp <b>spenta</b>: le schede si salvano comunque qui. <Link href="/admin/hr/sync" style={{ color: CP.accentSoftText }}>Dettagli →</Link></Notice>
      )}
      {data?.sync?.isRealList && <Notice danger>La lista configurata è quella <b>reale</b> del CRM HR: ogni salvataggio modifica i task veri.</Notice>}
      {data && !data.crypto && <Notice>Chiave di cifratura assente: i codici fiscali non si possono salvare né leggere. Il resto funziona.</Notice>}
      {syncProblems.length > 0 && (
        <Notice danger>{syncProblems.length === 1 ? "1 scheda non è" : `${syncProblems.length} schede non sono`} allineate con ClickUp ({syncProblems.slice(0, 3).map((p) => p.name).join(", ")}{syncProblems.length > 3 ? "…" : ""}). Il sistema riprova da solo; il pallino rosso le segna nell'elenco. <Link href="/admin/hr/sync" style={{ color: CP.accentSoftText }}>Dettagli →</Link></Notice>
      )}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && items.length === 0 && archivedItems.length === 0 && (
        <section style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 8 }}>Nessuna persona ancora.</div>
          <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>Manda il <button type="button" onClick={() => setLinkOpen(true)} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 14 }}>link del modulo</button> a chi entra, oppure crea una scheda con «Nuova persona».</p>
        </section>
      )}

      {data && (items.length > 0 || archivedItems.length > 0) && (
        <>
          <div role="tablist" aria-label="Viste" style={{ display: "flex", gap: 2, borderBottom: `1px solid ${CP.border}`, overflowX: "auto", marginBottom: 12 }}>
            {TABS.filter((t) => !t.hideEmpty || tabCounts[t.key] > 0 || tab === t.key).map((t) => tabBtn(t.key, t.label, tabCounts[t.key], t.attn))}
            {(archivedItems.length > 0 || tab === "archiviate") && tabBtn("archiviate", "Archiviate", archivedItems.length, false)}
          </div>

          {tab === "archiviate" ? (
            <ArchivedView rows={archivedItems} notice={archNotice} onChanged={(text) => { setArchNotice(text); mutate(); }} />
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <input aria-label="Cerca" style={{ ...input, flex: "1 1 260px", borderRadius: 999 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, email, telefono, progetto, referente…" />
                <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen} style={{ ...btnGhost, borderColor: activeFilters ? CP.accent : undefined }}>
                  <SlidersHorizontal size={14} /> Filtri{activeFilters ? ` · ${activeFilters}` : ""}
                </button>
                {activeFilters > 0 && <button type="button" onClick={resetFilters} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>Togli i filtri</button>}
              </div>
              {filtersOpen && (
                <section style={{ ...card, padding: "14px 16px", marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }} aria-label="Filtri">
                  <FilterSelect label="Progetto / creator" value={project} onChange={setProject} options={projects} />
                  <FilterSelect label="Stato del contratto" value={contract} onChange={setContract} options={contracts} />
                  <FilterSelect label="Reparto" value={dept} onChange={setDept} options={depts} />
                  <FilterSelect label="Tipo di rapporto" value={emp} onChange={setEmp} options={emps} />
                  <FilterSelect label="Lingue" value={lang} onChange={setLang} options={langs} />
                  <FilterSelect label="Come ci ha conosciuto" value={source} onChange={setSource} options={sources} />
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
                  {skill && (
                    <label>
                      <span style={lbl}>Livello minimo</span>
                      <select style={input} value={minLevel} onChange={(e) => setMinLevel(e.target.value)}>
                        <option value="">Qualunque livello</option>
                        {SKILL_LEVELS.slice(1).map((l) => <option key={l} value={l}>Almeno {l}</option>)}
                      </select>
                    </label>
                  )}
                  <label>
                    <span style={lbl}>Ha ricoperto il ruolo</span>
                    <select style={input} value={pastRole} onChange={(e) => setPastRole(e.target.value)}>
                      <option value="">Qualunque</option>
                      {PAST_ROLES.map(([k, name]) => <option key={k} value={k}>{name} · {roleCounts[k] || 0}</option>)}
                    </select>
                  </label>
                </section>
              )}

              <DataTable columns={columns} rows={rows} defaultSort={{ key: "name", dir: 1 }} onRowClick={(p) => router.push(`/admin/hr/${p.id}`)} minWidth={860} maxHeight={680}
                empty={<span>Nessuna persona qui{activeFilters || q ? " con questi filtri" : ""}.{(activeFilters || q) ? <> <button type="button" onClick={() => { resetFilters(); setQ(""); }} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer" }}>Togli i filtri</button></> : null}</span>} />

              {tab === "ripulire" && data.cleanup && (
                <section style={{ ...card, padding: "14px 16px", marginTop: 12 }}>
                  <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 8px", lineHeight: 1.5 }}>
                    Niente viene cancellato. Apri le schede e decidi quale tenere; quella in più la porti in «Uscita» (o la sistemi su ClickUp).
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
                </section>
              )}
            </>
          )}
        </>
      )}

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link del modulo">
        <SharedLinkBox onChanged={() => mutate()} />
      </Modal>
      <NewPersonModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(p) => { setNewOpen(false); mutate(); router.push(`/admin/hr/${p.id}`); }} />
    </div>
  );
}

/** Fase come etichetta colorata (stesso colore ovunque). */
function PhasePill({ phase }) {
  const tone = phase === "Attiva" ? [CP.accentGreen, "rgba(30,122,82,.10)"]
    : phase === "In ingresso" ? [CP.accentSoftText || CP.accent, CP.accentSoft]
    : phase === "Uscita" ? [CP.textMuted, CP.surfaceAlt]
    : PHASE_LABELS.includes(phase) ? [CP.attn, CP.surfaceAlt] : [CP.textMuted, "transparent"];
  return <span style={{ display: "inline-block", fontSize: 12.5, padding: "2px 9px", borderRadius: 999, color: tone[0], background: tone[1], whiteSpace: "nowrap" }}>{phase || "senza fase"}</span>;
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
          {/* 05/10/2026: provare una sola parte del modulo senza compilarlo tutto (dati finti, non si invia nulla) */}
          <div style={{ fontSize: 12.5, color: CP.textMuted }}>
            Prova una sezione (dati finti, non si invia nulla):{" "}
            {[["inizio", "apertura"], ["3", "contatti"], ["6", "esperienza"], ["documenti", "documento"], ["fine", "tessera finale"]].map(([k, n], i) => (
              <span key={k}>{i ? " · " : ""}<a href={`/tessera?prova=${k}`} target="_blank" rel="noreferrer" style={{ color: CP.accent }}>{n}</a></span>
            ))}
            {" "}· dentro la prova puoi passare a qualsiasi sezione.
          </div>
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
