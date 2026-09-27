/**
 * POST/GET /api/cron/citta-lunedi — il rituale del lunedì della città (giro 2 dei visionari, 28/09/2026):
 * una mail breve al board (HOC_ALERTS_EMAILS, come il digest degli alert) con tre cose sole —
 * priorità senza nessuno, piani riaccesi (con chi), nuovi ritardi della settimana — e il link.
 * Riconosce il processo, non fa classifiche. Smistato dal dispatcher solo il lunedì.
 * Path pubblico nel middleware: si difende con isCronAuthorized + fallback SEED (anteprima senza invio).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getCitySnapshot, getClaims, citySince, recentRelit } from "@/lib/citta";
import { getCityLive, mergeCityLive } from "@/lib/citta-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP = "https://houseofcreators.app/admin/citta";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function build() {
  const snap = await getCitySnapshot();
  if (!snap?.projects?.length) return null;
  const [live, claims, since, relit, seen] = await Promise.all([getCityLive(), getClaims(), citySince(), recentRelit(7), kv.get("citta:topseen")]);
  const merged = mergeCityLive(snap, live, { claims });
  const open = (merged.top || []).filter((x) => !(x.areas || [x.area]).some((a) => claims[`${x.tower}|${a}`]))
    .map((x) => { const first = Math.min(...(x.areas || [x.area]).map((a) => seen?.[`${x.tower}|${a}`] || Date.now())); return { ...x, days: Math.floor((Date.now() - first) / 864e5) }; });
  return { open, relit, worse: since.worse || [], base: since.base || null };
}

function html(d) {
  const li = (t) => `<li style="margin:0 0 6px">${t}</li>`;
  const sec = (title, items, empty) => `<h3 style="font:600 13px/1.4 Helvetica,Arial;margin:18px 0 6px;color:#1b1a17">${title}</h3>` + (items.length ? `<ul style="padding-left:18px;margin:0;font:14px/1.5 Helvetica,Arial;color:#3a3833">${items.map(li).join("")}</ul>` : `<p style="margin:0;font:14px/1.5 Helvetica,Arial;color:#8a8579">${empty}</p>`);
  return `<div style="max-width:560px;margin:0 auto;padding:24px;background:#f6f3ee">
<p style="font:13px Helvetica,Arial;color:#8a8579;margin:0">HOC Pro · La città</p>
<h2 style="font:500 22px/1.25 Georgia,serif;color:#1b1a17;margin:6px 0 4px">Il lunedì della città</h2>
${sec("Da prendere in carico", d.open.map((x) => `<b>${esc(x.tower)}</b> · ${esc(x.text)}${x.days >= 1 ? ` <span style="color:#8a8579">(nessuno da ${x.days} giorni)</span>` : ""}`), "Tutte le priorità hanno qualcuno che le segue.")}
${sec("Riaccesi questa settimana", d.relit.map((r) => `<b>${esc(r.tower)}</b> · ${esc(r.area)} — grazie a ${esc(r.by)}`), "Ancora nessun piano riacceso: prendere in carico è il primo passo.")}
${sec(`Nuovi ritardi${d.base ? " dal " + new Date(d.base).toLocaleDateString("it-IT", { day: "numeric", month: "long" }) : ""}`, d.worse.slice(0, 6).map(esc), "Nessun nuovo ritardo.")}
<p style="margin:22px 0 0"><a href="${APP}" style="font:500 14px Helvetica,Arial;color:#1b1a17">Apri la città →</a></p>
</div>`;
}

async function run(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const d = await build();
  if (!d) return Response.json({ sent: false, reason: "nessuna fotografia" });
  await kv.set("citta:weekly", { at: Date.now(), ...d }, { ex: 14 * 864e2 }).catch(() => {});
  // da sessione (admin): anteprima, niente invio
  if (!viaCron) return Response.json({ sent: false, preview: true, ...d });
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.HOC_ALERTS_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || !to.length) return Response.json({ sent: false, reason: "RESEND_API_KEY / HOC_ALERTS_EMAILS non configurate" });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.HOC_ALERTS_FROM || "HOC Pro <onboarding@resend.dev>", to, subject: `La città questa settimana · ${d.open.length} da prendere in carico`, html: html(d) }),
  });
  const b = await r.json().catch(() => null);
  await kv.set("cron:heartbeat:citta-lunedi", { at: Date.now(), ok: r.ok }, { ex: 40 * 864e2 }).catch(() => {});
  return Response.json({ sent: r.ok, id: b?.id || null, error: r.ok ? null : b?.message || `Resend ${r.status}` });
}
export const GET = run;
export const POST = run;
