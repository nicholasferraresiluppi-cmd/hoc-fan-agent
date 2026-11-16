// Radar salary — chi può usarlo: il Radar creator (SMM, admin) o chi gestisce gli account social
// (la squadra salary: social media manager e publisher). Le impostazioni restano admin (SEED).
import { authorize, CAPABILITIES } from "@/lib/rbac";

export async function authorizeSalaryRadar() {
  const a = await authorize(CAPABILITIES.SCOUTING_USE);
  if (a.ok) return a;
  const b = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  return b.ok ? b : a;
}

export const fail = (e) => Response.json({ error: e?.message || "Errore." }, { status: e?.status || 500 });
