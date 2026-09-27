"use client";
// Le parole che usiamo (27/09/2026, pannello pilota: "PPV, fascia, scaglione… non so cosa sono").
// Una riga per parola, in italiano semplice. Chiuso di default: si apre quando serve.
import { useState } from "react";
import { Disclosure } from "@/components/ds";
import { CP } from "@/lib/brand";

const TERMS = [
  ["PPV", "Contenuto a pagamento che mandi in chat: il fan lo sblocca pagando."],
  ["Cadenza PPV", "Ogni quanto proponi un contenuto a pagamento durante il turno."],
  ["Tasso di domande", "Quante delle tue frasi sono domande. Da noi troppe domande di fila rallentano la vendita."],
  ["Score Vendite", "Quanto vendi per turno rispetto ai colleghi sulle stesse creator. Conta per le revisioni mensili."],
  ["Score Mestiere", "Come lavori in chat (risposte, conversione, cura). Conta per il percorso di carriera."],
  ["Fascia", "Il livello del tuo score, per esempio Buona o Forte."],
  ["Scaglione", "La percentuale del venduto che ti viene riconosciuta: sale a gradini con il venduto del turno."],
  ["Coseller", "Un collega sulla stessa creator nello stesso turno: il venduto si divide tra voi."],
  ["Mass", "Messaggio mandato a molti fan insieme."],
  ["Upsell", "Proporre qualcosa in più a chi ha appena comprato."],
];

export default function Glossario() {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure open={open} onToggle={() => setOpen((v) => !v)} title="Le parole che usiamo" summary="PPV, fascia, scaglione, coseller…">
      <dl style={{ margin: 0, display: "grid", gap: 8 }}>
        {TERMS.map(([t, d]) => (
          <div key={t} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 150px) 1fr", gap: 12, fontSize: 14, lineHeight: 1.5 }}>
            <dt style={{ color: CP.textPrimary, fontWeight: 500 }}>{t}</dt>
            <dd style={{ margin: 0, color: CP.textSecondary }}>{d}</dd>
          </div>
        ))}
      </dl>
    </Disclosure>
  );
}
