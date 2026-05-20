"use client";

import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import AdminNav from "@/components/AdminNav";
import { COLORS, FONTS } from "@/lib/brand";

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
  const unmappedSample = mapData?.unmapped_sample || [];
  const inflowwNames = mapData?.infloww_names || [];

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
    error: { background: COLORS.signal + "20", color: COLORS.signal, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 },
    statBox: { background: COLORS.charcoal, padding: "10px 14px", borderRadius: 8 },
    statLabel: { fontSize: 10, color: COLORS.fog, textTransform: "uppercase", letterSpacing: "0.1em" },
    statValue: { fontFamily: FONTS.mono, fontSize: 20, fontWeight: 700, marginTop: 4 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "10px 12px", color: COLORS.fog, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${COLORS.charcoal}88`, verticalAlign: "middle" },
    input: { padding: "5px 10px", background: COLORS.charcoal, border: `1px solid ${COLORS.steel}`, borderRadius: 6, color: COLORS.alabaster, fontSize: 12, fontFamily: FONTS.body, width: "100%", outline: "none" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <AdminNav />
        <h1 style={styles.title}>Sync CreatorsPro</h1>
        <p style={styles.sub}>
          Sincronizza i dati di sales/shift da CreatorsPro nel KV di HOC Fan Agent.
          Una volta sincronizzato, la leaderboard operativa mostrerà i KPI "Sales per shift",
          "Fascia oraria top", e il drill-down operatore avrà best/worst shift.
        </p>

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

        {/* MAPPING NON RISOLTI */}
        {unmappedSample.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.h2}>Mapping da risolvere ({mapData?.unmapped_count})</h2>
            <p style={{ color: COLORS.fog, fontSize: 13, marginBottom: 14 }}>
              Member CreatorsPro senza corrispondenza Infloww. Assegna manualmente il nome Infloww per attivare il join dei dati.
            </p>
            <datalist id="cp-infloww-names">
              {inflowwNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>CP Member</th>
                  <th style={styles.th}>Username</th>
                  <th style={styles.th}>Nome Infloww (typed/picked)</th>
                </tr>
              </thead>
              <tbody>
                {unmappedSample.map((m) => (
                  <tr key={m.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{m.firstName} {m.lastName}</td>
                    <td style={{ ...styles.td, color: COLORS.mist, fontSize: 12, fontFamily: FONTS.mono }}>{m.username || "—"}</td>
                    <td style={styles.td}>
                      <input
                        list="cp-infloww-names"
                        placeholder="Cerca o digita nome Infloww"
                        style={styles.input}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v) setMapping(m.id, v);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mapData?.unmapped_count > unmappedSample.length && (
              <p style={{ fontSize: 11, color: COLORS.mist, marginTop: 12 }}>
                Mostrati i primi {unmappedSample.length} di {mapData.unmapped_count}. Re-sync dopo aver mappato manualmente per riprovare match automatici.
              </p>
            )}
          </div>
        )}

        {/* MAPPING ATTIVI */}
        {Object.keys(mapping).length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.h2}>Mapping attivi ({Object.keys(mapping).length})</h2>
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
                {Object.entries(mapping).slice(0, 100).map(([cpId, inflowwName]) => {
                  const m = members.find((x) => x.id === cpId);
                  return (
                    <tr key={cpId}>
                      <td style={{ ...styles.td, fontFamily: FONTS.mono, fontSize: 11, color: COLORS.mist }}>{cpId.slice(0, 8)}…</td>
                      <td style={styles.td}>{m ? `${m.firstName} ${m.lastName}` : "—"}</td>
                      <td style={{ ...styles.td, color: COLORS.champagne, fontWeight: 600 }}>{inflowwName}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>
                        <button
                          onClick={() => { if (confirm(`Rimuovere mapping per ${m ? m.firstName + " " + m.lastName : cpId}?`)) setMapping(cpId, null); }}
                          style={{ padding: "4px 10px", background: "transparent", color: COLORS.signal, border: `1px solid ${COLORS.signal}66`, borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                        >Rimuovi</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {Object.keys(mapping).length > 100 && (
              <p style={{ fontSize: 11, color: COLORS.mist, marginTop: 12 }}>Mostrati i primi 100 di {Object.keys(mapping).length}.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
