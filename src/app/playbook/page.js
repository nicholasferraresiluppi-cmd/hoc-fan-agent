"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { COLORS, FONTS, CP } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => r.json());

const CATEGORY_LABELS = {
  "le-basi-della-chat": "Basi della chat",
  "custom-e-upsell": "Custom & PPV",
  "script-avanzati": "Script avanzati",
  "recuperi-e-retention": "Recuperi & Retention",
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

const DIFFICULTY_COLORS = {
  principiante: COLORS.verdant,
  intermedio: COLORS.champagne,
  avanzato: COLORS.signal,
};

function EntryCard({ entry }) {
  const isDedicated = entry.source === "dedicated";

  return (
    <Link
      href={`/playbook/${entry.id}`}
      style={{
        display: "block",
        background: COLORS.graphite,
        border: `1px solid ${COLORS.charcoal}`,
        borderRadius: 12,
        padding: 18,
        textDecoration: "none",
        color: COLORS.alabaster,
        transition: "border-color 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.champagne;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.charcoal;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.35, fontFamily: FONTS.display, flex: 1 }}>
          {entry.title}
        </h3>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            background: isDedicated ? COLORS.champagne : COLORS.charcoal,
            color: isDedicated ? COLORS.obsidian : COLORS.fog,
            padding: "3px 8px",
            borderRadius: 6,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {isDedicated ? "Curato" : "Pool AI"}
        </span>
      </div>

      <p style={{ color: COLORS.fog, fontSize: 13, lineHeight: 1.5, margin: "0 0 12px 0" }}>
        {entry.preview}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
        <span style={{ background: COLORS.charcoal, color: COLORS.fog, padding: "2px 8px", borderRadius: 10 }}>
          {CATEGORY_LABELS[entry.category] || entry.category}
        </span>
        {entry.creator && (
          <span style={{ background: COLORS.charcoal, color: COLORS.fog, padding: "2px 8px", borderRadius: 10 }}>
            {CREATOR_LABELS[entry.creator] || entry.creator}
          </span>
        )}
        {entry.benchmark && (
          <span style={{ background: COLORS.cobalt + "30", color: COLORS.cobalt, padding: "2px 8px", borderRadius: 10 }}>
            {BENCHMARK_LABELS[entry.benchmark] || entry.benchmark}
          </span>
        )}
        {entry.difficulty && (
          <span
            style={{
              background: (DIFFICULTY_COLORS[entry.difficulty] || COLORS.mist) + "20",
              color: DIFFICULTY_COLORS[entry.difficulty] || COLORS.mist,
              padding: "2px 8px",
              borderRadius: 10,
              fontWeight: 500,
            }}
          >
            {entry.difficulty}
          </span>
        )}
        {entry.outcome === "failure" && (
          <span style={{ background: COLORS.signal + "20", color: COLORS.signal, padding: "2px 8px", borderRadius: 10, fontWeight: 500 }}>
            esempio negativo
          </span>
        )}
        <span style={{ color: COLORS.mist, marginLeft: "auto", alignSelf: "center" }}>
          {entry.messageCount} msg
        </span>
      </div>
    </Link>
  );
}

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

  const styles = {
    page: {
      minHeight: "100vh",
      background: COLORS.obsidian,
      color: COLORS.alabaster,
      fontFamily: FONTS.body,
      padding: "32px 24px",
    },
    container: { maxWidth: 1200, margin: "0 auto" },
    title: {
      fontFamily: FONTS.display,
      fontSize: 32,
      letterSpacing: "-0.01em",
      margin: 0,
    },
    sub: { color: COLORS.fog, fontSize: 15, marginTop: 6, marginBottom: 24 },
    filterBar: {
      display: "flex",
      gap: 10,
      marginBottom: 22,
      flexWrap: "wrap",
      alignItems: "center",
    },
    search: {
      flex: "1 1 280px",
      minWidth: 200,
      padding: "10px 14px",
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 8,
      color: COLORS.alabaster,
      fontSize: 14,
      fontFamily: FONTS.body,
      outline: "none",
    },
    select: {
      padding: "10px 14px",
      background: COLORS.graphite,
      border: `1px solid ${COLORS.charcoal}`,
      borderRadius: 8,
      color: COLORS.alabaster,
      fontSize: 13,
      fontFamily: FONTS.body,
      cursor: "pointer",
      minWidth: 130,
    },
    counter: { color: COLORS.fog, fontSize: 13, marginLeft: "auto" },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      gap: 16,
    },
    backLink: { color: COLORS.fog, fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 12 },
    empty: {
      padding: 40,
      textAlign: "center",
      color: COLORS.fog,
      background: COLORS.graphite,
      borderRadius: 12,
      border: `1px solid ${COLORS.charcoal}`,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <PageHeader
          breadcrumb={
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
              <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Academy</Link>
              <span style={{ color: CP.textMuted }}>›</span>
              <span style={{ color: CP.textPrimary }}>Playbook</span>
            </div>
          }
          section="Training · Library"
          title="Playbook"
          subtitle={<>Libreria di esempi reali curati per la tua formazione. <strong style={{ color: COLORS.champagne }}>Curato</strong> = pensato per la formazione (didattico). Altri = pool di calibrazione AI (più tecnici).</>}
        />

        <div style={styles.filterBar}>
          <input
            type="text"
            placeholder="Cerca per situazione, parola chiave, contenuto messaggio..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={styles.search}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={styles.select}>
            <option value="">Tutte le categorie</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>
          <select value={creator} onChange={(e) => setCreator(e.target.value)} style={styles.select}>
            <option value="">Tutte le creator</option>
            {facets.creators.map((c) => (
              <option key={c} value={c}>
                {CREATOR_LABELS[c] || c}
              </option>
            ))}
          </select>
          <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)} style={styles.select}>
            <option value="">Tutti i benchmark</option>
            {facets.benchmarks.map((b) => (
              <option key={b} value={b}>
                {BENCHMARK_LABELS[b] || b}
              </option>
            ))}
          </select>
          <span style={styles.counter}>
            {data ? `${data.total} di ${data.totalUnfiltered}` : ""}
          </span>
        </div>

        {isLoading && !data && <p style={{ color: COLORS.fog }}>Caricamento…</p>}
        {error && <p style={{ color: COLORS.signal }}>Errore: {String(error)}</p>}
        {data?.error && <p style={{ color: COLORS.signal }}>{data.error}</p>}

        {entries.length === 0 && data && !isLoading && (
          <div style={styles.empty}>
            Nessun esempio trovato con questi filtri. Prova a togliere qualche filtro o cambia search.
          </div>
        )}

        {entries.length > 0 && (
          <div style={styles.grid}>
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
