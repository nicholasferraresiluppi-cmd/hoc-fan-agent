// Radar creator — segnalazioni e reel su richiesta (10/10/2026).
//
// Una persona incolla (o condivide dall'iPhone) il link di un profilo o di un reel:
//   1. reel → chi l'ha pubblicato (data-slayer/instagram-post-details: legge anche i reel
//      con limite d'età, ~0,4 centesimi) e il reel finisce nella scheda;
//   2. creator già nel radar → nota "segnalata di nuovo" + verifica SUBITO (numeri e prima
//      evidenza riletti, ~3 cent; dal 21/10/2026) e chi l'aveva trovata per primo;
//   3. creator nuova → numeri del profilo (afanasenko/instagram-profile-scraper, 1 cent)
//      + PRIMA storia in evidenza (afanasenko/instagram-stories-highlights-scraper, ~2 cent):
//      il link che c'è dentro dice se ha un profilo a pagamento; se la storia TAGGA un altro
//      account, si legge il link nella bio di quell'account (apify/instagram-profile-scraper,
//      ~0,3 cent, anche privato): è il giro che le creator usano per non farsi bloccare.
// Nicchia e format restano "da classificare": li giudica una persona (o un giro di
// classificazione in sessione), mai un'etichetta inventata.
//
// Reel nella scheda: data-slayer/instagram-profile-reels (~0,2 cent a reel). I link video
// che Instagram restituisce sono FIRMATI e scadono in un paio di giorni: si tengono in KV
// 36 ore e si riprendono quando servono. Nessuna copia dei video: la scheda li riproduce
// dal server di Instagram (che li serve anche ad altri siti: cross-origin).
import { getProfiles, commitProfiles, getForgotten, getCrm, saveCrm, getReelMedia, setReelMedia } from "@/lib/scouting-store";
import { normHandle, parseRefreshItem, parseInstagramLink, linkOrHint, sigFromLink, signalWhat, parseHighlightRows, weekKey, addNote, creatorIdOf, appendHistory, applyHighlightRead, knownBefore, sameAsSuggestions, linkWhere } from "@/lib/scouting-core";

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
  const before = [...profiles];
  const i = profiles.findIndex((p) => p.h === h);
  if (i >= 0) {
    const keep = new Map((profiles[i].reels || []).map((r) => [r.sc, r]));
    for (const r of reels) keep.set(r.sc, { ...keep.get(r.sc), ...r });
    profiles[i] = { ...profiles[i], reels: [...keep.values()].sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 24), reelsAt: Date.now() };
    await commitProfiles(before, profiles);
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

/** Prima storia in evidenza: i link (sticker) e gli account taggati (menzioni). */
async function fetchFirstHighlight(h) {
  const rows = await runSync("afanasenko~instagram-stories-highlights-scraper", {
    operationMode: "highlightsByUsername", usernames: [h], maxAccounts: 1, includeHighlightItems: true,
    maxHighlightsPerAccount: 1, analyzeFrames: false, maxAnalyzedPerAccount: 0, skipPrivate: true,
  }, { maxUsd: 0.05, timeout: 120 });
  const r = parseHighlightRows(rows, { maxMentions: MAX_VIA }).get(h);
  // l'attore risponde sempre con una riga per account: né letto né privato/sparito = non letta
  if (!r?.read && !r?.gone) throw new Error("evidenza non letta");
  return { urls: r.urls, mentions: r.mentions };
}

const MAX_VIA = 3;

/**
 * La bio degli account taggati nella prima evidenza (anche se PRIVATI: il link in bio di un
 * account privato è pubblico). apify/instagram-profile-scraper, ~0,3 cent a account;
 * afanasenko salta i privati, che sono proprio il caso tipico ("imieilinkzz").
 */
async function fetchViaLinks(handles) {
  if (!handles.length) return [];
  const rows = await runSync("apify~instagram-profile-scraper", { usernames: handles }, { maxUsd: 0.03, timeout: 90 });
  const out = [];
  for (const r of rows) {
    const h = normHandle(r.username || "");
    if (!h || !handles.includes(h)) continue;
    const urls = new Set();
    if (r.externalUrl) urls.add(r.externalUrl);
    for (const l of Array.isArray(r.externalUrls) ? r.externalUrls : []) if (l?.url) urls.add(l.url);
    out.push({ h, urls: [...urls].slice(0, 5), priv: !!r.private });
  }
  return out;
}

/**
 * Evidenza + giro dei tag. Mai bloccante: senza, la scheda nasce lo stesso.
 * hlVia null = evidenza NON letta (non si salva: una nuova segnalazione la riprova).
 */
async function readHighlight(h) {
  let hl = { urls: [], mentions: [] };
  try { hl = await fetchFirstHighlight(h); } catch { return { hlLinks: [], hlVia: null }; }
  let hlVia = [];
  try { hlVia = await fetchViaLinks(hl.mentions); } catch { hlVia = hl.mentions.map((m) => ({ h: m, urls: [] })); }
  return { hlLinks: hl.urls, hlVia };
}

/** Quello che la segnalazione ha trovato, in breve (per la riga e la finestra). */
function resultOf(p) {
  const l = linkOrHint([p]);
  return { fol: p.fol ?? null, medv: p.medv ?? null, link: l ? { label: l.label, where: linkWhere(l, { short: true }), strength: l.strength } : null };
}

/** Fatti noti su un account PRIMA della segnalazione (null = non è nel radar). Letture KV, nessuna spesa. */
export async function precheckSignal(text) {
  const link = parseInstagramLink(text);
  const h = link?.handle ? normHandle(link.handle) : null;
  if (!h) return { h: null, known: null };
  const [profiles, crm] = await Promise.all([getProfiles(), getCrm()]);
  const p = profiles.find((x) => x.h === h);
  return { h, known: p ? knownBefore(p, crm.creators?.[creatorIdOf(crm, h)]) : null };
}

// Una creator già nel radar ricontrollata da meno di 6 ore non si rilegge (stessa segnalazione due volte).
const RECHECK_MS = 6 * 3600 * 1000;

/**
 * Lavora una segnalazione fino in fondo. Ritorna { status, h, msg, known, ... } con status:
 * nuova | gia_nel_radar | cancellata | non_trovata | non_instagram | errore.
 * Già nel radar = si VERIFICA SUBITO (decisione di Nicholas, 21/10/2026): numeri e prima storia
 * in evidenza riletti adesso (~3 cent), non solo una nota. `onStep` dice a che punto è.
 */
export async function processSignal({ text, by, why }, { onStep } = {}) {
  const step = async (s, extra) => { try { await onStep?.(s, extra); } catch { /* il passo è solo un'indicazione */ } };
  if (!process.env.APIFY_TOKEN) return { status: "errore", msg: "Manca la chiave Apify nelle impostazioni di HOC Pro." };
  const link = parseInstagramLink(text);
  if (!link) return { status: "non_instagram", msg: "Non è un link di Instagram." };
  let h = link.handle || null;
  let reel = null;
  let media = null;
  if (link.code) {
    await step("reel");
    const r = await fetchReelByCode(link.code);
    if (!r?.h) return { status: "non_trovata", msg: "Non riesco a leggere questo reel: prova col link del profilo." };
    h = r.h; reel = r.reel; media = r.media;
  }
  h = normHandle(h);
  if (!h) return { status: "non_trovata", msg: "Account non riconosciuto." };
  if ((await getForgotten()).has(h)) return { status: "cancellata", h, msg: "Questa creator ha chiesto di essere tolta dal radar." };

  const profiles = await getProfiles();
  const before = [...profiles]; // si salva solo la differenza: chi scrive mentre si aspetta Apify non si perde
  const crm0 = await getCrm();
  const i = profiles.findIndex((p) => p.h === h);
  const note = [`Segnalata da ${by || "qualcuno"}`, why ? `: ${String(why).slice(0, 200)}` : ""].join("");
  const known = i >= 0 ? knownBefore(profiles[i], crm0.creators?.[creatorIdOf(crm0, h)]) : null;
  // dal link di un reel l'account si scopre solo adesso: chi l'aveva trovata lo si dice subito
  if (link.code) await step("account", { h, pre: { h, known } });
  if (i >= 0) {
    const cur = profiles[i];
    let found = "";
    let warn = false;
    let checked = false;
    if (!(cur.checkedAt && Date.now() - cur.checkedAt < RECHECK_MS)) {
      const now = Date.now();
      await step("profilo");
      const row = await fetchProfileRow(h).catch(() => null);
      let next = { ...cur };
      if (row) {
        next = { ...next, fol: row.fol ?? next.fol, medv: row.medv ?? next.medv, vf: row.vf ?? next.vf, url: row.url || next.url, ...(row.bio !== undefined ? { bio: row.bio } : {}), ...(row.pic ? { pic: row.pic } : {}), hist: appendHistory(next.hist, weekKey(new Date(now)), row.fol, row.medv), lastSeen: now, missing: 0 };
      }
      await step("storia");
      const { hlLinks, hlVia } = await readHighlight(h);
      if (hlVia) next = applyHighlightRead(next, { urls: hlLinks, mentions: hlVia.map((v) => v.h) }, new Map(hlVia.map((v) => [v.h, v])), now);
      next.checkedAt = now;
      profiles[i] = next;
      checked = true;
      await commitProfiles(before, profiles);
      const l = linkOrHint([next]);
      found = ` · ${signalWhat(l, { hlFailed: !hlVia })}`;
      if (!row) found += " · numeri NON riletti (Instagram non ha risposto)";
      warn = !hlVia || !row;
    }
    if (reel) {
      const rs = new Map((profiles[i].reels || []).map((x) => [x.sc, x]));
      rs.set(reel.sc, { ...rs.get(reel.sc), ...reel, signaled: true });
      profiles[i] = { ...profiles[i], reels: [...rs.values()].sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 24) };
      await commitProfiles(before, profiles);
    }
    await noteOn(h, note, by);
    if (media) await cacheMedia(h, [media]);
    const crm = await getCrm();
    return {
      status: "gia_nel_radar", h, sig: profiles[i].sig || null, warn, known, checked,
      ...resultOf(profiles[i]), match: sameAsSuggestions(profiles, crm, h),
      msg: `@${h} era già nel radar: aggiunta la segnalazione${checked ? `, ricontrollata adesso${found}` : ", già ricontrollata nelle ultime ore"}.`,
    };
  }

  await step("profilo");
  const row = await fetchProfileRow(h);
  if (!row) return { status: "non_trovata", h, msg: `Non riesco a leggere @${h} (privato o inesistente).` };
  await step("storia");
  const { hlLinks, hlVia } = await readHighlight(h);
  const draft = { url: row.url, hlLinks, hlVia: hlVia || [] };
  const link0 = linkOrHint([draft]);
  const sig = sigFromLink(link0);
  const now = Date.now();
  const p = {
    h, fol: row.fol, medv: row.medv, vf: row.vf ?? null, sig, hl: hlLinks.length > 0, hlLinks, ...(hlVia ? { hlVia, hlAt: now } : {}),
    nic: "", fmt: "nessuno", u: 0, nota: "", ours: false, ag: false, chk: false,
    g: "Da classificare", src: "segnalata", url: row.url || "", bio: row.bio || "",
    hist: [[weekKey(new Date(now)), row.fol, row.medv]], firstSeen: now, lastSeen: now, checkedAt: now, missing: 0,
    reels: reel ? [{ ...reel, signaled: true }] : [], by: by || null,
  };
  profiles.push(p);
  await commitProfiles(before, profiles);
  await noteOn(h, note, by);
  if (media) await cacheMedia(h, [media]);
  const what = signalWhat(link0, { hlFailed: !hlVia });
  return { status: "nuova", h, sig, warn: !hlVia, known: null, checked: true, ...resultOf(p), match: sameAsSuggestions(profiles, crm0, h), msg: `@${h} aggiunta al radar · ${what}.` };
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
