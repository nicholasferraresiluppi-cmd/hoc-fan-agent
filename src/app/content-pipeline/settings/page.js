"use client";

import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard } from "@/components/cp-style";

export default function SettingsPage() {
  return (
    <div style={{ padding: "32px 28px 64px 28px", maxWidth: 1100, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <Link href="/content-pipeline" style={{ color: "inherit", textDecoration: "none" }}>Pipeline</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Settings</span>
          </div>
        }
        section="Content · Config"
        title="Settings"
        subtitle="Impostazioni globali della content pipeline (telegram tokens, default schedule, encryption key)."
      />
      <CpCard padding="24px" style={{ color: CP.textMuted }}>
        TODO: form impostazioni globali.
      </CpCard>
    </div>
  );
}
