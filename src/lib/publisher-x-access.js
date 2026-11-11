/**
 * Chi gestisce Publisher X (11/11/2026): admin (SEED) o Referente X (publisherx.manage).
 * Il Referente X vede la vista "admin" di lib/publisher-x: link, inviti, fan per username —
 * mai fee, provvigione chatter e margine (restano a chi tiene la contabilità).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";

export async function authorizePublisherX() {
  const az = await authorize(CAPABILITIES.SEED);
  if (az.ok) return az;
  const rx = await authorize(CAPABILITIES.PUBLISHERX_MANAGE);
  return rx.ok ? rx : az;
}
