"use client";

// L'Editoriale è diventato la scheda «Contenuti» di Social (29/10/2026, Nicholas: «uniscili»).
// Questo indirizzo resta per i link già girati e porta lì.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EditorialeRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/warmup?tab=contenuti"); }, [router]);
  return null;
}
