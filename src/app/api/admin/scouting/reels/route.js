// Radar creator — reel di una creator (SEED).
// GET ?h=  → link video ancora validi (cache 36 h, nessuna spesa)
// POST {h} → carica gli ultimi 12 reel da Apify (~3 centesimi) e aggiorna la scheda
// POST {h, sc} → solo il video di quel reel (~0,4 centesimi)
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { normHandle } from "@/lib/scouting-core";
import { loadReels, reelMedia, watchReel } from "@/lib/scouting-intake";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const h = normHandle(new URL(request.url).searchParams.get("h"));
  if (!h) return Response.json({ error: "account mancante" }, { status: 400 });
  return Response.json({ media: await reelMedia(h) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!process.env.APIFY_TOKEN) return Response.json({ error: "Manca la chiave Apify nelle impostazioni di HOC Pro." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const h = normHandle(body.h);
  if (!h) return Response.json({ error: "account mancante" }, { status: 400 });
  const rl = await checkRateLimit("scouting_reels", az.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  // un reel solo (≈0,4 centesimi): il link video per guardarlo qui
  if (body.sc) {
    try {
      const m = await watchReel(h, String(body.sc).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40));
      if (!m?.video) return Response.json({ error: "Instagram non dà il video di questo reel." }, { status: 404 });
      return Response.json({ ok: true, media: { [m.sc]: m } });
    } catch (e) {
      return Response.json({ error: `Instagram non ha risposto: ${String(e.message || e).slice(0, 120)}` }, { status: 502 });
    }
  }
  try {
    const { reels, media } = await loadReels(h, 12);
    if (!reels.length) return Response.json({ error: `Nessun reel leggibile per @${h}.` }, { status: 404 });
    return Response.json({ ok: true, reels, media: Object.fromEntries(media.map((m) => [m.sc, m])) });
  } catch (e) {
    return Response.json({ error: `Instagram non ha risposto: ${String(e.message || e).slice(0, 120)}` }, { status: 502 });
  }
}
