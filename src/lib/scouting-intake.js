// Radar creator — segnalazioni e reel su richiesta (10/10/2026).
//
// Una persona incolla (o condivide dall'iPhone) il link di un profilo o di un reel:
//   1. reel → chi l'ha pubblicato (data-slayer/instagram-post-details: legge anche i reel
//      con limite d'età, ~0,4 centesimi) e il reel finisce nella scheda;
//   2. creator già nel radar → nota "segnalata di nuovo", nessuna spesa in più;
//   3. creator nuova → numeri del profilo (afanasenko/instagram-profile-scraper, 1 cent)
//      + PRIMA storia in evidenza (afanasenko/instagram-stories-highlights-scraper, ~2 cent):
//      il link che c'è dentro dice se ha un profilo a pagamento.
// Nicchia e format restano "da classificare": li giudica una persona (o un giro di
// classificazione in sessione), mai un'etichetta inventata.
//
// Reel nella scheda: data-slayer/instagram-profile-reels (~0,2 cent a reel). I link video
// che Instagram restituisce sono FIRMATI e scadono in un paio di giorni: si tengono in KV
// 36 ore e si riprendono quando servono. Nessuna copia dei video: la scheda li riproduce
// dal server di Instagram (che li serve anche ad altri siti: cross-origin).
import { getProfiles, saveProfiles, getForgotten, getCrm, saveCrm, getReelMedia, setReelMedia } from "@/lib/scouting-store";
import { normHandle, parseRefreshItem, parseInstagramLink, bestLink, weekKey, addNote, creatorIdOf } from "@/lib/scouting-core";

const API = "https://api.apify.com/v2";

async function runSync(actor, input, { maxUsd, timeout = 120 } = {}) {
  const url = `${API}/acts/${actor}/run-sync-get-dataset-items?timeout=${timeout}&maxTotalChargeUsd=${maxUsd}&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${text.slice(0, 160)}`);
  const data = text ? JSON.parse(text) : [];
  return Array.isArray(data) ? data : [];
}

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o) ?? o?.[path];

/** Un reel come lo teniamo nella scheda (solo numeri e codice: niente testo integrale). */
function reelOf(it) {
  const sc = it.code || it.shortcode;
  if (!sc) return null;
  const v = get(it, "metrics.play_count") ?? get(it, "metrics.ig_play_count") ?? get(it, "metrics.view_count") ?? it.play_count ?? null;
  const ts = it.taken_at_ts ?? it.taken_at;
  return {
    sc,
    v: v == null ? null : Number(v),
    t: ts ? (typeof ts === "number" ? ts * (ts < 1e12 ? 1000 : 1) : Date.parse(ts)) : null,
    a: get(it, "clips_metadata.audio_type") || null,
    d: it.video_duration ? Math.round(Number(it.video_duration)) : null,
  };
}
/** I link che scadono (video e copertina) + la didascalia, solo per la cache a tempo. */
function mediaOf(it) {
  const sc = it.code || it.shortcode;
  const video = it.video_url || get(it, "video_versions.url") || null;
  const thumb = it.thumbnail_url || get(it, "image_versions.items.url") || null;
  const cap = get(it, "caption.text") || "";
  return sc ? { sc, video, thumb, cap: String(cap).slice(0, 400) } : null;
}

export async function fetchReelByCode(code) {
  const rows = await runSync("data-slayer~instagram-post-details", { postUrls: [`https://www.instagram.com/reel/${code}/`] }, { maxUsd: 0.05, timeout: 90 });
  const it = rows[0];
  if (!it) return null;
  return { h: normHandle(get(it, "user.username") || ""), reel: reelOf(it), media: mediaOf(it) };
}

/** Ultimi reel di un account (numeri nel profilo, link video nella cache a tempo). */
export async function loadReels(h, n = 12) {
  const rows = await runSync("data-slayer~instagram-profile-reels", { username: h, maxResults: n }, { maxUsd: 0.06, timeout: 150 });
  const reels = rows.map(reelOf).filter(Boolean);
  const media = rows.map(mediaOf).filter(Boolean);
  if (!reels.length) return { reels: [], media: [] };
  const profiles = await getProfiles();
  const i = profiles.findIndex((p) => p.h === h);
  if (i >= 0) {
    const keep = new Map((profiles[i].reels || []).map((r) => [r.sc, r]));
    for (const r of reels) keep.set(r.sc, { ...keep.get(r.sc), ...r });
    profiles[i] = { ...profiles[i], reels: [...keep.values()].sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 24), reelsAt: Date.now() };
    await saveProfiles(profiles);
  }
  const old = (await getReelMedia(h)) || {};
  const byCode = { ...(old.byCode || {}) };
  for (const m of media) byCode[m.sc] = m;
  await setReelMedia(h, { at: Date.now(), byCode });
  return { reels, media };
}

/** Il video di un reel solo, per guardarlo nella scheda (cache a tempo). */
export async function watchReel(h, sc) {
  const r = await fetchReelByCode(sc);
  if (!r?.media) return null;
  await cacheMedia(h, [r.media]);
  return r.media;
}

/** I link video ancora validi per una creator (dalla cache a tempo), per codice reel. */
export async function reelMedia(h) {
  const m = await getReelMedia(h);
  return m?.byCode || {};
}

async function fetchProfileRow(h) {
  const rows = await runSync("afanasenko~instagram-profile-scraper", {
    operationMode: "analyzeSpecificAccounts", specificUsernamesList: [h], maxCountList: 1,
    extractEmail: false, extractPhoneNumber: false, extractWebsiteUrl: true, extractBusinessCategory: false,
    analyzeQuality: true, extractPosts: false, maxBudgetUsd: 0.02,
  }, { maxUsd: 0.05, timeout: 120 });
  return rows.map(parseRefreshItem).find((p) => p && p.h === h) || null;
}

async function fetchFirstHighlightLinks(h) {
  const rows = await runSync("afanasenko~instagram-stories-highlights-scraper", {
    operationMode: "highlightsByUsername", usernames: [h], maxAccounts: 1, includeHighlightItems: true,
    maxHighlightsPerAccount: 1, analyzeFrames: false, maxAnalyzedPerAccount: 0, skipPrivate: true,
  }, { maxUsd: 0.05, timeout: 120 });
  const urls = new Set();
  for (const r of rows) {
    const ls = r.linkStickers;
    // l'attore a volte restituisce l'elenco come testo in stile Python ("[{'url': '…'}]")
    if (typeof ls === "string") for (const m of ls.matchAll(/['"]url['"]\s*:\s*['"]([^'"]+)['"]/g)) urls.add(m[1]);
    else for (const l of Array.isArray(ls) ? ls : []) if (l?.url) urls.add(l.url);
  }
  return [...urls].slice(0, 5);
}

/**
 * Lavora una segnalazione fino in fondo. Ritorna { status, h, msg } con status:
 * nuova | gia_nel_radar | cancellata | non_trovata | non_instagram | errore.
 */
export async function processSignal({ text, by, why }) {
  if (!process.env.APIFY_TOKEN) return { status: "errore", msg: "Manca la chiave Apify nelle impostazioni di HOC Pro." };
  const link = parseInstagramLink(text);
  if (!link) return { status: "non_instagram", msg: "Non è un link di Instagram." };
  let h = link.handle || null;
  let reel = null;
  let media = null;
  if (link.code) {
    const r = await fetchReelByCode(link.code);
    if (!r?.h) return { status: "non_trovata", msg: "Non riesco a leggere questo reel: prova col link del profilo." };
    h = r.h; reel = r.reel; media = r.media;
  }
  h = normHandle(h);
  if (!h) return { status: "non_trovata", msg: "Account non riconosciuto." };
  if ((await getForgotten()).has(h)) return { status: "cancellata", h, msg: "Questa creator ha chiesto di essere tolta dal radar." };

  const profiles = await getProfiles();
  const i = profiles.findIndex((p) => p.h === h);
  const note = [`Segnalata da ${by || "qualcuno"}`, why ? `: ${String(why).slice(0, 200)}` : ""].join("");
  if (i >= 0) {
    if (reel) {
      const rs = new Map((profiles[i].reels || []).map((x) => [x.sc, x]));
      rs.set(reel.sc, { ...rs.get(reel.sc), ...reel, signaled: true });
      profiles[i] = { ...profiles[i], reels: [...rs.values()].sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 24) };
      await saveProfiles(profiles);
    }
    await noteOn(h, note, by);
    if (media) await cacheMedia(h, [media]);
    return { status: "gia_nel_radar", h, msg: `@${h} era già nel radar: aggiunta la segnalazione.` };
  }

  const row = await fetchProfileRow(h);
  if (!row) return { status: "non_trovata", h, msg: `Non riesco a leggere @${h} (privato o inesistente).` };
  let hlLinks = [];
  try { hlLinks = await fetchFirstHighlightLinks(h); } catch { /* le evidenze sono un di più: senza, la scheda nasce lo stesso */ }
  const draft = { url: row.url, hlLinks };
  const link0 = bestLink([draft]);
  const sig = !link0 || link0.strength < 1 ? "nessuno" : link0.strength >= 2 ? "forte" : "debole";
  const now = Date.now();
  profiles.push({
    h, fol: row.fol, medv: row.medv, vf: row.vf ?? null, sig, hl: hlLinks.length > 0, hlLinks,
    nic: "", fmt: "nessuno", u: 0, nota: "", ours: false, ag: false, chk: false,
    g: "Da classificare", src: "segnalata", url: row.url || "", bio: row.bio || "",
    hist: [[weekKey(new Date(now)), row.fol, row.medv]], firstSeen: now, lastSeen: now, missing: 0,
    reels: reel ? [{ ...reel, signaled: true }] : [], by: by || null,
  });
  await saveProfiles(profiles);
  await noteOn(h, note, by);
  if (media) await cacheMedia(h, [media]);
  const what = sig === "forte" ? `${link0.label} trovato ${link0.where === "evidenza" ? "nella prima evidenza" : "in bio"}` : sig === "debole" ? "solo una pagina di link" : "nessun profilo a pagamento visibile";
  return { status: "nuova", h, sig, msg: `@${h} aggiunta al radar · ${what}.` };
}

async function noteOn(h, text, by) {
  const crm = await getCrm();
  await saveCrm(addNote(crm, creatorIdOf(crm, h), text, by));
}
async function cacheMedia(h, list) {
  const old = (await getReelMedia(h)) || {};
  const byCode = { ...(old.byCode || {}) };
  for (const m of list) if (m) byCode[m.sc] = m;
  await setReelMedia(h, { at: Date.now(), byCode });
}
