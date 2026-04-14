import { auth } from "@clerk/nextjs/server";
import {
  getDrillForDate,
  getDrillStatusForUser,
  markDrillCompleted,
  getDrillStreak,
  isDrillMandatory,
  todayKey,
} from "@/lib/daily-drill";
import { computeSeniority } from "@/lib/seniority";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauth" }, { status: 401 });

  const drill = getDrillForDate();
  const status = await getDrillStatusForUser(userId);
  const streak = await getDrillStreak(userId);
  const seniority = await computeSeniority(userId);
  const mandatory = isDrillMandatory(seniority.tier);

  return Response.json({
    dateKey: todayKey(),
    drill,
    completed: status.completed,
    record: status.record,
    streak,
    tier: seniority.tier,
    mandatory,
  });
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauth" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const rec = await markDrillCompleted(userId, body);
    const streak = await getDrillStreak(userId);
    return Response.json({ ok: true, record: rec, streak });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
