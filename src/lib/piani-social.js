// Dati social per i controlli automatici dei piani (`social_posts`). 15/11/2026, piano Fishball:
// i ritmi di pubblicazione si verificano dal magazzino, chi pubblica non deve dichiararli.
//
// Fonti (riga giornaliera per account, pochi MB a query):
//   - instagram.cache_accounts_talents: reels_count_diff (reel nuovi), reels_play_count_diff (views),
//                                       unique_visitors_count_diff (click in bio)
//   - tiktok.cache_accounts_creators:   posts_count_diff (video nuovi), play_count_diff (views); niente click in bio
// Un account collegato a più creator/talent può comparire su più righe nello stesso giorno: si
// prende il massimo per giorno, non la somma. I diff negativi (contenuti cancellati) contano zero.
// Cache KV 1h: il magazzino si aggiorna una volta al giorno.
import { kv } from "@vercel/kv";
import { bqQuery, bqProjects, bigQueryConfigured } from "@/lib/bigquery-api";

const TTL = 3600;
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const clean = (v) => String(v || "").trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9._]/g, "");

/** Righe [{p, u, d, posts, views, clicks}] per gli account richiesti, tra `from` e `to` (inclusi). */
export async function loadSocialRows({ ig = [], tt = [], from, to }) {
  if (!bigQueryConfigured() || !isDay(from)) return null;
  const igU = [...new Set(ig.map(clean).filter(Boolean))].sort();
  const ttU = [...new Set(tt.map(clean).filter(Boolean))].sort();
  if (!igU.length && !ttU.length) return [];
  const end = isDay(to) ? to : new Date().toISOString().slice(0, 10);
  const key = `piani:social:${from}:${end}:${igU.join(",")}|${ttU.join(",")}`.slice(0, 900);
  try {
    const hit = await kv.get(key);
    if (hit) return typeof hit === "string" ? JSON.parse(hit) : hit;
  } catch { /* cache non disponibile: si legge dal magazzino */ }

  const { dataProject } = bqProjects();
  const list = (a) => a.map((u) => `'${u}'`).join(",");
  const parts = [];
  if (igU.length) parts.push(`
    SELECT 'ig' p, LOWER(owner_username) u, FORMAT_DATE('%Y-%m-%d', date_key) d,
      MAX(GREATEST(IFNULL(reels_count_diff, 0), 0)) posts, MAX(GREATEST(IFNULL(reels_play_count_diff, 0), 0)) views,
      MAX(GREATEST(IFNULL(unique_visitors_count_diff, 0), 0)) clicks
    FROM \`${dataProject}.instagram.cache_accounts_talents\`
    WHERE date_key BETWEEN '${from}' AND '${end}' AND LOWER(owner_username) IN (${list(igU)})
    GROUP BY 1, 2, 3`);
  if (ttU.length) parts.push(`
    SELECT 'tt' p, LOWER(author_unique_id) u, FORMAT_DATE('%Y-%m-%d', date_key) d,
      MAX(GREATEST(IFNULL(posts_count_diff, 0), 0)) posts, MAX(GREATEST(IFNULL(play_count_diff, 0), 0)) views, 0 clicks
    FROM \`${dataProject}.tiktok.cache_accounts_creators\`
    WHERE date_key BETWEEN '${from}' AND '${end}' AND LOWER(author_unique_id) IN (${list(ttU)})
    GROUP BY 1, 2, 3`);
  const { rows } = await bqQuery(parts.join(" UNION ALL "), { maxBytesBilled: 2 * 1024 ** 3 });
  const out = rows.map((r) => ({ p: r.p, u: r.u, d: r.d, posts: Number(r.posts) || 0, views: Number(r.views) || 0, clicks: Number(r.clicks) || 0 }));
  try { await kv.set(key, out, { ex: TTL }); } catch { /* ok senza cache */ }
  return out;
}
