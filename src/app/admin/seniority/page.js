"use client";

// Seniority operatori (redesign DS 26/09/2026). Il livello (junior/senior/master)
// si calcola dalle sessioni del SIMULATORE Academy (quante + punteggio medio
// recente); qui si legge e, se serve, si forza a mano. API e azioni invariate.
// Tolti: emoji dei livelli e colori per livello (decorazione).
import { useEffect, useState } from "react";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, Notice, DataTable, card } from "@/components/ds";

const TIERS = ["junior", "senior", "master"];
const TIER_LABEL = { junior: "Junior", senior: "Senior", master: "Master" };
const btn = { padding: "4px 9px", borderRadius: 6, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: FONTS.body };

export default function SeniorityAdminPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seniority");
      const j = await res.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setTier = async (userId, tier) => {
    setBusy(userId);
    try {
      await fetch("/api/admin/seniority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const rows = data?.rows || [];
  const count = (t) => rows.filter((r) => r.tier === t).length;
  const overrides = rows.filter((r) => r.override).length;
  const avg = (v) => (v ? Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "—");

  const columns = [
    {
      key: "name", label: "Operatore",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          {r.name === r.userId ? null : <div style={{ fontSize: 11, color: CP.textMuted }}>{r.userId}</div>}
        </div>
      ),
    },
    {
      key: "tier", label: "Livello attuale", sort: (r) => TIERS.indexOf(r.tier),
      render: (r) => (
        <span>
          <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{TIER_LABEL[r.tier] || r.tier}</span>
          <span style={{ fontSize: 12, color: CP.textMuted }}>{r.override ? " · forzato a mano" : " · automatico"}</span>
        </span>
      ),
    },
    { key: "auto", label: "Livello dai numeri", muted: true, sort: (r) => TIERS.indexOf(r.auto), render: (r) => TIER_LABEL[r.auto] || r.auto || "—" },
    { key: "totalSessions", label: "Sessioni", align: "right", render: (r) => fmtInt(r.totalSessions) },
    { key: "avgRecent30", label: "Media ultime 30", align: "right", sort: (r) => Number(r.avgRecent30) || 0, render: (r) => avg(r.avgRecent30) },
    { key: "avgRecent50", label: "Media ultime 50", align: "right", sort: (r) => Number(r.avgRecent50) || 0, render: (r) => avg(r.avgRecent50) },
    {
      key: "actions", label: "Forza a mano", sortable: false,
      render: (r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {TIERS.map((t) => {
            const on = r.override === t;
            return (
              <button key={t} disabled={busy === r.userId} onClick={() => setTier(r.userId, t)}
                style={{ ...btn, background: on ? CP.accentSoft : CP.surface, border: `1px solid ${on ? CP.accent : CP.border}`, color: on ? CP.accentSoftText : CP.textSecondary, opacity: busy === r.userId ? 0.6 : 1 }}>
                {TIER_LABEL[t]}
              </button>
            );
          })}
          <button disabled={busy === r.userId || !r.override} onClick={() => setTier(r.userId, null)}
            title="Togli la forzatura: il livello torna quello calcolato dai numeri"
            style={{ ...btn, background: "transparent", color: r.override ? CP.textSecondary : CP.textMuted, cursor: r.override ? "pointer" : "not-allowed", opacity: r.override ? 1 : 0.5 }}>
            Torna all'automatico
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "People" }, { label: "Seniority" }]}
        title="Seniority operatori"
        subtitle="Il livello di ogni operatore nel simulatore di training (Academy): si calcola da solo da quante sessioni ha fatto e dal punteggio medio recente. Da qui lo leggi e, se serve, lo forzi a mano."
      />

      <Notice>
        Come si sale: <b style={{ color: CP.textPrimary, fontWeight: 500 }}>Senior</b> con almeno 30 sessioni e punteggio medio delle ultime 30 di almeno 70 su 100;
        {" "}<b style={{ color: CP.textPrimary, fontWeight: 500 }}>Master</b> con almeno 100 sessioni e media delle ultime 50 di almeno 80. Sotto queste soglie si è Junior.
      </Notice>

      {loading && !data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{String(data.error)}</Notice>}

      {data && !data.error && rows.length === 0 && (
        <div style={{ ...card, padding: "22px 20px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          Nessun operatore ha ancora fatto sessioni valutate nel simulatore, quindi non c'è un livello da mostrare.
          Chi completa la prima sessione compare qui da solo. <Link href="/" style={{ color: CP.accentSoftText, textDecoration: "none" }}>Apri il simulatore →</Link>
        </div>
      )}

      {rows.length > 0 && (<>
        <HeroMetric label="Operatori con sessioni nel simulatore" value={fmtInt(rows.length)} compare={overrides ? `${fmtInt(overrides)} con livello forzato a mano` : "Nessun livello forzato a mano"}>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {TIERS.map((t) => <Metric key={t} label={TIER_LABEL[t]} value={fmtInt(count(t))} />)}
          </div>
        </HeroMetric>
        <DataTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.userId }))} defaultSort={{ key: "totalSessions", dir: -1 }} minWidth={900} maxHeight={680} />
      </>)}
    </div>
  );
}
