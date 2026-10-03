"use client";

/**
 * /admin/hr/sync — stato della sincronizzazione Centro HR ↔ ClickUp (SEED).
 *
 * Risponde a "funziona?": lista configurata (mai un default verso la lista
 * reale), token, chiave del codice fiscale, webhook registrato, ultimo
 * import, conflitti recenti, campi attesi vs presenti sulla lista.
 * Comandi: Importa ora, Registra webhook.
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw, Webhook } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Notice, DataTable, SectionTitle, Disclosure, Metric, card } from "@/components/ds";
import { FIELD_BY_KEY, PHASE_LABELS, taskStatusNamesFor } from "@/lib/hr-fields";
import { btnPrimary, btnGhost, SYNC_LABEL, fmtDateTime, fetcher, postJson } from "@/components/hr-ui";

function Row({ ok, label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, alignItems: "baseline", flexWrap: "wrap" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: ok === true ? CP.accentGreen : ok === false ? CP.accentRed : CP.textMuted, alignSelf: "center" }} />
      <span style={{ width: 190, flexShrink: 0, fontSize: 14, color: CP.textPrimary }}>{label}</span>
      <span style={{ flex: "1 1 300px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

/** Quali fasi hanno uno stato del task sulla lista (nome italiano o inglese). Senza, lo stato del task non si tocca. */
function PhaseStatusesRow({ statuses }) {
  const have = new Set(statuses.map((x) => String(x).trim().toLowerCase()));
  const found = PHASE_LABELS.filter((ph) => taskStatusNamesFor(ph).some((n) => have.has(n.toLowerCase())));
  const missing = PHASE_LABELS.filter((ph) => !found.includes(ph));
  return (
    <Row ok={missing.length === 0 ? true : found.length ? false : null} label="Stati del task">
      {missing.length === 0
        ? "la lista ha uno stato per ognuna delle 5 fasi: fase e stato del task restano allineati"
        : found.length
          ? <>mancano gli stati per: {missing.join(", ")}. Per queste fasi lo stato del task non si aggiorna (vale la tendina).</>
          : "la lista non ha stati con i nomi delle fasi: la fase si legge e si scrive solo dalla tendina «Collaboration Status»"}
    </Row>
  );
}

// Documenti dal modulo (03/10/2026): in transito sul Blob privato, poi su ClickUp.
const KIND_LABEL = { document: "Documento d'identità", cv: "CV" };
function UploadsBlock({ u }) {
  return (
    <>
      {u.failed?.length > 0 && (
        <Notice danger>
          {u.failed.length === 1 ? "Un documento caricato dal modulo non è arrivato" : `${u.failed.length} documenti caricati dal modulo non sono arrivati`} su ClickUp negli ultimi 30 giorni. Chiedi alla persona di ricaricarlo (il file non è più nel transito).
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {u.failed.slice(0, 10).map((f, i) => (
              <li key={`${f.at}-${i}`}>
                {KIND_LABEL[f.kind] || "File"} · {fmtDateTime(f.at)} · <Link href={`/admin/hr/${f.personId}`} style={{ color: CP.accentSoftText }}>apri la scheda</Link> · {f.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Metric label="Documenti in arrivo" value={fmtInt(u.pending || 0)} note={u.oldestAt ? `il più vecchio dal ${fmtDateTime(u.oldestAt)}` : "nessuno in coda"} danger={Boolean(u.oldestAt && Date.now() - u.oldestAt > 24 * 3600 * 1000)} />
        <span style={{ fontSize: 13, color: CP.textMuted, maxWidth: 520 }}>
          {u.blob
            ? "I file del modulo passano per pochi istanti da uno spazio temporaneo privato (Vercel Blob, Europa) e si cancellano appena arrivano su ClickUp. Se ClickUp non risponde restano in coda e si riprovano; di notte si cancellano i file abbandonati da più di 24 ore."
            : "Spazio temporaneo per i documenti non configurato (BLOB_READ_WRITE_TOKEN): il caricamento dei documenti dal modulo è spento."}
        </span>
      </section>
    </>
  );
}

export default function HrSyncPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/hr/sync", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const run = async (action) => {
    if (action === "register_webhook" && !confirm(`Registro il webhook verso ${data?.webhookEndpoint}? Se ce n'era già uno viene sostituito.`)) return;
    setBusy(action); setMsg(null);
    try {
      const j = await postJson("/api/admin/hr/sync", { action });
      if (action === "import") {
        setMsg(j.skipped ? { ok: false, text: j.reason } : { ok: !j.errors?.length, text: `Import fatto: ${j.tasks} task letti, ${j.created} persone nuove, ${j.updated} aggiornate, ${j.unchanged} invariate, ${j.pushedBack} campi rimandati a ClickUp${j.createdOnClickup ? `, ${j.createdOnClickup} schede create su ClickUp` : ""}${j.deferred ? `, ${j.deferred} rimandate al prossimo giro` : ""}${j.errors?.length ? `. ${j.errors.length} errori.` : "."}` });
      } else {
        setMsg({ ok: true, text: "Webhook registrato: da ora le modifiche su ClickUp arrivano qui in pochi secondi." });
      }
      await mutate();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };

  const c = data?.config;
  const li = data?.lastImport;
  const missingFields = (data?.fields || []).filter((f) => !f.present && !f.extra);
  const fieldRows = (data?.fields || []).map((f) => ({ ...f, id: f.key }));
  const conflictRows = (data?.conflicts || []).map((x, i) => ({ ...x, id: `${x.at}-${i}` }));

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1100, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Persone HR", href: "/admin/hr" }, { label: "Sincronizzazione ClickUp" }]}
        title="Sincronizzazione ClickUp"
        subtitle="HOC Pro è la fonte principale; la lista HR su ClickUp ne è lo specchio. Qui vedi se il collegamento funziona e lo fai ripartire."
        actions={c?.enabled && (
          <>
            <button type="button" onClick={() => run("register_webhook")} disabled={Boolean(busy)} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}><Webhook size={14} /> {busy === "register_webhook" ? "Registro…" : "Registra webhook"}</button>
            <button type="button" onClick={() => run("import")} disabled={Boolean(busy)} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}><RefreshCw size={14} /> {busy === "import" ? "Importo…" : "Importa ora"}</button>
          </>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a leggere lo stato: ${error.message}`}</Notice>}
      {msg && <Notice danger={!msg.ok}>{msg.text}</Notice>}
      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && (
        <>
          {!c.enabled && (
            <Notice>
              La sincronizzazione è <b>spenta</b>. Per accenderla imposta nelle variabili d'ambiente <code>HR_CLICKUP_LIST_ID</code> con l'id della lista «✅ New CRM» (901222719267; non c'è nessun valore predefinito: senza, niente parte verso ClickUp) e verifica che <code>CLICKUP_API_TOKEN</code> ci sia.
            </Notice>
          )}
          {c.isRealList && <Notice danger>La lista configurata è il <b>CRM vecchio</b> (901212383318), non «✅ New CRM»: dal 03/10/2026 il CRM attivo è New CRM e il vecchio resta solo come archivio. Ogni salvataggio e ogni import toccherebbero i task del vecchio.</Notice>}

          <section style={{ ...card, padding: "6px 16px 8px", marginBottom: 14 }}>
            <Row ok={Boolean(c.listId)} label="Lista ClickUp">
              {c.listId ? <>id <code>{c.listId}</code>{data.list ? <> · «{data.list.name}»</> : null}{data.listError ? <span style={{ color: CP.accentRed }}> · non leggibile: {data.listError}</span> : null}</> : "non impostata (HR_CLICKUP_LIST_ID)"}
            </Row>
            <Row ok={c.token} label="Token ClickUp">{c.token ? "presente (CLICKUP_API_TOKEN)" : "assente (CLICKUP_API_TOKEN)"}</Row>
            <Row ok={data.crypto} label="Chiave codice fiscale">{data.crypto ? "presente: i codici fiscali si salvano cifrati" : "assente (HR_ENCRYPTION_KEY): i codici fiscali non si salvano, il resto sì"}</Row>
            <Row ok={data.webhook ? data.webhook.sameList && !(data.webhook.missingEvents || []).length : c.enabled ? false : null} label="Webhook">
              {data.webhook ? (
                <>registrato il {fmtDateTime(data.webhook.at)} verso <code>{data.webhook.endpoint}</code>{!data.webhook.sameList && <span style={{ color: CP.accentRed }}> · è su un'altra lista ({data.webhook.listId}): registralo di nuovo</span>}{data.webhook.sameList && (data.webhook.missingEvents || []).length > 0 && <span style={{ color: CP.accentRed }}> · registrato prima che l'app seguisse lo stato del task: i cambi di stato fatti su ClickUp arrivano solo di notte. Registralo di nuovo</span>}</>
              ) : (
                <>non registrato: le modifiche fatte su ClickUp arrivano solo con l'import (a mano o di notte). Verrà registrato verso <code>{data.webhookEndpoint}</code>.</>
              )}
            </Row>
            <Row ok={li ? li.ok !== false && !li.fatal : null} label="Ultimo import">
              {li ? (
                <>{fmtDateTime(li.at)} ({li.mode === "reconcile" ? "notturno" : "a mano"}) · {li.tasks} task · {li.created} nuove · {li.updated} aggiornate · {li.pushedBack} campi rimandati · {li.missingOnClickup} task spariti{li.fatal ? <span style={{ color: CP.accentRed }}> · fermato: {li.fatal}</span> : null}{li.errors?.length ? <span style={{ color: CP.accentRed }}> · {li.errors.length} errori</span> : null}</>
              ) : "mai eseguito"}
            </Row>
            {data.list && <PhaseStatusesRow statuses={data.list.statuses || []} />}
            <Row ok={null} label="Riconciliazione notturna">{c.enabled ? "ogni notte dal dispatcher (03:00 UTC): import completo + campi rimasti in sospeso" : "spenta finché la lista non è impostata"}</Row>
          </section>

          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Schede in HOC Pro" value={fmtInt(data.people.total)} />
            <Metric label="Allineate" value={fmtInt(data.people.bySync.ok || 0)} />
            <Metric label="Con campi in sospeso" value={fmtInt(data.people.pending)} note="riprovati di notte" />
            <Metric label="Con problemi" value={fmtInt((data.people.bySync.error || 0) + (data.people.bySync.partial || 0) + (data.people.bySync.deleted || 0) + (data.people.bySync.missing || 0))} danger={Boolean(data.people.bySync.error || data.people.bySync.missing)} />
            <Metric label="Archiviate" value={fmtInt(data.people.archived || 0)} note="non si sincronizzano" />
          </section>
          {Object.keys(data.people.bySync).length > 0 && (
            <p style={{ fontSize: 13, color: CP.textMuted, margin: "-6px 0 14px" }}>
              {Object.entries(data.people.bySync).map(([k, n]) => `${SYNC_LABEL[k] || k}: ${n}`).join(" · ")} · <Link href="/admin/hr" style={{ color: CP.accentSoftText }}>vai all'elenco</Link>
            </p>
          )}

          {data.uploads && <UploadsBlock u={data.uploads} />}

          {data.fields && (
            <Disclosure open={fieldsOpen} onToggle={() => setFieldsOpen(!fieldsOpen)} title="Campi della lista"
              summary={missingFields.length ? `${missingFields.length} campi attesi non trovati sulla lista` : "tutti i campi attesi ci sono"}>
              <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
                I campi si riconoscono per NOME. I quattro campi nuovi (codice fiscale, documento, partita IVA, mansione attuale) se mancano sulla lista finiscono in fondo alla descrizione del task, nel blocco «— Dati HOC Pro —» (il codice fiscale lì solo mascherato).
                I sette campi di testo (luogo di nascita, comune, CAP, competenze e livello, ruoli già ricoperti, vorrebbe imparare, altro che sa fare) si modificano da tutte e due le parti: se su ClickUp un testo non si riesce a leggere, HOC Pro tiene il suo valore e lo scrive nello storico della scheda.
              </p>
              <DataTable minWidth={520} rows={fieldRows} columns={[
                { key: "name", label: "Campo ClickUp" },
                { key: "key", label: "In HOC Pro", render: (f) => FIELD_BY_KEY[f.key]?.label || f.key, muted: true },
                { key: "present", label: "Sulla lista", sort: (f) => (f.present ? 1 : 0), render: (f) => (f.present ? `sì (${f.type})` : f.extra ? <span style={{ color: CP.textMuted }}>no · va nel blocco in descrizione</span> : <span style={{ color: CP.accentRed }}>no</span>) },
              ]} />
            </Disclosure>
          )}

          <SectionTitle aside="vince l'ultima modifica per campo; qui i casi in cui HOC Pro era più recente">Conflitti recenti</SectionTitle>
          <DataTable minWidth={640} rows={conflictRows} empty="Nessun conflitto registrato." columns={[
            { key: "at", label: "Quando", render: (x) => fmtDateTime(x.at) },
            { key: "personId", label: "Persona", render: (x) => <Link href={`/admin/hr/${x.personId}`} style={{ color: CP.textPrimary }}>apri scheda</Link>, sortable: false },
            { key: "field", label: "Campo", render: (x) => FIELD_BY_KEY[x.field]?.label || x.field },
            { key: "clickupValue", label: "Valore su ClickUp", render: (x) => x.clickupValue ?? "vuoto", muted: true },
            { key: "appValue", label: "Tenuto (HOC Pro)", render: (x) => x.appValue ?? "vuoto" },
          ]} />
        </>
      )}
    </div>
  );
}
