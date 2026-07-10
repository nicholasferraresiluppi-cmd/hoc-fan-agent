"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => r.json());
const URL_API = "/api/admin/group-languages";

const LANG_OPTIONS = [
  { value: "", label: "—", color: COLORS.mist },
  { value: "ita", label: "🇮🇹 ITA", color: "#3FB97E" },
  { value: "eng", label: "🇬🇧 ENG", color: "#4F8CCB" },
];

function LangBadge({ language }) {
  const opt = LANG_OPTIONS.find((o) => o.value === language) || LANG_OPTIONS[0];
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      fontSize: 10, fontWeight: 700, fontFamily: FONTS.mono,
      background: opt.color + "20", color: opt.color, border: `1px solid ${opt.color}55`,
    }}>{opt.label}</span>
  );
}

export default function GroupLanguagesPage() {
  const { data } = useSWR(URL_API, fetcher, { revalidateOnFocus: false });
  const [filter, setFilter] = useState("all");
  const [pendingOverrides, setPendingOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const groups = data?.groups || [];
  const auto = data?.auto || {};
  const overrides = data?.overrides || {};

  // Merge pending con overrides server per UI
  const display = useMemo(() => {
    const out = {};
    for (const g of groups) {
      const ov = pendingOverrides[g] !== undefined ? pendingOverrides[g] : overrides[g];
      out[g] = {
        auto: auto[g] || null,
        override: ov || null,
        effective: ov || auto[g] || null,
        hasOverride: !!ov,
        pending: pendingOverrides[g] !== undefined && pendingOverrides[g] !== overrides[g],
      };
    }
    return out;
  }, [groups, auto, overrides, pendingOverrides]);

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      const d = display[g];
      if (filter === "all") return true;
      if (filter === "missing") return !d.effective;
      if (filter === "auto") return d.effective && !d.hasOverride;
      if (filter === "override") return d.hasOverride;
      return true;
    });
  }, [groups, display, filter]);

  const pendingCount = Object.keys(pendingOverrides).filter((g) => pendingOverrides[g] !== overrides[g]).length;

  function setOverride(group, value) {
    setPendingOverrides((p) => ({ ...p, [group]: value }));
  }

  async function save() {
    if (pendingCount === 0) return;
    setSaving(true);
    setMessage("");
    try {
      // Costruisco l'oggetto finale: overrides server + pending modifiche
      const finalOverrides = { ...overrides };
      for (const [g, v] of Object.entries(pendingOverrides)) {
        if (v && (v === "ita" || v === "eng")) finalOverrides[g] = v;
        else delete finalOverrides[g];
      }
      const res = await fetch(URL_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: finalOverrides }),
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        setMessage(d.error || "Errore");
      } else {
        setMessage(`✓ Salvati ${pendingCount} cambiamenti.`);
        setPendingOverrides({});
        await mutate(URL_API);
      }
    } catch (err) {
      setMessage(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    if (!confirm("Cancellare TUTTI gli override manuali? I Group torneranno alla detection automatica via regex.")) return;
    setSaving(true);
    try {
      const res = await fetch(URL_API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      const d = await res.json();
      if (!res.ok || d.error) setMessage(d.error || "Errore");
      else {
        setMessage("✓ Tutti gli override rimossi.");
        setPendingOverrides({});
        await mutate(URL_API);
      }
    } catch (err) { setMessage(String(err)); }
    finally { setSaving(false); }
  }

  const styles = {
    page: { minHeight: "100vh", background: COLORS.obsidian, color: COLORS.alabaster, fontFamily: FONTS.body, padding: "32px 24px" },
    container: { maxWidth: 1200, margin: "0 auto" },
    title: { fontFamily: FONTS.display, fontSize: 28, margin: "0 0 6px 0", fontWeight: 500 },
    sub: { color: COLORS.fog, fontSize: 14, marginBottom: 24, maxWidth: 900, lineHeight: 1.55 },
    card: { background: COLORS.graphite, border: `1px solid ${COLORS.charcoal}`, borderRadius: 14, padding: 22, marginBottom: 22 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "10px 12px", color: COLORS.fog, fontSize: 10, letterSpacing: "0.1em", borderBottom: `1px solid ${COLORS.steel}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${COLORS.charcoal}88`, verticalAlign: "middle" },
    filterPill: (active) => ({
      padding: "6px 12px", marginRight: 6,
      background: active ? COLORS.champagne : COLORS.graphite,
      color: active ? COLORS.obsidian : COLORS.alabaster,
      border: `1px solid ${active ? COLORS.champagne : COLORS.steel}`,
      borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 500,
      fontFamily: FONTS.body,
    }),
    btn: { padding: "9px 18px", background: COLORS.champagne, color: COLORS.obsidian, border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 },
    btnGhost: { padding: "9px 14px", background: "transparent", color: COLORS.alabaster, border: `1px solid ${COLORS.steel}`, borderRadius: 8, cursor: "pointer", fontSize: 13, marginLeft: 8 },
    btnDanger: { padding: "9px 14px", background: "transparent", color: COLORS.signal, border: `1px solid ${COLORS.signal}66`, borderRadius: 8, cursor: "pointer", fontSize: 12, marginLeft: 8 },
    select: (value) => ({
      padding: "5px 10px",
      background: COLORS.charcoal,
      color: COLORS.alabaster,
      border: `1px solid ${COLORS.steel}`,
      borderRadius: 6, fontSize: 12, fontFamily: FONTS.body, cursor: "pointer", outline: "none",
    }),
    success: { background: "#3FB97E20", color: "#3FB97E", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
    error: { background: COLORS.signal + "20", color: COLORS.signal, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
  };

  const counts = {
    all: groups.length,
    missing: groups.filter((g) => !display[g]?.effective).length,
    auto: groups.filter((g) => display[g]?.effective && !display[g]?.hasOverride).length,
    override: groups.filter((g) => display[g]?.hasOverride).length,
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Lingue Group</span>
            </div>
          }
          section="Data · Config"
          title="Lingue Group"
          subtitle={<>La lingua di un Group viene rilevata <b>automaticamente</b> dal nome (regex ITA/ENG). Quando il nome non contiene il marker, qui puoi assegnare la lingua a mano. Gli override sopravvivono al re-import del CSV.</>}
        />

        {message && (
          <div style={message.startsWith("✓") ? styles.success : styles.error}>{message}</div>
        )}

        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
            <div>
              {["all","missing","auto","override"].map((f) => (
                <button key={f} style={styles.filterPill(filter === f)} onClick={() => setFilter(f)}>
                  {f === "all" ? "Tutti" : f === "missing" ? "Senza lingua" : f === "auto" ? "Auto (regex)" : "Override manuale"}
                  <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: FONTS.mono, fontSize: 11 }}>({counts[f]})</span>
                </button>
              ))}
            </div>
            <div>
              <button style={styles.btn} onClick={save} disabled={saving || pendingCount === 0}>
                {saving ? "Salvataggio…" : pendingCount > 0 ? `✓ Salva ${pendingCount} modifiche` : "Salva"}
              </button>
              <button style={styles.btnDanger} onClick={resetAll} disabled={saving}>Reset override</button>
            </div>
          </div>

          {!data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
          {data?.error && <p style={{ color: COLORS.signal }}>{data.error}</p>}

          {data && !data.error && filtered.length === 0 && (
            <p style={{ color: COLORS.fog, fontSize: 13 }}>Nessun Group corrispondente al filtro.</p>
          )}

          {filtered.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Group</th>
                  <th style={styles.th}>Auto (regex)</th>
                  <th style={styles.th}>Override manuale</th>
                  <th style={styles.th}>Effettiva</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const d = display[g];
                  const current = pendingOverrides[g] !== undefined ? pendingOverrides[g] : (overrides[g] || "");
                  return (
                    <tr key={g}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{g}</td>
                      <td style={styles.td}><LangBadge language={d.auto} /></td>
                      <td style={styles.td}>
                        <select
                          value={current}
                          onChange={(e) => setOverride(g, e.target.value)}
                          style={styles.select(current)}
                        >
                          {LANG_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} style={{ background: COLORS.charcoal }}>
                              {o.value === "" ? "— nessuno —" : o.label}
                            </option>
                          ))}
                        </select>
                        {d.pending && <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.champagne, fontWeight: 600 }}>● modificato</span>}
                      </td>
                      <td style={styles.td}>
                        <LangBadge language={d.effective} />
                        {d.hasOverride && <span style={{ marginLeft: 6, fontSize: 9, color: COLORS.mist, fontFamily: FONTS.mono }}>OVERRIDE</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
