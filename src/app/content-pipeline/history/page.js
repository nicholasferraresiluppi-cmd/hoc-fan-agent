"use client";

import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard } from "@/components/cp-style";

export default function HistoryPage() {
  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/content-pipeline" style={{ color: "inherit", textDecoration: "none" }}>Pipeline</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>History</span>
          </div>
        }
        section="Content · Archive"
        title="History"
        subtitle="Storico dei post pubblicati. Filtrabile per creator e periodo."
      />
      <CpCard padding="24px" style={{ color: CP.textMuted }}>
        TODO: SWR su /api/content-pipeline/history?creator= — lista pubblicati con preview.
      </CpCard>
    </div>
  );
}
