"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertCircle, Compass, Search } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /admin/cp-probe
 *
 * Tool di scoperta endpoint CP: chiama l'API admin che prova una lista di
 * URL plausibili contro l'API CreatorsPro e mostra quali rispondono 2xx,
 * quali 4xx/5xx, e i primi 600 char della response per ognuno.
 *
 * Scopo: scoprire l'endpoint dei "Profili pagamento" senza dover aprire
 * DevTools su CP.
 */
export default function CpProbePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function probe() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/admin/cp-probe-payment-profiles");
      const j = await res.json();
      if (!res.ok) throw new Error(j?.reason || j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1200, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>CP endpoint probe</span>
          </div>
        }
        section="Data · Diagnostica"
        title="CP — Discovery endpoint Profili Pagamento"
        subtitle="Probing automatico di endpoint plausibili sull'API CreatorsPro per trovare quello dei Profili Pagamento, così possiamo wrapparlo in HOC Pro."
      />

      <CpCard padding="20px 24px" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Avvia probing</div>
            <div style={{ fontSize: 12, color: CP.textSecondary, lineHeight: 1.5 }}>
              Chiama ~25 URL candidati contro CP API con le credenziali bot e
              raccoglie status + sample della response. Mette in evidenza quelli
              che rispondono 2xx (endpoint trovati) e quelli con status diverso
              da 404/405 (potenzialmente interessanti).
            </div>
          </div>
          <button
            onClick={probe}
            disabled={loading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 22px",
              background: loading ? CP.surfaceAlt : CP.accent,
              color: loading ? CP.textMuted : CP.accentInk,
              border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer",
            }}
          >
            <Search size={14} /> {loading ? "Probing…" : "Avvia probing"}
          </button>
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 20 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={16} /> {error}
          </div>
        </CpCard>
      )}

      {!data && !loading && !error && (
        <CpCard padding="20px 24px">
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <Compass size={20} color={CP.accentGreen} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ color: CP.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
              Clicca <b>Avvia probing</b>. Cerco endpoint plausibili tipo
              <code style={mono}>/v1/sellers-wage/profiles</code>,
              <code style={mono}>/v1/sellers-wage/payment-profiles</code>,
              <code style={mono}>/v1/sellers-wage/groups/&#123;id&#125;/profile</code> ecc.
              Quelli che rispondono 200 sono i nostri candidati per il wrapper.
            </div>
          </div>
        </CpCard>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
            <MiniStat label="URL provati" value={data.tried} />
            <MiniStat label="Risposte 2xx" value={data.success_count} color={data.success_count > 0 ? CP.accentGreen : null} />
            <MiniStat label="Status interessanti (non 404/405)" value={data.interesting_count} color={data.interesting_count > 0 ? "#F59E0B" : null} />
          </div>

          {data.group_used && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 12, color: CP.textSecondary }}>
              Group test usato per gli endpoint per-id: <b>{data.group_used.name}</b> <code style={mono}>{data.group_used.id}</code>
            </div>
          )}

          {data.successes.length > 0 && (
            <>
              <SectionLabel style={{ display: "block", marginBottom: 10, color: CP.accentGreen }}>
                ✓ Endpoint trovati ({data.successes.length})
              </SectionLabel>
              {data.successes.map((r) => <ResponseCard key={r.path} r={r} highlight />)}
            </>
          )}

          {data.sample_full_profile && (
            <>
              <SectionLabel style={{ display: "block", marginBottom: 10, marginTop: 24, color: CP.accentGreen }}>
                Sample completo del primo Payment Profile (struttura)
              </SectionLabel>
              <CpCard accent={CP.accentGreen} padding="14px 18px">
                <pre style={{ margin: 0, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 6, fontFamily: FONTS.mono, fontSize: 11, color: CP.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 520, overflow: "auto" }}>
                  {JSON.stringify(data.sample_full_profile, null, 2)}
                </pre>
              </CpCard>
            </>
          )}

          {data.interesting.length > data.successes.length && (
            <>
              <SectionLabel style={{ display: "block", marginBottom: 10, marginTop: 24, color: "#F59E0B" }}>
                Status interessanti — non 200 ma da indagare ({data.interesting.length - data.successes.length})
              </SectionLabel>
              {data.interesting.filter((r) => !r.ok).map((r) => <ResponseCard key={r.path} r={r} />)}
            </>
          )}

          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: "pointer", color: CP.textSecondary, fontSize: 13 }}>
              Vedi tutti i {data.all.length} tentativi (anche 404)
            </summary>
            <div style={{ marginTop: 10 }}>
              {data.all.filter((r) => r.status === 404 || r.status === 405).map((r) => (
                <div key={r.path} style={{ padding: "8px 12px", borderBottom: `1px solid ${CP.border}`, fontSize: 12, color: CP.textMuted, fontFamily: FONTS.mono, display: "flex", justifyContent: "space-between" }}>
                  <span>{r.path}</span>
                  <span>HTTP {r.status}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function ResponseCard({ r, highlight }) {
  const color = r.ok ? CP.accentGreen : (r.status >= 500 ? CP.accentRed : "#F59E0B");
  return (
    <CpCard accent={color} padding="14px 18px" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: highlight ? CP.accentGreen : CP.textPrimary }}>
          {r.path}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color }}>
          {r.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          HTTP {r.status ?? "ERR"}
        </div>
      </div>
      {r.parsed_top_keys && (
        <Row k="Top keys response" v={r.parsed_top_keys.join(", ")} mono />
      )}
      {r.parsed_data_count !== null && r.parsed_data_count !== undefined && (
        <Row k="data[] count" v={r.parsed_data_count} />
      )}
      {r.parsed_data_first_keys && (
        <Row k="data[0] keys" v={r.parsed_data_first_keys.join(", ")} mono />
      )}
      {r.error && <Row k="Errore" v={r.error} color={CP.accentRed} />}
      {r.sample && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", color: CP.textSecondary, fontSize: 11 }}>Sample body (600 char)</summary>
          <pre style={{ marginTop: 6, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 6, fontFamily: FONTS.mono, fontSize: 11, color: CP.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}>
            {r.sample}
          </pre>
        </details>
      )}
    </CpCard>
  );
}

function Row({ k, v, mono, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, gap: 12 }}>
      <span style={{ color: CP.textMuted, flexShrink: 0 }}>{k}</span>
      <span style={{ color: color || CP.textPrimary, fontFamily: mono ? FONTS.mono : FONTS.body, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ padding: "14px 16px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: CP.textMuted, marginBottom: 6, letterSpacing: "0.08em", fontWeight: 700, fontFamily: FONTS.mono }}>{label}</div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 24, color: color || CP.textPrimary }}>{value}</div>
    </div>
  );
}

const mono = { padding: "2px 6px", background: "#0a0a0a", borderRadius: 4, fontFamily: "ui-monospace, monospace", fontSize: 11, margin: "0 3px", color: "#f0f0f0" };
