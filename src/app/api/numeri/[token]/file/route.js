/**
 * /api/numeri/[token]/file — screenshot della scheda numeri, lato creator (19/11/2026).
 * POST { pathname }        «caricato»: controlla i byte veri e lo registra
 * DELETE ?p=pathname       toglie uno screenshot (finché la scheda non è inviata)
 * GET ?p=pathname          anteprima di uno screenshot di QUESTO link
 */
import { confirmUpload, removeUpload, readOwnFile, getRecord } from "@/lib/creator-numeri";
import { linkState } from "@/lib/creator-numeri-core";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";
async function limited(request, token, name = "numeri_upload") {
  const ip = await checkRateLimit("numeri_ip", ipOf(request));
  if (!ip.ok) return tooMany(ip.retryAfter);
  const rl = await checkRateLimit(name, String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);
  return null;
}

export async function POST(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }
  const r = await confirmUpload(token, body?.pathname);
  return Response.json(r, { status: r.ok ? 200 : r.status });
}

export async function DELETE(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  const p = new URL(request.url).searchParams.get("p");
  const r = await removeUpload(token, p);
  return Response.json(r, { status: r.ok ? 200 : r.status });
}

export async function GET(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token, "numeri_form");
  if (stop) return stop;
  const rec = await getRecord(token);
  const state = linkState(rec);
  if (state === "invalid" || state === "expired") return new Response("Non trovato", { status: 404 });
  const f = await readOwnFile(token, new URL(request.url).searchParams.get("p"));
  if (!f) return new Response("Non trovato", { status: 404 });
  return new Response(f.bytes, { headers: { "Content-Type": f.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
