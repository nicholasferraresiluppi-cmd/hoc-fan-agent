"use client";

/**
 * /admin/hr/contratti — controllo contratti (SEED, 09/10/2026).
 *
 * Richiesta di Nicholas: il CRM deve dire, chiaro e cristallino, chi ha il contratto,
 * chi no e chi sta cambiando mansione. Si legge dall'alto: prima quello che va fatto
 * (mansione cambiata, senza contratto, risolti), poi quello in corso (in firma), poi
 * i contratti che non hanno ancora una scheda (da collegare a mano), infine chi è a posto.
 *
 * I contratti arrivano da Dropbox Sign (ogni notte, o con «Aggiorna adesso»); lo stato
 * si calcola dalla mansione scritta nella scheda, quindi cambia subito quando la si modifica.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, DataTable, SectionTitle, card } from "@/components/ds";
import { FLAG_LABEL, KIND_LABEL, PERSONNEL_KINDS, statusSentence } from "@/lib/hr-contracts-core";
import { btnPrimary, btnGhost, input, fetcher, postJson, fmtDate, fmtDateTime } from "@/components/hr-ui";
import { ContractPill, FLAG_TONE, PrepareLink } from "@/components/hr-contracts-ui";

const SIX_MONTHS = 183 * 86400e3;

export default function HrContractsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/hr/contracts", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showAllUnmatched, setShowAllUnmatched] = useState(false);
  const [showOk, setShowOk] = useState(false);
  const v = data?.view;

  const groups = useMemo(() => {
    const g = {};
    if (!v) return g;
    for (const [pid, st] of Object.entries(v.persons)) (g[st.flag] ||= []).push({ id: pid, name: v.names[pid], st, ...data.phases[pid] });
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.name.localeCompare(b.name, "it"));
    return g;
  }, [v, data]);
  const count = (f) => (groups[f] || []).length;

  const unmatched = useMemo(() => {
    if (!v) return [];
    const all = v.unmatched.map((id) => v.contracts[id]);
    if (showAllUnmatched) return all;
    // di base: contratti del personale degli ultimi 6 mesi (i più vecchi sono quasi tutti di chi non c'è più)
    return all.filter((c) => PERSONNEL_KINDS.has(c.kind) && c.state !== "scaduto" && c.state !== "rifiutato" && Date.now() - (c.createdAt || 0) < SIX_MONTHS);
  }, [v, showAllUnmatched]);

  const sync = async () => {
    setBusy(true); setNotice(null);
    try {
      const j = await postJson("/api/admin/hr/contracts", { action: "sync" });
      const parts = [`${j.requests} contratti su Dropbox Sign`, j.classified ? `${j.classified} letti adesso` : null, j.statusSet ? `${j.statusSet} schede aggiornate` : null, j.attached ? `${j.attached} PDF allegati su ClickUp` : null].filter(Boolean);
      const more = (j.pending || 0) + (j.attachPending || 0);
      setNotice({ ok: !j.errors?.length, text: `Aggiornato: ${parts.join(", ")}.${more ? ` Ne restano ${more} da completare: premi di nuovo o ci pensa il giro di stanotte.` : ""}${j.errors?.length ? ` Problemi: ${j.errors.slice(0, 3).join("; ")}` : ""}` });
      await mutate();
    } catch (e) { setNotice({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const link = async (contractId, personId) => {
    try {
      await postJson("/api/admin/hr/contracts", { action: "link", contractId, personId });
      await mutate();
    } catch (e) { setNotice({ ok: false, text: e.message }); }
  };

  const personOptions = useMemo(() => (v ? Object.entries(v.names).sort((a, b) => a[1].localeCompare(b[1], "it")) : []), [v]);
  const byId = v?.contracts || {};
  const personCell = (r) => <Link href={`/admin/hr/${r.id}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{r.name}</Link>;
  const signedCell = (r) => { const c = byId[r.st.latestSigned]; return c ? <span>{c.role || KIND_LABEL[c.kind]}<div style={{ fontSize: 12, color: CP.textMuted }}>firmato il {fmtDate(c.signedAt || c.createdAt)}</div></span> : <span style={{ color: CP.textMuted }}>—</span>; };
  const mansCell = (r) => (r.mansioni || []).join(", ") || <span style={{ color: CP.textMuted }}>non indicata</span>;
  const prepCol = { key: "prep", label: "", sortable: false, render: (r) => <span onClick={(e) => e.stopPropagation()}><PrepareLink personId={r.id} /></span> };
  const whatCell = (r) => <span style={{ fontSize: 13, color: CP.textSecondary }}>{statusSentence(r.st, byId, fmtDate)}</span>;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1240, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Persone", href: "/admin/hr" }, { label: "Contratti" }]}
        title="Controllo contratti"
        subtitle="Chi ha il contratto, chi no e chi sta cambiando mansione. I contratti arrivano da Dropbox Sign, la mansione dalla scheda."
        actions={data?.configured && (
          <button type="button" onClick={sync} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}><RefreshCw size={15} /> {busy ? "Aggiorno… (fino a un minuto)" : "Aggiorna adesso"}</button>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : `Non riesco a caricare i contratti: ${error.message}`}</Notice>}
      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data && !data.configured && <Notice danger>Chiave di Dropbox Sign non configurata (DROPBOX_SIGN_API_KEY): i contratti non si possono leggere.</Notice>}
      {notice && <Notice danger={!notice.ok}>{notice.text}</Notice>}
      {v?.lastError && <Notice danger>Ultimo aggiornamento non riuscito ({fmtDateTime(v.lastError.at)}): {v.lastError.message}</Notice>}
      {data && !v?.syncedAt && data.configured && <Notice>Contratti non ancora letti: premi «Aggiorna adesso».</Notice>}

      {v?.syncedAt && (
        <>
          <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "0 0 12px" }}>
            {Object.keys(v.contracts).length} contratti su Dropbox Sign · aggiornato il {fmtDateTime(v.syncedAt)} · si aggiorna da solo ogni notte · i PDF firmati vengono allegati al task ClickUp della persona
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10, marginBottom: 18 }}>
            {[["cambiata", "da rifare"], ["mancante", "da trovare o fare"], ["risolto", "risolti, ancora in elenco"], ["in_firma", "inviati, non firmati"], ["cambiata_in_firma", "contratto nuovo partito"], ["da_verificare", "da controllare"], ["ok", "a posto"]].map(([f, hint]) => (
              <a key={f} href={`#${{ risolto: "mancante", cambiata_in_firma: "in_firma" }[f] || f}`} style={{ ...card, padding: "12px 14px", textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: 24, fontWeight: 500, color: count(f) && f !== "ok" ? FLAG_TONE[f][0] : CP.textPrimary }}>{count(f)}</div>
                <div style={{ fontSize: 13, color: CP.textPrimary }}>{FLAG_LABEL[f]}</div>
                <div style={{ fontSize: 12, color: CP.textMuted }}>{hint}</div>
              </a>
            ))}
          </div>

          <Group id="cambiata" title="Mansione cambiata: serve un contratto nuovo" rows={groups.cambiata}
            intro="La mansione scritta nel CRM non è coperta da nessun contratto firmato. O si prepara il contratto nuovo, o la mansione nel CRM è sbagliata e va corretta: in entrambi i casi questa riga sparisce da sola."
            columns={[{ key: "name", label: "Persona", sort: (r) => r.name, render: personCell }, { key: "crm", label: "Nel CRM", sortable: false, render: mansCell }, { key: "c", label: "Contratto firmato", sortable: false, render: signedCell }, { key: "phase", label: "Fase", sort: (r) => r.phase || "", render: (r) => r.phase || "—", muted: true }, prepCol]} />

          <Group id="mancante" title="Senza contratto" rows={[...(groups.mancante || []), ...(groups.risolto || [])]}
            intro="Nessun contratto su Dropbox Sign (o l'ultimo atto è una risoluzione). Se il contratto esiste ma è intestato in modo diverso, collegalo a mano qui sotto in «Contratti senza scheda»."
            columns={[{ key: "name", label: "Persona", sort: (r) => r.name, render: personCell }, { key: "f", label: "Stato", sort: (r) => r.st.flag, render: (r) => <ContractPill flag={r.st.flag} /> }, { key: "crm", label: "Mansione", sortable: false, render: mansCell }, { key: "phase", label: "Fase", sort: (r) => r.phase || "", render: (r) => r.phase || "—", muted: true }, prepCol]} />

          <Group id="in_firma" title="In attesa di firma" rows={[...(groups.in_firma || []), ...(groups.cambiata_in_firma || [])]}
            intro="Contratti inviati e non ancora firmati: quando la persona firma, la scheda si aggiorna da sola."
            columns={[{ key: "name", label: "Persona", sort: (r) => r.name, render: personCell }, { key: "f", label: "Stato", sortable: false, render: (r) => <ContractPill flag={r.st.flag} /> }, { key: "c", label: "Contratto", sortable: false, render: (r) => { const c = byId[r.st.pending[r.st.pending.length - 1]]; return c ? <span>{c.title}<div style={{ fontSize: 12, color: CP.textMuted }}>inviato il {fmtDate(c.createdAt)}</div></span> : "—"; } }]} />

          <Group id="da_verificare" title="Da controllare" rows={groups.da_verificare}
            intro="Contratto firmato, ma il confronto con la mansione non si può fare: la mansione nel CRM è vuota, oppure il documento non dice la mansione."
            columns={[{ key: "name", label: "Persona", sort: (r) => r.name, render: personCell }, { key: "w", label: "Perché", sortable: false, render: whatCell }]} />

          <section id="senza-scheda" style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
            <SectionTitle aside={`${unmatched.length}${showAllUnmatched ? "" : ` di ${v.unmatched.length}`}`}>Contratti senza scheda</SectionTitle>
            <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
              Contratti che non si abbinano da soli a nessuna scheda: nome scritto diversamente, omonimi, oppure persone che non hanno ancora compilato il modulo.
              {showAllUnmatched ? " Qui ci sono tutti, anche i vecchi e i non del personale." : " Di base: contratti del personale degli ultimi 6 mesi."}{" "}
              <button type="button" onClick={() => setShowAllUnmatched(!showAllUnmatched)} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>{showAllUnmatched ? "Mostra solo i recenti" : "Mostra tutti"}</button>
            </p>
            <DataTable rows={unmatched} defaultSort={{ key: "at", dir: -1 }} minWidth={900} maxHeight={520} empty="Nessun contratto da collegare."
              columns={[
                { key: "t", label: "Contratto", sort: (c) => c.title, render: (c) => <span>{c.title}<div style={{ fontSize: 12, color: CP.textMuted }}>{c.signerName || "—"}{c.signerEmail ? ` · ${c.signerEmail}` : ""}</div></span> },
                { key: "k", label: "Mansione letta", sort: (c) => c.role || c.kind, render: (c) => c.role || KIND_LABEL[c.kind] },
                { key: "at", label: "Data", sort: (c) => c.createdAt, render: (c) => <span style={{ whiteSpace: "nowrap" }}>{fmtDate(c.signedAt || c.createdAt)}<div style={{ fontSize: 12, color: CP.textMuted }}>{c.state === "firmato" ? "firmato" : c.state.replace("_", " ")}</div></span> },
                { key: "a", label: "Collega a", sortable: false, render: (c) => (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                    <select aria-label={`Collega ${c.title}`} style={{ ...input, padding: "5px 8px", fontSize: 13, minWidth: 170 }} value="" onChange={(e) => e.target.value && link(c.id, e.target.value)}>
                      <option value="">{c.ambiguous ? `${c.ambiguous.length} possibili: scegli…` : "Scegli la persona…"}</option>
                      {c.ambiguous && <optgroup label="Possibili">{c.ambiguous.map((pid) => <option key={pid} value={pid}>{v.names[pid]}</option>)}</optgroup>}
                      <optgroup label="Tutte">{personOptions.map(([pid, n]) => <option key={pid} value={pid}>{n}</option>)}</optgroup>
                    </select>
                    <button type="button" onClick={() => link(c.id, "none")} title="Non è un contratto del personale attuale: non comparirà più qui" style={{ ...btnGhost, padding: "5px 8px", fontSize: 12 }}>Ignora</button>
                  </span>
                ) },
              ]} />
          </section>

          <section id="ok" style={{ ...card, padding: "14px 16px" }}>
            <SectionTitle aside={String(count("ok") + count("non_richiesto"))}>A posto</SectionTitle>
            <button type="button" onClick={() => setShowOk(!showOk)} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>{showOk ? "Nascondi" : "Mostra chi ha il contratto firmato e coerente con la mansione"}</button>
            {showOk && (
              <div style={{ marginTop: 10 }}>
                <DataTable rows={[...(groups.ok || []), ...(groups.non_richiesto || [])]} defaultSort={{ key: "name", dir: 1 }} minWidth={700} maxHeight={520}
                  columns={[{ key: "name", label: "Persona", sort: (r) => r.name, render: personCell }, { key: "crm", label: "Mansione", sortable: false, render: mansCell }, { key: "c", label: "Contratto firmato", sortable: false, render: signedCell }]} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Group({ id, title, intro, rows = [], columns }) {
  if (!rows.length) return null;
  return (
    <section id={id} style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
      <SectionTitle aside={String(rows.length)}>{title}</SectionTitle>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>{intro}</p>
      <DataTable rows={rows} columns={columns} defaultSort={{ key: "name", dir: 1 }} minWidth={760} maxHeight={520} />
    </section>
  );
}
