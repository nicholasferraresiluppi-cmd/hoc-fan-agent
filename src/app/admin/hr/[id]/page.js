"use client";

/**
 * /admin/hr/[id] — scheda persona del Centro HR (SEED).
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
 */
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ExternalLink, RefreshCw, Eye, Pencil } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, DataTable, SectionTitle, Disclosure, card } from "@/components/ds";
import { FIELDS, SECTIONS, FIELD_BY_KEY, PHASE_EXITED } from "@/lib/hr-fields";
import { lbl, btnPrimary, btnGhost, SYNC_LABEL, displayValue, FieldInput, fmtDate, fmtDateTime, fetcher, postJson } from "@/components/hr-ui";
import { RestoreButton, archivedSummary } from "@/components/hr-archive";
import { ExitButton, ReactivateButton } from "@/components/hr-phase";

const ACTION_LABEL = {
  create: "Scheda creata", update: "Modifica", conflict: "Conflitto con ClickUp", cf_revealed: "Codice fiscale mostrato",
  form_link: "Link di compilazione creato", consent: "Consenso privacy", upload: "File caricato", sync_error: "Errore di sincronizzazione",
  clickup_deleted: "Task cancellato su ClickUp", echo_ignored: "Eco di una nostra scrittura (ignorata)", cf_skipped: "Codice fiscale non importato",
  archived: "Scheda archiviata", restored: "Scheda ripristinata", task_trashed: "Task nel cestino di ClickUp",
  task_delete_queued: "Cancellazione del task in coda", mirror_unrecognized: "Testo di ClickUp non riconosciuto",
};
const SOURCE_LABEL = { app: "HOC Pro", clickup: "ClickUp", modulo: "Modulo della persona", sistema: "Sistema" };
const who = (by) => (!by ? "—" : String(by).startsWith("user_") ? `utente …${String(by).slice(-6)}` : by);

export default function HrPersonPage() {
  const { id } = useParams();
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/admin/hr/people/${id}` : null, fetcher, { revalidateOnFocus: false });
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [logOpen, setLogOpen] = useState(true);
  const p = data?.person;

  const syncNow = async () => {
    setSyncing(true); setNotice(null);
    try {
      const j = await postJson(`/api/admin/hr/people/${id}/sync`, {});
      setNotice({ ok: j.ok, text: j.ok ? "Scheda riportata su ClickUp." : `Sincronizzazione non riuscita: ${j.message || j.status}` });
      await mutate();
    } catch (e) { setNotice({ ok: false, text: e.message }); } finally { setSyncing(false); }
  };

  const logRows = (data?.log || []).map((r, i) => ({ ...r, id: `${r.at}-${i}` }));
  const logCols = [
    { key: "at", label: "Quando", render: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.at)}</span> },
    { key: "source", label: "Da dove", render: (r) => SOURCE_LABEL[r.source] || r.source, muted: true },
    { key: "by", label: "Chi", render: (r) => who(r.by), muted: true },
    { key: "action", label: "Cosa", render: (r) => <span>{ACTION_LABEL[r.action] || r.action}{r.field ? <span style={{ color: CP.textMuted }}> · {FIELD_BY_KEY[r.field]?.label || r.field}</span> : null}</span> },
    { key: "change", label: "Da → a", sortable: false, render: (r) => (r.from == null && r.to == null ? "" : <span style={{ fontSize: 13 }}><span style={{ color: CP.textMuted }}>{r.from ?? "vuoto"}</span> → {r.to ?? "vuoto"}</span>) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1100, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Persone HR", href: "/admin/hr" }, { label: p?.name || "Scheda" }]}
        title={p?.name || (isLoading ? "Caricamento…" : "Scheda")}
        subtitle={p ? [p.fields?.currentJob, p.fields?.collaborationStatus].filter(Boolean).join(" · ") || null : null}
        actions={p && !p.archived && (
          <>
            {p.clickupUrl && p.clickupTaskId && <a href={p.clickupUrl} target="_blank" rel="noopener noreferrer" style={btnGhost}><ExternalLink size={14} /> Apri su ClickUp</a>}
            {data.sync?.enabled && <button type="button" onClick={syncNow} disabled={syncing} style={{ ...btnGhost, opacity: syncing ? 0.5 : 1 }}><RefreshCw size={14} /> {syncing ? "Sincronizzo…" : "Sincronizza ora"}</button>}
            {p.fields?.collaborationStatus === PHASE_EXITED
              ? <ReactivateButton person={p} onDone={(j) => { setNotice(phaseNotice(j, "Fase riportata ad Attiva.")); mutate(); }} />
              : <ExitButton person={p} onDone={(j) => { setNotice(phaseNotice(j, `Segnata come uscita, fine collaborazione il ${fmtDate(j.person?.fields?.endDate)}.`)); mutate(); }} />}
          </>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : error.status === 404 ? <>Scheda non trovata. <Link href="/admin/hr" style={{ color: CP.accentSoftText }}>Torna all'elenco</Link></> : `Non riesco a caricare la scheda: ${error.message}`}</Notice>}
      {notice && <Notice danger={!notice.ok}>{notice.text}</Notice>}

      {p?.archived && (
        <section style={{ ...card, padding: "14px 16px", marginBottom: 14, borderLeft: `3px solid ${CP.attn}` }} aria-labelledby="hr-archived-h">
          <h2 id="hr-archived-h" style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Scheda archiviata</h2>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: CP.textSecondary }}>{archivedSummary(p)}.</p>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>
            Il suo task su ClickUp è stato cancellato: la scheda non si sincronizza e qui si legge soltanto. Non si cancella mai: la tieni così o la ripristini.
            Da procedura chi va via non si elimina, si segna «{PHASE_EXITED}».
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <RestoreButton person={p} onDone={(j) => { setNotice({ ok: true, text: j.sync?.status === "ok" ? "Scheda ripristinata e riportata su ClickUp." : `Scheda ripristinata. ${j.sync?.message || ""}`.trim() }); mutate(); }} />
          </div>
        </section>
      )}

      {p && (
        <>
          <PhaseCard p={p} />
          {!p.archived && <SyncCard p={p} enabled={data.sync?.enabled} />}

          {data.flags?.includes("spazzatura") && <Notice>Scheda quasi vuota (nome di 1-2 lettere, nessuna email). In HOC Pro non si elimina: se è un task di prova o sbagliato, sistemalo su ClickUp (se cancelli il task, qui la scheda va tra le Archiviate).</Notice>}
          {data.duplicates && (
            <Notice>
              Possibile doppione (stesso {data.duplicates.reasons.join(" + ")}) di{" "}
              {data.duplicates.others.map((o, i) => <span key={o.id}>{i > 0 && ", "}<Link href={`/admin/hr/${o.id}`} style={{ color: CP.accentSoftText }}>{o.name}</Link></span>)}.
              Decidi quale tenere e sistema il doppione su ClickUp: se cancelli lì il task in più, qui la sua scheda va tra le Archiviate.
            </Notice>
          )}

          {SECTIONS.map((s) => (
            <Section key={s.key} section={s} person={p} options={data.options || {}} crypto={data.crypto} locked={Boolean(p.archived)} onSaved={(j) => { mutate(); setNotice(j.notice); }} />
          ))}

          <Disclosure open={logOpen} onToggle={() => setLogOpen(!logOpen)} title="Storico modifiche" summary={`${logRows.length} voci`}>
            <DataTable columns={logCols} rows={logRows} defaultSort={{ key: "at", dir: -1 }} minWidth={720} maxHeight={480} empty="Nessuna modifica registrata." />
            <p style={{ fontSize: 12, color: CP.textMuted, margin: "8px 0 0" }}>Il codice fiscale non compare mai in chiaro nello storico. Si tengono le ultime 500 voci.</p>
          </Disclosure>
        </>
      )}

    </div>
  );
}

/** Esito di "Segna come uscita" / "Riattiva", con quello che è successo su ClickUp. */
function phaseNotice(j, okText) {
  const s = j?.sync;
  if (s?.status === "error") return { ok: false, text: `${okText} Su ClickUp non è arrivato: ${s.message}` };
  if (s?.status === "partial") return { ok: false, text: `${okText} Su ClickUp in parte: ${(s.errors || []).join("; ")}` };
  return { ok: true, text: okText };
}

/** Fase della persona e stato del contratto: due assi separati, affiancati. */
function PhaseCard({ p }) {
  const phase = p.fields?.collaborationStatus;
  const contract = p.fields?.hvContractStatus;
  const exited = phase === PHASE_EXITED;
  const item = (label, value, note) => (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: value ? CP.textPrimary : CP.textMuted }}>{value || "Non indicato"}</div>
      {note && <div style={{ fontSize: 12, color: CP.textMuted }}>{note}</div>}
    </div>
  );
  return (
    <section aria-label="Fase e contratto" style={{ ...card, padding: "14px 16px", marginBottom: 14, display: "flex", gap: 32, flexWrap: "wrap" }}>
      {item("Fase", phase, phase === "Da verificare" ? "arrivata da ClickUp: scegli una fase nella sezione Rapporto" : exited && p.fields?.endDate ? `fine collaborazione il ${fmtDate(p.fields.endDate)}` : null)}
      {item("Stato del contratto", contract, null)}
    </section>
  );
}

function SyncCard({ p, enabled }) {
  const st = p.sync?.status || "pending";
  const bad = ["error", "deleted", "missing"].includes(st);
  return (
    <section style={{ ...card, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: st === "ok" ? CP.accentGreen : bad ? CP.accentRed : CP.textMuted }} />
        <span style={{ color: CP.textPrimary }}>ClickUp: {SYNC_LABEL[st] || st}</span>
      </span>
      {p.sync?.at && <span style={{ color: CP.textMuted }}>ultimo tentativo {fmtDateTime(p.sync.at)}</span>}
      {p.sync?.message && <span style={{ color: bad ? CP.accentRed : CP.textSecondary }}>{p.sync.message}</span>}
      {(p.pendingKeys || []).length > 0 && enabled && <span style={{ color: CP.textSecondary }}>{p.pendingKeys.length} campi in attesa di arrivare su ClickUp</span>}
      {p.consent?.at && <span style={{ color: CP.textMuted }}>consenso privacy il {fmtDateTime(p.consent.at)} (v. {p.consent.version})</span>}
      {(p.sync?.skipped || []).length > 0 && (
        <details style={{ flexBasis: "100%", fontSize: 13, color: CP.textSecondary }}>
          <summary style={{ cursor: "pointer" }}>{p.sync.skipped.length} campi non scritti su ClickUp e perché</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {p.sync.skipped.map((x, i) => <li key={i}>{FIELD_BY_KEY[x.key]?.label || x.key}: {x.reason}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function Section({ section, person, options, crypto, onSaved, locked }) {
  const fields = FIELDS.filter((f) => f.section === section.key);
  const editable = locked ? [] : fields.filter((f) => !f.readOnly);
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
        <SectionTitle aside={section.key === "documenti" ? "i file stanno su ClickUp, qui solo i riferimenti" : null}>{section.label}</SectionTitle>
        {!editing && editable.length > 0 && (
          <button type="button" onClick={start} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, flexShrink: 0 }}><Pencil size={13} /> Modifica</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "12px 18px" }}>
        {fields.map((f) => (
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
              <span style={{ fontSize: 14, color: CP.textPrimary }}>{displayValue(f, person.fields?.[f.key])}</span>
            )}
          </div>
        ))}
      </div>
      {section.key === "anagrafica" && cf && <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 0" }}>Hai visto il codice fiscale in chiaro: è registrato nello storico.</p>}
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
