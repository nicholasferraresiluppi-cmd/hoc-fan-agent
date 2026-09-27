/**
 * /api/grazie — "grazie" tra colleghi (lib/grazie). Solo utenti loggati.
 * GET  → { received, sent, people, pratiche, shared }   (?shared=1 → solo i condivisi, per /cultura)
 * POST { to, pratica, text } | { action: "share", id, on }
 */
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { PRATICHE, sendThanks, listThanks, setShared, listShared } from "@/lib/grazie";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function people() {
  const hit = await kv.get("thanks:people").catch(() => null);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.list;
  const cc = await clerkClient();
  const list = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = await cc.users.getUserList({ limit: 100, offset });
    const data = Array.isArray(r) ? r : r?.data || [];
    for (const u of data) if (!u.banned) list.push({ userId: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || (u.emailAddresses?.[0]?.emailAddress || "").split("@")[0] });
    if (data.length < 100) break;
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  await kv.set("thanks:people", { at: Date.now(), list }, { ex: 3600 }).catch(() => {});
  return list;
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (new URL(request.url).searchParams.get("shared") === "1") return Response.json({ shared: await listShared(6) });
  const [mine, ppl] = await Promise.all([listThanks(userId), people()]);
  return Response.json({ ...mine, people: ppl.filter((p) => p.userId !== userId), pratiche: PRATICHE });
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthenticated" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  try {
    if (body?.action === "share") return Response.json({ ok: true, item: await setShared(userId, String(body.id || ""), body.on) });
    const rl = await checkRateLimit("thanks", userId);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const to = (await people()).find((p) => p.userId === body?.to);
    if (!to) return Response.json({ error: "Collega non trovato." }, { status: 400 });
    const me = await currentUser();
    const from = { userId, name: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || "Un collega" };
    return Response.json({ ok: true, item: await sendThanks({ from, to, pratica: body?.pratica, text: body?.text }) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
