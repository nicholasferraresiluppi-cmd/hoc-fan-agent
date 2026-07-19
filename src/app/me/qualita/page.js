"use client";

import useSWR from "swr";
import Link from "next/link";
import { HelpCircle, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/qualita — "La mia qualità" (scope own, docs/VISIBILITY_POLICY.md).
 * Gli esiti QA propri con rubrica, note del reviewer (anonimo: rotazione §8.1)
 * e lo stato che alimenta i gate. Mai visibili tra pari.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function MyQaPage() {
  const { data, isLoading } = useSWR("/api/me/qa", fetcher, { revalidateOnFocus: false });
  const dims = data?.dimensions || [];

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="La mia qualità"
        subtitle="Le review sulle tue conversazioni: rubrica a 5 dimensioni (1-4), pass = media ≥ 3 senza fail compliance. Chi valuta ruota e non è mai il tuo team lead da solo. Le note sono per te: dicono cosa ha funzionato e cosa migliorare."
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

      {data?.linked && (
        <>
          {data.gate_status ? (
            <div style={{ background: CP.surface, border: `1px solid ${data.gate_status.frozen_by_compliance ? CP.accentRed : CP.border}`, borderRadius: 12, padding: "16px 22px", marginBottom: 18, maxWidth: 560 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: CP.textMuted, marginBottom: 4 }}>Ultimi {data.gate_status.window_months} mesi</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {data.gate_status.frozen_by_compliance ? <ShieldAlert size={20} color={CP.accentRed} /> : data.gate_status.pass ? <CheckCircle2 size={20} color={CP.accentGreen} /> : <XCircle size={20} color={CP.textMuted} />}
                <span style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 600, color: data.gate_status.frozen_by_compliance ? CP.accentRed : data.gate_status.pass ? CP.accentGreen : CP.textPrimary }}>
                  {data.gate_status.frozen_by_compliance ? "Compliance da risolvere" : data.gate_status.pass ? "QA pass" : "QA non superata"}
                </span>
                <span style={{ fontSize: 12.5, color: CP.textMuted }}>{data.gate_status.passes}/{data.gate_status.reviews} review pass</span>
              </div>
              {data.gate_status.frozen_by_compliance && (
                <p style={{ fontSize: 12.5, color: CP.accentRed, margin: "8px 0 0" }}>Un fail su compliance congela le promozioni in corso (§8.1): parlane subito col tuo SM.</p>
              )}
            </div>
          ) : (
            <CpCard style={{ marginBottom: 18 }}>
              <p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>Nessuna review negli ultimi 3 mesi — appena arriva la prima la vedi qui, con le note.</p>
            </CpCard>
          )}

          <SectionLabel>Le mie review</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(data.reviews || []).map((r) => (
              <CpCard key={r.id} accent={r.compliance_fail ? CP.accentRed : undefined}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: CP.textMuted }}>{r.period_id}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: r.compliance_fail ? CP.accentRed : r.pass ? CP.accentGreen : CP.textMuted }}>
                    media {r.avg} · {r.compliance_fail ? "fail compliance" : r.pass ? "pass" : "no pass"}
                  </span>
                  <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{new Date(r.created_at).toLocaleDateString("it-IT")}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: r.notes ? 8 : 0 }}>
                  {dims.map((d) => {
                    const v = r.scores?.[d.key];
                    return (
                      <span key={d.key} style={{ fontSize: 11.5, color: v <= 1 ? CP.accentRed : v >= 3 ? CP.textSecondary : "#d9a44a", background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, borderRadius: 99, padding: "3px 10px" }}>
                        {d.label.split(" ")[0]} <b>{v}</b>
                      </span>
                    );
                  })}
                </div>
                {r.notes && <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0 }}>{r.notes}</p>}
              </CpCard>
            ))}
          </div>

          <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 18, lineHeight: 1.6 }}>
            Non sei d'accordo con una valutazione? <Link href="/me/contestazioni" style={{ color: CP.accent }}>Apri una contestazione</Link>.
          </p>
        </>
      )}
    </div>
  );
}
