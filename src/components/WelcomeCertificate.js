"use client";

// L'attestato di benvenuto in pagina: stessa composizione dell'email
// (lib/welcome-card → welcomeEmailHtml), colori fissi PAPER per essere identico
// in tema chiaro e scuro. Usato dall'anteprima dell'editor (Membri) e dalla
// schermata di primo accesso (WelcomeAttestato).
import { PAPER as P } from "@/lib/welcome-card";

const serif = "Georgia, 'Times New Roman', serif";
const sans = "var(--font-body, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif)";

function Corner({ pos }) {
  const s = { position: "absolute", width: 18, height: 18, borderColor: P.accent, borderStyle: "solid", borderWidth: 0 };
  const map = {
    tl: { top: 16, left: 16, borderTopWidth: 2, borderLeftWidth: 2 },
    tr: { top: 16, right: 16, borderTopWidth: 2, borderRightWidth: 2 },
    bl: { bottom: 16, left: 16, borderBottomWidth: 2, borderLeftWidth: 2 },
    br: { bottom: 16, right: 16, borderBottomWidth: 2, borderRightWidth: 2 },
  };
  return <span aria-hidden style={{ ...s, ...map[pos] }} />;
}

export default function WelcomeCertificate({ card, cta, compact }) {
  if (!card) return null;
  const pad = compact ? "30px 26px 26px" : "44px 48px 36px";
  return (
    <article style={{ position: "relative", background: P.paper, color: P.ink, borderRadius: 6, border: `1px solid ${P.rule}`, padding: 10,
      boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.10)",
      backgroundImage: `radial-gradient(ellipse at top, #ffffff 0%, ${P.paper} 60%)` }}>
      <div style={{ position: "relative", border: `1px solid ${P.rule}`, borderRadius: 3, padding: pad }}>
        <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

        <div style={{ textAlign: "center" }}>
          <div style={{ font: `600 11px/1 ${sans}`, letterSpacing: 3, textTransform: "uppercase", color: P.faint }}>{card.kicker}</div>
          <div style={{ height: 1, width: 64, background: P.accent, margin: "18px auto 22px" }} />
          <h2 style={{ font: `400 ${compact ? 26 : 32}px/1.2 ${serif}`, margin: 0, color: P.ink }}>{card.heading}</h2>
          <div style={{ font: `italic 14px/1.4 ${serif}`, color: P.faint, margin: "18px 0 6px" }}>questo attestato è per</div>
          <div style={{ display: "inline-block", font: `400 ${compact ? 30 : 38}px/1.2 ${serif}`, color: P.ink, paddingBottom: 8, borderBottom: `2px solid ${P.accent}` }}>{card.recipient}</div>
          {card.creator && <div style={{ font: `13px/1.4 ${sans}`, color: P.faint, marginTop: 10 }}>{card.creator}</div>}
          <div style={{ margin: "20px 0 4px" }}>
            <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, background: P.accentSoft, color: P.accent, font: `500 12px/1 ${sans}`, letterSpacing: 1, textTransform: "uppercase" }}>{card.badge}</span>
          </div>
        </div>

        <div style={{ margin: "24px auto 8px", maxWidth: 560 }}>
          {card.paragraphs.map((p, i) => (
            <p key={i} style={{ margin: "0 0 14px", font: `15px/1.65 ${sans}`, color: P.soft, whiteSpace: "pre-line" }}>{p}</p>
          ))}
        </div>

        {cta && <div style={{ textAlign: "center", margin: "8px 0 22px" }}>{cta}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, maxWidth: 560, margin: "18px auto 0" }}>
          <div>
            <div style={{ font: `italic 20px/1.2 ${serif}`, color: P.ink }}>{card.signName}</div>
            <div style={{ height: 1, background: P.rule, margin: "8px 0 6px", width: 220, maxWidth: "100%" }} />
            <div style={{ font: `12px/1.4 ${sans}`, color: P.faint }}>{card.signRole}</div>
          </div>
          <div aria-hidden style={{ flexShrink: 0, width: 78, height: 78, borderRadius: "50%", border: `2px solid ${P.accent}`, outline: `1px solid ${P.accent}`, outlineOffset: 3,
            color: P.accent, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", font: `600 10px/1.3 ${sans}`, letterSpacing: 1, textTransform: "uppercase", transform: "rotate(-8deg)" }}>
            <span>HOC</span><span>Pro</span>{card.number && <span>N. {card.number}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Bottone nello stile dell'attestato (anche come <a>). */
export const certButton = { display: "inline-block", padding: "13px 28px", borderRadius: 8, background: P.accent, color: "#ffffff", textDecoration: "none", font: `500 15px/1 ${sans}`, border: "none", cursor: "pointer" };
