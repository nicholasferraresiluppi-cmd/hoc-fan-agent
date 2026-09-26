"use client";

/**
 * Alert operativi — fonte di verità dei check automatici.
 * ADR: docs/ALERT_OPERATIVI.md. Dati da /api/admin/ops-alerts (SCORES_VIEW all).
 * Stati: open → ack (manuale, globale di team) → resolved (SOLO automatico).
 *
 * Redesign DS (26/09/2026): struttura issue-tracker invariata (critici in cima
 * dall'API, prendi in carico, link all'azione, creator terminate). Numero
 * principale = critici aperti; un solo bottone accento (Aggiorna ora), le
 * azioni di riga sono link/ghost per non far competere N viola nella stessa vista.
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, RefreshCw, Loader2, ArrowUpRight } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtAgo, fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, DataTable, card } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
};

const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, whiteSpace: "nowrap" };
const btnPrimary = { ...btn, padding: "8px 14px", background: CP.accent, border: `1px solid ${CP.accent}`, color: CP.accentInk, fontWeight: 500 };
const inp = { padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };

function sevColor(a) {
  if (a.status === "resolved") return CP.accentGreen;
  return a.severity === "critical" ? CP.accentRed : CP.textMuted;
}
function sevLabel(a) {
  if (a.status === "resolved") return "Risolto";
  return a.severity === "critical" ? "Critico" : "Avviso";
}

function StatusText({ alert }) {
  if (alert.status === "resolved") {
    return <span style={{ color: CP.textSecondary, fontSize: 13 }}>Chiuso da solo {alert.resolvedAt ? fmtAgo(alert.resolvedAt) : ""}</span>;
  }
  if (alert.status === "ack") {
    return <span style={{ color: CP.textSecondary, fontSize: 13 }}>In carico a {alert.ackBy || "qualcuno"}</span>;
  }
  return <span style={{ color: CP.textPrimary, fontSize: 13 }}>Aperto, nessuno se ne occupa</span>;
}

export default function OpsAlertsPage() {
  const { user } = useUser();
  const { data, error, isLoading, mutate } = useSWR("/api/admin/ops-alerts", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [filter, setFilter] = useState("open");
  const [running, setRunning] = useState(false);
  const [ackBusy, setAckBusy] = useState(null);

  const alerts = data?.alerts || [];
  const lastRun = data?.last_run;
  const openAlerts = alerts.filter((a) => a.status !== "resolved");
  const critOpen = openAlerts.filter((a) => a.severity === "critical");
  const warnOpen = openAlerts.filter((a) => a.severity !== "critical");
  const unowned = openAlerts.filter((a) => a.status === "open");

  const visible = filter === "all" ? alerts
    : filter === "crit" ? alerts.filter((a) => a.severity === "critical" && a.status !== "resolved")
    : openAlerts;

  async function runNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/admin/ops-alerts/run", { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        alert(d?.error || `Errore run (${r.status})`);
      }
      await mutate();
    } finally {
      setRunning(false);
    }
  }

  async function takeCharge(fingerprint) {
    setAckBusy(fingerprint);
    try {
      const r = await fetch("/api/admin/ops-alerts/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, name: user?.firstName || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        alert(d?.error || `Errore (${r.status})`);
      }
      await mutate();
    } finally {
      setAckBusy(null);
    }
  }

  const lastRunText = lastRun ? `${fmtAgo(lastRun.at)} (${lastRun.trigger === "manual" ? "lanciato a mano" : "automatico"})` : "mai";

  const columns = [
    {
      key: "title", label: "Problema", sort: (a) => (a.status === "resolved" ? 2 : a.severity === "critical" ? 0 : 1),
      render: (a) => {
        const resolved = a.status === "resolved";
        return (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", maxWidth: 460, minWidth: 260, whiteSpace: "normal" }}>
            <span title={sevLabel(a)} style={{ width: 8, height: 8, borderRadius: 999, background: sevColor(a), flexShrink: 0, marginTop: 6 }} />
            <div>
              <div style={{ fontSize: 12, color: a.severity === "critical" && !resolved ? CP.accentRed : CP.textMuted }}>{sevLabel(a)}</div>
              <div style={{ color: resolved ? CP.textSecondary : CP.textPrimary, fontWeight: 500, lineHeight: 1.4 }}>{a.title}</div>
              {a.detail && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 3, lineHeight: 1.5 }}>{a.detail}</div>}
            </div>
          </div>
        );
      },
    },
    { key: "value", label: "Valore", render: (a) => <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: a.status === "resolved" ? CP.textSecondary : CP.textPrimary }}>{a.value || "—"}</span> },
    {
      key: "firstSeen", label: "Aperto da", sort: (a) => -(a.firstSeen || 0),
      render: (a) => <span style={{ color: CP.textMuted, fontSize: 13, whiteSpace: "nowrap" }} title={`Ritrovato in ${a.runCount || 1} controlli`}>{fmtAgo(a.firstSeen)}</span>,
    },
    { key: "status", label: "Stato", render: (a) => <StatusText alert={a} /> },
    {
      key: "actions", label: "", sortable: false,
      render: (a) => {
        const resolved = a.status === "resolved";
        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", whiteSpace: "nowrap" }}>
            {a.status === "open" && (
              <button onClick={() => takeCharge(a.fingerprint)} disabled={ackBusy === a.fingerprint}
                title="Segna al team che te ne stai occupando tu"
                style={{ ...btn, opacity: ackBusy === a.fingerprint ? 0.6 : 1 }}>
                Prendi in carico
              </button>
            )}
            {!resolved && a.cta?.href && (
              <Link href={a.cta.href} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: CP.accentSoftText, textDecoration: "none", padding: "6px 4px" }}>
                {a.cta.label || "Apri"} <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Alert operativi" }]}
        title="Alert operativi"
        subtitle="Cosa si è rotto nei dati o è rimasto fermo, in ordine di gravità. Per ognuno: prendilo in carico e apri la pagina dove si sistema. Si chiude da solo quando il problema rientra."
        actions={
          <button onClick={runNow} disabled={running} style={{ ...btnPrimary, cursor: running ? "default" : "pointer", opacity: running ? 0.6 : 1 }}>
            {running ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
            Aggiorna ora
          </button>
        }
      />

      {error && <Notice danger>{String(error.message || error)}</Notice>}

      {isLoading && !data && !error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.textMuted, fontSize: 14, padding: "12px 0" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Carico gli alert…
        </div>
      )}

      {data && !error && (<>
        <HeroMetric
          label="Critici aperti"
          value={fmtInt(critOpen.length)}
          compare={critOpen.length === 0 ? "Nessun problema grave in questo momento." : "Da guardare per primi: bloccano numeri che usate per decidere."}
          hint={`Ultimo controllo: ${lastRunText}. I controlli girano ogni notte; i valori possono differire di poco dalle pagine, che calcolano al momento.`}
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Avvisi aperti" value={fmtInt(warnOpen.length)} />
            <Metric label="Senza nessuno che se ne occupa" value={fmtInt(unowned.length)} />
          </div>
        </HeroMetric>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <FilterChip label={`Aperti · ${openAlerts.length}`} active={filter === "open"} onClick={() => setFilter("open")} />
          <FilterChip label={`Solo critici · ${critOpen.length}`} active={filter === "crit"} onClick={() => setFilter("crit")} />
          <FilterChip label={`Tutti, anche risolti · ${alerts.length}`} active={filter === "all"} onClick={() => setFilter("all")} />
        </div>

        {visible.length === 0 ? (
          <div style={{ ...card, padding: "24px 20px", display: "flex", alignItems: "center", gap: 10, color: CP.textSecondary, fontSize: 14, marginBottom: 14 }}>
            <CheckCircle2 size={18} color={CP.accentGreen} />
            {filter === "all"
              ? "Nessun alert registrato finora. Premi «Aggiorna ora» per il primo controllo."
              : "Nessun alert aperto: i controlli non hanno trovato problemi."}
          </div>
        ) : (
          <DataTable columns={columns} rows={visible.map((a) => ({ ...a, id: a.fingerprint }))} minWidth={820} />
        )}

        <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
          Se un controllo ritrova lo stesso problema aggiorna la riga esistente, non ne crea una nuova.
          «Prendi in carico» è visibile a tutto il team. Gli alert risolti restano nello storico 90 giorni.
        </p>
      </>)}

      <div style={{ marginTop: 32 }}>
        <SectionTitle aside="Servono ai controlli per non dare falsi allarmi.">Impostazioni dei controlli</SectionTitle>
        <EndedCreators />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


// Creator che hanno smesso: il controllo "turni crollati" non le segnala più
// dai mesi successivi (una creator ferma non è un buco di dati).
function EndedCreators() {
  const { data, mutate } = useSWR("/api/admin/creators-ended", (u) => fetch(u).then((r) => (r.ok ? r.json() : null)));
  const prevMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const { data: pnl } = useSWR(`/api/admin/pnl-live?period_id=${prevMonth}`, (u) => fetch(u).then((r) => (r.ok ? r.json() : null)));
  const [alias, setAlias] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState(null);
  if (!data) return null;
  const ended = Object.entries(data.ended || {}).sort((a, b) => b[1].ended_on.localeCompare(a[1].ended_on));
  const add = async () => {
    setErr(null);
    const r = await fetch("/api/admin/creators-ended", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alias, ended_on: date }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Errore");
    setAlias(""); setDate(""); mutate();
  };
  const remove = async (a) => { await fetch(`/api/admin/creators-ended?alias=${encodeURIComponent(a)}`, { method: "DELETE" }); mutate(); };
  const canAdd = alias && date;
  return (
    <section style={{ ...card, padding: "16px 18px" }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, marginBottom: 4 }}>Creator terminate</div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 14, lineHeight: 1.5 }}>
        Segna qui chi ha smesso di lavorare con HOC: dai mesi dopo la data di fine, i controlli non la segnalano più come “turni crollati”.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: CP.textSecondary, flex: "1 1 240px" }}>
          Creator (nome come in CreatorsPro)
          <input list="ended-aliases" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Inizia a scrivere…" style={{ ...inp, width: "100%" }} />
        </label>
        <datalist id="ended-aliases">{(pnl?.rows || []).map((r) => <option key={r.alias} value={r.alias} />)}</datalist>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: CP.textSecondary }}>
          Ultimo giorno di lavoro
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        </label>
        <button onClick={add} disabled={!canAdd} style={{ ...btn, padding: "8px 14px", opacity: canAdd ? 1 : 0.5, cursor: canAdd ? "pointer" : "default" }}>Segna terminata</button>
      </div>
      {err && <div style={{ fontSize: 13, color: CP.accentRed, marginBottom: 10 }}>{err}</div>}
      {ended.length === 0 ? <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna creator segnata come terminata.</div> : ended.map(([a, v]) => (
        <div key={a} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 180px", color: CP.textPrimary }}>{a}</span>
          <span style={{ color: CP.textMuted, fontSize: 13 }}>fine {new Date(v.ended_on + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>
          <button onClick={() => remove(a)} style={{ ...btn, padding: "4px 10px", fontSize: 12, color: CP.textSecondary, background: "transparent" }}>Togli</button>
        </div>
      ))}
    </section>
  );
}
