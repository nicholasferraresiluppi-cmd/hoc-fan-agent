"use client";
// Radar creator — vista "Esplora": tutte le creator, con viste pronte (le domande vere dello
// scouting) e filtri. Una riga = una persona (più account collegati contano una volta).
import { useMemo, useState } from "react";
import { CP } from "@/lib/brand";
import { DataTable, FilterChip } from "@/components/ds";
import { NUM, fmtFull, input, LinkChip, Growth, Spark, STAGE_LABEL } from "./radar-ui";

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
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

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
      if (s && !`${r.name} ${r.handles.join(" ")} ${r.nic} ${r.fmts.join(" ")} ${r.g}`.toLowerCase().includes(s)) return false;
      return true;
    }).sort((a, b) => (b.g4 ?? -999) - (a.g4 ?? -999) || (b.medv || 0) - (a.medv || 0));
  }, [base, grp, growing, fmtOnly, q]);

  const columns = [
    { key: "name", label: "Creator", render: (r) => (
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 600 }}>{r.name}{r.n > 1 && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · {r.n} account</span>}{r.ours && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · già nostra</span>}</span>
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
