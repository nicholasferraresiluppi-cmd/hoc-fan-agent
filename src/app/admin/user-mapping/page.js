"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Link2, CheckCircle2, Sparkles, Unlink, RefreshCw, Loader2, Search } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, Notice, DataTable, NUM } from "@/components/ds";
import { fmtInt } from "@/lib/format";

/**
 * /admin/user-mapping — collega gli utenti Clerk al loro operatore.
 * Suggerimento dal roster Infloww (per email), collegamento ancorato all'employeeId.
 * Completa la storia del mapping via API (PR #38).
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function UserMappingPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/user-mapping", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(null);
  const [pageErr, setPageErr] = useState(null);

  const forbidden = data?.error;
  const users = data?.users || [];
  const unmapped = users.filter((u) => u.mapping.status === "none").length;

  async function link(u, employee, employee_id) {
    setBusy(u.userId);
    setPageErr(null);
    try {
      const r = await fetch("/api/me/employee", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: u.userId, employee, employee_id: employee_id || null }),
      });
      const j = await r.json();
      if (!r.ok) setPageErr(j.error || "Errore.");
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  async function unlink(u) {
    if (!window.confirm(`Scollegare ${u.name} da ${u.mapping.employee}?`)) return;
    setBusy(u.userId);
    setPageErr(null);
    try {
      const r = await fetch(`/api/me/employee?user_id=${encodeURIComponent(u.userId)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) setPageErr(j.error || "Errore.");
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  // Redesign 26/09/2026 (pannello tester BOARD/UX): con 12 su 13 "non collegati"
  // e "nessun match roster" su ogni riga la pagina sembrava rotta. In realtà chi
  // non ha un suggerimento di solito non è un operatore (board, admin, account di
  // servizio) e non va collegato. Ora le righe si dividono per cosa c'è da fare:
  // prima chi ha un suggerimento (un clic), poi i collegati, poi il resto.
  const [filter, setFilter] = useState("all");
  const withSug = users.filter((u) => u.mapping.status === "none" && u.suggestion?.employee);
  const linked = users.filter((u) => u.mapping.status !== "none");
  const ambiguous = users.filter((u) => u.mapping.status === "none" && u.suggestion?.ambiguous);
  const noMatch = users.filter((u) => u.mapping.status === "none" && !u.suggestion?.employee && !u.suggestion?.ambiguous);
  const legacy = users.filter((u) => u.mapping.status === "override_legacy");
  const byFilter = { all: users, todo: withSug, linked, none: [...ambiguous, ...noMatch] };
  const rank = (u) => (u.mapping.status === "none" && u.suggestion?.employee ? 0 : u.mapping.status === "none" && u.suggestion?.ambiguous ? 1 : u.mapping.status !== "none" ? 2 : 3);
  const rows = (byFilter[filter] || users).map((u) => ({ ...u, id: u.userId, _rank: rank(u) }));

  const columns = [
    { key: "name", label: "Utente", render: (u) => (
      <span>
        <span style={{ fontWeight: 500 }}>{u.name}</span>
        <div style={{ fontSize: 12, color: CP.textMuted }}>{u.email || "—"}</div>
      </span>
    ) },
    { key: "_rank", label: "Operatore collegato", sort: (u) => u._rank, render: (u) => {
      const m = u.mapping;
      if (m.status === "override_anchored") return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} color={CP.accentGreen} /> {m.employee}
          <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>#{m.employee_id}</span>
        </span>
      );
      if (m.status === "override_legacy") return <span>{m.employee} <span style={{ fontSize: 12, color: CP.textMuted }}>(collegato per nome, non per codice)</span></span>;
      return <span style={{ color: CP.textMuted }}>non collegato</span>;
    } },
    { key: "sug", label: "Suggerimento", sortable: false, render: (u) => {
      const s = u.suggestion;
      if (s?.employee) return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CP.accentSoftText }}>
          <Sparkles size={13} /> {s.employee}
          <span style={{ fontSize: 12, color: CP.textMuted }}>{s.match === "exact" ? "email identica" : s.match}</span>
        </span>
      );
      if (s?.ambiguous) return <span style={{ fontSize: 13, color: CP.textSecondary }}>più operatori possibili: {s.candidates.join(", ")}</span>;
      if (u.mapping.status === "none") return <span style={{ fontSize: 13, color: CP.textMuted }}>nessun operatore con questa email</span>;
      return null;
    } },
    { key: "act", label: "", align: "right", sortable: false, render: (u) => {
      const s = u.suggestion, m = u.mapping;
      return (
        <span style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap" }}>
          {s?.employee && (
            <button onClick={() => link(u, s.employee, s.employee_id)} disabled={busy === u.userId}
              style={{ ...btnPrimary, opacity: busy === u.userId ? 0.6 : 1 }}>
              {busy === u.userId ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Collega
            </button>
          )}
          {m.status !== "none" && (
            <button onClick={() => unlink(u)} disabled={busy === u.userId} style={{ ...btnGhost, color: CP.accentRed }}>
              <Unlink size={12} /> Scollega
            </button>
          )}
        </span>
      );
    } },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Collega utenti" }]}
        title="Collega utenti a operatori"
        subtitle="Quale operatore è ogni persona con un account HOC Pro: serve perché l'operatore veda le sue pagine personali (profilo, score, compenso). Il collegamento usa il codice Infloww dell'operatore, quindi regge a refusi e cambi di nome."
        actions={<>
          <Link href="/admin/debug-mapping" style={{ ...btnGhost, textDecoration: "none" }}><Search size={14} /> Debug mapping CP</Link>
          <button onClick={() => mutate()} style={btnGhost}><RefreshCw size={14} /> Ricarica</button>
        </>}
      />

      {forbidden && <Notice danger>{String(forbidden)} {data?.reason ? `(${data.reason})` : ""}</Notice>}
      {pageErr && <Notice danger>Operazione non riuscita: {pageErr}</Notice>}
      {isLoading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textMuted, fontSize: 14 }}><Loader2 size={15} className="animate-spin" /> Carico utenti e roster…</div>}

      {!isLoading && !forbidden && (
        <>
          <HeroMetric
            label="Da collegare con un clic"
            value={fmtInt(withSug.length)}
            compare={withSug.length > 0 ? "utenti non collegati per cui il roster Infloww ha un operatore con la stessa email" : "nessun collegamento pronto da fare"}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Utenti con account" value={fmtInt(users.length)} />
              <Metric label="Già collegati" value={fmtInt(linked.length)} note={legacy.length ? `${legacy.length} solo per nome` : null} />
              <Metric label="Senza operatore corrispondente" value={fmtInt(noMatch.length + ambiguous.length)} note="di solito board, admin o account di servizio" />
            </div>
          </HeroMetric>

          {noMatch.length > 0 && withSug.length === 0 && linked.length === 0 && (
            <Notice>Nessun utente ha un operatore con la stessa email nel roster Infloww. È normale se oggi gli account sono solo del board e degli admin: gli operatori compariranno qui quando accetteranno l&apos;invito.</Notice>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Tutti (${users.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label={`Da collegare (${withSug.length})`} active={filter === "todo"} onClick={() => setFilter("todo")} disabled={!withSug.length} />
            <FilterChip label={`Collegati (${linked.length})`} active={filter === "linked"} onClick={() => setFilter("linked")} disabled={!linked.length} />
            <FilterChip label={`Senza corrispondenza (${noMatch.length + ambiguous.length})`} active={filter === "none"} onClick={() => setFilter("none")} disabled={!(noMatch.length + ambiguous.length)} />
          </div>

          <DataTable columns={columns} rows={rows} defaultSort={{ key: "_rank", dir: 1 }} minWidth={760} maxHeight={640} empty="Nessun utente in questo filtro." />
        </>
      )}

      <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 14, lineHeight: 1.6 }}>
        Il collegamento automatico avviene solo quando l&apos;email coincide esattamente; gli altri si collegano da qui con un clic sul suggerimento.
        Gli account “MASS” (invii di massa) sono esclusi dal roster e non compaiono mai come suggerimento.
        Per collegare un operatore che non viene suggerito serve l&apos;API con il suo codice Infloww (employeeId) dal roster.
      </p>
    </div>
  );
}

const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: CP.accent, border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer", fontFamily: FONTS.body };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, cursor: "pointer", fontFamily: FONTS.body };
