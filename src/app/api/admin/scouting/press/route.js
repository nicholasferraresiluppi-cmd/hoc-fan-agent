// Radar creator — notorietà dai giornali (17/10/2026, test Elisa): salva sui profili quanti
// articoli parlano di lei e se dicono che ha OnlyFans. Le ricerche Google si lanciano con
// /discover (kind "google"); qui arriva solo il conteggio già fatto, con al massimo 3 titoli.
// POST { entries: [{ h, n, of, top: [{ title, url, site }] }] } → { updated }
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProfiles, saveProfiles } from "@/lib/scouting-store";
import { normHandle } from "@/lib/scouting-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { entries } = await request.json().catch(() => ({}));
  if (!Array.isArray(entries) || !entries.length) return Response.json({ error: "nessuna voce" }, { status: 400 });
  const by = new Map();
  for (const e of entries.slice(0, 5000)) {
    const h = normHandle(e?.h || "");
    const n = Math.max(0, Math.min(999, Math.round(Number(e?.n) || 0)));
    if (!h) continue;
    const top = (Array.isArray(e.top) ? e.top : []).slice(0, 3)
      .map((t) => ({ title: clean(t?.title, 140), url: /^https:\/\/[^\s]{4,300}$/.test(String(t?.url || "")) ? String(t.url) : "", site: clean(t?.site, 60) }))
      .filter((t) => t.title && t.url);
    by.set(h, { n, of: Boolean(e.of), top, at: Date.now() });
  }
  const profiles = await getProfiles();
  let updated = 0;
  const next = profiles.map((p) => {
    const v = by.get(p.h);
    if (!v) return p;
    updated++;
    return { ...p, press: v };
  });
  if (updated) await saveProfiles(next);
  return Response.json({ updated, asked: by.size });
}
