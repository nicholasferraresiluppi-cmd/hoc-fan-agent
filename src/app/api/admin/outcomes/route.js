import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES, getTeamMembers, getUserTeam } from "@/lib/rbac";

// POST — salva outcome settimanale di un operatore (dati reali di vendita/retention)
export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    const _az = await authorize(CAPABILITIES.OUTCOMES_WRITE);
    if (!_az.ok) return Response.json({ error: _az.message }, { status: _az.status });

    const { operatorId, week, revenue, ppvCount, customCount, retentionRate, churnCount, notes } = await request.json();

    if (!operatorId || !week) {
      return Response.json({ error: "operatorId e week richiesti." }, { status: 400 });
    }

    // Scope enforcement sulla POST
    if (_az.scope === "team") {
      const myTeam = await getUserTeam(_az.userId);
      if (!myTeam) return Response.json({ error: "Nessun team assegnato." }, { status: 403 });
      const members = new Set(await getTeamMembers(myTeam));
      members.add(_az.userId);
      if (!members.has(operatorId)) {
        return Response.json({ error: "Operatore fuori dal tuo team." }, { status: 403 });
      }
    } else if (_az.scope === "own" && operatorId !== _az.userId) {
      return Response.json({ error: "Puoi scrivere solo i tuoi outcome." }, { status: 403 });
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
    const _az = await authorize(CAPABILITIES.OUTCOMES_WRITE);
    if (!_az.ok) return Response.json({ error: _az.message }, { status: _az.status });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const keys = await kv.zrange("outcomes:index", 0, limit - 1, { rev: true });
    let records = (await Promise.all((keys || []).map((k) => kv.get(k)))).filter(Boolean);

    if (_az.scope === "team") {
      const myTeam = await getUserTeam(_az.userId);
      if (!myTeam) {
        records = [];
      } else {
        const members = new Set(await getTeamMembers(myTeam));
        members.add(_az.userId);
        records = records.filter((r) => members.has(r.operatorId));
      }
    } else if (_az.scope === "own") {
      records = records.filter((r) => r.operatorId === _az.userId);
    }

    return Response.json({ outcomes: records });
  } catch (error) {
    console.error("Outcomes GET error:", error);
    return Response.json({ outcomes: [], error: "Errore." }, { status: 200 });
  }
}
