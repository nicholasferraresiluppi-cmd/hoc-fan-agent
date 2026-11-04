// Editoriale — «pubblicato» segnato da solo (29/10/2026). Logica pura in editoriale-core.js
// (dueForAutoCheck, matchPublished).
//
// Ogni ora (cron proprio, vedi /api/cron/editoriale-autopub): si cercano i contenuti in calendario
// con l'orario passato e non ancora segnati; solo per i LORO profili si leggono gli ultimi post
// pubblici con Apify (apify/instagram-profile-scraper, ~0,3 cent a profilo, nessun accesso
// all'account) e i post dello stesso tipo usciti vicino all'orario segnano il contenuto pubblicato.
// Nessun contenuto in attesa = nessuna lettura, quindi costa solo nelle ore dopo una pubblicazione.
// Ogni profilo si legge al massimo una volta l'ora (`edit:autopub:seen:{id}`).
import { kv } from "@vercel/kv";
import { creatorsWithProfiles, listItems, markAutoPublished } from "@/lib/editoriale-store";
import { dueForAutoCheck, matchPublished } from "@/lib/editoriale-core";

const ACTOR = "apify~instagram-profile-scraper";
const SEEN = (id) => `edit:autopub:seen:${id}`;
const RUN = "edit:autopub:run";

const handleOf = (u) => { const h = String(u || "").trim().replace(/^@+/, ""); return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h.toLowerCase() : null; };

async function readProfiles(handles) {
  const n = handles.length;
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=120&maxTotalChargeUsd=${(0.01 + n * 0.006).toFixed(2)}&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernames: handles }), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`instagram-profile-scraper ${r.status}: ${text.slice(0, 160)}`);
  const rows = text ? JSON.parse(text) : [];
  const out = new Map();
  for (const row of rows) {
    const h = String(row.username || "").toLowerCase();
    if (!h || row.error) continue;
    out.set(h, (row.latestPosts || []).filter((p) => p?.timestamp && (p.shortCode || p.id)).map((p) => ({
      id: String(p.shortCode || p.id),
      ts: Date.parse(p.timestamp),
      kind: p.productType === "clips" || p.type === "Video" ? "reel" : p.type === "Sidecar" ? "carosello" : "post",
      caption: String(p.caption || "").slice(0, 2200),
      url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
    })).filter((p) => !isNaN(p.ts)));
  }
  return out;
}

export async function autoPublishCheck({ now = Date.now() } = {}) {
  if (!process.env.APIFY_TOKEN) return { skip: "no-apify-token" };
  const creators = await creatorsWithProfiles();
  const work = []; // { ck, profile, handle, due[], taken }
  for (const c of creators) {
    const items = await listItems(c.ck).catch(() => []);
    const due = dueForAutoCheck(items, now);
    if (!due.length) continue;
    const taken = new Set(items.map((it) => it.autoPub?.post).filter(Boolean));
    for (const p of c.profiles) {
      const mine = due.filter((it) => it.slot.profileId === p.id);
      const handle = handleOf(p.username);
      if (mine.length && handle) work.push({ ck: c.ck, profile: p, handle, due: mine, taken });
    }
  }
  if (!work.length) { await kv.set(RUN, { at: now, checked: 0 }); return { checked: 0 }; }
  // una lettura per profilo all'ora al massimo
  const fresh = [];
  for (const w of work) if (await kv.set(SEEN(w.profile.id), now, { nx: true, ex: 55 * 60 })) fresh.push(w);
  if (!fresh.length) return { checked: 0, waiting: work.length };
  const posts = await readProfiles([...new Set(fresh.map((w) => w.handle))].slice(0, 25));
  let marked = 0;
  const done = [];
  for (const w of fresh) {
    const matches = matchPublished(w.due, posts.get(w.handle) || [], w.taken);
    for (const m of matches) {
      const ok = await markAutoPublished(w.ck, m.itemId, { post: m.post.id, url: m.post.url, ts: m.post.ts, caption: m.caption, profile: w.profile.username });
      if (ok) { marked++; w.taken.add(m.post.id); done.push(`${w.profile.username} ${m.post.id}`); }
    }
  }
  const res = { checked: fresh.length, read: posts.size, marked, done: done.slice(0, 10) };
  await kv.set(RUN, { at: now, ...res });
  return res;
}
