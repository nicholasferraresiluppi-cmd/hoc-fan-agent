"use client";

import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP, alpha } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

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

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1200, margin: "0 auto" },
    title: { fontFamily: FONTS.display, fontSize: 28, margin: "0 0 6px 0", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 24, maxWidth: 900, lineHeight: 1.55 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 22, marginBottom: 22 },
    h2: { fontFamily: FONTS.display, fontSize: 18, margin: "0 0 14px 0", fontWeight: 500 },
    btn: { padding: "10px 18px", background: COLORS.champagne, color: COLORS.obsidian, border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 },
    select: { padding: "9px 14px", background: COLORS.charcoal, border: `1px solid ${COLORS.steel}`, borderRadius: 8, color: COLORS.alabaster, fontSize: 13, fontFamily: FONTS.body, marginRight: 10 },
    success: { background: "#3FB97E20", color: "#3FB97E", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    error: { background: alpha(COLORS.signal, "20"), color: COLORS.signal, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 },
    statBox: { background: COLORS.charcoal, padding: "10px 14px", borderRadius: 8 },
    statLabel: { fontSize: 10, color: COLORS.fog, letterSpacing: "0.1em" },
    statValue: { fontFamily: FONTS.mono, fontSize: 20, fontWeight: 700, marginTop: 4 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "10px 12px", color: COLORS.fog, fontSize: 10, letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${alpha(COLORS.charcoal, "88")}`, verticalAlign: "middle" },
    input: { padding: "5px 10px", background: COLORS.charcoal, border: `1px solid ${COLORS.steel}`, borderRadius: 6, color: COLORS.alabaster, fontSize: 12, fontFamily: FONTS.body, width: "100%", outline: "none" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Sync CreatorsPro</span>
            </div>
          }
          section="Data · Integration"
          title="Sync CreatorsPro"
          subtitle={'Sincronizza sales/shift da CreatorsPro nel KV di HOC. Una volta sync, la Leaderboard mostra "Sales/shift", "Fascia oraria top", e il drill-down avrà best/worst shift. Sync incrementale a chunk per stare sotto i 60s di Vercel Hobby.'}
        />

        {/* STATUS */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Stato sync</h2>
          {!meta ? (
            <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessun sync ancora effettuato. Esegui il primo sync sotto.</p>
          ) : (
            <>
              <div style={styles.statRow}>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Ultimo sync</div>
                  <div style={{ ...styles.statValue, fontSize: 14 }}>{new Date(meta.last_sync_at).toLocaleString("it-IT")}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Periodo</div>
                  <div style={styles.statValue}>{meta.last_sync_period}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Durata</div>
                  <div style={styles.statValue}>{Math.round(meta.duration_ms / 1000)}s</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Wages</div>
                  <div style={styles.statValue}>{meta.counts?.wages_normalized || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Shifts</div>
                  <div style={styles.statValue}>{meta.counts?.shifts_total || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Members</div>
                  <div style={styles.statValue}>{meta.counts?.members || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Mappati</div>
                  <div style={styles.statValue}>{meta.counts?.mapping_total || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Non mappati</div>
                  <div style={{ ...styles.statValue, color: (meta.counts?.mapping_unmatched || 0) > 0 ? COLORS.signal : COLORS.alabaster }}>
                    {meta.counts?.mapping_unmatched || 0}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* TRIGGER SYNC */}
        <div style={styles.card}>
          <h2 style={styles.h2}>Esegui sync</h2>
          {syncError && <div style={styles.error}>{syncError}</div>}
          {syncResult && (
            <div style={styles.success}>
              ✓ Sync completato in {Math.round((syncResult.meta?.duration_ms || 0) / 1000)}s.
              {syncResult.meta?.counts?.wages_normalized} wage, {syncResult.meta?.counts?.shifts_total} shift,
              {syncResult.meta?.counts?.mapping_unmatched} member non mappati automaticamente.
            </div>
          )}
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={styles.select} disabled={syncing}>
            {monthlyOpts.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button style={styles.btn} onClick={runSync} disabled={syncing}>
            {syncing ? `🔄 ${syncPhase || "Sync"}${syncProgress.total > 0 ? ` · ${syncProgress.current}/${syncProgress.total}` : ""}` : "🔄 Sincronizza periodo selezionato"}
          </button>
          <p style={{ marginTop: 10, fontSize: 11, color: COLORS.mist }}>
            Sovrascrive i dati CP esistenti per il periodo. Non tocca i dati Infloww.
          </p>
        </div>

        {/* PERSONE DA COLLEGARE (25/09/2026): ordinate per venduto — chi non è
            collegato sparisce da Sales CP, Creator, Action/Coaching Center. */}
        {allUnmapped.length > 0 && (() => {
          const withSales = filteredUnmapped.filter((m) => (m.sales_cur || 0) + (m.sales_prev || 0) > 0);
          const idle = filteredUnmapped.filter((m) => !((m.sales_cur || 0) + (m.sales_prev || 0) > 0));
          const rows = showIdle ? [...withSales, ...idle] : withSales;
          const nameOf = (m) => (m.cp_name || `${m.firstName || ""} ${m.lastName || ""}`).trim();
          const imp = mapData?.impact;
          return (
          <div id="collega" style={styles.card}>
            <h2 style={styles.h2}>Persone da collegare a un operatore ({withSales.length} con vendite)</h2>
            <p style={{ color: COLORS.fog, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
              {imp?.unmapped ? <>Nel mese {imp.period_id}: <b style={{ color: COLORS.alabaster }}>${imp.unmapped.toLocaleString("it-IT")}</b> ({(imp.share * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% del venduto) viene da persone non collegate, che quindi non compaiono in Sales CP, Creator, Action e Coaching Center. </> : null}
              Scegli il nome dell&apos;operatore se esiste già (suggerito quando lo riconosco), altrimenti “Usa il nome CP”.
            </p>
            {(() => {
              // Proposte SICURE: nome identico (a parte accenti/emoji/"HOC") a un
              // operatore Infloww non ancora collegato a nessun'altra persona CP.
              const taken = new Set((mapData?.taken_names || []).map(norm));
              const safe = withSales.map((m) => ({ m, name: exactName(nameOf(m), inflowwNames) })).filter((x) => x.name && !taken.has(norm(x.name)));
              if (!safe.length) return null;
              return (
                <div style={{ margin: "0 0 14px", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.charcoal}` }}>
                  <div style={{ fontSize: 14, color: COLORS.alabaster, marginBottom: 6 }}><b>{safe.length} proposte sicure</b>: stesso nome di un operatore esistente (a parte accenti, emoji, &quot;HOC&quot;).</div>
                  <div style={{ fontSize: 12, color: COLORS.mist, marginBottom: 10 }}>{safe.map((x) => `${nameOf(x.m)} → ${x.name}`).join(" · ")}</div>
                  <button disabled={bulkBusy} onClick={async () => {
                    if (!confirm(`Collegare ${safe.length} persone al loro operatore?`)) return;
                    setBulkBusy(true);
                    for (const x of safe) await setMapping(x.m.cp_id || x.m.id, x.name);
                    setBulkBusy(false);
                  }} style={{ ...linkBtn, fontSize: 14, padding: "6px 12px", border: "1px solid var(--cp-accent)", borderRadius: 8 }}>
                    {bulkBusy ? "Collego…" : `Collega le ${safe.length} proposte sicure`}
                  </button>
                </div>
              );
            })()}
            <input type="text" placeholder="Cerca per nome CP o username…" value={unmappedSearch} onChange={(e) => setUnmappedSearch(e.target.value)} style={{ ...styles.input, marginBottom: 12 }} />
            <datalist id="cp-infloww-names">{inflowwNames.map((n) => <option key={n} value={n} />)}</datalist>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Persona in CreatorsPro</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Venduto mese</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Mese prima</th>
                  <th style={styles.th}>Operatore</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const id = m.cp_id || m.id;
                  const sug = suggestName(nameOf(m), inflowwNames);
                  return (
                    <tr key={id}>
                      <td style={{ ...styles.td, fontWeight: 500 }}>{nameOf(m)}{m.username ? <span style={{ color: COLORS.mist, fontSize: 12, marginLeft: 8 }}>@{m.username}</span> : null}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.sales_cur ? `$${m.sales_cur.toLocaleString("it-IT")}` : "—"}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: COLORS.mist }}>{m.sales_prev ? `$${m.sales_prev.toLocaleString("it-IT")}` : "—"}</td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input list="cp-infloww-names" placeholder="Nome operatore" defaultValue="" style={{ ...styles.input, width: 200 }}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v) setMapping(id, v); }} />
                          {sug && <button onClick={() => setMapping(id, sug)} style={linkBtn}>Collega a “{sug}”</button>}
                          <button onClick={() => setMapping(id, nameOf(m))} style={linkBtn}>Usa il nome CP</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: COLORS.mist, marginTop: 12 }}>
              {idle.length > 0 && <button onClick={() => setShowIdle((v) => !v)} style={linkBtn}>{showIdle ? "Nascondi" : "Mostra anche"} le {idle.length} persone senza vendite negli ultimi 2 mesi</button>}
              {" "}Il collegamento vale subito, anche per i mesi passati.
            </p>
          </div>
          );
        })()}

        {/* MAPPING ATTIVI */}
        {Object.keys(mapping).length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.h2}>Mapping attivi ({Object.keys(mapping).length})</h2>
            <input
              type="text"
              placeholder="🔍 Cerca per nome CP, nome Infloww o cp_id..."
              value={mappedSearch}
              onChange={(e) => setMappedSearch(e.target.value)}
              style={{ ...styles.input, marginBottom: 12 }}
            />
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>CP Member ID</th>
                  <th style={styles.th}>CP Nome</th>
                  <th style={styles.th}>Mappato su Infloww</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredMapped.map(([cpId, inflowwName]) => {
                  const m = members.find((x) => x.id === cpId);
                  return (
                    <tr key={cpId}>
                      <td style={{ ...styles.td, fontFamily: FONTS.mono, fontSize: 11, color: COLORS.mist }}>{cpId.slice(0, 8)}…</td>
                      <td style={styles.td}>{m ? `${m.firstName} ${m.lastName}` : "—"}</td>
                      <td style={{ ...styles.td, color: COLORS.champagne, fontWeight: 600 }}>{inflowwName}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>
                        <button
                          onClick={() => { if (confirm(`Rimuovere mapping per ${m ? m.firstName + " " + m.lastName : cpId}?`)) setMapping(cpId, null); }}
                          style={{ padding: "4px 10px", background: "transparent", color: COLORS.signal, border: `1px solid ${alpha(COLORS.signal, "66")}`, borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                        >Rimuovi</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: COLORS.mist, marginTop: 12 }}>
              {mappedSearch ? `${filteredMapped.length} risultati su ${mappedEntries.length}` : `Mostrati tutti i ${mappedEntries.length}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
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
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--cp-accentSoftText)", fontSize: 13, cursor: "pointer" };
