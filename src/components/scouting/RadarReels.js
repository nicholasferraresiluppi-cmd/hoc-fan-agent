"use client";
// Radar creator — i reel di una creator, da guardare dentro l'app (link a tempo di Instagram,
// nessuna copia). Usato dalla scheda e dalla coda «Valuta» (compact: 6 reel, 3 per riga).
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CP, alpha } from "@/lib/brand";
import { NUM, fmtFull, btn, igReel, H2 } from "./radar-ui";

const fetcher = (u) => fetch(u).then((r) => (r.ok ? r.json() : {}));

export default function RadarReels({ c, compact = false }) {
  const { data: md, mutate: refreshMedia } = useSWR(`/api/admin/scouting/reels?h=${encodeURIComponent(c.handles[0])}`, fetcher, { revalidateOnFocus: false });
  const media = md?.media || {};
  const [loading, setLoading] = useState(false);
  const [reelMsg, setReelMsg] = useState(null);
  const [reels, setReels] = useState(c.reels || []);
  useEffect(() => setReels(c.reels || []), [c.id, c.reels]);

  async function loadReels() {
    setLoading(true); setReelMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: c.handles[0] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      setReels(d.reels.map((x) => ({ ...x, h: c.handles[0] })).sort((a, b) => (b.v || 0) - (a.v || 0)));
      await refreshMedia();
    } catch (e) { setReelMsg(e.message); } finally { setLoading(false); }
  }

  const [watching, setWatching] = useState(null);
  async function watch(sc) {
    setWatching(sc); setReelMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: c.handles[0], sc }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      await refreshMedia({ media: { ...media, ...d.media } }, { revalidate: false });
    } catch (e) { setReelMsg(e.message); } finally { setWatching(null); }
  }

  const medianV = reels.length ? [...reels].map((r) => r.v || 0).sort((a, b) => a - b)[Math.floor(reels.length / 2)] : null;
  return (
    <>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
              {compact ? <span style={{ fontSize: 13, color: CP.textMuted }}>{reels.length ? "I reel, dal più visto" : "Nessun reel letto"}</span>
                : <H2 sub={reels.length ? "Dal più visto. I video si guardano qui; i link di Instagram scadono in un paio di giorni, poi si ricaricano." : "Carica gli ultimi 12 reel per guardarli qui, anche se il profilo ha il limite d'età."}>I reel</H2>}
              <button style={compact ? { ...btn, minHeight: 32, padding: "5px 12px", fontSize: 12.5 } : btn} disabled={loading} onClick={loadReels}>{loading ? "Carico i reel…" : reels.length ? "Aggiorna i reel" : "Carica i reel"}</button>
            </div>
            {reelMsg && <p style={{ margin: 0, color: CP.attn, fontSize: 14 }}>{reelMsg}</p>}
            {reels.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fill, minmax(min(140px, 45%), 1fr))", gap: compact ? 8 : 14 }}>
                {reels.slice(0, compact ? 6 : 9).map((r) => {
                  const m = media[r.sc];
                  const mult = medianV && r.v ? r.v / medianV : null;
                  return (
                    <figure key={r.sc} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      {m?.video ? (
                        <video src={m.video} poster={m.thumb || undefined} controls preload="none" playsInline
                          style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 12, background: CP.surface, border: `1px solid ${CP.border}` }} />
                      ) : (
                        <button onClick={() => watch(r.sc)} disabled={watching === r.sc} style={{ aspectRatio: "9 / 16", width: "100%", borderRadius: 12, background: `linear-gradient(180deg, ${alpha(CP.textPrimary, "12")}, ${alpha(CP.textPrimary, "05")})`, border: `1px solid ${CP.border}`, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", color: CP.textPrimary, fontSize: 14, textAlign: "center", padding: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" /></svg>
                          {watching === r.sc ? "Carico…" : compact ? "" : "Guarda qui"}
                        </button>
                      )}
                      <figcaption style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "2px 8px", fontSize: 13 }}>
                        <span style={NUM}>{fmtFull(r.v)} view{mult && mult >= 2 ? <span style={{ color: CP.gold }}> · ×{mult.toFixed(1).replace(".", ",")}</span> : null}</span>
                        <a href={igReel(r.sc)} target="_blank" rel="noopener noreferrer" style={{ color: CP.textSecondary, textDecoration: "none" }}>Apri ↗</a>
                      </figcaption>
                      {(r.a || r.signaled) && <span style={{ fontSize: 12, color: CP.textMuted }}>{[r.a === "original_sounds" ? "audio originale" : r.a === "licensed_music" ? "musica di libreria" : null, r.signaled ? "segnalato" : null].filter(Boolean).join(" · ")}</span>}
                    </figure>
                  );
                })}
              </div>
            )}
    </>
  );
}
