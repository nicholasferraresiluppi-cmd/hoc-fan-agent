"use client";

// Schermata di primo accesso con l'attestato di benvenuto: compare una volta,
// solo a chi è entrato da un invito operatore (/api/me/welcome), sopra ogni
// altra finestra. "Inizia" la chiude per sempre (lato server, vale su ogni
// dispositivo).
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import WelcomeCertificate, { certButton } from "@/components/WelcomeCertificate";

export default function WelcomeAttestato() {
  const { user, isLoaded } = useUser();
  const [card, setCard] = useState(null);

  useEffect(() => {
    if (!isLoaded || !user) return;
    let alive = true;
    fetch("/api/me/welcome").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.card) setCard(j.card); }).catch(() => {});
    return () => { alive = false; };
  }, [isLoaded, user]);

  useEffect(() => {
    if (!card) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setCard(null);
    fetch("/api/me/welcome", { method: "POST" }).catch(() => {});
  }

  if (!card) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={card.heading}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,18,14,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <WelcomeCertificate card={card} cta={<button onClick={close} style={certButton}>Inizia</button>} />
      </div>
    </div>
  );
}
