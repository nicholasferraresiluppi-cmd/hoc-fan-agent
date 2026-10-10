// Radar creator — salva adesso le foto ancora valide che non sono già salvate (SEED, nessuna spesa:
// si scaricano dal link di Instagram che il radar ha già). Quello che non sta nel tempo, al giro dopo.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProfiles, saveProfiles } from "@/lib/scouting-store";
import { savePics } from "@/lib/scouting-pics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const res = await savePics(await getProfiles(), { budgetMs: 90000 });
  if (res.saved) await saveProfiles(res.profiles);
  return Response.json({ saved: res.saved, left: res.left ?? 0, skipped: res.skipped || null });
}
