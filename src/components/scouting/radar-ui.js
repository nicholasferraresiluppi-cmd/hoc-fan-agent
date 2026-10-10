"use client";
// Radar creator — pezzi condivisi tra le viste (10/10/2026). Stile: token CP (seguono il tema
// e lo stile "Casa"), titoli in serif (--cp-sig), niente riquadri pesanti: linee sottili.
import { CP, FONTS, alpha } from "@/lib/brand";

export const NUM = { fontVariantNumeric: "tabular-nums" };
export const SERIF = { fontFamily: FONTS.signature, fontWeight: 400, letterSpacing: "-0.01em" };

export const fmtN = (v) => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })} M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : v.toLocaleString("it-IT"));
export const fmtFull = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT"));
export const fmtPct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);
export const fmtDate = (t) => (t ? new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");
export const igProfile = (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`;
export const igReel = (sc) => `https://www.instagram.com/reel/${encodeURIComponent(sc)}/`;

export const btn = { padding: "9px 16px", borderRadius: 999, border: `1px solid ${CP.border}`, background: "transparent", color: CP.textPrimary, fontSize: 13.5, cursor: "pointer", fontFamily: FONTS.body, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40 };
export const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, borderColor: CP.accent, fontWeight: 600 };
export const btnQuiet = { ...btn, border: "none", color: CP.textSecondary, padding: "9px 6px" };
export const input = { padding: "10px 12px", borderRadius: 10, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, minWidth: 0 };

export function Initials({ name, size = 52, gold }) {
  const clean = String(name || "").replace(/^@/, "").replace(/[._\d]+/g, " ").trim().split(/\s+/);
  const ini = ((clean[0]?.[0] || "") + (clean[1]?.[0] || clean[0]?.[1] || "")).toUpperCase();
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flex: "0 0 auto", borderRadius: "50%", background: CP.surfaceAlt || CP.surface, border: `1px solid ${gold ? alpha(CP.gold, "88") : CP.border}`, display: "flex", alignItems: "center", justifyContent: "center", ...SERIF, fontSize: size * 0.42 }}>{ini}</span>
  );
}

/** Dove porta il profilo: "Telegram privato · nella prima evidenza". */
export function LinkChip({ link, sig }) {
  if (!link && sig !== "forte") return <span style={{ fontSize: 12.5, color: CP.textMuted }}>Nessun link trovato</span>;
  const strong = link ? link.strength >= 2 : true;
  const text = link ? `${link.label} · ${link.where === "evidenza" ? "nella prima evidenza" : "in bio"}` : "Profilo a pagamento";
  return (
    <span style={{ alignSelf: "flex-start", fontSize: 12.5, color: strong ? CP.gold : CP.textSecondary, border: `1px solid ${strong ? alpha(CP.gold, "55") : CP.border}`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{text}</span>
  );
}

export function Growth({ v }) {
  const c = v == null ? CP.textMuted : v >= 5 ? CP.accentGreen : v < 0 ? CP.textSecondary : CP.textPrimary;
  return <span style={{ color: c, ...NUM }}>{v == null ? "—" : fmtPct(v)}</span>;
}

/** Linea dei follower (storico [settimana, follower]); con meno di due punti dice quando arriva. */
export function Spark({ hist, w = 96, h = 26, big }) {
  const pts = (hist || []).filter((p) => p[1] != null);
  if (pts.length < 2) return big ? <p style={{ fontSize: 13.5, color: CP.textMuted, margin: 0 }}>La linea della crescita compare dal secondo giro settimanale dei numeri.</p> : <span style={{ fontSize: 12, color: CP.textMuted }}>—</span>;
  const vals = pts.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const W = big ? 700 : w, H = big ? 140 : h, pad = big ? 10 : 3;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => (max === min ? H / 2 : H - pad - ((v - min) * (H - 2 * pad)) / (max - min));
  const line = pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ");
  const label = `Follower da ${fmtN(vals[0])} a ${fmtN(vals[vals.length - 1])} in ${pts.length} settimane`;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: big ? "100%" : w, height: H, display: "block" }} role="img" aria-label={label}>
        {big && <polygon points={`${line} ${x(pts.length - 1)},${H - pad} ${x(0)},${H - pad}`} fill={alpha(CP.scale, "18")} />}
        <polyline points={line} fill="none" stroke={CP.scale} strokeWidth={big ? 2 : 1.6} vectorEffect="non-scaling-stroke" />
        {big && <circle cx={x(pts.length - 1)} cy={y(vals[vals.length - 1])} r="4" fill={CP.scale} />}
      </svg>
      {big && (
        <figcaption style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: CP.textMuted, marginTop: 6 }}>
          <span>{pts[0][0]} · {fmtN(vals[0])}</span><span>{pts[pts.length - 1][0]} · {fmtN(vals[vals.length - 1])}</span>
        </figcaption>
      )}
    </figure>
  );
}

export function H2({ children, sub, id }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h2 id={id} style={{ margin: 0, ...SERIF, fontSize: 30, lineHeight: 1.1, color: CP.textPrimary }}>{children}</h2>
      {sub && <p style={{ margin: 0, color: CP.textSecondary, fontSize: 14 }}>{sub}</p>}
    </div>
  );
}

export function BigNum({ value, label, gold }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...SERIF, fontSize: 48, lineHeight: 1, color: gold ? CP.gold : CP.textPrimary, ...NUM }}>{value}</span>
      <span style={{ fontSize: 13.5, color: CP.textSecondary }}>{label}</span>
    </div>
  );
}

export const STAGE_LABEL = { da_valutare: "Da valutare", interessante: "Interessante", contattata: "Contattata", trattativa: "In trattativa", firmata: "Firmata", scartata: "Scartata" };
