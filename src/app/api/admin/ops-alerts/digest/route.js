/**
 * POST /api/admin/ops-alerts/digest — mail del lunedì (nudge push).
 *
 * Parte SOLO se ci sono alert critici aperti: se non arriva niente, va tutto
 * bene (zero rumore by design, ADR docs/ALERT_OPERATIVI.md). La mail è il
 * richiamo, la webapp resta la destinazione: 3 righe + link a /admin/alerts.
 *
 * Invio via Resend (fetch diretto, niente SDK). Finché il dominio non è
 * verificato su Resend il mittente è onboarding@resend.dev e può recapitare
 * solo all'email dell'account Resend — configurare HOC_ALERTS_FROM dopo la
 * verifica dominio per il mittente custom.
 *
 * Env: RESEND_API_KEY, HOC_ALERTS_EMAILS (destinatari, comma-separated),
 *      HOC_ALERTS_FROM (opzionale).
 * Auth: stesso pattern di run/ (x-vercel-cron / Bearer CRON_SECRET / SEED).
 * Cron: lunedì 06:05 UTC, 5 minuti dopo il run dei check (vercel.json).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listAlerts } from "@/lib/ops-alerts";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

const APP_URL = "https://hoc-fan-agent.vercel.app";

// Auth cron centralizzata in lib/cron-auth (fix 20 lug 2026: i path cron sono
// ora pubblici nel middleware → l'header x-vercel-cron da solo non è più prova
// sufficiente quando CRON_SECRET è configurato).
const isAuthorized = (request) => isCronAuthorized(request);

const daysOpen = (ts) => Math.max(0, Math.floor((Date.now() - ts) / 86400000));

function buildHtml(critical, warningCount) {
  const rows = critical.map((a) => {
    const inCharge = a.status === "ack" ? `in carico: ${a.ackBy || "?"}` : "nessuno in carico";
    return `<li style="margin:0 0 10px 0;">
      <strong>${a.value ? `${a.value} · ` : ""}${a.title}</strong><br>
      <span style="color:#667085;font-size:13px;">aperto da ${daysOpen(a.firstSeen)} giorni · ${inCharge}</span>
    </li>`;
  }).join("");
  const warnLine = warningCount > 0
    ? `<p style="color:#667085;font-size:13px;margin:16px 0 0 0;">+ ${warningCount} avvisi non critici aperti.</p>`
    : "";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;color:#1a1f2b;">
    <p style="font-size:14px;margin:0 0 16px 0;">Alert critici aperti in HOC Pro:</p>
    <ul style="padding-left:18px;margin:0;">${rows}</ul>
    ${warnLine}
    <p style="margin:22px 0 0 0;">
      <a href="${APP_URL}/admin/alerts" style="font-size:14px;color:#6d5ef0;font-weight:600;">Apri gli alert in HOC Pro &rarr;</a>
    </p>
    <p style="color:#98a2b3;font-size:12px;margin:26px 0 0 0;">
      Questa mail parte solo quando ci sono alert critici aperti. Gli alert si chiudono da soli quando la condizione rientra.
    </p>
  </div>`;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipients = (process.env.HOC_ALERTS_EMAILS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || recipients.length === 0) {
    return Response.json({ error: "RESEND_API_KEY / HOC_ALERTS_EMAILS non configurate" }, { status: 500 });
  }

  const { alerts } = await listAlerts();
  const open = alerts.filter((a) => a.status !== "resolved");
  const critical = open.filter((a) => a.severity === "critical");
  const warningCount = open.length - critical.length;

  if (critical.length === 0) {
    return Response.json({ sent: false, reason: "nessun alert critico aperto" });
  }

  const subject = critical.length === 1
    ? "1 alert critico aperto · HOC Pro"
    : `${critical.length} alert critici aperti · HOC Pro`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.HOC_ALERTS_FROM || "HOC Pro <onboarding@resend.dev>",
      to: recipients,
      subject,
      html: buildHtml(critical, warningCount),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("ops-alerts digest send failed:", res.status, body);
    return Response.json({ error: body?.message || `Resend HTTP ${res.status}` }, { status: 502 });
  }

  const summary = { at: Date.now(), recipients: recipients.length, critical: critical.length, resend_id: body?.id || null };
  await kv.set("ops:alerts:last_digest", summary);
  return Response.json({ sent: true, ...summary });
}

export async function GET(request) {
  return POST(request);
}
