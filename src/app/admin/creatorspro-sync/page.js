"use client";

import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { RefreshCw, Link2, Loader2, CheckCircle2 } from "lucide-react";
import { FONTS, CP, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, Disclosure, Notice, DataTable, card, NUM } from "@/components/ds";
import { fmt$, fmtInt, fmtPct, fmtAgo, MONTHS_IT } from "@/lib/format";

const fetcher = (url) => fetch(url).then((r) => r.json());

function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonthlyOptions(count = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export default function CreatorsProSyncPage() {
  const [periodId, setPeriodId] = useState(currentMonthId());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState("");

  const { data: status } = useSWR("/api/admin/creatorspro-sync", fetcher, { revalidateOnFocus: false });
  const { data: mapData } = useSWR("/api/admin/creatorspro-mapping", fetcher, { revalidateOnFocus: false });

  const monthlyOpts = useMemo(() => MonthlyOptions(12), []);

  const [syncPhase, setSyncPhase] = useState("");
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  async function callSync(payload, phaseLabel) {
    const res = await fetch("/api/admin/creatorspro-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Spesso 504/timeout torna HTML; provo a leggere il messaggio in chiaro
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch {}
      throw new Error(`[${phaseLabel}] HTTP ${res.status}${detail ? " — " + detail : ""}`);
    }
    let d;
    try { d = await res.json(); }
    catch (e) { throw new Error(`[${phaseLabel}] risposta non-JSON (probabile timeout server)`); }
    if (d.error) throw new Error(`[${phaseLabel}] ${d.error}${d.reason ? " — " + d.reason : ""}`);
    return d;
  }

  async function runSync() {
    if (!confirm(`Sincronizzare CreatorsPro per ${periodId}?\n\nL'operazione fa più chiamate sequenziali (~3-5 min totali per un mese). Non chiudere la tab.`)) return;
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    setSyncPhase("refdata");
    setSyncProgress({ current: 0, total: 0 });
    try {
      // Step 1: refdata
      await callSync({ action: "refdata" }, "refdata");

      // Step 2: prepare incrementale (5 pagine alla volta per stare safe sotto 60s)
      const PAGES_PER_CALL = 5;
      let pageOffset = 1;
      let totalWages = 0;
      let prepareDone = false;
      while (!prepareDone) {
        setSyncPhase(`preparing page ${pageOffset}`);
        const prep = await callSync({
          action: "prepare", period_id: periodId,
          page_offset: pageOffset, pages_limit: PAGES_PER_CALL,
        }, "prepare");
        totalWages = prep.total || 0;
        prepareDone = !!prep.done;
        pageOffset = prep.next_page || pageOffset + PAGES_PER_CALL;
        setSyncProgress({ current: 0, total: totalWages });
      }
      if (totalWages === 0) {
        setSyncPhase("nothing-to-sync");
        const fin = await callSync({ action: "finalize", period_id: periodId }, "finalize");
        setSyncResult(fin);
      } else {
        // Step 3: loop batch detail
        let offset = 0;
        const BATCH = 30;
        while (offset < totalWages) {
          setSyncPhase(`batch ${Math.floor(offset / BATCH) + 1}/${Math.ceil(totalWages / BATCH)}`);
          const r = await callSync({ action: "batch", period_id: periodId, offset, batch_size: BATCH }, "batch");
          offset = r.next_offset;
          setSyncProgress({ current: offset, total: totalWages });
          if (r.done) break;
        }
        // Step 4: finalize
        setSyncPhase("finalizing");
        const fin = await callSync({ action: "finalize", period_id: periodId }, "finalize");
        setSyncResult(fin);
      }
      await mutate("/api/admin/creatorspro-sync");
      await mutate("/api/admin/creatorspro-mapping");
      setSyncPhase("done");
    } catch (e) {
      setSyncError(String(e?.message || e));
      setSyncPhase("error");
    } finally {
      setSyncing(false);
    }
  }

  async function setMapping(cpId, inflowwName) {
    const res = await fetch("/api/admin/creatorspro-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cp_member_id: cpId, infloww_name: inflowwName || null }),
    });
    const d = await res.json();
    if (!res.ok || d.error) { alert(d.error || "Errore"); return; }
    await mutate("/api/admin/creatorspro-mapping");
  }

  const meta = status?.meta;
  const mapping = mapData?.mapping || {};
  const members = mapData?.members || [];
  const allUnmapped = mapData?.unmapped || mapData?.unmapped_sample || [];
  const inflowwNames = mapData?.infloww_names || [];

  // v2: ricerca client-side su entrambe le tabelle
  const [unmappedSearch, setUnmappedSearch] = useState("");
  const [mappedSearch, setMappedSearch] = useState("");
  const [showIdle, setShowIdle] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mappedOpen, setMappedOpen] = useState(false);

  const filteredUnmapped = useMemo(() => {
    if (!unmappedSearch.trim()) return allUnmapped;
    const q = unmappedSearch.toLowerCase();
    return allUnmapped.filter((m) =>
      (m.cp_name || "").toLowerCase().includes(q) ||
      (m.username || "").toLowerCase().includes(q)
    );
  }, [allUnmapped, unmappedSearch]);

  const mappedEntries = useMemo(() => Object.entries(mapping), [mapping]);
  const filteredMapped = useMemo(() => {
    if (!mappedSearch.trim()) return mappedEntries;
    const q = mappedSearch.toLowerCase();
    return mappedEntries.filter(([cpId, infloww]) => {
      const m = members.find((x) => x.id === cpId);
      const cpName = m ? `${m.firstName || ""} ${m.lastName || ""}` : "";
      return cpName.toLowerCase().includes(q) ||
             (infloww || "").toLowerCase().includes(q) ||
             cpId.toLowerCase().includes(q);
    });
  }, [mappedEntries, mappedSearch, members]);

  // Redesign 26/09/2026 (pannello tester BOARD/PAY/UX): il punto della pagina è
  // "chi manca all'appello e quanto venduto sparisce dai report" → numero
  // principale + proposte sicure in cima; il sync va in testata con lo stato del
  // lavoro sempre visibile; i 300+ collegamenti esistenti scendono in una sezione
  // chiusa. Logica di sync e di collegamento invariata.
  const nameOf = (m) => (m.cp_name || `${m.firstName || ""} ${m.lastName || ""}`).trim();
  const withSales = filteredUnmapped.filter((m) => (m.sales_cur || 0) + (m.sales_prev || 0) > 0);
  const idle = filteredUnmapped.filter((m) => !((m.sales_cur || 0) + (m.sales_prev || 0) > 0));
  const allWithSales = allUnmapped.filter((m) => (m.sales_cur || 0) + (m.sales_prev || 0) > 0);
  const imp = mapData?.impact;
  // Proposte SICURE: nome identico (a parte accenti/emoji/"HOC") a un
  // operatore Infloww non ancora collegato a nessun'altra persona CP.
  const taken = new Set((mapData?.taken_names || []).map(norm));
  const safe = withSales.map((m) => ({ m, name: exactName(nameOf(m), inflowwNames) })).filter((x) => x.name && !taken.has(norm(x.name)));
  const unmappedRows = (showIdle ? [...withSales, ...idle] : withSales).map((m) => ({ ...m, id: m.cp_id || m.id }));
  const mappedRows = filteredMapped.map(([cpId, inflowwName]) => {
    const m = members.find((x) => x.id === cpId);
    return { id: cpId, cpName: m ? `${m.firstName} ${m.lastName}` : null, infloww: inflowwName };
  });
  const lastSyncTs = meta?.last_sync_at ? new Date(meta.last_sync_at).getTime() : null;
  const loadingMap = !mapData;
  const mapError = mapData?.error;

  const unmappedCols = [
    { key: "name", label: "Persona in CreatorsPro", sort: (m) => nameOf(m), render: (m) => (
      <span>{nameOf(m)}{m.username ? <span style={{ color: CP.textMuted, fontSize: 12, marginLeft: 8 }}>@{m.username}</span> : null}</span>
    ) },
    { key: "sales_cur", label: imp?.period_id ? `Venduto ${monthLabel(imp.period_id)}` : "Venduto mese", align: "right", sort: (m) => m.sales_cur || 0, render: (m) => (m.sales_cur ? fmt$(m.sales_cur) : "—") },
    { key: "sales_prev", label: "Mese prima", align: "right", muted: true, sort: (m) => m.sales_prev || 0, render: (m) => (m.sales_prev ? fmt$(m.sales_prev) : "—") },
    { key: "link", label: "Collega a un operatore", sortable: false, render: (m) => {
      const sug = suggestName(nameOf(m), inflowwNames);
      return (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input list="cp-infloww-names" placeholder="Nome operatore" aria-label={`Operatore per ${nameOf(m)}`} defaultValue="" style={{ ...ctl, width: 190, padding: "6px 10px", fontSize: 13 }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v) setMapping(m.id, v); }} />
          {sug && <button onClick={() => setMapping(m.id, sug)} style={linkBtn}>Collega a “{sug}”</button>}
          <button onClick={() => setMapping(m.id, nameOf(m))} style={{ ...linkBtn, color: CP.textSecondary }}>Usa il nome CP</button>
        </div>
      );
    } },
  ];

  const mappedCols = [
    { key: "cpName", label: "Persona in CreatorsPro", sort: (r) => r.cpName || "", render: (r) => r.cpName || <span style={{ color: CP.textMuted }}>—</span> },
    { key: "infloww", label: "Operatore in HOC Pro" },
    { key: "id", label: "Codice CP", muted: true, render: (r) => <span style={{ fontSize: 12 }}>{r.id.slice(0, 8)}…</span> },
    { key: "rm", label: "", align: "right", sortable: false, render: (r) => (
      <button onClick={() => { if (confirm(`Rimuovere mapping per ${r.cpName || r.id}?`)) setMapping(r.id, null); }}
        style={{ ...btn, padding: "4px 10px", fontSize: 12, color: CP.accentRed }}>Rimuovi</button>
    ) },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Sync CreatorsPro" }]}
        title="Sync CreatorsPro"
        subtitle="Porta in HOC Pro vendite e turni del mese da CreatorsPro, e collega ogni persona CP al suo operatore: chi non è collegato non compare in Sales CP, Creator, Action e Coaching Center."
        actions={<>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={ctl} disabled={syncing} aria-label="Mese da sincronizzare">
            {monthlyOpts.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}
          </select>
          <button style={{ ...btnPrimary, opacity: syncing ? 0.7 : 1, cursor: syncing ? "default" : "pointer" }} onClick={runSync} disabled={syncing}>
            <RefreshCw size={14} /> {syncing ? "Sync in corso…" : "Sincronizza il mese"}
          </button>
        </>}
      />

      {/* Stato del lavoro: sempre in cima, visibile appena premi il bottone */}
      {syncing && (
        <section style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: CP.textPrimary, flexWrap: "wrap" }}>
            <Loader2 size={15} className="animate-spin" color={CP.accent} />
            Sync di {monthLabel(periodId)} in corso · {phaseLabel(syncPhase)}
            {syncProgress.total > 0 && <span style={{ color: CP.textMuted, ...NUM }}>· {fmtInt(syncProgress.current)} di {fmtInt(syncProgress.total)} righe paga</span>}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: CP.surfaceAlt, marginTop: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${syncProgress.total > 0 ? Math.max(3, (syncProgress.current / syncProgress.total) * 100) : 3}%`, background: CP.accent, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8 }}>Un mese richiede 3-5 minuti. Non chiudere questa scheda finché non finisce.</div>
        </section>
      )}
      {syncError && (
        <Notice danger>
          <span style={{ color: CP.textPrimary }}>Il sync si è fermato.</span> Rilancialo per lo stesso mese: riparte da capo.
          <div style={{ marginTop: 4, fontSize: 12, color: CP.textMuted, wordBreak: "break-word" }}>Dettaglio tecnico: {syncError}</div>
        </Notice>
      )}
      {syncResult && !syncing && (
        <section style={{ ...card, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
          <CheckCircle2 size={16} color={CP.accentGreen} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ color: CP.textPrimary }}>Sync completato in {Math.round((syncResult.meta?.duration_ms || 0) / 1000)} secondi.</span>{" "}
            {fmtInt(syncResult.meta?.counts?.wages_normalized)} righe paga, {fmtInt(syncResult.meta?.counts?.shifts_total)} turni, {fmtInt(syncResult.meta?.counts?.mapping_unmatched)} persone non collegate in automatico.
          </div>
        </section>
      )}

      {mapError && <Notice danger>Non riesco a leggere i collegamenti: {String(mapError)}</Notice>}
      {loadingMap && <Notice>Carico persone e collegamenti…</Notice>}

      {/* NUMERO PRINCIPALE: quanto venduto resta fuori dai report */}
      {!loadingMap && !mapError && (allWithSales.length > 0 ? (
        <HeroMetric
          label={imp?.period_id ? `Venduto di persone non collegate · ${monthLabel(imp.period_id)}` : "Persone con vendite non collegate"}
          value={imp?.unmapped ? fmt$(imp.unmapped) : fmtInt(allWithSales.length)}
          compare={imp?.unmapped ? `${fmtPct(imp.share, 1)} del venduto del mese non compare nei report` : null}
          hint="Collegarle aggiorna subito anche i mesi passati.">
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Persone con vendite da collegare" value={fmtInt(allWithSales.length)} />
            <Metric label="Proposte sicure" value={fmtInt(safe.length)} note="collegabili con un clic" />
            <Metric label="Già collegate" value={fmtInt(mappedEntries.length)} />
          </div>
        </HeroMetric>
      ) : (
        <HeroMetric label="Persone con vendite da collegare" value="0" compare="Tutte le persone che vendono sono collegate a un operatore: i report sono completi.">
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Già collegate" value={fmtInt(mappedEntries.length)} />
            <Metric label="Ultimo sync" value={lastSyncTs ? fmtAgo(lastSyncTs) : "mai"} note={meta?.last_sync_period ? monthLabel(meta.last_sync_period) : null} />
          </div>
        </HeroMetric>
      ))}

      {/* PERSONE DA COLLEGARE (25/09/2026): ordinate per venduto — chi non è
          collegato sparisce da Sales CP, Creator, Action/Coaching Center. */}
      {allUnmapped.length > 0 && (
        <section id="collega" style={{ marginBottom: 22 }}>
          <SectionTitle aside={`${fmtInt(withSales.length)} con vendite negli ultimi 2 mesi`}>Persone da collegare a un operatore</SectionTitle>
          {safe.length > 0 && (
            <section style={{ ...card, padding: "14px 16px", marginBottom: 12, borderColor: alpha(CP.accent, "66") }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 4 }}>{safe.length} proposte sicure: stesso nome di un operatore esistente</div>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>Nome identico a parte accenti, emoji e &quot;HOC&quot;, e l&apos;operatore non è collegato a nessun altro. Controlla la lista e collega tutto insieme.</div>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>{safe.map((x) => `${nameOf(x.m)} → ${x.name}`).join(" · ")}</div>
              <button disabled={bulkBusy} onClick={async () => {
                if (!confirm(`Collegare ${safe.length} persone al loro operatore?`)) return;
                setBulkBusy(true);
                for (const x of safe) await setMapping(x.m.cp_id || x.m.id, x.name);
                setBulkBusy(false);
              }} style={{ ...btnPrimary, opacity: bulkBusy ? 0.7 : 1 }}>
                {bulkBusy ? <><Loader2 size={14} className="animate-spin" /> Collego…</> : <><Link2 size={14} /> Collega le {safe.length} proposte sicure</>}
              </button>
            </section>
          )}
          <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
            Per le altre: scrivi il nome dell&apos;operatore (ti suggerisco quelli esistenti), usa il collegamento proposto quando lo riconosco, oppure “Usa il nome CP” se in HOC Pro non esiste ancora.
          </p>
          <input type="text" placeholder="Cerca per nome CP o username…" aria-label="Cerca persona da collegare" value={unmappedSearch} onChange={(e) => setUnmappedSearch(e.target.value)} style={{ ...ctl, width: "100%", maxWidth: 360, marginBottom: 10, boxSizing: "border-box" }} />
          <datalist id="cp-infloww-names">{inflowwNames.map((n) => <option key={n} value={n} />)}</datalist>
          <DataTable columns={unmappedCols} rows={unmappedRows} minWidth={760} maxHeight={620}
            empty={unmappedSearch ? "Nessuna persona trovata con questa ricerca." : "Nessuna persona con vendite da collegare."} />
          <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
            {idle.length > 0 && <button onClick={() => setShowIdle((v) => !v)} style={linkBtn}>{showIdle ? "Nascondi" : "Mostra anche"} le {idle.length} persone senza vendite negli ultimi 2 mesi</button>}
            {" "}Il collegamento vale subito, anche per i mesi passati.
          </p>
        </section>
      )}

      {/* ULTIMO SYNC: cosa è arrivato l'ultima volta */}
      <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
        <SectionTitle aside={meta ? "Il sync sovrascrive i dati CP del mese scelto, non tocca i dati Infloww." : null}>Ultimo sync</SectionTitle>
        {!status ? (
          <div style={{ fontSize: 13, color: CP.textMuted }}>Carico lo stato…</div>
        ) : !meta ? (
          <div style={{ fontSize: 13, color: CP.textSecondary }}>Nessun sync ancora fatto. Scegli un mese in alto e premi “Sincronizza il mese”.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
            <Metric label="Quando" value={fmtAgo(lastSyncTs)} note={new Date(meta.last_sync_at).toLocaleString("it-IT")} />
            <Metric label="Mese" value={monthLabel(meta.last_sync_period)} note={`durata ${Math.round(meta.duration_ms / 1000)} s`} />
            <Metric label="Righe paga" value={fmtInt(meta.counts?.wages_normalized || 0)} />
            <Metric label="Turni" value={fmtInt(meta.counts?.shifts_total || 0)} />
            <Metric label="Persone in CP" value={fmtInt(meta.counts?.members || 0)} />
            <Metric label="Collegate" value={fmtInt(meta.counts?.mapping_total || 0)} note="al momento del sync" />
            <Metric label="Non collegate" value={fmtInt(meta.counts?.mapping_unmatched || 0)} note="al momento del sync" />
          </div>
        )}
      </section>

      {/* MAPPING ATTIVI: consultazione/correzione, di rado */}
      {Object.keys(mapping).length > 0 && (
        <Disclosure open={mappedOpen} onToggle={() => setMappedOpen((v) => !v)}
          title={`Persone già collegate (${fmtInt(mappedEntries.length)})`}
          summary="Cerca un collegamento o rimuovilo se è sbagliato">
          <input type="text" placeholder="Cerca per nome CP, nome operatore o codice CP…" aria-label="Cerca collegamento" value={mappedSearch} onChange={(e) => setMappedSearch(e.target.value)}
            style={{ ...ctl, width: "100%", maxWidth: 360, marginBottom: 10, boxSizing: "border-box" }} />
          <DataTable columns={mappedCols} rows={mappedRows} minWidth={620} maxHeight={520} defaultSort={{ key: "cpName", dir: 1 }} empty="Nessun collegamento trovato." />
          <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
            {mappedSearch ? `${filteredMapped.length} risultati su ${mappedEntries.length}` : `Mostrati tutti i ${mappedEntries.length}`}
          </p>
        </Disclosure>
      )}
    </div>
  );
}

// "2026-09" → "settembre 2026"
function monthLabel(id) {
  const [y, m] = String(id || "").split("-").map(Number);
  return y && m ? `${MONTHS_IT[m - 1]} ${y}` : String(id || "—");
}
// Fase del sync in parole (i valori interni restano quelli della logica)
function phaseLabel(p) {
  if (!p || p === "refdata") return "scarico le anagrafiche";
  if (p.startsWith("preparing page")) return `preparo l'elenco (pagina ${p.split(" ").pop()})`;
  if (p.startsWith("batch")) return `scarico i dettagli (blocco ${p.split(" ").pop().replace("/", " di ")})`;
  if (p === "finalizing") return "salvo i dati";
  if (p === "nothing-to-sync") return "nessuna riga paga nel mese, chiudo";
  return p;
}

// Nome operatore già esistente che corrisponde alla persona CP (senza "HOC",
// emoji, maiuscole): "Erick Jhon HOC" → "Erick Jhon". Solo match esatti o
// univoci per prefisso di nome+cognome: meglio nessun suggerimento che quello sbagliato.
const norm = (x) => (x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z ]/g, " ").replace(/\bHOC\b/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
// Solo match ESATTO (normalizzato) e univoco: base delle "proposte sicure".
function exactName(cpName, names) {
  const n = norm(cpName);
  if (!n) return null;
  const hits = names.filter((x) => norm(x) === n);
  return hits.length === 1 ? hits[0] : null;
}
function suggestName(cpName, names) {
  const n = norm(cpName);
  if (!n) return null;
  const exact = names.filter((x) => norm(x) === n);
  if (exact.length === 1) return exact[0];
  // prefisso solo se la parte comune ha almeno nome E cognome: col solo nome
  // ("Salvatore HOC") si suggeriva lo stesso operatore a due Salvatore diversi
  const two = (k) => k.split(" ").length >= 2;
  const pre = names.filter((x) => { const k = norm(x); return k && ((two(n) && k.startsWith(n + " ")) || (two(k) && n.startsWith(k + " "))); });
  return pre.length === 1 ? pre[0] : null;
}
const linkBtn = { background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const ctl = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const btn = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
