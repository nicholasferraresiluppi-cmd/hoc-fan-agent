// Il modulo pubblico NON usa lo scheletro grigio dell'app: sul telefono si vedeva un lampo
// chiaro prima dell'apertura (05/10/2026). Qui solo il fondo scuro dell'apertura, identico.
export default function Loading() {
  return <div aria-busy="true" aria-label="Caricamento" style={{ position: "fixed", inset: 0, background: "radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%)" }} />;
}
