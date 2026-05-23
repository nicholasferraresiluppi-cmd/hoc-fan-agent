"use client";

import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard } from "@/components/cp-style";

export default function DraftDetailPage({ params }) {
  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/content-pipeline" style={{ color: "inherit", textDecoration: "none" }}>Pipeline</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/content-pipeline/queue" style={{ color: "inherit", textDecoration: "none" }}>Queue</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Draft</span>
          </div>
        }
        section={`Draft #${params.id}`}
        title="Editor + Preview"
        subtitle="Editor body/media + preview Telegram + SchedulePicker + ApprovalActions (approve/reject)."
      />
      <CpCard padding="24px" style={{ color: CP.textMuted }}>
        TODO: caricare draft da /api/content-pipeline/queue/{params.id}, mostrare editor + preview + actions.
      </CpCard>
    </div>
  );
}
