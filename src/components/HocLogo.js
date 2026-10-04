// Logo House of Creators, versione scelta il 03/10/2026 (prova "E"): il tetto con la
// palma resta SOPRA la parola "HOUSE" e la copre esattamente dall'inizio alla fine (la
// palma sporge a destra, come nel logo originale); scritta in Cinzel, "OF" più piccolo
// in oro. Il simbolo è largo 476 unità ma il tetto finisce a 440: da qui il 108,2%.
import { HOC_PALMA_PATH } from "@/components/HocPalma";

const BRAND_FONT = "var(--f-brand), Cinzel, 'Trajan Pro', Georgia, serif";

// letters (apertura del modulo, 04/10/2026): ogni lettera in uno span .hl-ch con --i =
// posizione, e il simbolo con classe .hl-palm, così la pagina le accende una a una.
const spell = (word, from) => [...word].map((c, i) => <span key={i} className="hl-ch" style={{ "--i": from + i }}>{c}</span>);

export default function HocLogo({ size = 28, color = "currentColor", gold = "#d9b46a", title = "House of Creators", style, className, letters = false }) {
  return (
    <span role="img" aria-label={title} className={className}
      style={{ display: "inline-flex", alignItems: "flex-end", gap: "0.3em", paddingTop: "1.9em", fontFamily: BRAND_FONT, fontWeight: 500, fontSize: size, letterSpacing: "0.16em", lineHeight: 1, color, whiteSpace: "nowrap", ...style }}>
      <span style={{ position: "relative", display: "inline-block" }}>
        <svg viewBox="0 0 476 168" aria-hidden="true" fill={gold} className={letters ? "hl-palm" : undefined}
          style={{ position: "absolute", left: 0, bottom: "100%", marginBottom: "0.14em", width: "108.2%", height: "auto", display: "block", overflow: "visible" }}>
          <path d={HOC_PALMA_PATH} />
        </svg>
        {letters ? spell("HOUSE", 0) : "HOUSE"}
      </span>
      <span style={{ fontSize: "0.7em", color: gold }}>{letters ? spell("OF", 5) : "OF"}</span>
      <span>{letters ? spell("CREATORS", 7) : "CREATORS"}</span>
    </span>
  );
}
