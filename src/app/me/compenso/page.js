"use client";

import useSWR from "swr";
import Link from "next/link";
import { Wallet, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/compenso — "Il mio compenso, spiegato" (scope own, docs/VISIBILITY_POLICY.md).
 * Breakdown per turno: venduto → scaglione → importo. Solo i propri dati.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const fmtUsd = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 }));
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }); } catch { return iso; }
};

export default function MyPayoutPage() {
  const { data, isLoading } = useSWR("/api/me/payout", fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(null);

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="Il mio compenso"
        subtitle="Ogni turno: quanto hai venduto, quale scaglione si è applicato, quanto ti è stato riconosciuto. Il totale non è un numero calato dall'alto: si apre."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {data && !data.linked && !data.error && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <HelpCircle size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>Account non ancora collegato a un profilo operatore.</p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Chiedi a un admin di collegare la tua email al tuo nome operatore.</p>
          </div>
        </CpCard>
      )}

      {data?.linked && data.reason && (
        <CpCard>
          <p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>
            {data.reason === "no_periods" && "Nessun periodo di compensi sincronizzato ancora."}
            {data.reason === "not_in_period" && `Nessun turno registrato per te nel periodo${data.period_id ? ` ${data.period_id}` : ""}.`}
          </p>
        </CpCard>
      )}

      {data?.linked && data.totals && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 22px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>Totale · {data.period_id}</div>
              <div style={{ fontFamily: FONTS.display, fontSize: 32, fontWeight: 600, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{fmtUsd(data.totals.wage)}</div>
              <div style={{ fontSize: 12, color: CP.textMuted }}>{data.totals.shifts} turni{data.totals.hours ? ` · ${Math.round(data.totals.hours)}h` : ""}</div>
            </div>
            <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "16px 22px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>Da scaglioni sul venduto</div>
              <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, color: CP.textPrimary }}>{fmtUsd(data.totals.from_takes)}</div>
              {data.totals.from_hours > 0 && <div style={{ fontSize: 12, color: CP.textMuted }}>+ {fmtUsd(data.totals.from_hours)} da ore</div>}
            </div>
          </div>

          <SectionLabel>I miei turni (dal più recente)</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(data.shifts || []).map((s, i) => {
              const isOpen = open === i;
              return (
                <CpCard key={i} onClick={() => setOpen(isOpen ? null : i)} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textSecondary, minWidth: 56 }}>{fmtDate(s.started_at)}</span>
                    <span style={{ fontSize: 13.5, color: CP.textPrimary, flex: 1, minWidth: 120 }}>{(s.creators || []).join(", ") || "—"}</span>
                    <span style={{ fontSize: 13, color: CP.textMuted }}>venduto <b style={{ color: CP.textPrimary, fontFamily: FONTS.mono }}>{fmtUsd(s.sold)}</b></span>
                    {s.effective_pct != null && (
                      <span style={{ fontSize: 12, color: CP.accent, background: CP.accentSoft, borderRadius: 99, padding: "2px 9px" }}>{(s.effective_pct * 100).toFixed(1)}%</span>
                    )}
                    <span style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 650, color: CP.accentGreen }}>{fmtUsd(s.earned)}</span>
                    {isOpen ? <ChevronUp size={15} color={CP.mutedIcons} /> : <ChevronDown size={15} color={CP.mutedIcons} />}
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}` }}>
                      {s.profile && (
                        <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "0 0 8px" }}>
                          Profilo: {s.profile.name}{s.profile.cosellers ? ` · ${s.profile.cosellers} coseller` : ""}{s.worked_hours ? ` · ${s.worked_hours}h lavorate` : ""}
                        </p>
                      )}
                      {(s.breakdown || []).length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {s.breakdown.map((b, j) => (
                            <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textSecondary }}>
                              <span>{fmtUsd(b.from)}{b.to != null ? ` → ${fmtUsd(b.to)}` : " in su"} · <b style={{ color: CP.textPrimary }}>{(b.pct * 100).toFixed(0)}%</b></span>
                              <span style={{ fontFamily: FONTS.mono }}>{fmtUsd(b.tier_sales)} → <b style={{ color: CP.accentGreen }}>{fmtUsd(b.tier_earning)}</b></span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: 12.5, color: CP.textMuted, margin: 0 }}>Nessuno scaglione registrato per questo turno.</p>
                      )}
                    </div>
                  )}
                </CpCard>
              );
            })}
          </div>

          <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 18, lineHeight: 1.6 }}>
            Gli scaglioni sono cumulativi: ogni fascia si applica solo alla parte di venduto che ci cade dentro. Un numero non ti torna? <Link href="/me/contestazioni" style={{ color: CP.accent }}>Apri una contestazione</Link> — ogni correzione viene tracciata.
          </p>
        </>
      )}
    </div>
  );
}
