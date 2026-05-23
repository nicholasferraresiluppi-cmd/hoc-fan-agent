"use client";

import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard } from "@/components/cp-style";

const Breadcrumb = () => (
  <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
    <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
    <span style={{ color: CP.textMuted }}>›</span>
    <span style={{ color: CP.textPrimary }}>Content Pipeline</span>
  </div>
);

export default function ContentPipelineHome() {
  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={<Breadcrumb />}
        section="Content · Pipeline"
        title="Content Pipeline"
        subtitle="Flusso di content production end-to-end: ideazione → draft → approval → schedule → publish. Dashboard dei contatori e shortcut alle sezioni."
      />
      <CpCard padding="24px" style={{ color: CP.textMuted }}>
        TODO: dashboard landing (contatori pending/scheduled/published, shortcut alle code).
      </CpCard>
    </div>
  );
}
