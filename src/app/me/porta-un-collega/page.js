import { redirect } from "next/navigation";

// 28/10/2026: il programma si chiama «Porta un amico». Il vecchio indirizzo resta per i link già girati.
export default function OldReferralPage() {
  redirect("/me/porta-un-amico");
}
