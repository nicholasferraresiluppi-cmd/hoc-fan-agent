// Accessi è confluita in Membri (27/09/2026): lo stato admin si gestisce dal pannello del membro.
import { redirect } from "next/navigation";

export default function AccessPage() {
  redirect("/admin/ruoli");
}
