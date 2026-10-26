"use client";

/**
 * /admin/hr/[id] — scheda persona del Centro HR (people.manage: admin e People Partner).
 *
 * Sezioni Anagrafica · Rapporto · Contratto · Documenti · Storico modifiche.
 * Ogni sezione si modifica da sola e salva SOLO i campi cambiati (così su
 * ClickUp si toccano solo quelli). Codice fiscale mascherato: "Mostra" lo
 * legge in chiaro e resta scritto nello storico chi l'ha fatto e quando.
 *
 * 03/10/2026: da procedura non si elimina mai una persona. Al posto di "Elimina"
 * c'è "Segna come uscita" (fase "Uscita" + fine collaborazione) e, per chi è
 * uscito, "Riattiva". Fase e stato del contratto stanno in cima alla scheda.
 * Una scheda archiviata (task cancellato su ClickUp) si legge soltanto e si
 * ripristina. I campi di testo (luogo, comune, CAP, competenze, ruoli, vorrebbe
 * imparare, altro) si modificano qui o su ClickUp.
 *
 * 18/10/2026: «Note» = la descrizione del task ClickUp (a due vie) e, in Documenti, TUTTI i file
 * del task letti da ClickUp a ogni apertura, da aprire e caricare anche da qui.
 */
import { Fragment, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ExternalLink, Eye, Pencil, Phone, Mail, MessageCircle, FileText, Upload, Download } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Notice, DataTable, SectionTitle, card } from "@/components/ds";
import { FIELDS, FIELD_BY_KEY, PHASE_EXITED } from "@/lib/hr-fields";
import { readiness, READINESS, initials, avatarColor } from "@/lib/hr-readiness";
import { normalizeSkillMap, skillName } from "@/lib/hr-skills";
import { lbl, btnPrimary, btnGhost, SYNC_LABEL, displayValue, FieldInput, fmtDate, fmtDateTime, fetcher, postJson } from "@/components/hr-ui";
import { RestoreButton, archivedSummary } from "@/components/hr-archive";
import { ExitButton, ReactivateButton } from "@/components/hr-phase";
import { PersonContractCard } from "@/components/hr-contracts-ui";

const ACTION_LABEL = {
  create: "Scheda creata", update: "Modifica", conflict: "Conflitto con ClickUp", cf_revealed: "Codice fiscale mostrato",
  form_link: "Link di compilazione creato", consent: "Consenso privacy", upload: "File caricato", sync_error: "Errore di sincronizzazione",
  clickup_deleted: "Task cancellato su ClickUp", echo_ignored: "Eco di una nostra scrittura (ignorata)", cf_skipped: "Codice fiscale non importato",
  archived: "Scheda archiviata", restored: "Scheda ripristinata", task_trashed: "Task nel cestino di ClickUp",
  task_delete_queued: "Cancellazione del task in coda", mirror_unrecognized: "Testo di ClickUp non riconosciuto",
  doc_opened: "Documento aperto", contract_attached: "Contratto allegato su ClickUp", contract_link: "Contratto collegato", contract_sent: "Contratto inviato in firma", id_document: "Dati del documento d\u2019identità",
};
const SOURCE_LABEL = { app: "HOC Pro", clickup: "ClickUp", modulo: "Modulo della persona", sistema: "Sistema" }; // le scritture da Dropbox Sign hanno source "sistema", chi = "Dropbox Sign"
const who = (by) => (!by ? "—" : String(by).startsWith("user_") ? `utente …${String(by).slice(-6)}` : by);

// telefono in formato internazionale per WhatsApp (hr-people-core usa node:crypto: qui non si importa)
const toE164 = (v) => {
  const raw = String(v || "").trim();
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (raw.startsWith("+")) return `+${d}`;
  if (raw.startsWith("00")) return `+${d.slice(2)}`;
  if (/^(3\d{8,9}|0\d{5,10})$/.test(d)) return `+39${d}`;
  return null;
};

// Schede della persona (05/10/2026, redesign): ogni dato in un posto solo.
const SKILL_KEYS = ["skillLevels", "learnWish", "pastRoles", "otherSkills"];
const TABS = [
  { key: "panoramica", label: "Panoramica" },
  { key: "anagrafica", label: "Anagrafica", keys: FIELDS.filter((f) => f.section === "anagrafica" && !f.retired).map((f) => f.key) },
  { key: "lavoro", label: "Lavoro e contratto", keys: FIELDS.filter((f) => (f.section === "rapporto" || f.section === "contratto") && !SKILL_KEYS.includes(f.key) && !f.retired).map((f) => f.key) },
  { key: "competenze", label: "Competenze", keys: SKILL_KEYS },
  { key: "documenti", label: "Documenti", keys: FIELDS.filter((f) => f.section === "documenti").map((f) => f.key) },
  { key: "storico", label: "Storico" },
];

export default function HrPersonPage() {
  const { id } = useParams();
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/admin/hr/people/${id}` : null, fetcher, { revalidateOnFocus: false });
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState("panoramica");
  const [copied, setCopied] = useState(null);
  const p = data?.person;
  const f = p?.fields || {};

  const syncNow = async () => {
    setSyncing(true); setNotice(null);
    try {
      const j = await postJson(`/api/admin/hr/people/${id}/sync`, {});
      setNotice({ ok: j.ok, text: j.ok ? "Scheda riportata su ClickUp." : `Sincronizzazione non riuscita: ${j.message || j.status}` });
      await mutate();
    } catch (e) { setNotice({ ok: false, text: e.message }); } finally { setSyncing(false); }
  };
  const copy = async (what, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* niente */ }
  };

  const logRows = (data?.log || []).map((r, i) => ({ ...r, id: `${r.at}-${i}` }));
  const logCols = [
    { key: "at", label: "Quando", render: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.at)}</span> },
    { key: "source", label: "Da dove", render: (r) => SOURCE_LABEL[r.source] || r.source, muted: true },
    { key: "by", label: "Chi", render: (r) => who(r.by), muted: true },
    { key: "action", label: "Cosa", render: (r) => <span>{ACTION_LABEL[r.action] || r.action}{r.field ? <span style={{ color: CP.textMuted }}> · {FIELD_BY_KEY[r.field]?.label || r.field}</span> : null}</span> },
    { key: "change", label: "Da → a", sortable: false, render: (r) => (r.from == null && r.to == null ? "" : <span style={{ fontSize: 13 }}><span style={{ color: CP.textMuted }}>{r.from ?? "vuoto"}</span> → {r.to ?? "vuoto"}</span>) },
  ];

  const phone = toE164(f.personalPhone) || f.personalPhone;
  const syncBad = p && ["error", "partial", "deleted", "missing", "drift"].includes(p.sync?.status);
  const since = f.startDate ? fmtDate(f.startDate) : p?.createdAt ? fmtDate(p.createdAt) : null;
  const subtitle = p ? [(f.mansioni || []).join(", ") || f.currentJob, since ? `con noi dal ${since}` : null, f.referredBy ? `su segnalazione di ${f.referredBy}` : null].filter(Boolean).join(" · ") : null;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 10 }}><Link href="/admin/hr" style={{ color: CP.textSecondary, textDecoration: "none" }}>← Persone</Link></div>

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata a chi gestisce le persone (Area Partner o admin)." : error.status === 404 ? <>Scheda non trovata. <Link href="/admin/hr" style={{ color: CP.accentSoftText }}>Torna all'elenco</Link></> : `Non riesco a caricare la scheda: ${error.message}`}</Notice>}
      {!p && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {p && (
        <>
          <header style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
            <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: "50%", background: avatarColor(p.id), color: "#fff", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 600, flex: "0 0 auto" }}>{initials(p.name)}</span>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: CP.textPrimary, lineHeight: 1.15 }}>{p.name}</h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                <PhasePill phase={f.collaborationStatus} />
                {f.hvContractStatus && <span style={{ fontSize: 12.5, color: CP.textSecondary }}>contratto: {f.hvContractStatus}</span>}
                {subtitle && <span style={{ fontSize: 13, color: CP.textMuted }}>{subtitle}</span>}
              </div>
            </div>
            {!p.archived && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {phone && <button type="button" onClick={() => copy("tel", phone)} style={btnGhost}><Phone size={14} /> {copied === "tel" ? "Copiato" : "Copia telefono"}</button>}
                {phone && String(phone).startsWith("+") && <a href={`https://wa.me/${String(phone).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={btnGhost}><MessageCircle size={14} /> WhatsApp</a>}
                {f.personalEmail && <button type="button" onClick={() => copy("mail", f.personalEmail)} style={btnGhost}><Mail size={14} /> {copied === "mail" ? "Copiata" : "Copia email"}</button>}
                {p.clickupUrl && p.clickupTaskId && <a href={p.clickupUrl} target="_blank" rel="noopener noreferrer" style={btnGhost}><ExternalLink size={14} /> ClickUp</a>}
                {f.collaborationStatus === PHASE_EXITED
                  ? <ReactivateButton person={p} onDone={(j) => { setNotice(phaseNotice(j, "Fase riportata ad Attiva.")); mutate(); }} />
                  : <ExitButton person={p} onDone={(j) => { setNotice(phaseNotice(j, `Segnata come uscita, fine collaborazione il ${fmtDate(j.person?.fields?.endDate)}.`)); mutate(); }} />}
              </div>
            )}
          </header>

          {notice && <Notice danger={!notice.ok}>{notice.text}</Notice>}
          {syncBad && (
            <Notice danger>
              ClickUp: {SYNC_LABEL[p.sync?.status] || p.sync?.status}{p.sync?.message ? ` — ${p.sync.message}` : ""}. Il sistema riprova da solo.{" "}
              {data.sync?.enabled && <button type="button" onClick={syncNow} disabled={syncing} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 14 }}>{syncing ? "Riprovo…" : "Riprova adesso"}</button>}
            </Notice>
          )}

          {p.archived && (
            <section style={{ ...card, padding: "14px 16px", marginBottom: 14, borderLeft: `3px solid ${CP.attn}` }} aria-labelledby="hr-archived-h">
              <h2 id="hr-archived-h" style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Scheda archiviata</h2>
              <p style={{ margin: "0 0 4px", fontSize: 14, color: CP.textSecondary }}>{archivedSummary(p)}.</p>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>
                Il suo task su ClickUp è stato cancellato: la scheda non si sincronizza e qui si legge soltanto. Non si cancella mai: la tieni così o la ripristini.
              </p>
              <RestoreButton person={p} onDone={(j) => { setNotice({ ok: true, text: j.sync?.status === "ok" ? "Scheda ripristinata e riportata su ClickUp." : `Scheda ripristinata. ${j.sync?.message || ""}`.trim() }); mutate(); }} />
            </section>
          )}
          {data.flags?.includes("spazzatura") && <Notice>Scheda quasi vuota (nome di 1-2 lettere, nessuna email). Se è una prova o un errore, portala in «Uscita».</Notice>}
          {data.duplicates && (
            <Notice>
              Possibile doppione (stesso {data.duplicates.reasons.join(" + ")}) di{" "}
              {data.duplicates.others.map((o, i) => <span key={o.id}>{i > 0 && ", "}<Link href={`/admin/hr/${o.id}`} style={{ color: CP.accentSoftText }}>{o.name}</Link></span>)}.
              Decidi quale tenere; quella in più la porti in «Uscita».
            </Notice>
          )}

          <div role="tablist" aria-label="Sezioni della scheda" style={{ display: "flex", gap: 2, borderBottom: `1px solid ${CP.border}`, overflowX: "auto", marginBottom: 14 }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                style={{ background: "none", border: 0, borderBottom: `2px solid ${tab === t.key ? CP.accent : "transparent"}`, padding: "9px 12px", marginBottom: -1, cursor: "pointer", fontFamily: FONTS.body, fontSize: 14, whiteSpace: "nowrap", color: tab === t.key ? CP.textPrimary : CP.textSecondary, fontWeight: tab === t.key ? 500 : 400 }}>
                {t.label}{t.key === "storico" ? <span style={{ color: CP.textMuted, fontSize: 12.5 }}> {logRows.length}</span> : null}
              </button>
            ))}
          </div>

          {tab === "panoramica" && (
            <>
              {["cambiata", "mancante", "risolto"].includes(data.contracts?.status?.flag) && <PersonContractCard contracts={data.contracts} personId={p.id} />}
              <Overview p={p} onGo={setTab} />
              {f.notes && (
                <section style={{ ...card, padding: "14px 16px", marginTop: 14 }}>
                  <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Note</h2>
                  <p style={{ margin: 0, fontSize: 14, color: CP.textPrimary, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5 }}>{f.notes}</p>
                  <p style={{ fontSize: 12, color: CP.textMuted, margin: "8px 0 0" }}>Le stesse della descrizione del task su ClickUp: si modificano qui (Lavoro e contratto) o lì.</p>
                </section>
              )}
            </>
          )}
          {tab === "lavoro" && !p.archived && <PersonContractCard contracts={data.contracts} personId={p.id} />}
          {tab === "documenti" && <DocumentsCard person={p} />}
          {TABS.filter((t) => t.keys && t.key === tab).map((t) => (
            <Section key={t.key} title={t.label} keys={t.keys} person={p} options={data.options || {}} crypto={data.crypto} incoming={data.incoming || []} locked={Boolean(p.archived)} onSaved={(j) => { mutate(); setNotice(j.notice); }} />
          ))}
          {tab === "storico" && (
            <section style={{ ...card, padding: "14px 16px" }}>
              <DataTable columns={logCols} rows={logRows} defaultSort={{ key: "at", dir: -1 }} minWidth={720} maxHeight={560} empty="Nessuna modifica registrata." />
              <p style={{ fontSize: 12, color: CP.textMuted, margin: "8px 0 0" }}>Il codice fiscale non compare mai in chiaro nello storico. Si tengono le ultime 500 voci.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Panoramica: cosa manca nei dati + l'essenziale. */
function Overview({ p, onGo }) {
  const f = p.fields || {};
  const r = readiness(f);
  const GO = { document: "documenti", contract: "lavoro", referent: "lavoro", project: "lavoro", job: "lavoro" };
  const langs = (f.spokenLanguages || []).map((x) => String(x).replace(" - ", " ")).join(", ");
  const skills = Object.entries(normalizeSkillMap(f.skillLevels)).filter(([, lv]) => ["Esperto", "Posso insegnarla"].includes(lv)).map(([k]) => skillName(k)).slice(0, 4);
  const rows = [
    ["Telefono", f.personalPhone], ["Email", f.personalEmail],
    ["Vive a", f.residenceComune?.abroad ? [f.residenceComune.city, f.residenceComune.country].filter(Boolean).join(", ") : f.residenceComune?.name],
    ["Lingue", langs], ["Punti forti", skills.join(", ")], ["Partita IVA", f.partitaIva === true ? "Sì" : f.partitaIva === false ? "No" : null],
    ["Progetto", (f.progetto || []).join(", ") || (f.project || []).join(", ")], ["Referente", (f.referent || []).map((u) => u.name).join(", ")],
    ["Come ci ha conosciuto", f.source], ["Privacy", p.consent?.at ? `consenso il ${fmtDate(p.consent.at)}` : null],
  ].filter(([, v]) => v);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
      <section style={{ ...card, padding: "14px 16px" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{r.missing.length ? `Scheda completa per ${r.done} su ${r.total}` : "Scheda completa"}</h2>
        {READINESS.map((x) => {
          const ok = x.test(f);
          return (
            <div key={x.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14 }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, display: "grid", placeItems: "center", fontSize: 12, background: ok ? CP.accentGreen : "transparent", border: ok ? 0 : `1.5px solid ${CP.borderStrong || CP.border}`, color: "#fff" }}>{ok ? "✓" : ""}</span>
              <span style={{ flex: 1, color: ok ? CP.textSecondary : CP.textPrimary }}>{x.label.charAt(0).toUpperCase() + x.label.slice(1)}</span>
              {!ok && <button type="button" onClick={() => onGo(GO[x.key])} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>Aggiungi →</button>}
            </div>
          );
        })}
        <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Solo i dati della scheda: le procedure d'ingresso restano su ClickUp.</p>
      </section>
      <section style={{ ...card, padding: "14px 16px" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>In breve</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 14px", margin: 0, fontSize: 14 }}>
          {rows.map(([k, v]) => <Fragment key={k}><dt style={{ color: CP.textMuted }}>{k}</dt><dd style={{ margin: 0, color: CP.textPrimary, minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd></Fragment>)}
        </dl>
      </section>
    </div>
  );
}

function PhasePill({ phase }) {
  const tone = phase === "Attiva" ? [CP.accentGreen, "rgba(30,122,82,.10)"]
    : phase === "In ingresso" ? [CP.accentSoftText || CP.accent, CP.accentSoft]
    : phase === PHASE_EXITED ? [CP.textMuted, CP.surfaceAlt] : [CP.attn, CP.surfaceAlt];
  return <span style={{ display: "inline-block", fontSize: 12.5, padding: "2px 9px", borderRadius: 999, color: tone[0], background: tone[1], whiteSpace: "nowrap" }}>{phase || "senza fase"}</span>;
}

/** Esito di "Segna come uscita" / "Riattiva", con quello che è successo su ClickUp. */
function phaseNotice(j, okText) {
  const s = j?.sync;
  if (s?.status === "error") return { ok: false, text: `${okText} Su ClickUp non è arrivato: ${s.message}` };
  if (s?.status === "partial") return { ok: false, text: `${okText} Su ClickUp in parte: ${(s.errors || []).join("; ")}` };
  return { ok: true, text: okText };
}

function Section({ title, keys, person, options, crypto, onSaved, locked, incoming = [] }) {
  const all = keys.map((k) => FIELD_BY_KEY[k]).filter(Boolean);
  const [showEmpty, setShowEmpty] = useState(false);
  const isEmpty = (f) => { const v = person.fields?.[f.key]; if (f.type === "cf") return !person.hasCf; return v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length); };
  const emptyCount = all.filter(isEmpty).length;
  const editable = locked ? [] : all.filter((f) => !f.readOnly);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [cf, setCf] = useState(null);

  const start = () => {
    const d = {};
    for (const f of editable) d[f.key] = f.type === "cf" ? "" : person.fields?.[f.key] ?? (f.type === "labels" ? [] : null);
    setDraft(d); setErr(null); setEditing(true);
  };
  const save = async () => {
    const body = {};
    for (const f of editable) {
      const v = draft[f.key];
      if (f.type === "cf") { if (String(v || "").trim()) body[f.key] = v; continue; }
      if (JSON.stringify(v ?? null) !== JSON.stringify(person.fields?.[f.key] ?? (f.type === "labels" ? [] : null))) body[f.key] = v;
    }
    if (!Object.keys(body).length) { setEditing(false); return; }
    setBusy(true); setErr(null);
    try {
      const j = await postJson(`/api/admin/hr/people/${person.id}`, body, "PATCH");
      setEditing(false);
      const s = j.sync;
      const text = [j.cfNote, s?.status === "error" ? `Salvato in HOC Pro, ma ClickUp non ha risposto: ${s.message}` : s?.status === "partial" ? `Salvato. Su ClickUp: ${s.errors.join("; ")}` : s?.status === "off" ? "Salvato in HOC Pro (sincronizzazione spenta)." : "Salvato."].filter(Boolean).join(" ");
      onSaved({ notice: { ok: !j.cfNote && s?.status !== "error" && s?.status !== "partial", text } });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reveal = async () => {
    try { const j = await postJson(`/api/admin/hr/people/${person.id}/reveal-cf`, {}); setCf(j.value); } catch (e) { setErr(e.message); }
  };

  return (
    <section style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <SectionTitle aside={keys.includes("idDocument") ? "riferimenti salvati dalla scheda" : null}>{keys.includes("idDocument") ? "Riferimenti" : title}</SectionTitle>
        {!editing && editable.length > 0 && (
          <button type="button" onClick={start} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, flexShrink: 0 }}><Pencil size={13} /> Modifica</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "12px 18px" }}>
        {(editing || showEmpty ? all : all.filter((f) => !isEmpty(f))).map((f) => (
          <div key={f.key} style={{ minWidth: 0, gridColumn: ["labels", "longtext", "skillmap", "roles"].includes(f.type) ? "1 / -1" : undefined }}>
            <span id={`hr-${f.key}-l`} style={lbl}>{f.label}{f.readOnly && f.cu ? <span style={{ color: CP.textMuted }}> · da ClickUp</span> : null}{person.mirrorStale?.includes(f.key) ? <span style={{ color: CP.attn }}> · su ClickUp c'è un testo non riconosciuto</span> : null}</span>
            {editing && !f.readOnly ? (
              f.type === "cf" && !crypto ? <span style={{ fontSize: 13, color: CP.textMuted }}>Non modificabile: manca la chiave di cifratura.</span> : (
                <>
                  <FieldInput id={`hr-${f.key}`} field={f} value={draft[f.key]} options={options[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
                  {f.type === "cf" && <span style={{ fontSize: 12, color: CP.textMuted }}>Lascia vuoto per non cambiarlo.</span>}
                </>
              )
            ) : f.type === "cf" ? (
              <span style={{ fontSize: 14, color: CP.textPrimary, display: "inline-flex", gap: 8, alignItems: "center" }}>
                {cf || person.cfMasked || (person.hasCf ? (person.cfUnreadable ? "presente (illeggibile senza chiave)" : "presente") : <span style={{ color: CP.textMuted }}>—</span>)}
                {person.hasCf && !cf && crypto && <button type="button" onClick={reveal} style={{ ...btnGhost, padding: "3px 8px", fontSize: 12 }}><Eye size={12} /> Mostra</button>}
              </span>
            ) : (
              <span style={{ fontSize: 14, color: CP.textPrimary }}>
                {displayValue(f, person.fields?.[f.key])}
                {f.type === "fileRef" && incoming.some((x) => x.key === f.key) && (
                  <span style={{ display: "block", fontSize: 12, color: CP.textSecondary, marginTop: 2 }}>
                    {f.key === "idDocument" ? "Documento in arrivo" : "File in arrivo"}: ricevuto dal modulo, in attesa di arrivare su ClickUp
                  </span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
      {!editing && emptyCount > 0 && (
        <button type="button" onClick={() => setShowEmpty(!showEmpty)} style={{ background: "none", border: 0, padding: 0, marginTop: 12, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>
          {showEmpty ? "Nascondi i campi vuoti" : `Mostra i campi vuoti (${emptyCount})`}
        </button>
      )}
      {keys.includes("codiceFiscale") && cf && <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Hai visto il codice fiscale in chiaro: è registrato nello storico.</p>}
      {editing && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>{busy ? "Salvo…" : "Salva"}</button>
          <button type="button" onClick={() => setEditing(false)} style={btnGhost}>Annulla</button>
          {err && <span style={{ color: CP.accentRed, fontSize: 13 }}>{err}</span>}
        </div>
      )}
      {!editing && err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </section>
  );
}

const fmtSize = (b) => (!b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const KIND_LABEL = { id: "Documento d'identità", contract: "Contratto", cv: "CV", other: "Altro" };

/** Tutti i file del task ClickUp (18/10/2026): letti a ogni apertura, si aprono e si caricano anche da qui. */
function DocumentsCard({ person }) {
  const url = `/api/admin/hr/people/${person.id}/documents`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const docs = data?.documents || [];
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("Si caricano solo PDF, JPG o PNG.");
      let j;
      if (data?.bigUpload) {
        // fino a 50 MB: dal browser al Blob privato, poi il server lo porta su ClickUp (come il modulo)
        if (file.size > 50 * 1024 * 1024) throw new Error("File oltre 50 MB.");
        const post = async (body) => {
          const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const out = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(out.error || `Errore ${r.status}`);
          return out;
        };
        const slot = await post({ type: "slot", filename: file.name, contentType: file.type, size: file.size });
        const { upload } = await import("@vercel/blob/client");
        await upload(slot.pathname, file, { access: "private", handleUploadUrl: url, contentType: file.type, multipart: file.size > 20e6 });
        j = await post({ type: "finish", pathname: slot.pathname });
      } else {
        if (file.size > 4 * 1024 * 1024) throw new Error("File oltre 4 MB: qui il caricamento grande non è attivo, caricalo sul task ClickUp.");
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(url, { method: "POST", body: fd });
        j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
      }
      setMsg({ ok: true, text: `Caricato su ClickUp: ${j.name}` });
      await mutate();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <section style={{ ...card, padding: "14px 16px", marginBottom: 14 }} aria-labelledby="hr-docs-h">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="hr-docs-h" style={{ margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Documenti{docs.length ? <span style={{ color: CP.textMuted, fontWeight: 400 }}> · {docs.length}</span> : null}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: CP.textMuted }}>Sono i file del task su ClickUp: quello che si aggiunge lì compare qui, quello che carichi qui va lì.</p>
        </div>
        {!person.archived && person.clickupTaskId && (
          <label style={{ ...btnGhost, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            <Upload size={14} /> {busy ? "Carico…" : "Carica documento"}
            <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} style={{ display: "none" }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {msg && <div style={{ marginTop: 10 }}><Notice danger={!msg.ok}>{msg.text}</Notice></div>}
      {error && <div style={{ marginTop: 10 }}><Notice danger>{error.message || "Non riesco a leggere i documenti da ClickUp."}</Notice></div>}
      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14, marginTop: 10 }}>Leggo i documenti da ClickUp…</div>}
      {data?.reason && <p style={{ fontSize: 14, color: CP.textSecondary, margin: "10px 0 0" }}>{data.reason}</p>}
      {data && !data.reason && !docs.length && <p style={{ fontSize: 14, color: CP.textSecondary, margin: "10px 0 0" }}>Nessun documento sul task.</p>}
      {docs.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {docs.map((d) => {
            const href = `${url}/${encodeURIComponent(d.id)}`;
            return (
              <li key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}`, flexWrap: "wrap" }}>
                <FileText size={16} aria-hidden="true" style={{ color: CP.textMuted, flex: "0 0 auto" }} />
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary, fontSize: 14, textDecoration: "none", overflowWrap: "anywhere" }}>{d.title}</a>
                  <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>
                    {[KIND_LABEL[d.kind], d.field ? `campo «${d.field}»` : null, d.date ? fmtDate(d.date) : null, fmtSize(d.size)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <a href={`${href}?download=1`} style={{ ...btnGhost, padding: "4px 9px", fontSize: 12 }} aria-label={`Scarica ${d.title}`}><Download size={13} /> Scarica</a>
              </li>
            );
          })}
        </ul>
      )}
      <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Carichi qui PDF, JPG o PNG fino a {data?.bigUpload === false ? "4" : "50"} MB. Chi apre un documento resta scritto nello storico.</p>
    </section>
  );
}
