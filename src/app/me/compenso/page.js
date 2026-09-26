"use client";

import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CP, FONTS } from "@/lib/brand";
import { fmtPct } from "@/lib/format";
import { PageHead, HeroMetric, Metric, SectionTitle, DataTable, Notice, card, NUM } from "@/components/ds";

/**
 * /me/compenso — "Il mio compenso, spiegato" (scope own, docs/VISIBILITY_POLICY.md).
 * Breakdown per turno: venduto → scaglione → importo. Solo i propri dati.
 * 26/09/2026: portata sul design system — turni in tabella ordinabile, il
 * dettaglio scaglioni del turno scelto si apre sotto (stessi dati di prima).
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

// sempre 2 decimali: "$137,1" accanto a "$226,25" sembrava un errore (pannello UX)
const fmtUsd = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }));
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }); } catch { return iso; }
};
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const monthLabel = (pid) => (/^\d{4}-\d{2}$/.test(pid || "") ? `${MESI[Number(pid.slice(5)) - 1]} ${pid.slice(0, 4)}` : pid);

const SHIFT_COLUMNS = [
  { key: "date", label: "Turno", render: (s) => fmtDate(s.started_at), sort: (s) => s.started_at || "" },
  { key: "creators", label: "Creator", muted: true, render: (s) => (s.creators || []).join(", ") || "—", sort: (s) => (s.creators || []).join(", ") },
  { key: "sold", label: "Venduto", align: "right", render: (s) => fmtUsd(s.sold) },
  { key: "effective_pct", label: "Quota riconosciuta", align: "right", render: (s) => (s.effective_pct != null ? fmtPct(s.effective_pct, 1) : "—") },
  { key: "earned", label: "Compenso", align: "right", render: (s) => <span style={{ fontWeight: 500 }}>{fmtUsd(s.earned)}</span> },
];

const TIER_COLUMNS = [
  { key: "band", label: "Fascia di venduto", sortable: false, render: (b) => `${fmtUsd(b.from)}${b.to != null ? ` → ${fmtUsd(b.to)}` : " in su"}` },
  { key: "pct", label: "Percentuale", align: "right", sortable: false, render: (b) => fmtPct(b.pct) },
  { key: "tier_sales", label: "Venduto in questa fascia", align: "right", sortable: false, render: (b) => fmtUsd(b.tier_sales) },
  { key: "tier_earning", label: "Riconosciuto", align: "right", sortable: false, render: (b) => <span style={{ fontWeight: 500 }}>{fmtUsd(b.tier_earning)}</span> },
];

export default function MyPayoutPage() {
  const { data, error, isLoading } = useSWR("/api/me/payout", fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(null);
  const shifts = useMemo(() => (data?.shifts || []).map((s, i) => ({ ...s, key: i })), [data]);
  const sel = open != null ? shifts.find((s) => s.key === open) : null;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Il mio compenso" }]}
        title="Il mio compenso"
        subtitle="Ogni turno: quanto hai venduto, quale scaglione si è applicato, quanto ti è stato riconosciuto. Il totale non è un numero calato dall'alto: si apre."
      />

      {isLoading && <div style={{ ...card, padding: 16, color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}
      {error && <Notice danger>Non riesco a caricare il tuo compenso. Ricarica la pagina tra qualche minuto.</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.linked && !data.error && (
        <Notice>Account non ancora collegato a un profilo operatore. Chiedi a un admin di collegare la tua email al tuo nome operatore.</Notice>
      )}

      {data?.linked && data.reason && (
        <Notice>
          {data.reason === "no_periods" && "Nessun periodo di compensi sincronizzato ancora."}
          {data.reason === "not_in_period" && `Nessun turno registrato per te nel periodo${data.period_id ? ` ${monthLabel(data.period_id)}` : ""}.`}
        </Notice>
      )}

      {data?.linked && data.totals && (
        <>
          <HeroMetric
            label={`Totale · ${monthLabel(data.period_id)}`}
            value={fmtUsd(data.totals.wage)}
            compare={`${data.totals.shifts} turni${data.totals.hours ? ` · ${Math.round(data.totals.hours)}h` : ""}`}
          >
            <Metric
              label="Da scaglioni sul venduto"
              value={fmtUsd(data.totals.from_takes)}
              note={data.totals.from_hours > 0 ? `+ ${fmtUsd(data.totals.from_hours)} da ore` : null}
            />
          </HeroMetric>

          <section style={{ marginTop: 22, marginBottom: 14 }}>
            <SectionTitle aside="dal più recente · tocca un turno per vedere gli scaglioni">I miei turni</SectionTitle>
            <DataTable
              columns={SHIFT_COLUMNS}
              rows={shifts}
              minWidth={620}
              maxHeight={440}
              onRowClick={(s) => setOpen(open === s.key ? null : s.key)}
              selected={(s) => s.key === open}
              empty="Nessun turno in questo periodo."
            />
          </section>

          {sel && (
            <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
              <SectionTitle aside={(sel.creators || []).join(", ") || null}>Turno del {fmtDate(sel.started_at)}</SectionTitle>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14, color: CP.textSecondary, marginBottom: 12, ...NUM }}>
                <span>Venduto <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtUsd(sel.sold)}</span></span>
                <span>Compenso <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtUsd(sel.earned)}</span></span>
              </div>
              {sel.profile && (
                <p style={{ fontSize: 13, color: CP.textMuted, margin: "0 0 12px" }}>
                  Profilo: {sel.profile.name}{sel.profile.cosellers ? ` · ${sel.profile.cosellers} coseller` : ""}{sel.worked_hours ? ` · ${sel.worked_hours}h lavorate` : ""}
                </p>
              )}
              {(sel.breakdown || []).length > 0 ? (
                <DataTable columns={TIER_COLUMNS} rows={sel.breakdown} minWidth={520} />
              ) : (
                <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>Nessuno scaglione registrato per questo turno.</p>
              )}
            </section>
          )}

          <p style={{ fontSize: 13, color: CP.textMuted, marginTop: 18, lineHeight: 1.6 }}>
            Gli scaglioni sono cumulativi: ogni fascia si applica solo alla parte di venduto che ci cade dentro. Un numero non ti torna? <Link href="/me/contestazioni" style={{ color: CP.accentSoftText }}>Apri una contestazione</Link> — ogni correzione viene tracciata.
          </p>
        </>
      )}
    </div>
  );
}
