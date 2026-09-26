// La città (26/09/2026): l'azienda come città — un palazzo per ogni spazio ClickUp
// (quartiere creator + quartiere sede), piani = cartelle/liste, luci = stato.
// I dati sono una FOTOGRAFIA di ClickUp caricata in KV (non una lettura live: l'app
// non ha ancora una chiave API ClickUp). La pagina dichiara sempre la data della foto.
import { kv } from "@vercel/kv";

export const CITTA_KEY = "citta:snapshot";
const MAX_SPACES = 200;
const MAX_FLOORS = 12;

const str = (v, n = 120) => String(v ?? "").slice(0, n);
const int = (v) => Math.max(0, Math.min(1e6, Math.round(Number(v) || 0)));

/** Normalizza e limita una fotografia (niente campi estranei, niente testi lunghi). */
export function cleanSnapshot(raw) {
  if (!raw || !Array.isArray(raw.spaces)) throw new Error("Formato non valido: servono { generated, spaces[] }");
  const generated = /^\d{4}-\d{2}-\d{2}$/.test(raw.generated || "") ? raw.generated : null;
  if (!generated) throw new Error("Data della fotografia mancante (generated: AAAA-MM-GG)");
  const spaces = raw.spaces.slice(0, MAX_SPACES).map((s) => ({
    id: str(s.id, 40),
    name: str(s.name, 80),
    district: s.district === "creator" ? "creator" : "sede",
    open: int(s.open),
    overdue: int(s.overdue),
    in_progress: int(s.in_progress),
    last_update: /^\d{4}-\d{2}-\d{2}$/.test(s.last_update || "") ? s.last_update : null,
    stale: Boolean(s.stale),
    truncated: Boolean(s.truncated),
    people: (Array.isArray(s.people) ? s.people : []).slice(0, 6).map((p) => [str(p?.[0], 40), int(p?.[1])]),
    late_items: (Array.isArray(s.late_items) ? s.late_items : []).slice(0, 5).map((t) => str(t, 90)),
    floors: (Array.isArray(s.floors) ? s.floors : []).slice(0, MAX_FLOORS).map((f) => ({ name: str(f?.name, 60), open: int(f?.open), overdue: int(f?.overdue) })),
  })).filter((s) => s.id && s.name);
  return { generated, spaces, saved_at: Date.now() };
}

export async function getCitySnapshot() {
  return (await kv.get(CITTA_KEY)) || null;
}

export async function saveCitySnapshot(raw) {
  const snap = cleanSnapshot(raw);
  await kv.set(CITTA_KEY, snap);
  return snap;
}
