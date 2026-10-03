"use client";

/**
 * Tutorial video: pulsante "Come funziona" + lettore in sovrimpressione (03/10/2026).
 * I video sono nel catalogo src/lib/tutorial-videos.js.
 *
 * - <TutorialVideoButton id="persone-hr" />            pulsante compatto per le intestazioni di pagina
 * - <TutorialVideoButton id="…" render={(open, v) => …} />  aspetto libero (es. il modulo pubblico, palette Notte)
 * - <TutorialVideoCard video={v} />                      anteprima con poster, per /guida
 *
 * Il lettore si chiude con Esc, con la X o cliccando fuori; parte da solo (con audio: l'apertura è un
 * gesto dell'utente), preload solo all'apertura, così le pagine non scaricano MB che nessuno guarda.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PlayCircle, X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { getTutorial, fmtDuration } from "@/lib/tutorial-videos";

export function TutorialPlayer({ video, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const portrait = video.orientation === "portrait";
  // Portal nel <body>: se un antenato ha transform/filter (es. il fade del modulo), un position:fixed
  // si misurerebbe su quell'antenato invece che sullo schermo (lettore rimpicciolito: visto in prova).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={video.title} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(5,6,9,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "grid", gap: 10, justifyItems: "center", maxWidth: "100%" }}>
        <button type="button" onClick={onClose} aria-label="Chiudi il video"
          style={{ position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", background: "rgba(20,20,26,.9)", color: "#f2eee6", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 2 }}>
          <X size={18} />
        </button>
        <video src={video.src} poster={video.poster} controls autoPlay playsInline preload="auto"
          style={portrait
            // la larghezza è il minimo tra lo spazio orizzontale e quello verticale (nel rapporto del video):
            // così il lettore non esce mai dallo schermo, né su telefono né su desktop
            ? { width: "min(94vw, calc(84vh * 9 / 16), 506px)", height: "auto", aspectRatio: "9 / 16", borderRadius: 16, background: "#000", boxShadow: "0 30px 80px rgba(0,0,0,.6)", display: "block" }
            : { width: "min(94vw, calc(80vh * 16 / 9), 1180px)", height: "auto", aspectRatio: "16 / 9", borderRadius: 14, background: "#000", boxShadow: "0 30px 80px rgba(0,0,0,.6)", display: "block" }} />
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: "rgba(242,238,230,.7)", textAlign: "center" }}>{video.title} · {fmtDuration(video.durationSec)}</div>
      </div>
    </div>,
    document.body
  );
}

export function TutorialVideoButton({ id, label = "Come funziona", render }) {
  const [open, setOpen] = useState(false);
  const video = getTutorial(id);
  if (!video) return null;
  const openIt = () => setOpen(true);
  return (
    <>
      {render ? render(openIt, video) : (
        <button type="button" onClick={openIt} title={`Video: ${video.title}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" }}>
          <PlayCircle size={15} /> {label} <span style={{ color: CP.textMuted }}>· {fmtDuration(video.durationSec)}</span>
        </button>
      )}
      {open && <TutorialPlayer video={video} onClose={() => setOpen(false)} />}
    </>
  );
}

export function TutorialVideoCard({ video }) {
  const [open, setOpen] = useState(false);
  const portrait = video.orientation === "portrait";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: "grid", gridTemplateColumns: portrait ? "88px 1fr" : "176px 1fr", gap: 16, alignItems: "center", width: "100%", textAlign: "left", padding: 12, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, cursor: "pointer", fontFamily: FONTS.body, color: CP.textPrimary }}>
        <span style={{ position: "relative", display: "block", aspectRatio: portrait ? "9 / 16" : "16 / 9", borderRadius: 8, overflow: "hidden", background: "#000" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: .9 }} />
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff" }}><PlayCircle size={portrait ? 26 : 34} /></span>
        </span>
        <span style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{video.title}</span>
          <span style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>{video.summary}</span>
          <span style={{ fontSize: 12.5, color: CP.textMuted }}>{video.audience} · {fmtDuration(video.durationSec)}</span>
        </span>
      </button>
      {open && <TutorialPlayer video={video} onClose={() => setOpen(false)} />}
    </>
  );
}
