import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { isUserIdAdmin } from "@/lib/admin";

// POST — salva outcome settimanale di un operatore (dati reali di vendita/retention)
export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    if (!(await isUserIdAdmin(userId))) return Response.json({ error: "Non autorizzato." }, { status: 403 });

    const { operatorId, week, revenue, ppvCount, customCount, retentionRate, churnCount, notes } = await request.json();

    if (!operatorId || !week) {
      return Response.json({ error: "operatorId e week richiesti." }, { status: 400 });
    }

    const key = `outcome:${operatorId}:${week}`;
    const record = {
      operatorId,
      week, // ISO week es. "2026-W15"
      revenue: parseFloat(revenue) || 0,
      ppvCount: parseInt(ppvCount) || 0,
      customCount: parseInt(customCount) || 0,
      retentionRate: parseFloat(retentionRate) || 0,
      churnCount: parseInt(churnCount) || 0,
      notes: notes || "",
      updatedBy: userId,
      updatedAt: Date.now(),
    };

    await kv.set(key, record);
    await kv.zadd("outcomes:index", { score: Date.now(), member: key });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Outcomes POST error:", error);
    return Response.json({ error: "Errore." }, { status: 500 });
  }
}

// GET — lista outcomes
export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    if (!(await isUserIdAdmin(userId))) return Response.json({ error: "Non autorizzato." }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const keys = await kv.zrange("outcomes:index", 0, limit - 1, { rev: true });
    const records = await Promise.all((keys || []).map((k) => kv.get(k)));
    return Response.json({ outcomes: (records || []).filter(Boolean) });
  } catch (error) {
    console.error("Outcomes GET error:", error);
    return Response.json({ outcomes: [], error: "Errore." }, { status: 200 });
  }
}
