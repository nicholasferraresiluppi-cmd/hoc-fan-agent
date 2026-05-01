/**
 * GET /api/playbook
 *
 * Endpoint che alimenta la libreria formativa visibile agli operatori.
 * Unisce due sorgenti:
 *   - PLAYBOOK_ENTRIES (curate a mano per gli operatori, con commentary
 *     didattico, situation, takeaway, steps)
 *   - GOLDEN_EXAMPLES (pool di calibrazione del giudice AI, con commentary
 *     più tecnico ma comunque leggibile)
 *
 * Le ritorna in formato unificato con campo `source: "dedicated" | "golden"`,
 * così la UI può marcare visivamente la provenienza.
 *
 * Visibilità: TUTTI gli operatori autenticati. Niente RBAC stretto, è
 * materiale formativo non sensibile.
 *
 * Query params (filtri AND):
 *   ?q=string          — search testuale su title, situation, commentary, contenuto messaggi
 *   ?category=string   — filtra per categoria
 *   ?creator=string    — filtra per creator (ignora "any")
 *   ?benchmark=string  — filtra per benchmark (terranova / spagnuolo)
 */
import { auth } from "@clerk/nextjs/server";
import { GOLDEN_EXAMPLES } from "@/lib/golden-examples";
import { PLAYBOOK_ENTRIES } from "@/lib/playbook-entries";

/**
 * Trasforma una entry golden nel formato unificato della libreria.
 */
function goldenToEntry(g) {
  // Inferisci il benchmark dai tags
  let benchmark = null;
  if (g.tags?.includes("benchmark-terranova")) benchmark = "terranova";
  else if (g.tags?.includes("benchmark-spagnuolo")) benchmark = "spagnuolo";

  // Title: prima frase del commentary, fino a 80 char
  let title = g.commentary || "";
  title = title.split(/[.!?]/)[0].trim();
  if (title.length > 80) title = title.substring(0, 77) + "…";
  if (!title) title = `Esempio ${g.id}`;

  return {
    id: g.id,
    source: "golden",
    title,
    category: g.category,
    creator: null, // golden non ha campo creator
    benchmark,
    difficulty: null,
    situation: null,
    commentary: g.commentary,
    conversation: g.conversation,
    steps: null,
    takeaway: null,
    outcome: g.outcome,
    operatorId: g.operatorId, // anonimizzato
    tags: g.tags || [],
  };
}

/**
 * Trasforma una entry dedicated nel formato unificato.
 */
function dedicatedToEntry(d) {
  return {
    id: d.id,
    source: "dedicated",
    title: d.title,
    category: d.category,
    creator: d.creator !== "any" ? d.creator : null,
    benchmark: d.benchmark !== "any" ? d.benchmark : null,
    difficulty: d.difficulty || null,
    situation: d.situation || null,
    commentary: d.commentary,
    conversation: d.conversation || [],
    steps: d.steps || null,
    takeaway: d.takeaway || null,
    outcome: null,
    operatorId: null,
    tags: d.tags || [],
  };
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const category = url.searchParams.get("category");
  const creator = url.searchParams.get("creator");
  const benchmark = url.searchParams.get("benchmark");

  // Unifica i due pool. Le dedicated vengono prima (sono il contenuto premium curato).
  const all = [
    ...PLAYBOOK_ENTRIES.map(dedicatedToEntry),
    ...GOLDEN_EXAMPLES.map(goldenToEntry),
  ];

  // Applica filtri (AND)
  let filtered = all;

  if (category) {
    filtered = filtered.filter((e) => e.category === category);
  }

  if (creator) {
    filtered = filtered.filter((e) => e.creator === creator);
  }

  if (benchmark) {
    filtered = filtered.filter((e) => e.benchmark === benchmark);
  }

  if (q) {
    filtered = filtered.filter((e) => {
      const blob = [
        e.title,
        e.situation,
        e.commentary,
        e.takeaway,
        ...(e.tags || []),
        ...(e.conversation || []).map((m) => m.content),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }

  // Lista categorie/creator/benchmark distinti (per popolare i dropdown UI)
  const facets = {
    categories: [...new Set(all.map((e) => e.category).filter(Boolean))].sort(),
    creators: [...new Set(all.map((e) => e.creator).filter(Boolean))].sort(),
    benchmarks: [...new Set(all.map((e) => e.benchmark).filter(Boolean))].sort(),
  };

  // Riduzione payload: mandiamo solo summary nella lista, il dettaglio chiamerà /api/playbook/[id]
  const summary = filtered.map((e) => ({
    id: e.id,
    source: e.source,
    title: e.title,
    category: e.category,
    creator: e.creator,
    benchmark: e.benchmark,
    difficulty: e.difficulty,
    outcome: e.outcome,
    tags: e.tags,
    // breve preview del commentary (prima frase)
    preview: (e.situation || e.commentary || "").split(/[.!?]/)[0].trim().substring(0, 200),
    messageCount: (e.conversation || []).length,
  }));

  return Response.json({
    entries: summary,
    facets,
    total: summary.length,
    totalUnfiltered: all.length,
  });
}
