// Attestato di benvenuto — lato server: modello modificabile (KV), numerazione,
// invio email, attestato "in attesa" da mostrare al primo accesso.
//
// Invio: Resend. L'email a un operatore parte SOLO se è configurato un mittente
// su dominio verificato (env HOC_MAIL_FROM, es. "HOC Pro <ciao@houseofcreators.app>").
// Senza, Resend accetta solo il mittente di prova, che consegna soltanto al
// proprietario dell'account: in quel caso l'invito resta quello standard di Clerk
// e l'attestato compare al primo accesso nell'app (mai un invio che fallisce in
// silenzio).
import { kv } from "@vercel/kv";
import { sanitizeWelcome, DEFAULT_WELCOME } from "@/lib/welcome-card";

const TEMPLATE_KEY = "welcome:template";
const SEQ_KEY = "welcome:seq";
const PENDING_KEY = (userId) => `welcome:pending:${userId}`;

export async function getWelcomeTemplate() {
  const saved = await kv.get(TEMPLATE_KEY).catch(() => null);
  return { template: sanitizeWelcome(saved?.template || DEFAULT_WELCOME), updated_at: saved?.updated_at || null, updated_by: saved?.updated_by || null };
}

export async function saveWelcomeTemplate(template, { userId, name } = {}) {
  const clean = sanitizeWelcome(template);
  await kv.set(TEMPLATE_KEY, { template: clean, updated_at: Date.now(), updated_by: name || userId || null });
  return clean;
}

export async function resetWelcomeTemplate() {
  await kv.del(TEMPLATE_KEY);
  return sanitizeWelcome(DEFAULT_WELCOME);
}

/** Numero progressivo dell'attestato (N. 001, 002…). */
export async function nextWelcomeNumber() {
  return kv.incr(SEQ_KEY);
}

export function mailStatus() {
  const hasKey = !!process.env.RESEND_API_KEY;
  const from = process.env.HOC_MAIL_FROM || null;
  return {
    ready: hasKey && !!from,
    has_key: hasKey,
    from: from || process.env.HOC_ALERTS_FROM || "HOC Pro <onboarding@resend.dev>",
    reason: !hasKey ? "Manca la chiave Resend" : !from ? "Dominio di invio non verificato (manca HOC_MAIL_FROM)" : null,
  };
}

export async function sendMail({ to, subject, html, text }) {
  const st = mailStatus();
  if (!st.has_key) throw new Error("Invio email non configurato");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: st.from, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `Resend HTTP ${res.status}`);
  return body?.id || null;
}

// Attestato da mostrare al primo accesso (scritto quando l'account si collega all'invito)
export async function setPendingWelcome(userId, data) {
  await kv.set(PENDING_KEY(userId), { ...data, at: Date.now() }, { ex: 60 * 60 * 24 * 120 });
}
export async function getPendingWelcome(userId) {
  return kv.get(PENDING_KEY(userId)).catch(() => null);
}
export async function clearPendingWelcome(userId) {
  await kv.del(PENDING_KEY(userId));
}
