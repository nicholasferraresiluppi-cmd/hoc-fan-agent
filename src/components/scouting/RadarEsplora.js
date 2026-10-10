"use client";
// Radar creator — vista "Esplora": tutte le creator, con viste pronte (le domande vere dello
// scouting) e filtri. Una riga = una persona (più account collegati contano una volta).
import { useMemo, useState } from "react";
import { CP } from "@/lib/brand";
import { DataTable, FilterChip } from "@/components/ds";
import { NUM, fmtFull, fmtN, input, btn, LinkChip, Growth, Spark, Initials, STAGE_LABEL, useIsPhone } from "./radar-ui";

const views = (newCut) => [
  { id: "paid", label: "Con profilo a pagamento", test: (c) => c.sig === "forte" },
  { id: "talent", label: "Talenti da formare", test: (c) => c.sig === "nessuno" && c.fmt && c.fmt !== "nessuno" },
  { id: "new", label: "Nuove questa settimana", test: (c) => c.firstSeen && c.firstSeen >= newCut },
  { id: "check", label: "Indizi da verificare", test: (c) => c.sig === "debole" },
  { id: "todo", label: "Da classificare", test: (c) => c.g === "Da classificare" },
  { id: "all", label: "Tutte", test: () => true },
];
const PAGE = 150;

export default function RadarEsplora({ creators, profilesBy, onOpen, newCut }) {
  const VIEWS = useMemo(() => views(newCut), [newCut]);
  const [view, setView] = useState("paid");
  const [grp, setGrp] = useState("all");
  const [growing, setGrowing] = useState(false);
  const [fmtOnly, setFmtOnly] = useState(false);
  const [itaSure, setItaSure] = useState(false);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const phone = useIsPhone();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const viewCounts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, creators.filter(v.test).length])), [creators, VIEWS]);
  const base = useMemo(() => creators.filter(VIEWS.find((v) => v.id === view).test), [creators, view, VIEWS]);
  const groups = useMemo(() => {
    const c = {};
    for (const r of base) c[r.g] = (c[r.g] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [base]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return base.filter((r) => {
      if (grp !== "all" && r.g !== grp) return false;
      if (growing && !(r.g4 != null && r.g4 >= 5)) return false;
      if (fmtOnly && (!r.fmt || r.fmt === "nessuno")) return false;
      if (itaSure && r.ita === "forse") return false;
      if (s && !`${r.name} ${r.handles.join(" ")} ${r.nic} ${r.fmts.join(" ")} ${r.g}`.toLowerCase().includes(s)) return false;
      return true;
    }).sort((a, b) => (b.g4 ?? -999) - (a.g4 ?? -999) || (b.medv || 0) - (a.medv || 0));
  }, [base, grp, growing, fmtOnly, itaSure, q]);

  const columns = [
    { key: "name", label: "Creator", render: (r) => (
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 600 }}>{r.name}{r.n > 1 && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · {r.n} account</span>}{r.ours && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · già nostra</span>}{r.ita === "forse" && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · forse italiana</span>}</span>
        <span style={{ fontSize: 12.5, color: CP.textMuted }}>{[r.g, r.nic].filter(Boolean).join(" · ")}</span>
      </span>) },
    { key: "link", label: "Dove porta", sort: (r) => r.link?.strength ?? (r.sig === "forte" ? 2 : -1), render: (r) => <LinkChip link={r.link} sig={r.sig} /> },
    { key: "fmt", label: "Format", muted: true, render: (r) => (r.fmt === "nessuno" ? "—" : r.fmt) },
    { key: "fol", label: "Follower", align: "right", render: (r) => fmtFull(r.fol) },
    { key: "medv", label: "View per reel", align: "right", render: (r) => fmtFull(r.medv) },
    { key: "g4", label: "4 settimane", align: "right", render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>{r.n === 1 && <Spark hist={profilesBy[r.handles[0]]?.hist} w={64} h={20} />}<Growth v={r.g4} /></span>) },
    { key: "stage", label: "Fase", sort: (r) => Object.keys(STAGE_LABEL).indexOf(r.stage), render: (r) => <span style={{ color: r.stage === "interessante" ? CP.gold : r.stage === "scartata" ? CP.textMuted : CP.textSecondary }}>{STAGE_LABEL[r.stage]}</span> },
  ];

  const activeFilters = (grp !== "all") + growing + fmtOnly + itaSure;
  const more = rows.length > shown && (
    <button onClick={() => setShown((x) => x + PAGE)} style={{ ...btn, alignSelf: "center" }}>Mostra altre {fmtFull(Math.min(PAGE, rows.length - shown))}</button>
  );

  if (phone) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label htmlFor="rx-q" style={{ position: "absolute", left: -9999 }}>Cerca</label>
      <input id="rx-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Cerca nome, @ o nicchia" style={{ ...input, width: "100%", fontSize: 16 }} />
      <div role="tablist" aria-label="Viste" className="rx-strip">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => { setView(v.id); setGrp("all"); setShown(PAGE); }}
            style={{ flexShrink: 0, whiteSpace: "nowrap", borderRadius: 999, padding: "7px 13px", fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${view === v.id ? CP.gold : CP.border}`, background: view === v.id ? CP.surface : "transparent", color: view === v.id ? CP.textPrimary : CP.textSecondary }}>
            {v.label} <span style={{ color: CP.textMuted, ...NUM }}>{fmtFull(viewCounts[v.id])}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13.5, color: CP.textMuted }}>{fmtFull(rows.length)} creator · le più in crescita prima</span>
        <button onClick={() => setFiltersOpen((x) => !x)} aria-expanded={filtersOpen} style={{ ...btn, minHeight: 36, padding: "6px 14px" }}>Filtri{activeFilters ? ` · ${activeFilters}` : ""}</button>
      </div>
      {filtersOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, border: `1px solid ${CP.border}`, background: CP.surface }}>
          <label htmlFor="rx-grp" style={{ fontSize: 13, color: CP.textMuted }}>Nicchia</label>
          <select id="rx-grp" value={grp} onChange={(e) => { setGrp(e.target.value); setShown(PAGE); }} style={{ ...input, fontSize: 16 }}>
            <option value="all">Tutte · {base.length}</option>
            {groups.map(([g, n]) => <option key={g} value={g}>{g} · {n}</option>)}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <FilterChip label="In crescita" active={growing} onClick={() => setGrowing((x) => !x)} />
            <FilterChip label="Ha un format" active={fmtOnly} onClick={() => setFmtOnly((x) => !x)} />
            <FilterChip label="Solo italiane sicure" active={itaSure} onClick={() => setItaSure((x) => !x)} />
          </div>
        </div>
      )}
      {rows.length === 0 ? <p style={{ color: CP.textSecondary }}>Nessuna creator con questi filtri.</p> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.slice(0, shown).map((r) => (
            <li key={r.id} style={{ borderBottom: `1px solid ${CP.borderSoft || CP.border}` }}>
              <button onClick={() => onOpen(r)} style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "12px 0" }}>
                <Initials name={r.name} size={40} gold={r.sig === "forte"} />
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}{r.n > 1 ? <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12.5 }}> · {r.n} account</span> : null}</span>
                  <span style={{ fontSize: 13, color: CP.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[r.nic || r.g, r.fmt && r.fmt !== "nessuno" ? r.fmt : null].filter(Boolean).join(" · ")}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><LinkChip link={r.link} sig={r.sig} />{r.stage !== "da_valutare" && <span style={{ fontSize: 12, color: r.stage === "interessante" ? CP.gold : CP.textMuted }}>{STAGE_LABEL[r.stage]}</span>}</span>
                </span>
                <span style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 3, ...NUM }}>
                  <span style={{ fontSize: 15, color: CP.textPrimary }}>{fmtN(r.fol)}</span>
                  <span style={{ fontSize: 12.5 }}><Growth v={r.g4} /></span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {more}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div role="tablist" aria-label="Viste" style={{ display: "flex", flexWrap: "wrap", gap: "6px 26px", borderBottom: `1px solid ${CP.border}` }}>
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => { setView(v.id); setGrp("all"); setShown(PAGE); }}
            style={{ background: "none", border: "none", borderBottom: `1px solid ${view === v.id ? CP.gold : "transparent"}`, color: view === v.id ? CP.textPrimary : CP.textSecondary, padding: "0 0 12px", fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
            {v.label} · <span style={NUM}>{fmtFull(viewCounts[v.id])}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label htmlFor="rx-grp" style={{ fontSize: 13, color: CP.textMuted }}>Nicchia</label>
        <select id="rx-grp" value={grp} onChange={(e) => { setGrp(e.target.value); setShown(PAGE); }} style={{ ...input, padding: "8px 10px" }}>
          <option value="all">Tutte · {base.length}</option>
          {groups.map(([g, n]) => <option key={g} value={g}>{g} · {n}</option>)}
        </select>
        <FilterChip label="In crescita (+5% in 4 settimane)" active={growing} onClick={() => setGrowing((x) => !x)} />
        <FilterChip label="Ha un format" active={fmtOnly} onClick={() => setFmtOnly((x) => !x)} />
        <FilterChip label={`Solo italiane sicure (senza ${base.filter((r) => r.ita === "forse").length} «forse»)`} active={itaSure} onClick={() => setItaSure((x) => !x)} />
        <span style={{ flex: "1 1 auto" }} />
        <label htmlFor="rx-q" style={{ position: "absolute", left: -9999 }}>Cerca</label>
        <input id="rx-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Cerca nome, @ o nicchia" style={{ ...input, flex: "1 1 220px", maxWidth: 320 }} />
      </div>
      <DataTable columns={columns} rows={rows.slice(0, shown)} onRowClick={onOpen} minWidth={940} density="compact" empty="Nessuna creator con questi filtri." />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, fontSize: 13.5, color: CP.textMuted }}>
        <span>{Math.min(shown, rows.length)} di {fmtFull(rows.length)}{rows.length > shown && <> · <button onClick={() => setShown((s) => s + PAGE)} style={{ background: "none", border: "none", color: CP.textPrimary, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, textDecoration: "underline" }}>mostra altre</button></>}</span>
        <span>Una creator con più account conta una volta · i follower sono la somma</span>
      </div>
    </div>
  );
}
