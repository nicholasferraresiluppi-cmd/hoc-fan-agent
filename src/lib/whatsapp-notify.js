/**
 * Avviso WhatsApp a Nicholas (04/10/2026): stesso canale del robot Infloww (CallMeBot,
 * ~/infloww-daily/notify.py), qui lato server. Usato quando una persona invia il modulo HR.
 *
 * Config: HR_WHATSAPP_PHONE + HR_WHATSAPP_APIKEY (env di Vercel). Senza config non fa nulla.
 * Non solleva mai: un avviso mancato non deve far fallire l'invio del modulo.
 * Nel testo solo il nome e il link alla scheda: nessun altro dato personale passa a CallMeBot.
 */
export function whatsappConfigured() {
  return Boolean(process.env.HR_WHATSAPP_PHONE && process.env.HR_WHATSAPP_APIKEY);
}

export async function notifyWhatsApp(text, { timeoutMs = 10000 } = {}) {
  if (!whatsappConfigured()) return { ok: false, skipped: true };
  try {
    const q = new URLSearchParams({ phone: process.env.HR_WHATSAPP_PHONE, text: String(text).slice(0, 900), apikey: process.env.HR_WHATSAPP_APIKEY });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`https://api.callmebot.com/whatsapp.php?${q}`, { signal: ctrl.signal });
    clearTimeout(t);
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false };
  }
}

/**
 * "Antonio Marucci ha compilato il modulo HR." + link alla scheda.
 * doc: "caricato" (modulo completo col documento) | "manca" (dati inviati, documento non arrivato) | null
 */
export function newFormMessage(person, origin = "https://houseofcreators.app", { doc = null } = {}) {
  const f = person?.fields || {};
  const name = [f.firstName, f.surname].map((x) => String(x || "").trim()).filter(Boolean).join(" ") || "Una persona";
  const via = f.source === "Me l'ha consigliato qualcuno" && f.referredBy ? `\nSegnalato da: ${String(f.referredBy).trim()}` : "";
  const what = doc === "caricato" ? "ha completato il modulo HR (documento caricato)."
    : doc === "manca" ? "ha inviato i dati del modulo HR ma NON ha completato il documento d'identità."
    : "ha compilato il modulo HR.";
  return `${name} ${what}${via}\n${origin}/admin/hr/${encodeURIComponent(person?.id || "")}`;
}
