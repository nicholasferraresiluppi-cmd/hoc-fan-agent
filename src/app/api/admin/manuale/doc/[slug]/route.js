/**
 * /api/admin/manuale/doc/[slug] — il documento HTML del manuale, servito solo a
 * chi ha la vista vendite su tutte le creator. Si apre in una scheda nuova dalla
 * pagina /admin/manuale-vendite (gli iframe sono vietati in tutta l'app).
 * CSP stretta: nessuno script, solo stili e font.
 */
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeAllCreators } from "@/lib/creator-scope";
import { getDocHtml } from "@/lib/manuale/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const az = await authorizeAllCreators(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return new Response(az.message || "Non autorizzato", { status: az.status });
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug || "")) return new Response("Non trovato", { status: 404 });
  const html = await getDocHtml(slug);
  if (!html) return new Response("Non trovato", { status: 404 });
  return new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; frame-ancestors 'none'",
    "X-Robots-Tag": "noindex",
  } });
}
