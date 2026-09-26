// Nomi delle fasce MOSTRATI a schermo (decisione Nicholas 26/09/2026, dalla
// revisione dello stile): in italiano e non punitivi. I valori SALVATI e
// calcolati restano Critical…Elite (formula, storico, snapshot, KV invariati):
// qui si traduce solo la lettura. Vale per entrambi gli score (Vendite e Mestiere).
// Colore: le fasce basse NON sono mai rosse (il rosso = denaro negativo o
// allarme); solo le fasce alte hanno un segnale, per riconoscere chi è in alto.
import { CP } from "@/lib/brand";

export const TIER_IT = {
  Critical: "Da costruire",
  Weak: "In crescita",
  Average: "Nella media",
  Good: "Buona",
  Strong: "Forte",
  Elite: "Eccellente",
};
export const TIER_ORDER = ["Critical", "Weak", "Average", "Good", "Strong", "Elite"];

export const tierLabel = (t) => (t ? TIER_IT[t] || t : t);
export const isHighTier = (t) => t === "Strong" || t === "Elite";
export const isLowTier = (t) => t === "Critical" || t === "Weak";
export const tierColor = (t) => (isHighTier(t) ? CP.accentGreen : CP.textSecondary);
