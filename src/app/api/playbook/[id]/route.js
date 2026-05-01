/**
 * GET /api/playbook/[id]
 *
 * Restituisce il record completo di una entry della libreria — sia dedicated
 * che golden. La UI di /playbook/[id] usa questo endpoint.
 *
 * Niente RBAC: tutti gli operatori autenticati vedono tutto. Materiale
 * formativo non sensibile.
 */
import { auth } from "@clerk/nextjs/server";
import { GOLDEN_EXAMPLES } from "@/lib/golden-examples";
import { PLAYBOOK_ENTRIES, getPlaybookEntryById } from "@/lib/playbook-entries";

export async function GET(_request, { params }) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  // Cerca prima nelle dedicated
  const dedicated = getPlaybookEntryById(id);
  if (dedicated) {
    return Response.json({
      entry: {
        ...dedicated,
        source: "dedicated",
      },
    });
  }

  // Poi nelle golden
  const golden = GOLDEN_EXAMPLES.find((g) => g.id === id);
  if (golden) {
    let benchmark = null;
    if (golden.tags?.includes("benchmark-terranova")) benchmark = "terranova";
    else if (golden.tags?.includes("benchmark-spagnuolo")) benchmark = "spagnuolo";

    let title = golden.commentary || "";
    title = title.split(/[.!?]/)[0].trim();
    if (title.length > 100) title = title.substring(0, 97) + "…";
    if (!title) title = `Esempio ${golden.id}`;

    return Response.json({
      entry: {
        id: golden.id,
        source: "golden",
        title,
        category: golden.category,
        creator: null,
        benchmark,
        difficulty: null,
        situation: null,
        commentary: golden.commentary,
        conversation: golden.conversation,
        steps: null,
        takeaway: null,
        outcome: golden.outcome,
        operatorId: golden.operatorId,
        fanProfile: golden.fanProfile,
        tags: golden.tags || [],
      },
    });
  }

  return Response.json({ error: "entry not found" }, { status: 404 });
}
