/**
 * Client del bot presenze Discord (servizio Railway `hoc-presenze`, codice in ~/Documents/progetti/hoc-discord-setup/presenze).
 * Il bot registra chi sta nelle stanze vocali del server «HOC House of Creators» ed espone un'API in sola lettura.
 * Env: HOC_PRESENZE_API_URL (es. https://presenze-production-xxxx.up.railway.app), HOC_PRESENZE_API_SECRET (Bearer).
 * Giornata = dalle 05:00 alle 05:00 (ora italiana), decisa lato bot.
 */
const base = () => String(process.env.HOC_PRESENZE_API_URL || "").trim().replace(/\/$/, "");
const secret = () => String(process.env.HOC_PRESENZE_API_SECRET || "").trim();

export const presenzeConfigured = () => Boolean(base() && secret());

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{5,25}$/;

/** view: days | day | person | range. Valida i parametri prima di chiamare il bot. */
export async function fetchPresenze(view, { day, id, days } = {}) {
  const q = new URLSearchParams();
  if (day) { if (!DAY_RE.test(day)) throw Object.assign(new Error("Giorno non valido."), { status: 400 }); q.set("day", day); }
  if (view === "person" || view === "range") {
    if (!ID_RE.test(String(id || ""))) throw Object.assign(new Error("Persona non valida."), { status: 400 });
    q.set("id", id);
  }
  if (view === "range") q.set("days", String(Math.min(90, Math.max(1, Number(days) || 30))));
  const path = { days: "/api/days", day: "/api/day", person: "/api/person", range: "/api/person-range" }[view];
  if (!path) throw Object.assign(new Error("Vista non valida."), { status: 400 });
  const r = await fetch(`${base()}${path}?${q}`, {
    headers: { Authorization: `Bearer ${secret()}` },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const text = await r.text();
  if (!r.ok) {
    const msg = r.status === 503 ? "Il bot si sta riavviando, riprova tra un minuto." : `Il bot presenze ha risposto ${r.status}: ${text.slice(0, 200)}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }
  return JSON.parse(text);
}
