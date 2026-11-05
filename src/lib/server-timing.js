// Cronometro per le tappe di una richiesta (29/10/2026): finisce nell'intestazione Server-Timing,
// che il browser mostra in Strumenti per sviluppatori › Rete › Tempi. Serve a sapere DOVE si perde
// il tempo prima di cambiare qualcosa (lezione della regione fra1: ipotesi non misurata = peggio).
export function serverTiming() {
  const t0 = performance.now();
  let last = t0;
  const marks = [];
  return {
    /** Chiude la tappa partita dall'ultimo mark. */
    mark(name) { const now = performance.now(); marks.push([name, now - last]); last = now; },
    header() {
      const parts = marks.map(([n, d]) => `${n};dur=${d.toFixed(1)}`);
      parts.push(`total;dur=${(performance.now() - t0).toFixed(1)}`);
      return parts.join(", ");
    },
  };
}
