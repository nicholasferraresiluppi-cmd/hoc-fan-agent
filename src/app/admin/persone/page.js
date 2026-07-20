"use client";

/**
 * /admin/persone — indice del "CRM persone".
 *
 * Roster operatori (apri la scheda di chiunque) + persone con timeline
 * nell'event-store + trigger del backfill. Stati vuoti espliciti: finché le
 * people-feature non sono usate, la timeline è vuota — la pagina lo dice.
 */
import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";
import { Search, Play, RefreshCw, Contact, ExternalLink } from "lucide-react";

const fetcher = async (url) => {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
  return r.json();
};

export default function PersoneIndexPage() {
  const { data, error, isLoading } = useSWR("/api/admin/persone", fetcher, { revalidateOnFocus: false });
  const [q, setQ] = useState("");
  const [bf, setBf] = useState(null);     // risultato backfill
  const [bfBusy, setBfBusy] = useState(false);

  const denied = error && (error.status === 401 || error.status === 403);

  const roster = data?.roster || [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return roster.slice(0, 40);
    return roster.filter((r) => r.name.toLowerCase().includes(s)).slice(0, 40);
  }, [roster, q]);

  async function runBackfill(dry) {
    if (!dry && !window.confirm("Eseguire il backfill reale? Scrive gli eventi nell'event-store (idempotente, ri-eseguibile).")) return;
    setBfBusy(true); setBf(null);
    try {
      const r = dry
        ? await fetch("/api/admin/person-backfill")
        : await fetch("/api/admin/person-backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: true }) });
      const j = await r.json();
      setBf({ ok: r.ok, dry, ...j });
    } catch (e) {
      setBf({ ok: false, error: String(e?.message || e) });
    } finally { setBfBusy(false); }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 80px", fontFamily: FONTS.body, color: CP.textSecondary }}>
      <PageHeader
        section="People"
        title="Persone"
        subtitle="Scheda 360 del ciclo di vita operatore: assunzione, onboarding, certificazioni, promozioni, QA, coaching, uscita. La timeline si popola man mano che le people-feature vengono usate."
      />

      {denied && <Notice>Accesso riservato agli admin (SEED): la scheda espone eventi HR sensibili.</Notice>}
      {error && !denied && <Notice>Errore nel caricamento ({String(error.status || error.message)}).</Notice>}

      {!denied && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <StatCard label="Operatori nel roster" value={isLoading ? "…" : (data?.roster_count ?? 0)} sub="apribili" />
            <StatCard label="Con timeline" value={isLoading ? "…" : (data?.store_count ?? 0)} sub="eventi nell'event-store" accent={data?.store_count ? CP.accent : undefined} />
          </div>

          {/* Trigger backfill */}
          <CpCard style={{ marginBottom: 18 }}>
            <SectionLabel style={{ display: "block", marginBottom: 6 }}>Backfill dai dati esistenti</SectionLabel>
            <p style={{ fontSize: 13, color: CP.textMuted, margin: "0 0 12px", lineHeight: 1.55 }}>
              Popola la timeline leggendo profili, certificazioni, QA, coaching, dispute e action-center. Idempotente: ri-eseguibile senza duplicare. Prova prima in dry-run.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => runBackfill(true)} disabled={bfBusy} style={btnGhost}>
                <RefreshCw size={14} strokeWidth={1.8} /> Dry-run
              </button>
              <button onClick={() => runBackfill(false)} disabled={bfBusy} style={btnPrimary}>
                <Play size={14} strokeWidth={1.8} /> Esegui backfill
              </button>
              {bfBusy && <span style={{ fontSize: 12, color: CP.textMuted, alignSelf: "center" }}>in corso…</span>}
            </div>
            {bf && <BackfillResult bf={bf} />}
          </CpCard>

          {/* Persone con timeline */}
          {data?.store_count > 0 ? (
            <>
              <SectionLabel style={{ display: "block", marginBottom: 10 }}>Con timeline</SectionLabel>
              <CpCard padding="6px 0" style={{ marginBottom: 18 }}>
                {data.store_people.map((p) => (
                  <Link key={p.id} href={`/admin/persone/${encodeURIComponent(p.id)}`} style={rowLink}>
                    <span style={{ fontWeight: 500, color: CP.textPrimary }}>{p.id}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: CP.textMuted }}>{p.level || "—"} · {p.status}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textSecondary, textAlign: "right" }}>{p.event_count} eventi</span>
                  </Link>
                ))}
              </CpCard>
            </>
          ) : (
            <Notice>
              Nessuna persona ha ancora una timeline. Le fonti (profili, certificazioni, QA, coaching, dispute) sono vuote finché il team non usa le people-feature. Appena c'è dato, lancia il backfill qui sopra e le timeline compaiono. Nel frattempo puoi comunque aprire la scheda di qualunque operatore dal roster.
            </Notice>
          )}

          {/* Ricerca roster */}
          <SectionLabel style={{ display: "block", margin: "8px 0 10px" }}>Apri un operatore dal roster</SectionLabel>
          <div style={{ position: "relative", marginBottom: 12, maxWidth: 420 }}>
            <Search size={15} strokeWidth={1.8} color={CP.textMuted} style={{ position: "absolute", left: 12, top: 10 }} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome…"
              style={{ width: "100%", boxSizing: "border-box", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 999, color: CP.textPrimary, fontSize: 13, padding: "8px 14px 8px 34px", outline: "none" }}
            />
          </div>
          <CpCard padding="6px 0">
            {filtered.length === 0 && <div style={{ padding: "12px 18px", fontSize: 13, color: CP.textMuted }}>Nessun operatore corrisponde.</div>}
            {filtered.map((r) => (
              <Link key={r.id} href={`/admin/persone/${encodeURIComponent(r.id)}`} style={rowLink}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 500, color: CP.textPrimary }}>
                  <Contact size={15} strokeWidth={1.7} color={CP.textMuted} /> {r.name}
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.textMuted }}>{r.id}</span>
                <span style={{ textAlign: "right", color: CP.accent }}><ExternalLink size={14} strokeWidth={1.8} /></span>
              </Link>
            ))}
          </CpCard>
          {!q && roster.length > 40 && <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>Mostrati i primi 40 di {roster.length}. Cerca per restringere.</p>}
        </>
      )}
    </div>
  );
}

function BackfillResult({ bf }) {
  if (bf.error || bf.ok === false) return <p style={{ fontSize: 12.5, color: CP.accentRed, marginTop: 12 }}>Errore: {bf.error || "richiesta fallita"}</p>;
  const w = bf.written;
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", background: CP.bg, border: `1px solid ${CP.borderSoft}`, borderRadius: 8, fontSize: 12.5 }}>
      <div style={{ color: CP.textSecondary, marginBottom: 6 }}>
        {bf.dry ? "Dry-run" : "Backfill eseguito"} · roster {bf.roster_size} · <b style={{ color: CP.textPrimary }}>{bf.persons}</b> persone · <b style={{ color: CP.textPrimary }}>{bf.events_total}</b> eventi{w ? ` · scritti ${w.added}` : ""}
      </div>
      {bf.events_total === 0 && <div style={{ color: CP.textMuted }}>Nessun evento: le fonti a monte sono ancora vuote. Atteso finché le people-feature non sono usate.</div>}
      {bf.by_source && Object.keys(bf.by_source).length > 0 && (
        <div style={{ color: CP.textMuted, fontFamily: FONTS.mono, fontSize: 11.5, marginTop: 4 }}>{Object.entries(bf.by_source).map(([k, v]) => `${k}:${v}`).join(" · ")}</div>
      )}
      {bf.unresolved_count > 0 && <div style={{ color: CP.accentRed, marginTop: 4 }}>{bf.unresolved_count} nomi non risolti a employeeId (non scritti).</div>}
    </div>
  );
}

function Notice({ children }) {
  return (
    <CpCard style={{ marginBottom: 18, borderColor: CP.borderStrong }}>
      <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55 }}>{children}</div>
    </CpCard>
  );
}

const rowLink = { display: "grid", gridTemplateColumns: "1fr auto 90px", gap: 14, alignItems: "center", padding: "11px 18px", borderBottom: `1px solid ${CP.borderSoft}`, textDecoration: "none", color: CP.textPrimary };
const btnBase = { display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 8, fontSize: 12, fontWeight: 500, padding: "8px 14px", cursor: "pointer" };
const btnPrimary = { ...btnBase, background: CP.accent, color: CP.accentInk, border: "none" };
const btnGhost = { ...btnBase, background: CP.surfaceAlt, color: CP.textSecondary, border: `1px solid ${CP.border}` };
