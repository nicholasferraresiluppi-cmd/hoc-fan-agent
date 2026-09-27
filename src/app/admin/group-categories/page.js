"use client";

// Categorie dei gruppi (Big / Medium / Small).
// Ridisegno 26/09/2026 (design system): in testa quanti gruppi sono senza
// categoria e quanti diversi dal suggerimento (le due cose su cui decidere),
// filtri per vederli subito, tabella ordinabile, barra di salvataggio sempre
// visibile con "modifiche non salvate". Colori delle categorie tolti (erano
// decorazione). API, conferme e azioni invariate.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FONTS, CP } from "@/lib/brand";
import { PageHead, Notice, DataTable, FilterChip, card } from "@/components/ds";
import { fmt$, fmtInt } from "@/lib/format";

const CATEGORIES = ["Big", "Medium", "Small"];

export default function GroupCategoriesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [assignments, setAssignments] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [stats, setStats] = useState({});
  const [referencePeriod, setReferencePeriod] = useState(null);
  const [saved, setSaved] = useState("{}");
  const [view, setView] = useState("all");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/group-categories");
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Errore nel caricamento.");
        setLoading(false);
        return;
      }
      setAssignments(data.assignments || {});
      setSaved(JSON.stringify(data.assignments || {}));
      setSuggestions(data.suggestions || {});
      setStats(data.stats || {});
      setReferencePeriod(data.reference_period);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function setCategory(group, category) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (category === "" || category == null) {
        delete next[group];
      } else {
        next[group] = category;
      }
      return next;
    });
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/group-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore nel salvataggio.");
      } else {
        setMessage("Categorie salvate.");
        setSaved(JSON.stringify(assignments));
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  async function applySuggested() {
    if (!confirm("Applicare i suggerimenti automatici a TUTTI i gruppi? Sovrascrive le scelte fatte a mano.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/group-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_suggestions" }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore.");
      } else {
        setMessage(data.message || "Suggerimenti applicati.");
        setAssignments(data.assignments || {});
        setSaved(JSON.stringify(data.assignments || {}));
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  async function resetAll() {
    if (!confirm("Cancellare TUTTE le assegnazioni? I gruppi resteranno senza categoria finché non li assegni a mano o applichi i suggerimenti.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/group-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore.");
      } else {
        setMessage(data.message || "Categorie cancellate.");
        setAssignments({});
        setSaved("{}");
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  // Lista Group ordinata per paying_fans desc
  const groupList = useMemo(() => {
    const all = new Set([...Object.keys(stats), ...Object.keys(assignments), ...Object.keys(suggestions)]);
    return Array.from(all).sort((a, b) => {
      const af = stats[a]?.paying_fans || 0;
      const bf = stats[b]?.paying_fans || 0;
      return bf - af;
    });
  }, [stats, assignments, suggestions]);

  // Conteggio per categoria
  const counts = useMemo(() => {
    const c = { Big: 0, Medium: 0, Small: 0, none: 0, differ: 0 };
    for (const g of groupList) {
      const cat = assignments[g];
      if (cat) c[cat] += 1;
      else c.none += 1;
      if (cat && suggestions[g] && cat !== suggestions[g]) c.differ += 1;
    }
    return c;
  }, [assignments, groupList, suggestions]);

  const dirty = JSON.stringify(assignments) !== saved;
  const btn = (primary) => ({ padding: "9px 16px", borderRadius: 8, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" });
  const selectStyle = (cur) => ({ padding: "6px 10px", background: CP.bg, border: `1px solid ${cur ? CP.border : CP.accentRed}`, borderRadius: 8, color: cur ? CP.textPrimary : CP.textMuted, fontSize: 13, fontFamily: FONTS.body, minWidth: 110 });

  const head = (
    <PageHead
      crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Categorie gruppi" }]}
      title="Categorie dei gruppi"
      subtitle="Dai a ogni gruppo (il team di una creator) una taglia: Big, Medium o Small. Serve solo come filtro nella leaderboard operativa, per confrontare operatori su pagine di dimensione simile: lo score non cambia."
    />
  );

  if (loading) {
    return (
      <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
        {head}
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento gruppi e statistiche…</div>
      </div>
    );
  }

  if (groupList.length === 0) {
    return (
      <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
        {head}
        {error ? <Notice danger>{error}</Notice> : (
          <Notice>
            Nessun gruppo ancora. I gruppi arrivano con l&apos;export Infloww: importalo in <Link href="/admin/leaderboard-import" style={{ color: CP.accentSoftText }}>Import KPI Infloww</Link> e qui compariranno con la taglia suggerita.
          </Notice>
        )}
      </div>
    );
  }

  const rows = groupList
    .filter((g) => view === "all" || (view === "none" ? !assignments[g] : assignments[g] && suggestions[g] && assignments[g] !== suggestions[g]))
    .map((g) => ({ id: g, group: g, ...(stats[g] || {}), sug: suggestions[g] || null, cur: assignments[g] || "" }));

  const columns = [
    { key: "group", label: "Gruppo", sort: (r) => r.group.toLowerCase() },
    { key: "paying_fans", label: "Fan paganti", align: "right", sort: (r) => r.paying_fans ?? null, render: (r) => fmtInt(r.paying_fans) },
    { key: "sales", label: "Venduto", align: "right", sort: (r) => r.sales ?? null, render: (r) => fmt$(r.sales) },
    { key: "operators_count", label: "Operatori", align: "right", sort: (r) => r.operators_count ?? null, render: (r) => fmtInt(r.operators_count) },
    { key: "sug", label: "Suggerita", sort: (r) => r.sug || "", render: (r) => <span style={{ color: CP.textSecondary }}>{r.sug || "—"}</span> },
    {
      key: "cur", label: "Categoria", sort: (r) => r.cur || "",
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <select value={r.cur} onChange={(e) => setCategory(r.group, e.target.value)} style={selectStyle(r.cur)} aria-label={`Categoria di ${r.group}`}>
            <option value="">Nessuna</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {r.cur && r.sug && r.cur !== r.sug && <span style={{ fontSize: 12, color: CP.textMuted }}>scelta a mano</span>}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 96px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      {head}

      {error && <Notice danger>{error}</Notice>}
      {message && <Notice>{message}</Notice>}

      <div style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
        {groupList.length} gruppi: Big {counts.Big} · Medium {counts.Medium} · Small {counts.Small} · <span style={{ color: counts.none ? CP.accentRed : CP.textSecondary }}>senza categoria {counts.none}</span>.
        {" "}La taglia suggerita viene dai fan paganti {referencePeriod ? `di ${String(referencePeriod).split(":").pop()}` : "dell'ultimo mese importato"}: il terzo più grande è Big, quello di mezzo Medium, il resto Small. Puoi cambiarla caso per caso.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <FilterChip label={`Tutti (${groupList.length})`} active={view === "all"} onClick={() => setView("all")} />
        <FilterChip label={`Senza categoria (${counts.none})`} active={view === "none"} danger={counts.none > 0} disabled={!counts.none} onClick={() => setView(view === "none" ? "all" : "none")} />
        <FilterChip label={`Diversa dal suggerimento (${counts.differ})`} active={view === "differ"} disabled={!counts.differ} onClick={() => setView(view === "differ" ? "all" : "differ")} />
      </div>

      <DataTable columns={columns} rows={rows} defaultSort={{ key: "paying_fans", dir: -1 }} minWidth={760} maxHeight={620} empty="Nessun gruppo in questa vista." />

      <div style={{ position: "sticky", bottom: 12, zIndex: 5, marginTop: 14, ...card, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ ...btn(true), opacity: saving || !dirty ? 0.6 : 1 }} onClick={saveAll} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva categorie"}
        </button>
        <button style={btn(false)} onClick={loadData} disabled={saving}>Annulla modifiche</button>
        <span style={{ fontSize: 12, color: dirty ? CP.accentSoftText : CP.textMuted }}>{dirty ? "Modifiche non salvate" : "Tutto salvato"}</span>
        <div style={{ flex: 1 }} />
        <button style={btn(false)} onClick={applySuggested} disabled={saving}>Applica tutti i suggerimenti</button>
        <button style={{ ...btn(false), color: CP.accentRed }} onClick={resetAll} disabled={saving}>Cancella tutte</button>
      </div>
    </div>
  );
}
