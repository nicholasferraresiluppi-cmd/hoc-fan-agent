/**
 * /t/{id} — la tessera di una persona, aperta a chiunque abbia il link (05/10/2026).
 * Pubblica (middleware): mostra solo nome, competenze e lingue (lib/hr-tessera-link).
 */
import { notFound } from "next/navigation";
import { getTesseraCard } from "@/lib/hr-tessera-link";
import TesseraPubblica from "./TesseraPubblica";

export const dynamic = "force-dynamic";
export const metadata = { title: "La tessera · House of Creators", robots: { index: false, follow: false } };

export default async function Page({ params }) {
  const { id } = await params;
  const card = id === "esempio"
    ? { data: { firstName: "Giulia", surname: "Rossi", gender: "Female", skillLevels: { of_chat: "Esperto", soc_instagram: "Autonomo" }, spokenLanguages: ["ITA - Native", "ENG - Advanced"] }, at: Date.now() }
    : await getTesseraCard(id).catch(() => null);
  if (!card?.data) notFound();
  return <TesseraPubblica data={card.data} at={card.at} />;
}
