"use client";

/**
 * RoleFunnelChecklist — l'anello dell'operatore come CHECKLIST d'azione.
 *
 * Non descrive il funnel: lo fa fare. Ogni voce è un'azione reale che si spunta
 * DA SOLA quando l'operatore la compie davvero (dai dati di /api/me/activation),
 * con barra di progresso e testa di partenza già spuntata. È l'applicazione dello
 * studio onboarding: learn-by-doing + progresso visibile (goal-gradient) + misura
 * reale, invece di "leggi la sequenza".
 *
 * Il funnel operatore porta il campo `checklist` (cfr role-funnels.js); il campo
 * `check` di ogni voce mappa sui campi del `progress`.
 */
import Link from "next/link";
import { CheckCircle2, Circle, UserCircle2, GraduationCap, Radar, ArrowRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";

const ICONS = { UserCircle2, GraduationCap, Radar };

// Stato done + eventuale dettaglio (es. "1/2") di una voce, dal progress.
function itemState(item, progress) {
  const p = progress || {};
  switch (item.check) {
    case "linked":
      // Testa di partenza: done SOLO quando il progresso è caricato (l'utente È
      // collegato) — così non lampeggia il check verde durante il loading.
      return { done: progress != null, detail: null };
    case "diagnosed":
      return { done: !!p.diagnosed, detail: null };
    case "trained": {
      const t = p.target || 2;
      const n = Math.min(p.trained || 0, t);
      return { done: (p.trained || 0) >= t, detail: `${n}/${t}` };
    }
    case "applied":
      return { done: !!p.applied, detail: null };
    default:
      return { done: false, detail: null };
  }
}

export default function RoleFunnelChecklist({ funnel, progress, focus, onNavigate }) {
  if (!funnel || !Array.isArray(funnel.checklist)) return null;
  const items = funnel.checklist;
  const states = items.map((it) => itemState(it, progress));
  const doneCount = states.filter((s) => s.done).length;
  const total = items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount === total;
  const loading = progress === undefined;

  return (
    <div style={{ fontFamily: FONTS.body }}>
      {/* Intestazione + barra di progresso */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 12px", fontSize: 14.5, color: CP.textPrimary, fontWeight: 500, lineHeight: 1.5 }}>
          {funnel.tagline}
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <strong style={{ fontSize: 13.5, color: CP.textPrimary, fontWeight: 500 }}>
            {loading ? "…" : `${doneCount} di ${total} completati`}
          </strong>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: CP.textMuted }}>{loading ? "" : `${pct}%`}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: CP.surfaceAlt, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: CP.accent, borderRadius: 999, transition: "width .5s cubic-bezier(.4,0,.2,1)" }} />
        </div>
      </div>

      {/* Voci */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => {
          const st = states[i];
          const Icon = ICONS[it.icon] || Circle;
          const body = (
            <>
              <div style={{ flexShrink: 0, paddingTop: 1 }}>
                {st.done ? (
                  <CheckCircle2 size={20} color={CP.accentGreen} aria-hidden="true" />
                ) : (
                  <Circle size={20} color={CP.mutedIcons} aria-hidden="true" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={15} color={st.done ? CP.accentGreen : CP.textMuted} strokeWidth={1.8} aria-hidden="true" />
                  <span style={{ fontSize: 14, fontWeight: 500, color: st.done ? CP.textSecondary : CP.textPrimary }}>{it.title}</span>
                  {st.detail && (
                    <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.accentSoftText, background: CP.accentSoft, padding: "1px 7px", borderRadius: 999 }}>{st.detail}</span>
                  )}
                  {it.href && <ArrowRight size={13} color={CP.mutedIcons} style={{ marginLeft: "auto" }} aria-hidden="true" />}
                </div>
                {it.why && (
                  <p style={{ margin: "5px 0 0", fontSize: 12.5, color: CP.textMuted, lineHeight: 1.5 }}>
                    {it.check === "trained" && focus ? focus : it.why}
                  </p>
                )}
              </div>
            </>
          );
          const style = {
            display: "flex", gap: 12, alignItems: "flex-start",
            padding: "13px 15px", borderRadius: 10, textDecoration: "none",
            background: CP.surface,
            border: `1px solid ${st.done ? CP.accentGreen + "44" : CP.border}`,
          };
          return it.href ? (
            <Link key={it.id} href={it.href} onClick={onNavigate} style={{ ...style, cursor: "pointer" }}>{body}</Link>
          ) : (
            <div key={it.id} style={style}>{body}</div>
          );
        })}
      </div>

      {allDone && !loading && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: CP.accentSoft, color: CP.accentSoftText, fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>
          Anello completo — hai diagnosticato, allenato e applicato. Ora riparti dal prossimo gap: è così che si migliora davvero, non una volta sola.
        </div>
      )}
    </div>
  );
}
