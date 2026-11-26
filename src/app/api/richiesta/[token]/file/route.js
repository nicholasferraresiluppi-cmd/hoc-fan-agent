/**
 * /api/richiesta/[token]/file — le riprese della modella (pubblica, 26/11/2026).
 * POST { pathname }   «caricato»: controlla il file vero (peso, primi byte) e lo registra.
 *                     Se con questo file ha caricato tutte le riprese, avviso WhatsApp.
 * DELETE ?p=pathname  toglie un suo file finché nessuno l'ha guardato.
 */
import { after } from "next/server";
import { confirmUpload, removeTake, getRecord } from "@/lib/richieste";
import { notifyWhatsApp } from "@/lib/whatsapp-notify";
import { internalOrigin } from "@/lib/cron-chain";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";
async function limited(request, token) {
  const ip = await checkRateLimit("richiesta_ip", ipOf(request));
  if (!ip.ok) return tooMany(ip.retryAfter);
  const rl = await checkRateLimit("richiesta_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);
  return null;
}

export async function POST(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }
  const r = await confirmUpload(token, body?.pathname, "modella");
  if (r.ok && r.justDelivered) {
    after(async () => {
      const rec = await getRecord(token).catch(() => null);
      // solo nome, titolo e link interno: nessun file e nessun altro dato passa a CallMeBot
      await notifyWhatsApp(`${rec?.creator?.name || "Una creator"} ha caricato tutte le riprese di «${rec?.title || "una richiesta"}».\n${internalOrigin(request)}/admin/richieste?t=${token}`).catch(() => {});
    });
  }
  return Response.json(r.ok ? { ok: true, file: { pathname: r.file.pathname } } : r, { status: r.ok ? 200 : r.status });
}

export async function DELETE(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  const r = await removeTake(token, new URL(request.url).searchParams.get("p"));
  return Response.json(r, { status: r.ok ? 200 : r.status });
}
