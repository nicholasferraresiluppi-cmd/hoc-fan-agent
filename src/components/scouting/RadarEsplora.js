"use client";
// Radar creator — vista "Esplora": tutte le creator, con viste pronte (le domande vere dello
// scouting) e filtri. Una riga = una persona (più account collegati contano una volta).
import { useMemo, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { hookLine, attentionScore } from "@/lib/scouting-core";
import { DataTable, FilterChip } from "@/components/ds";
import { NUM, SERIF, fmtFull, fmtN, input, btn, igProfile, LinkChip, Growth, Spark, Initials, STAGE_LABEL, useIsPhone } from "./radar-ui";

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
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Initials name={r.name} size={34} gold={r.sig === "forte"} pic={r.pic} />
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 600 }}>{r.name}{r.n > 1 && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · {r.n} account</span>}{r.ours && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · già nostra</span>}{r.ita === "forse" && <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 12 }}> · forse italiana</span>}</span>
        <span style={{ fontSize: 12.5, color: CP.textMuted }}>{[r.g, r.nic].filter(Boolean).join(" · ")}</span>
      </span></span>) },
    { key: "link", label: "Dove porta", sort: (r) => r.link?.strength ?? (r.sig === "forte" ? 2 : -1), render: (r) => <LinkChip link={r.link} sig={r.sig} /> },
    { key: "fmt", label: "Format", muted: true, render: (r) => (r.fmt === "nessuno" ? "—" : r.fmt) },
    { key: "fol", label: "Follower", align: "right", render: (r) => fmtFull(r.fol) },
    { key: "medv", label: "View per reel", align: "right", render: (r) => fmtFull(r.medv) },
    { key: "g4", label: "4 settimane", align: "right", render: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>{r.n === 1 && <Spark hist={profilesBy[r.handles[0]]?.hist} w={64} h={20} />}<Growth v={r.g4} /></span>) },
    { key: "stage", label: "Fase", sort: (r) => Object.keys(STAGE_LABEL).indexOf(r.stage), render: (r) => <span style={{ color: r.stage === "interessante" ? CP.gold : r.stage === "scartata" ? CP.textMuted : CP.textSecondary }}>{STAGE_LABEL[r.stage]}</span> },
  ];

  // «da guardare»: il 10% più alto per lo stesso punteggio di «Oggi», tra chi è ancora da valutare
  const hotCut = useMemo(() => {
    const xs = creators.filter((c) => c.stage === "da_valutare" && !c.ours).map((c) => attentionScore(c, newCut)).sort((a, b) => b - a);
    return xs.length ? xs[Math.floor(xs.length * 0.1)] : Infinity;
  }, [creators, newCut]);
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
        <span style={{ fontSize: 13, color: CP.textMuted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{fmtFull(rows.length)} creator<span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: CP.gold, display: "inline-block", marginLeft: 6 }} />da guardare</span>
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
          {rows.slice(0, shown).map((r) => {
            const hook = hookLine(r, { newCut });
            const hot = r.stage === "da_valutare" && !r.ours && attentionScore(r, newCut) >= hotCut;
            const best = r.reels?.[0]?.v;
            const reach = r.medv && r.fol ? r.medv / r.fol : null;
            return (
            <li key={r.id} style={{ borderBottom: `1px solid ${CP.borderSoft || CP.border}`, display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px", alignItems: "center", gap: 8 }}>
              <button onClick={() => onOpen(r)} style={{ all: "unset", boxSizing: "border-box", minWidth: 0, cursor: "pointer", display: "grid", gridTemplateColumns: "48px minmax(0,1fr)", gap: 12, alignItems: "start", padding: "14px 0" }}>
                <span style={{ position: "relative" }}>
                  <Initials name={r.name} size={48} gold={r.sig === "forte"} pic={r.pic} />
                  {hot && <span title="Da guardare" style={{ position: "absolute", right: -1, top: -1, width: 12, height: 12, borderRadius: "50%", background: CP.gold, border: `2px solid ${CP.bg}` }} />}
                </span>
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 13.5, color: CP.textSecondary, ...NUM, flexShrink: 0 }}>{fmtN(r.fol)}</span>
                  </span>
                  {hook
                    ? <span style={{ ...SERIF, fontStyle: "italic", fontSize: 15.5, lineHeight: 1.25, color: hot ? CP.gold : CP.textPrimary, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{hook.replace(/\.$/, "")}</span>
                    : <span style={{ fontSize: 13, color: CP.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nic || r.g}</span>}
                  <span style={{ display: "flex", gap: "4px 10px", alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: CP.textMuted }}>
                    <LinkChip link={r.link} sig={r.sig} />
                    {best ? <span style={NUM}>reel top {fmtN(best)}</span> : reach && reach >= 0.3 ? <span style={NUM}>view ×{reach.toFixed(1).replace(".", ",")} i follower</span> : null}
                    {r.g4 != null && <span><Growth v={r.g4} /></span>}
                    {r.stage !== "da_valutare" && <span style={{ color: r.stage === "interessante" ? CP.gold : CP.textMuted }}>{STAGE_LABEL[r.stage]}</span>}
                  </span>
                </span>
              </button>
              <a href={igProfile(r.handles[0])} target="_blank" rel="noopener noreferrer" aria-label={`Apri @${r.handles[0]} su Instagram`}
                style={{ width: 40, height: 40, borderRadius: "50%", border: `1px solid ${CP.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: CP.textPrimary, background: alpha(CP.textPrimary, "06") }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
              </a>
            </li>
            );
          })}
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
