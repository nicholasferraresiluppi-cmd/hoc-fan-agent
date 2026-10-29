// Radar del clipping — API (permesso social.manage: admin e ruoli Social / SMM).
//
// GET                                   profili, video con i numeri di confronto, idee salvate, spesa del mese
// POST {action:"add", text, platform}   aggiunge un profilo (link o @nome) e ne legge subito i video (~3 cent)
// POST {action:"remove", id}            toglie un profilo (e i suoi video)
// POST {action:"label", id, label, note} nome e nota per chi pubblica
// POST {action:"save", videoId, on, note}  salva / toglie un video dalle idee
// POST {action:"refresh"}               rilegge tutti i profili adesso (una volta l'ora al massimo)
export const runtime = "nodejs";
export const maxDuration = 300;

import { after } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { parseProfileInput, profileStats, scoreVideo, runBudget, MAX_PROFILES } from "@/lib/clip-radar-core";
import { loadAll, addProfile, removeProfile, updateProfile, toggleSaved, readProfiles, listProfiles, apifyConfigured } from "@/lib/clip-radar";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  let name = az.userId;
  try { const u = await currentUser(); name = u?.fullName || u?.firstName || u?.primaryEmailAddress?.emailAddress || az.userId; } catch {}
  return { by: { userId: az.userId, name } };
}

export async function GET() {
  const g = await gate();
  if (g.err) return g.err;
  const now = Date.now();
  const d = await loadAll();
  // i numeri di confronto si calcolano qui (una volta), la pagina filtra e ordina
  const videos = [];
  const profiles = d.profiles.map((p) => {
    const vids = d.videosByProfile[p.id] || [];
    const st = profileStats(vids, now);
    for (const v of vids) {
      const sc = scoreVideo(v, st, now);
      delete sc.hist;
      videos.push({ ...sc, profileId: p.id, handle: p.handle, label: p.label || null, base: st.median });
    }
    const reading = p.reading && now - p.reading < 6 * 60000;
    return { ...p, reading: Boolean(reading), stats: st };
  });
  return Response.json({
    configured: apifyConfigured(), profiles, videos, saved: d.saved, run: d.run,
    spent: Math.round(d.spent * 100) / 100, cap: d.cap, max: MAX_PROFILES, now,
  }, noStore);
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const body = await request.json().catch(() => ({}));
  const bad = (m, s = 400) => Response.json({ error: m }, { status: s });
  try {
    if (body.action === "add") {
      if (!apifyConfigured()) return bad("Apify non è configurato sul server: i video non si possono leggere", 503);
      const parsed = parseProfileInput(body.text, body.platform === "tt" ? "tt" : "ig");
      if (!parsed) return bad("Non riconosco il profilo: incolla il link (instagram.com/… o tiktok.com/@…) o scrivi @nome");
      const r = await addProfile(parsed, g.by);
      if (r.exists) return Response.json({ ok: true, id: r.id, exists: true });
      after(() => readProfiles([r.prof]).catch(() => updateProfile(r.id, { reading: null, error: "Lettura non riuscita: si riprova stanotte" }).catch(() => {})));
      return Response.json({ ok: true, id: r.id, cost: runBudget(1, parsed.platform) });
    }
    if (body.action === "remove") {
      if (!body.id) return bad("Manca il profilo");
      await removeProfile(String(body.id));
      return Response.json({ ok: true });
    }
    if (body.action === "label") {
      if (!body.id) return bad("Manca il profilo");
      await updateProfile(String(body.id), { label: String(body.label || "").trim().slice(0, 60) || null, note: String(body.note || "").slice(0, 500) });
      return Response.json({ ok: true });
    }
    if (body.action === "save") {
      if (!body.videoId) return bad("Manca il video");
      await toggleSaved(String(body.videoId), Boolean(body.on), g.by, body.note);
      return Response.json({ ok: true });
    }
    if (body.action === "refresh") {
      if (!apifyConfigured()) return bad("Apify non è configurato sul server", 503);
      const lock = await kv.set("clipradar:manual", Date.now(), { nx: true, ex: 3600 });
      if (!lock) return bad("I profili sono già stati riletti nell'ultima ora: i numeri cambiano lentamente, riprova più tardi", 429);
      const profiles = await listProfiles();
      if (!profiles.length) return bad("Nessun profilo da leggere");
      const res = await readProfiles(profiles);
      if (res.skip === "cap") return bad(`Tetto di spesa del mese raggiunto (${res.cap} $): si riparte il mese prossimo`, 429);
      return Response.json({ ok: true, result: res });
    }
    return bad("Azione sconosciuta");
  } catch (e) {
    return bad(e?.message || "Errore", 500);
  }
}
