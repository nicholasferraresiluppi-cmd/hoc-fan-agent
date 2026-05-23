"use client";

import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard } from "@/components/cp-style";

export default function QueuePage() {
  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/content-pipeline" style={{ color: "inherit", textDecoration: "none" }}>Pipeline</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Queue</span>
          </div>
        }
        section="Content · Approval"
        title="Queue"
        subtitle="Draft in attesa di approvazione. Filtra per creator + status."
      />
      <CpCard padding="24px" style={{ color: CP.textMuted }}>
        TODO: SWR su /api/content-pipeline/queue?creator=&amp;status=pending — lista draft + filtri.
      </CpCard>
    </div>
  );
}
