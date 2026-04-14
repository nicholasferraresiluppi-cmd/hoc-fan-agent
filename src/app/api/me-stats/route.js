import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";

// GET — aggregate player-card stats per l'utente corrente (media ultimi 50 record)
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "unauth" }, { status: 401 });

    const keys = (await kv.zrange(`score_hist:user:${userId}`, 0, 49, { rev: true })) || [];
    const recs = (await Promise.all(keys.map((k) => kv.get(k)))).filter(Boolean);

    const SK = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];
    const skills = {};
    let overall = 0;
    if (recs.length) {
      const sum = { overall: 0 };
      for (const k of SK) sum[k] = { s: 0, n: 0 };
      for (const r of recs) {
        sum.overall += r.overall || 0;
        for (const k of SK) {
          const v = r.skills?.[k];
          if (typeof v === "number") { sum[k].s += v; sum[k].n += 1; }
        }
      }
      overall = Math.round(sum.overall / recs.length);
      for (const k of SK) skills[k] = sum[k].n ? Math.round(sum[k].s / sum[k].n) : 0;
    } else {
      for (const k of SK) skills[k] = 0;
    }

    return Response.json({
      userId,
      overall,
      skills,
      totalSessions: await kv.zcard(`score_hist:user:${userId}`).catch(() => 0),
    });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
