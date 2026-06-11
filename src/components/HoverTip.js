"use client";

/**
 * HoverTip — tooltip immediato in stile design system.
 * Sostituisce il title nativo del browser (lento, non stilizzato) sugli
 * elementi dati: barre di grafici, chip, valori compatti.
 *
 * Regola d'uso (audience-check): ogni elemento dati il cui significato
 * completo non sta nel layout deve rispondere al passaggio del mouse
 * SUBITO, in linguaggio piano.
 *
 * Uso: <HoverTip tip={"$200–$300\n14 turni (12%)"} style={{flex:1}}>…</HoverTip>
 */
import { useState } from "react";
import { CP, FONTS } from "@/lib/brand";

export default function HoverTip({ tip, children, style, position = "top" }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block", ...style }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && tip && (
        <span
          style={{
            position: "absolute",
            ...(position === "top"
              ? { bottom: "calc(100% + 7px)" }
              : { top: "calc(100% + 7px)" }),
            left: "50%",
            transform: "translateX(-50%)",
            background: CP.surfaceAlt,
            border: `1px solid ${CP.border}`,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 400,
            color: CP.textPrimary,
            whiteSpace: "pre-line",
            zIndex: 40,
            pointerEvents: "none",
            minWidth: "max-content",
            maxWidth: 280,
            fontFamily: FONTS.body,
            lineHeight: 1.5,
            textAlign: "left",
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}
