"use client";

// Playbook (redesign 26/09/2026 sul design system): libreria di conversazioni
// d'esempio. Stessa API e stessi filtri di prima (ricerca, categoria, creator,
// benchmark); la categoria diventa una fila di chip, creator e benchmark
// restano menu a tendina. Il testo dell'esempio viene prima dei badge.
import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, FilterChip, Notice, card, NUM } from "@/components/ds";

const fetcher = (url) => fetch(url).then((r) => r.json());

const CATEGORY_LABELS = {
  "le-basi-della-chat": "Basi della chat",
  "custom-e-upsell": "Custom e PPV",
  "script-avanzati": "Script avanzati",
  "recuperi-e-retention": "Recuperi e retention",
};

const CREATOR_LABELS = {
  "elisa-esposito": "Elisa Esposito",
  "gaja-bertolin": "Gaja Bertolin",
  "giulia-vaneri": "Giulia Vaneri",
};

const BENCHMARK_LABELS = {
  terranova: "Terranova",
  spagnuolo: "Spagnuolo",
};

const tag = { fontSize: 12, padding: "2px 8px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textSecondary, whiteSpace: "nowrap" };

function EntryCard({ entry }) {
  const isDedicated = entry.source === "dedicated";
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={`/playbook/${entry.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...card, display: "flex", flexDirection: "column", gap: 10, padding: 16, textDecoration: "none", color: CP.textPrimary, borderColor: hover ? CP.borderStrong : CP.border }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{entry.title}</h3>
        <span style={{ ...tag, flexShrink: 0, background: isDedicated ? CP.accentSoft : CP.surfaceAlt, color: isDedicated ? CP.accentSoftText : CP.textMuted }}>
          {isDedicated ? "Curato" : "Pool AI"}
        </span>
      </div>

      <p style={{ color: CP.textSecondary, fontSize: 14, lineHeight: 1.55, margin: 0 }}>{entry.preview}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: "auto" }}>
        <span style={tag}>{CATEGORY_LABELS[entry.category] || entry.category}</span>
        {entry.creator && <span style={tag}>{CREATOR_LABELS[entry.creator] || entry.creator}</span>}
        {entry.benchmark && <span style={tag}>{BENCHMARK_LABELS[entry.benchmark] || entry.benchmark}</span>}
        {entry.difficulty && <span style={tag}>{entry.difficulty}</span>}
        {entry.outcome === "failure" && (
          <span style={{ ...tag, background: alpha(CP.accentRed, "1f"), color: CP.accentRed }}>esempio negativo</span>
        )}
        <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto", ...NUM }}>{fmtInt(entry.messageCount)} messaggi</span>
      </div>
    </Link>
  );
}

const input = {
  padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10,
  color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none",
};

export default function PlaybookListPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [creator, setCreator] = useState("");
  const [benchmark, setBenchmark] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    if (creator) params.set("creator", creator);
    if (benchmark) params.set("benchmark", benchmark);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [q, category, creator, benchmark]);

  const { data, error, isLoading } = useSWR(`/api/playbook${queryString}`, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const entries = data?.entries || [];
  const facets = data?.facets || { categories: [], creators: [], benchmarks: [] };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Academy", href: "/" }, { label: "Playbook" }]}
        title="Playbook"
        subtitle="Conversazioni d'esempio da leggere prima di allenarti: cerchi una situazione e vedi come è stata gestita. Gli esempi «Curato» sono scritti per imparare; quelli «Pool AI» servono a tarare la valutazione automatica e sono più tecnici."
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <label style={{ ...input, flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
          <Search size={15} color={CP.textMuted} />
          <input
            type="text"
            placeholder="Cerca una situazione o una parola del messaggio"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...input, border: "none", padding: "9px 0", flex: 1, minWidth: 0, background: "transparent" }}
          />
        </label>
        <select value={creator} onChange={(e) => setCreator(e.target.value)} style={{ ...input, cursor: "pointer" }} aria-label="Creator">
          <option value="">Tutte le creator</option>
          {facets.creators.map((c) => (
            <option key={c} value={c}>{CREATOR_LABELS[c] || c}</option>
          ))}
        </select>
        <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)} style={{ ...input, cursor: "pointer" }} aria-label="Benchmark">
          <option value="">Tutti i benchmark</option>
          {facets.benchmarks.map((b) => (
            <option key={b} value={b}>{BENCHMARK_LABELS[b] || b}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <FilterChip label="Tutte le categorie" active={!category} onClick={() => setCategory("")} />
        {facets.categories.map((c) => (
          <FilterChip key={c} label={CATEGORY_LABELS[c] || c} active={category === c} onClick={() => setCategory(c)} />
        ))}
        {data && !data.error && (
          <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: "auto", ...NUM }}>
            {fmtInt(data.total)} di {fmtInt(data.totalUnfiltered)} esempi
          </span>
        )}
      </div>

      {isLoading && !data && <Notice>Caricamento degli esempi…</Notice>}
      {error && <Notice danger>Non riesco a caricare il playbook: {String(error)}</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {entries.length === 0 && data && !data.error && !isLoading && (
        <Notice>Nessun esempio con questi filtri. Prova a toglierne qualcuno o a cercare un'altra parola.</Notice>
      )}

      {entries.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
          {entries.map((e) => <EntryCard key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}
