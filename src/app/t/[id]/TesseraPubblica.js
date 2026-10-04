"use client";

import HrWelcomeCard from "@/components/HrWelcomeCard";
import HocLogo from "@/components/HocLogo";

export default function TesseraPubblica({ data, at }) {
  const name = [data.firstName, data.surname].filter(Boolean).join(" ");
  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%)", color: "#f2eee6", padding: "28px 16px 64px", overflowX: "hidden" }}>
      <style>{"html,body{background:#0b0c10;overflow-x:hidden}"}</style>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ lineHeight: 0 }}><HocLogo size={11} color="rgba(242,238,230,.62)" /></div>
        <HrWelcomeCard data={data} at={at} title={name ? `${name}, membro di House of Creators.` : "Membro di House of Creators."} />
      </div>
    </main>
  );
}
