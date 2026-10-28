"use client";

// Foto (o video) ingrandita dell'Editoriale, usata anche dal Warm-up (28/10/2026): frecce, tastiera
// e dito per passare alle altre; nel Drive dell'Editoriale anche «Scegli questa foto».
import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Lock, X } from "lucide-react";
import { CP, alpha } from "@/lib/brand";
import { btn, btnPrimary, btnSm, hint } from "@/components/warmup/ui";

const API = "/api/admin/editoriale";
// il browser legge l'HEVC dei video dell'iPhone? (Safari sì, Chrome di solito no)
const nativeHevc = () => { try { return document.createElement("video").canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== ""; } catch { return false; } };

// Foto ingrandita: frecce (anche da tastiera e col dito) per passare alle altre della griglia e
// scelta direttamente da qui. Esc chiude, spazio sceglie.
export default function Lightbox({ creator, file, pos = 0, total = 1, selected = -1, owner = null, canPick = false, onPick, onPrev, onNext, onClose }) {
  const [touch, setTouch] = useState(null);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
      else if ((e.key === " " || e.key === "Enter") && canPick && !owner) { e.preventDefault(); onPick(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, onPrev, onNext, onPick, canPick, owner]);
  const picked = selected >= 0;
  const arrow = (side, fn, Icon) => fn && (
    <button type="button" aria-label={side === "l" ? "Foto prima" : "Foto dopo"} onClick={fn}
      style={{ position: "absolute", top: "50%", [side === "l" ? "left" : "right"]: 10, transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", border: `1px solid ${CP.border}`, background: CP.panel, color: CP.textPrimary, display: "grid", placeItems: "center", cursor: "pointer", zIndex: 2 }}>
      <Icon size={20} />
    </button>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label={file.name || "Foto"}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => setTouch(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touch == null) return; const dx = e.changedTouches[0].clientX - touch; setTouch(null); if (dx > 50 && onPrev) onPrev(); else if (dx < -50 && onNext) onNext(); }}
      style={{ position: "fixed", inset: 0, zIndex: 95, background: CP.panel, display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", padding: "max(12px, env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 10px", color: CP.textPrimary }}>
        <span style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name || "Foto"}</span>
        {total > 1 && <span style={{ ...hint, fontSize: 13 }}>{pos + 1} di {total}</span>}
        <a href={`https://drive.google.com/file/d/${file.id}/view`} target="_blank" rel="noreferrer" style={{ ...btnSm, textDecoration: "none" }}><ExternalLink size={13} />Drive</a>
        <button type="button" aria-label="Chiudi" onClick={onClose} style={{ ...btnSm, padding: "5px 8px" }}><X size={16} /></button>
      </div>
      <div style={{ position: "relative", display: "grid", placeItems: "center", minHeight: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        {arrow("l", onPrev, ChevronLeft)}
        {file.kind === "video" && !nativeHevc() ? (
          // Chrome e altri browser senza HEVC: i video dell'iPhone non si leggono. Il lettore di
          // Drive li converte da solo (serve l'account Google con accesso alla cartella).
          <iframe key={file.id} title={file.name || "Video"} src={`https://drive.google.com/file/d/${file.id}/preview`} allow="autoplay; fullscreen"
            style={{ border: "none", height: "100%", maxHeight: "100%", aspectRatio: "9 / 16", maxWidth: "100%", borderRadius: 10, background: CP.bgSunken }} />
        ) : file.kind === "video" ? (
          <video key={file.id} controls autoPlay playsInline preload="metadata"
            poster={`${API}?creator=${encodeURIComponent(creator)}&thumb=${encodeURIComponent(file.id)}&v=2&s=1200`}
            src={`${API}?creator=${encodeURIComponent(creator)}&media=${encodeURIComponent(file.id)}`}
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, background: CP.bgSunken, outline: picked ? `3px solid ${CP.accent}` : "none", outlineOffset: 3 }} />
        ) : (
          <img key={file.id} src={`${API}?creator=${encodeURIComponent(creator)}&thumb=${encodeURIComponent(file.id)}&v=2&s=1200`} alt=""
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10, outline: picked ? `3px solid ${CP.accent}` : "none", outlineOffset: 3 }} />
        )}
        {arrow("r", onNext, ChevronRight)}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, paddingTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        {owner ? <span style={{ fontSize: 14, color: CP.textSecondary }}><Lock size={13} style={{ verticalAlign: -2 }} /> Già usata in «{owner.title}»</span>
          : canPick ? (
            <button type="button" onClick={onPick} style={{ ...(picked ? btn : btnPrimary), minWidth: 220 }}>
              {picked ? <><X size={15} />Scelta n° {selected + 1} · togli</> : <><Check size={15} />{file.kind === "video" ? "Scegli questo video" : "Scegli questa foto"}</>}
            </button>
          ) : null}
        {file.kind === "video" && !nativeHevc() && <span style={hint}>Il video si vede col lettore di Google Drive (serve l'account Google con accesso alla cartella).</span>}
      </div>
    </div>
  );
}

