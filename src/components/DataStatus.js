"use client";

/**
 * Chip "Stato dati" dello stile v3 (anteprima, 26/09/2026).
 *
 * Legge /api/data-status (solo orari e stato, mai dati) e mostra
 * "Infloww ✓ 08:01 · CreatorsPro ✓ 05:02"; al clic un pannello con l'elenco
 * delle fonti e cosa alimentano.
 *
 * Chi non guarda i numeri di tutta l'org (non admin, senza scores.view "all")
 * vede un chip NEUTRO: puntino, mai rosso — una fonte ferma non è una sua
 * responsabilità e non deve sembrargli un allarme.
 *
 * `compact` = solo icona (intestazione da telefono).
 */
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Check, X, Database } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { canSee } from "@/lib/nav-access";

const silentFetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

const TZ = "Europe/Rome";
const dayKey = (ts) => new Date(ts).toLocaleDateString("it-IT", { timeZone: TZ });

/** "08:01" se oggi, altrimenti "dal 24" (fermo) / "24 set" (pannello). */
function shortWhen(ts, now) {
  if (!ts) return "—";
  if (dayKey(ts) === dayKey(now)) return new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `dal ${new Date(ts).toLocaleDateString("it-IT", { day: "numeric", timeZone: TZ })}`;
}
function longWhen(ts, now) {
  if (!ts) return "nessuna traccia";
  const t = new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (dayKey(ts) === dayKey(now)) return `oggi, ${t}`;
  const d = new Date(ts).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  return `${d}, ${t}`;
}

export function useCanSeeOrgData() {
  const { data: me } = useSWR("/api/whoami", silentFetcher, { revalidateOnFocus: false });
  if (!me?.authenticated) return false;
  return !!me.admin || canSee("/admin", me.capabilities, me.admin);
}

export default function DataStatus({ compact = false }) {
  const { data } = useSWR("/api/data-status", silentFetcher, { revalidateOnFocus: false, refreshInterval: 5 * 60 * 1000 });
  const privileged = useCanSeeOrgData();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const now = data?.now || Date.now();
  const sources = data?.sources || [];
  // Nel chip: le due fonti che alimentano i numeri principali
  const chipSources = sources.filter((s) => s.id === "infloww" || s.id === "creatorspro");
  const anyStale = privileged && sources.some((s) => s.status === "stale");
  const ariaLabel = `Stato dati: ${sources.length ? sources.map((s) => `${s.label} ${s.status === "ok" ? "aggiornato" : s.status === "stale" ? "fermo" : "sconosciuto"}`).join(", ") : "in caricamento"}`;

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        type="button"
        className="hoc-v3-chip"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        style={{
          display: "inline-flex", alignItems: "center", gap: 9,
          height: compact ? 44 : 32, minWidth: compact ? 44 : undefined,
          padding: compact ? "0 12px" : "0 11px", borderRadius: compact ? 12 : 9,
          border: "none", boxShadow: `0 0 0 1px ${CP.border} inset`,
          background: compact ? "transparent" : CP.surface, color: CP.textSecondary,
          fontSize: 12.5, fontFamily: FONTS.body, cursor: "pointer", whiteSpace: "nowrap",
          justifyContent: "center",
        }}
      >
        {compact ? (
          <>
            <Database size={17} strokeWidth={1.9} aria-hidden="true" />
            {/* puntino: rosso solo per chi guarda i dati org, neutro per tutti gli altri */}
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: anyStale ? CP.accentRed : CP.track }} />
          </>
        ) : !privileged ? (
          <>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: CP.track }} />
            <span style={{ color: CP.textMuted, fontWeight: 500 }}>Stato dati</span>
          </>
        ) : (
          <>
            <span style={{ color: CP.textMuted, fontWeight: 500 }}>Stato dati</span>
            {chipSources.length === 0 && <span style={{ color: CP.textMuted }}>…</span>}
            {chipSources.map((s, i) => (
              <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {i > 0 && <span aria-hidden="true" style={{ width: 1, height: 14, background: CP.border, marginRight: 4 }} />}
                <span style={{ color: s.status === "stale" ? CP.accentRed : CP.textSecondary }}>{s.label}</span>
                {s.status === "ok"
                  ? <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                  : s.status === "stale"
                    ? <X size={13} strokeWidth={2.2} color={CP.accentRed} aria-hidden="true" />
                    : <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: CP.track }} />}
                <span style={{ fontVariantNumeric: "tabular-nums", color: s.status === "stale" ? CP.accentRed : CP.textSecondary }}>{shortWhen(s.at, now)}</span>
              </span>
            ))}
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Da dove vengono i dati"
          className="hoc-v3-pop"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 70,
            width: "min(360px, calc(100vw - 32px))",
            background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14,
            boxShadow: "0 18px 48px rgba(0,0,0,.35)", padding: 14, fontFamily: FONTS.body,
          }}
        >
          <div style={{ fontSize: 11.5, color: CP.textMuted, marginBottom: 2 }}>Stato dati</div>
          <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500, marginBottom: 12 }}>Da dove vengono i numeri</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sources.length === 0 && <div style={{ fontSize: 12.5, color: CP.textMuted }}>Stato non disponibile al momento.</div>}
            {sources.map((s) => {
              const stale = s.status === "stale";
              const alarm = stale && privileged;
              return (
                <div key={s.id} style={{
                  display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
                  border: `1px solid ${alarm ? CP.accentRed : CP.border}`, background: alarm ? CP.dangerSoft : "transparent",
                }}>
                  <span aria-hidden="true" style={{
                    flex: "0 0 auto", width: 22, height: 22, borderRadius: 6, marginTop: 1,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 0 0 1px ${CP.border} inset`, color: alarm ? CP.accentRed : CP.textSecondary,
                  }}>
                    {s.status === "ok" ? <Check size={13} strokeWidth={2.2} /> : alarm ? <X size={13} strokeWidth={2.2} /> : <span style={{ width: 6, height: 6, borderRadius: 3, background: CP.track }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: CP.textPrimary, fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2, lineHeight: 1.4 }}>{s.feeds}</div>
                  </div>
                  <div style={{ fontSize: 11.5, textAlign: "right", color: alarm ? CP.accentRed : CP.textSecondary, whiteSpace: "nowrap" }}>
                    <div>{s.status === "ok" ? "aggiornato" : stale ? (privileged ? "fermo da" : "ultimo aggiornamento") : "—"}</div>
                    <div style={{ fontVariantNumeric: "tabular-nums" }}>{longWhen(s.at, now)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 12, lineHeight: 1.45 }}>
            Una fonte è aggiornata se l&apos;ultimo dato è arrivato nelle ultime {data?.fresh_hours || 30} ore. Orari di Roma.
          </div>
        </div>
      )}
    </div>
  );
}
