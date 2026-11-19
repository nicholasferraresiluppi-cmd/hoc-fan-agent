// Radar salary — chi può usarlo: il ruolo Salary (18/11/2026, solo questa pagina), il Radar creator
// (SMM, admin) o chi gestisce gli account social. Le impostazioni restano admin (SEED).
import { authorize, CAPABILITIES } from "@/lib/rbac";

export async function authorizeSalaryRadar() {
  const s = await authorize(CAPABILITIES.SALARY_RADAR);
  if (s.ok) return s;
  const a = await authorize(CAPABILITIES.SCOUTING_USE);
  if (a.ok) return a;
  const b = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  return b.ok ? b : a;
}

export const fail = (e) => Response.json({ error: e?.message || "Errore." }, { status: e?.status || 500 });
