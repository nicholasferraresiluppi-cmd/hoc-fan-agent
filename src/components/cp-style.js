"use client";

/**
 * HOC Fan Agent — Componenti UI "CP-style".
 *
 * Replicano i pattern visuali di CreatorsPro Sales Analytics:
 *   - SectionLabel : etichetta UPPERCASE letter-spaced
 *   - StatCard     : label piccola + numerone bold
 *   - TrendPill    : delta % con freccia (verde/rosso)
 *   - CreatorDot   : pallino colorato deterministico per alias creator
 *   - MiniInsight  : card piccola con label uppercase + contenuto rich
 *   - RankedItem   : riga "N. dot nome … valori a destra" stile CP
 *   - CpCard       : card neutra (background scuro + bordo sottile)
 *
 * Usano i token brand.CP per palette / brand.FONTS per tipografia.
 */
import { CP, FONTS, creatorDotColor } from "@/lib/brand";

export function SectionLabel({ children, color, size = 10, style }) {
  return (
    <span
      style={{
        color: color || CP.textMuted,
        fontFamily: FONTS.body,
        fontSize: Math.max(size, 11),
        fontWeight: 500,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function CpCard({ children, style, accent, padding = "20px 22px", onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: CP.surface,
        border: `1px solid ${accent ? accent + "55" : CP.border}`,
        borderRadius: 10,
        padding,
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, color, tooltip, accent }) {
  return (
    <div
      title={tooltip || ""}
      style={{
        background: CP.surface,
        border: `1px solid ${accent ? accent + "55" : CP.border}`,
        borderRadius: 10,
        padding: "18px 22px",
        cursor: tooltip ? "help" : "default",
        minHeight: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: CP.textSecondary,
          fontWeight: 500,
          marginBottom: 8,
          letterSpacing: "0.01em",
        }}
      >
        {label}
        {tooltip && <span style={{ marginLeft: 4, opacity: 0.4 }}>ⓘ</span>}
      </div>
      <div
        style={{
          fontFamily: FONTS.body,
          fontWeight: 500,
          fontSize: 22,
          lineHeight: 1.15,
          color: color || CP.textPrimary,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/**
 * Trend pill: cerchio arrotondato con freccia + percentuale.
 * value: numero (positivo o negativo, in punti percentuali, es. 20 = +20%)
 * neutralAt0: se true e value=0 → grigio invece di verde.
 */
export function TrendPill({ value, suffix = "%", size = "md", neutralAt0 = true }) {
  if (value == null || Number.isNaN(value)) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const isZero = value === 0;
  const color = isZero && neutralAt0 ? CP.textMuted : (isUp ? CP.accentGreen : CP.accentRed);
  const arrow = isUp ? "↑" : isDown ? "↓" : "·";
  const padding = size === "sm" ? "2px 7px" : "3px 9px";
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding,
        background: color + "18",
        color,
        borderRadius: 999,
        fontFamily: FONTS.mono,
        fontWeight: 500,
        fontSize,
        lineHeight: 1,
      }}
    >
      <span>{arrow}</span>
      <span>{Math.abs(value)}{suffix}</span>
    </span>
  );
}

export function CreatorDot({ alias, size = 10, style }) {
  const color = creatorDotColor(alias);
  return (
    <span
      title={alias}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/**
 * Mini insight card: usata per "Best performance", "Worst performance",
 * "Best shift" — label uppercase muted + contenuto bold.
 */
export function MiniInsight({ label, children, accent, value }) {
  return (
    <div
      style={{
        background: CP.surface,
        border: `1px solid ${CP.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <SectionLabel color={CP.textMuted} size={10}>{label}</SectionLabel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1, fontSize: 14, color: CP.textPrimary, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {children}
        </div>
        {value != null && (
          <div style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 500, color: accent || CP.textPrimary, whiteSpace: "nowrap" }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Ranked list item: stile CP "Revenue Split by Creator"
 *   N. ● Nome (badge?) ............ $value pct% trend%
 *
 * cols: array di { label?, value, color?, fontFamily? } — renderizzate a destra.
 */
export function RankedItem({ rank, dotAlias, dotColor, name, badge, cols = [], href, onClick }) {
  const dotCol = dotColor || (dotAlias ? creatorDotColor(dotAlias) : CP.textMuted);
  const Wrapper = href ? "a" : "div";
  const wrapperProps = href ? { href } : (onClick ? { onClick } : {});
  return (
    <Wrapper
      {...wrapperProps}
      style={{
        display: "grid",
        gridTemplateColumns: `36px 14px 1fr ${cols.map(() => "auto").join(" ")}`,
        gap: 16,
        alignItems: "center",
        padding: "12px 18px",
        borderBottom: `1px solid ${CP.border}`,
        color: CP.textPrimary,
        textDecoration: "none",
        cursor: href || onClick ? "pointer" : "default",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => { if (href || onClick) e.currentTarget.style.background = CP.surfaceAlt; }}
      onMouseLeave={(e) => { if (href || onClick) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textMuted, fontWeight: 500, textAlign: "right" }}>
        {rank != null ? `${rank}.` : ""}
      </div>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotCol }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        {badge && (
          <span style={{ padding: "2px 8px", background: CP.accentGreen + "22", color: CP.accentGreen, fontSize: 10, fontWeight: 500, borderRadius: 4, letterSpacing: "0.04em" }}>
            {badge}
          </span>
        )}
      </div>
      {cols.map((c, i) => (
        <div
          key={i}
          style={{
            fontFamily: c.fontFamily || FONTS.mono,
            fontSize: 14,
            fontWeight: 500,
            color: c.color || CP.textPrimary,
            whiteSpace: "nowrap",
            textAlign: "right",
            minWidth: c.minWidth || 70,
          }}
        >
          {c.value}
        </div>
      ))}
    </Wrapper>
  );
}

/**
 * PageHeader — Header pattern uniforme stile CP per pagine principali.
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │  SECTION · subtitle                  [toolbar]   │
 *   │  Title big                                       │
 *   │  Subtitle muted                                  │
 *   └──────────────────────────────────────────────────┘
 */
export function PageHeader({ section, title, subtitle, toolbar, breadcrumb }) {
  return (
    <div style={{ marginBottom: 28 }}>
      {breadcrumb && (
        <div style={{ marginBottom: 12, fontSize: 13, color: CP.textSecondary }}>{breadcrumb}</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {section && <SectionLabel>{section}</SectionLabel>}
          <h1 style={{
            fontFamily: FONTS.display,
            fontSize: 34, fontWeight: 500,
            margin: section ? "8px 0 6px 0" : "0 0 6px 0",
            letterSpacing: "-0.02em",
            color: CP.textPrimary,
            lineHeight: 1.15,
          }}>{title}</h1>
          {subtitle && (
            <p style={{ color: CP.textSecondary, fontSize: 14, margin: 0, lineHeight: 1.5, maxWidth: 760 }}>
              {subtitle}
            </p>
          )}
        </div>
        {toolbar && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {toolbar}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pill tab (es. After / Morning / Afternoon …): rotonda, dark, con icona.
 */
export function PillTab({ active, onClick, children, icon, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        background: active ? CP.surfaceAlt : "transparent",
        border: `1px solid ${active ? CP.borderStrong : "transparent"}`,
        borderRadius: 999,
        color: active ? CP.textPrimary : CP.textSecondary,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        fontFamily: FONTS.body,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      {icon && <span>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
