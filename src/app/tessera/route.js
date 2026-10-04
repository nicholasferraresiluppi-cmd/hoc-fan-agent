/**
 * /tessera — link corto e presentabile del modulo HR (03/10/2026, richiesta Nicholas).
 *
 * Porta al link condiviso ATTIVO (/hr/modulo/{token}): se l'admin rigenera il
 * link, /tessera segue da solo; se lo disattiva, mostra un messaggio. Pubblica
 * (middleware): non espone dati, fa solo un redirect come chi apre il link lungo.
 */
import { getSharedFormLink } from "@/lib/hr-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const link = await getSharedFormLink().catch(() => null);
  // la query passa (es. ?prova=documenti per provare una sezione senza compilare tutto)
  if (link?.path) { const u = new URL(link.path, request.url); u.search = new URL(request.url).search; return Response.redirect(u, 307); }
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>House of Creators</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c10;color:#f2eee6;font-family:system-ui,sans-serif;padding:24px;text-align:center">
<div><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:rgba(242,238,230,.5)">House of Creators</div>
<p style="font-size:18px;margin:16px 0 0">Il modulo al momento non è attivo.</p>
<p style="font-size:14px;color:rgba(242,238,230,.6)">Chiedi a chi ti ha mandato il link.</p></div></body></html>`;
  return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
