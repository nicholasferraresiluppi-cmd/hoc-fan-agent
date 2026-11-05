// Radar creator — ricerche mirate su Apify lanciate dall'app (SEED). 13/10/2026: serve ai giri di
// scoperta (seguiti delle creator col profilo a pagamento, profili dei candidati, prima storia in
// evidenza) senza passare a mano centinaia di nomi. Tetto di spesa per run deciso qui, non dal client.
//   POST { kind, handles, maxUsd } → { runId, datasetId }
//   GET  ?runId=…                  → stato del run
//   GET  ?datasetId=…&offset=&limit=&fields= → righe del risultato
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { apify, apifyConfigured } from "@/lib/scouting-refresh";
import { normHandle } from "@/lib/scouting-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_USD = 30; // per singolo run

const KINDS = {
  // posts: true → anche le didascalie degli ultimi 8 post (stesso prezzo a profilo): servono per capire il format
  profiles: { actor: "afanasenko~instagram-profile-scraper", unit: 0.011, input: (h, o) => ({ operationMode: "analyzeSpecificAccounts", specificUsernamesList: h, maxCountList: h.length, extractEmail: false, extractPhoneNumber: false, extractWebsiteUrl: true, extractBusinessCategory: false, analyzeQuality: true, extractPosts: Boolean(o.posts) }) },
  followings: { actor: "scraping_solutions~instagram-scraper-followers-following-no-cookies", unit: 0.35, input: (h) => ({ Account: h, resultsLimit: 1500, dataToScrape: "Followings" }) },
  // pagine di link (Linktree, Beacons, link.me…): profili social e link in uscita. Letta da un attore dello Store
  // (memo23/biolink-scraper, 0,3 cent a pagina, nessun permesso speciale): dal nostro indirizzo Linktree blocca.
  pages: { actor: "memo23~biolink-scraper", unit: 0.004, input: (urls) => ({ profileUrls: urls, maxItems: urls.length }) },
  // ricerche Google (17/10/2026, test Elisa): notorietà di una creator ("nome" OnlyFans) e fonte
  // "Stampa" (articoli italiani su chi apre OnlyFans). `handles` = le ricerche, una per riga.
  google: { actor: "apify~google-search-scraper", unit: 0.0025, input: (q) => ({ queries: q.join("\n"), countryCode: "it", languageCode: "it", maxPagesPerQuery: 1, resultsPerPage: 10, mobileResults: false, includeUnfilteredResults: false }) },
  highlights: { actor: "afanasenko~instagram-stories-highlights-scraper", unit: 0.022, input: (h) => ({ operationMode: "highlightsByUsername", usernames: h, maxAccounts: h.length, includeHighlightItems: true, maxHighlightsPerAccount: 1, analyzeFrames: false, skipPrivate: true }) },
};

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!apifyConfigured()) return Response.json({ error: "Manca la chiave Apify." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const k = KINDS[body.kind];
  if (!k) return Response.json({ error: "tipo di ricerca non valido" }, { status: 400 });
  const handles = body.kind === "google"
    ? [...new Set((body.handles || []).map((q) => String(q).replace(/\s+/g, " ").trim()).filter((q) => q.length >= 3 && q.length <= 160))].slice(0, 3000)
    : body.kind === "pages"
    ? [...new Set((body.handles || []).map(String).filter((u) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/[^\s]{1,80}$/i.test(u)))].slice(0, 3000)
    : [...new Set((body.handles || []).map(normHandle).filter(Boolean))].slice(0, 3000);
  if (!handles.length) return Response.json({ error: "nessun account" }, { status: 400 });
  const budget = Math.min(MAX_USD, Number(body.maxUsd) || 0, Math.ceil(handles.length * k.unit * 1.15 * 100) / 100 + 0.5);
  if (!(budget > 0)) return Response.json({ error: "tetto di spesa mancante" }, { status: 400 });
  const input = { ...k.input(handles, body), ...(body.kind === "profiles" ? { maxBudgetUsd: budget } : {}) };
  const res = await apify(`/acts/${k.actor}/runs?maxTotalChargeUsd=${budget}&timeout=7200`, { method: "POST", body: JSON.stringify(input) });
  return Response.json({ runId: res.data.id, datasetId: res.data.defaultDatasetId, budget, handles: handles.length });
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const p = new URL(request.url).searchParams;
  const id = (x) => /^[A-Za-z0-9]{8,30}$/.test(String(x || ""));
  if (p.get("runId")) {
    if (!id(p.get("runId"))) return Response.json({ error: "run non valido" }, { status: 400 });
    const r = (await apify(`/actor-runs/${p.get("runId")}`)).data;
    return Response.json({ status: r.status, usd: r.usageTotalUsd ?? null, items: r.stats?.datasetItemCount ?? null });
  }
  if (!id(p.get("datasetId"))) return Response.json({ error: "dataset non valido" }, { status: 400 });
  const offset = Math.max(0, Number(p.get("offset")) || 0), limit = Math.min(2000, Number(p.get("limit")) || 1000);
  const fields = p.get("fields") ? `&fields=${encodeURIComponent(p.get("fields"))}` : "";
  const items = await apify(`/datasets/${p.get("datasetId")}/items?clean=1&format=json&offset=${offset}&limit=${limit}${fields}`);
  return Response.json({ items });
}
