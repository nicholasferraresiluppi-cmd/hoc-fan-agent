"use client";
/**
 * Pezzi condivisi di «Porta un collega» (26/10/2026): stato di una voce,
 * importi, tappe del percorso, regole in parole. Usati da /me/porta-un-collega
 * (chi ha portato qualcuno) e da /admin/referral (HR). Solo token CP.
 * Niente rosso: una voce persa non è una colpa di chi guarda (stessa regola
 * della Difficoltà creator), si scrive in grigio barrato.
 */
import { Check, Circle, CircleDot, X } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";

export const NUM = { fontVariantNumeric: "tabular-nums" };

export const fmtEur = (v) => (v == null ? "—" : "€" + Number(v).toLocaleString("it-IT", { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2, useGrouping: "always" }));
export const fmtUsd = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: "always" }));
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const monthLabel = (m) => (/^\d{4}-\d{2}$/.test(m || "") ? `${MESI[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : m || "—");
export const fmtDay = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? `${Number(d.slice(8))} ${MESI[Number(d.slice(5, 7)) - 1].slice(0, 3)}` : "—");

export const STATUS = {
  pagato: { label: "Pagato", color: CP.accentGreen },
  maturato: { label: "Da pagare", color: CP.accentSoftText, strong: true },
  in_corso: { label: "In corso", color: CP.accentSoftText },
  in_attesa: { label: "Da sbloccare", color: CP.textMuted },
  perso: { label: "Non sbloccato", color: CP.textMuted, struck: true },
};

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.in_attesa;
  return (
    <span style={{ display: "inline-block", fontSize: 12, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
      background: s.strong ? CP.accentSoft : status === "pagato" ? alpha(CP.accentGreen, "1f") : CP.surfaceAlt,
      color: s.color, fontWeight: 500 }}>{s.label}</span>
  );
}

/** Riga di una voce: etichetta, perché, importo. */
export function MilestoneRow({ m }) {
  const s = STATUS[m.status] || STATUS.in_attesa;
  const amount = m.kind === "commission" && m.amountUsd != null
    ? <span>{fmtEur(m.amountEur)}<span style={{ color: CP.textMuted, fontSize: 12 }}> · {fmtUsd(m.amountUsd)}</span></span>
    : fmtEur(m.amountEur);
  const detail = m.kind === "commission" && m.salesUsd != null
    ? `su ${fmtUsd(m.salesUsd)} venduti${m.month ? ` (${m.salesMonths?.length > 1 ? "fino a " : ""}${monthLabel(m.month)})` : ""}`
    : m.status === "pagato" ? `pagato il ${fmtDay(m.paidAt)}`
    : m.status === "maturato" && m.unlockedAt ? `sbloccato il ${fmtDay(m.unlockedAt)}`
    : m.why || null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: s.struck ? CP.textMuted : CP.textPrimary, textDecoration: s.struck ? "line-through" : "none" }}>{m.label}</div>
        {detail && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 1 }}>{detail}</div>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: s.struck ? CP.textMuted : CP.textPrimary, textDecoration: s.struck ? "line-through" : "none", textAlign: "right", ...NUM }}>{amount}</div>
      <div style={{ width: 96, textAlign: "right" }}><StatusPill status={m.status} /></div>
    </div>
  );
}

/** Tappe del percorso: segnalata → colloquio → formazione → primo turno → mesi. */
export function Steps({ steps = [], next }) {
  return (
    <ol style={{ display: "flex", gap: 0, listStyle: "none", padding: 0, margin: "4px 0 6px", overflowX: "auto" }}>
      {steps.map((st, i) => {
        const isNext = st.key === next;
        const color = st.done ? CP.accent : st.failed ? CP.textMuted : isNext || st.current ? CP.accentSoftText : CP.mutedIcons;
        const Icon = st.done ? Check : st.failed ? X : isNext || st.current ? CircleDot : Circle;
        return (
          <li key={st.key} style={{ display: "flex", alignItems: "flex-start", flex: "1 0 74px", minWidth: 74 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <span style={{ flex: 1, height: 2, background: i === 0 ? "transparent" : steps[i - 1].done ? CP.accent : CP.border }} />
                <span style={{ width: 22, height: 22, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: st.done ? CP.accent : CP.surface, border: `1.5px solid ${color}`, color: st.done ? CP.accentInk : color, flexShrink: 0 }}>
                  <Icon size={12} strokeWidth={2.5} />
                </span>
                <span style={{ flex: 1, height: 2, background: i === steps.length - 1 ? "transparent" : st.done ? CP.accent : CP.border }} />
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: st.done || isNext ? CP.textPrimary : CP.textMuted, textAlign: "center", fontWeight: isNext ? 500 : 400 }}>{st.label}</div>
              {st.at && <div style={{ fontSize: 11, color: CP.textMuted, ...NUM }}>{/^\d{4}-\d{2}$/.test(st.at) ? monthLabel(st.at).slice(0, 3) : fmtDay(st.at)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Le regole in parole, lette da REFERRAL_RULES (mai cifre scritte a mano). */
export function RulesList({ rules: r }) {
  if (!r) return null;
  const pct = (x) => String(x * 100).replace(".", ",") + "%";
  const rows = [
    [fmtEur(r.storyEur), `quando pubblichi ${r.storiesRequired} storie Instagram entro ${r.storyWindowDays} giorni, concordate con l'HR. Le storie non sono obbligatorie: puoi portare qualcuno anche senza.`],
    [fmtEur(r.firstShiftEur), "quando la persona che hai portato supera la formazione e fa il primo turno in chat."],
    [`${fmtEur(r.retentionEur)} al mese`, `per i primi ${r.retentionMonths} mesi in cui la persona lavora davvero (vende nel mese e non è uscita).`],
    [pct(r.salesPct[0]), "di tutto quello che vende nel primo mese: è il mese in cui la persona impara, e il tuo aiuto conta di più: guardate insieme le sue chat, falle fare domande."],
    [pct(r.salesPct[1]), "di tutto quello che vende nel secondo mese."],
  ];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map(([a, b], i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <div style={{ minWidth: 104, fontSize: 15, fontWeight: 500, color: CP.textPrimary, ...NUM }}>{a}</div>
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>{b}</div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.5, marginTop: 4 }}>
        Il venduto è quello di Infloww, al netto della quota di OnlyFans. Le percentuali maturano in dollari e le vedi anche in euro al cambio di {String(r.usdToEur).replace(".", ",")}.
        Il primo mese parte dal mese del primo turno; se il primo turno è dopo il {r.lateStartDay}, parte dal mese dopo e i giorni prima si sommano al primo mese.
        Si guadagna solo sulle persone che porti tu, non su quelle portate da loro.
      </div>
    </div>
  );
}

export const box = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 };
export const pageWrap = { padding: "28px 24px 64px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body };
