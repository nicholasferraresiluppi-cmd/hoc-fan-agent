"use client";

/**
 * L'ufficio di un palazzo della città (SEED): chi lavora a quella creator.
 * Team progetto (ClickUp + anagrafica, con ruolo, costo, peso e "è in call?") e team chat
 * (operatori dai turni). /admin/citta/ufficio?t=<palazzo>
 */
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, DataTable, Notice, Metric, FilterChip, card } from "@/components/ds";
import { fmt$, fmtPct, fmtInt } from "@/lib/format";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};
const eur = (v) => (v == null ? "—" : `€${fmtInt(v)}`);
const hm = (ts) => new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function Presence({ p, configured }) {
  if (!configured) return null;
  if (!p) return <span style={{ fontSize: 12.5, color: CP.textMuted }}>Calendario non visibile</span>;
  const busy = p.busy;
  const txt = busy ? `In un impegno fino alle ${hm(p.until)}` : p.next ? `Libero · prossimo impegno alle ${hm(p.next)}` : "Libero per il resto della giornata";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: busy ? CP.textPrimary : CP.textSecondary }}>
      <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: busy ? "#FFB54A" : "#7FE0B8", flex: "none" }} />{txt}
    </span>
  );
}

function Member({ m, configured }) {
  return (
    <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.email}</div>
        {m.weight != null && <div style={{ fontSize: 13, color: CP.textSecondary, whiteSpace: "nowrap" }} title="Quota del costo del team progetto di questo palazzo">pesa {fmtPct(m.weight)}</div>}
      </div>
      <div style={{ fontSize: 13, color: m.role ? CP.textSecondary : CP.textMuted }}>
        {m.role || "Ruolo da indicare"}{m.areas?.length ? ` · in ClickUp: ${m.areas.join(", ")}` : ""}
      </div>
      <Presence p={m.presence} configured={configured} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: CP.textSecondary }}>
        {m.fromClickup && <span>{m.open} aperte{m.late ? <span style={{ color: CP.attn }}> · {m.late} in ritardo</span> : ""}</span>}
        <span>{m.costHere != null ? `${eur(m.costHere)}/mese qui${m.projectsCount > 1 ? ` (1/${m.projectsCount} di ${eur(m.cost)})` : ""}` : "Costo da indicare"}</span>
      </div>
      {m.deal && <div style={{ fontSize: 12.5, color: CP.textMuted, lineHeight: 1.45 }}>Accordo: {m.deal}</div>}
      <div style={{ display: "flex", gap: 12, marginTop: 2, fontSize: 13 }}>
        {m.phone && <a href={`tel:${m.phone.replace(/\s/g, "")}`} style={{ color: CP.accentSoftText }}>Chiama</a>}
        {m.email && <a href={`https://calendar.google.com/calendar/u/0/r/eventedit?add=${encodeURIComponent(m.email)}`} target="_blank" rel="noopener" style={{ color: CP.accentSoftText }}>Fissa una call</a>}
        {m.email && <a href={`mailto:${m.email}`} style={{ color: CP.accentSoftText }}>Scrivi</a>}
        <Link href={`/admin/citta/persone?p=${encodeURIComponent(m.key)}`} style={{ color: CP.textMuted, marginLeft: "auto" }}>Modifica</Link>
      </div>
    </div>
  );
}

function Office() {
  const sp = useSearchParams();
  const router = useRouter();
  const t = sp.get("t") || "";
  const { data, isLoading } = useSWR(t ? `/api/admin/citta/ufficio?t=${encodeURIComponent(t)}` : null, fetcher, { revalidateOnFocus: false, refreshInterval: 120000 });
  const crumbs = [{ label: "La città", href: "/admin/citta" }, { label: t || "Uffici" }];
  if (!t) return <PageHead crumbs={crumbs} title="Gli uffici" subtitle="Apri un palazzo dalla città o dalla tabella per vedere chi ci lavora." />;
  if (isLoading && !data) return <PageHead crumbs={crumbs} title={`L'ufficio di ${t}`} subtitle="Sto chiamando a raccolta le persone…" />;
  if (data?.error) return <><PageHead crumbs={crumbs} title={`L'ufficio di ${t}`} /><Notice danger>{data.error}</Notice></>;
  const hq = t === "Azienda";
  const inCall = data.members.filter((m) => m.presence?.busy).length;
  const chatCols = [
    { key: "name", label: "Operatore", render: (r) => <Link href={`/leaderboard/operational/${encodeURIComponent(r.name)}`} style={{ color: "inherit", textDecoration: "none" }}>{r.name}{r.under && <span style={{ marginLeft: 8, fontSize: 12, color: CP.attn }}>sotto soglia</span>}</Link> },
    { key: "shifts", label: "Turni", align: "right", render: (r) => r.shifts.toLocaleString("it-IT") },
    { key: "sales", label: "Venduto", align: "right", render: (r) => fmt$(r.sales) },
    { key: "perShift", label: "A turno", align: "right", render: (r) => fmt$(r.perShift) },
    { key: "cost", label: "Compenso", align: "right", render: (r) => fmt$(r.cost) },
    { key: "share", label: "Quota del venduto", align: "right", render: (r) => fmtPct(r.share) },
  ];
  return (
    <>
      <PageHead crumbs={crumbs} title={`L'ufficio di ${t}`}
        line2={data.members.length ? `${data.members.length} nel team progetto${hq ? "" : `, ${data.chatters.length} in chat`}` : null}
        subtitle={`Chi lavora ${hq ? "in sede" : "a questa creator"}. Team progetto da ClickUp (assegnatari delle attività aperte) e dall'anagrafica; team chat dai turni del mese.`}
        actions={<Link href="/admin/citta/persone" style={{ fontSize: 13.5, color: CP.accentSoftText, textDecoration: "none", padding: "8px 2px" }}>Anagrafica persone →</Link>} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {data.towers.map((n) => <FilterChip key={n} label={n} active={n === t} onClick={() => router.replace(`/admin/citta/ufficio?t=${encodeURIComponent(n)}`)} />)}
      </div>

      <section style={{ ...card, padding: "18px 22px", marginBottom: 18, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Metric label="Venduto del mese" value={fmt$(data.sales)} />
        <Metric label="Team progetto" value={data.missingCost === data.members.length ? "—" : eur(data.teamCost)} note={data.missingCost ? `${data.missingCost} senza costo indicato` : "€ al mese"} />
        {!hq && <Metric label="Compensi chat" value={fmt$(data.chatCost)} note={data.sales ? `${fmtPct(data.chatCost / data.sales, 1)} del venduto` : null} />}
        {data.calendar.configured && !data.calendar.error && <Metric label="Adesso in un impegno" value={`${inCall} su ${data.members.filter((m) => m.presence).length}`} />}
      </section>

      {!data.calendar.configured && (
        <Notice>La presenza (in call / libero) non è ancora collegata: serve che l'amministratore di Google Workspace autorizzi HOC Pro a leggere solo occupato/libero dei calendari. Si vedrà qui accanto a ogni persona.</Notice>
      )}
      {data.calendar.error && <Notice>Presenza non disponibile: {data.calendar.error}.</Notice>}

      <SectionTitle aside={data.members.some((m) => m.weight != null) ? "«pesa» = quota del costo del team progetto di questo palazzo; chi segue più palazzi è diviso in parti uguali" : null}>Team progetto</SectionTitle>
      {data.members.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12, marginBottom: 26 }}>
          {data.members.map((m) => <Member key={m.key} m={m} configured={data.calendar.configured && !data.calendar.error} />)}
        </div>
      ) : (
        <Notice>Nessuno risulta assegnato ad attività aperte di questo palazzo in ClickUp. Aggiungi le persone dall'anagrafica.</Notice>
      )}

      {!hq && (
        <>
          <SectionTitle aside="turni a quota: chi lavora su più pagine nello stesso turno è diviso tra loro">Team chat</SectionTitle>
          <DataTable columns={chatCols} rows={data.chatters.map((c) => ({ ...c, key: c.name }))} defaultSort={{ key: "sales", dir: -1 }} empty="Nessun turno su queste pagine questo mese." minWidth={640} />
        </>
      )}
      <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 16 }}>ClickUp letto {data.clickupAt ? new Date(data.clickupAt).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : "—"}. I costi del team progetto sono in € al mese e non si sommano ai compensi chat in $.</p>
    </>
  );
}

export default function UfficioPage() {
  return (
    <div style={{ padding: "28px 28px 64px", fontFamily: FONTS.body, maxWidth: 1180 }}>
      <Suspense fallback={null}><Office /></Suspense>
    </div>
  );
}
