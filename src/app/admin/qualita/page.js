"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP } from "@/lib/brand";
import { PageHead, Notice, card, SectionTitle, Disclosure, DataTable } from "@/components/ds";

/**
 * /admin/qualita — Controllo qualità: i problemi li trova il sistema, non le persone (10/10/2026).
 * Tre controlli (lib/qualita): coerenza degli accessi (ogni notte), giro per persona e prova del compito
 * (robot settimanale con i permessi di ogni membro). In alto «pronto per…»: una persona riceve uno
 * strumento quando i tre sono verdi.
 */

const fetcher = (u) => fetch(u, { cache: "no-store" }).then(async (r) => { const j = await r.json().catch(() => ({ error: "Risposta non valida" })); return r.ok ? j : { error: j.error || `Errore ${r.status}` }; });
const fmtWhen = (ts) => new Date(ts).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const KIND = { sales: "Chi guida le vendite", admin: "Admin", operator: "Operatore" };
const STATUS = { ok: { label: "ok", color: () => CP.accentGreen }, warn: { label: "da guardare", color: () => CP.attn }, fail: { label: "errore", color: () => CP.accentRed } };

function Dot({ color }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: color, marginRight: 8, flexShrink: 0 }} />;
}

export default function QualitaPage() {
  const { data, error, isLoading } = useSWR("/api/admin/qualita", fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState({});
  const [allPages, setAllPages] = useState(false);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const head = <PageHead crumbs={[{ label: "Admin", href: "/admin" }, { label: "Controllo qualità" }]} title="Controllo qualità"
    subtitle="Tre controlli che girano da soli e trovano i problemi prima delle persone: accessi incoerenti, pagine che non funzionano per chi le apre, lavori che non si riescono a finire. Una persona riceve uno strumento quando i tre sono verdi." />;
  if (isLoading) return <div style={{ maxWidth: 1100 }}>{head}<div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div></div>;
  if (error || data?.error) return <div style={{ maxWidth: 1100 }}>{head}<Notice danger>{data?.error || "Non riesco a leggere il controllo qualità."}</Notice></div>;

  const { coherence = [], giro = {}, readiness = [], tasks = [], members = 0 } = data;
  const last = giro.last;
  const ready = readiness.filter((r) => r.ready).length;

  return (
    <div style={{ maxWidth: 1100 }}>
      {head}

      {giro.stale && (
        <Notice danger>
          {last ? `L'ultimo giro del robot è del ${fmtWhen(last.at)}: oltre ${giro.staleDays} giorni fa.` : "Il robot del giro non ha ancora consegnato un rapporto."} Finché non gira, i controlli 2 e 3 non dicono niente di nuovo (gira ogni lunedì da GitHub Actions, o a mano con <code>scripts/qualita/giro.mjs</code>).
        </Notice>
      )}

      <section style={{ ...card, padding: "16px 18px", marginBottom: 18 }}>
        <SectionTitle aside={last ? `giro del ${fmtWhen(last.at)} · coerenza calcolata adesso` : "coerenza calcolata adesso"}>Pronto per… · {ready} su {readiness.length}</SectionTitle>
        <DataTable rows={readiness} minWidth={640} empty="Nessun giro ancora: compariranno qui le persone provate dal robot."
          columns={[
            { key: "label", label: "Persona", sort: (r) => r.label, render: (r) => <span style={{ color: CP.textPrimary }}>{r.label}</span> },
            { key: "ready", label: "Stato", sort: (r) => (r.ready ? 1 : 0), render: (r) => <span style={{ display: "inline-flex", alignItems: "center", color: r.ready ? CP.textSecondary : CP.accentRed }}><Dot color={r.ready ? CP.accentGreen : CP.accentRed} />{r.ready ? "pronto" : r.error ? "il robot non è entrato" : "da sistemare"}</span> },
            { key: "tasks", label: "Compiti", sort: (r) => r.tasksFailed, render: (r) => (r.tasks ? <span style={{ color: r.tasksFailed ? CP.accentRed : CP.textSecondary }}>{r.tasks - r.tasksFailed} su {r.tasks} riusciti</span> : <span style={{ color: CP.textMuted }}>—</span>) },
            { key: "fails", label: "Pagine in errore", sort: (r) => r.fails, render: (r) => <span style={{ color: r.fails ? CP.accentRed : CP.textMuted }}>{r.fails}</span> },
            { key: "warns", label: "Da guardare", sort: (r) => r.warns, render: (r) => <span style={{ color: r.warns ? CP.textSecondary : CP.textMuted }}>{r.warns}</span> },
            { key: "issues", label: "Accessi", sort: (r) => r.issues, render: (r) => <span style={{ color: r.issues ? CP.accentRed : CP.textMuted }}>{r.issues ? `${r.issues} da sistemare` : "ok"}</span> },
          ]} />
      </section>

      <SectionTitle aside="ogni notte · alert «Accessi incoerenti»">1 · Coerenza degli accessi</SectionTitle>
      <section style={{ ...card, padding: "14px 16px", marginBottom: 18 }}>
        {coherence.length === 0
          ? <div style={{ fontSize: 14, color: CP.textSecondary }}><Dot color={CP.accentGreen} />Tutti i {members} membri hanno ruolo, creator e vista che vanno d&apos;accordo.</div>
          : coherence.map((m) => (
            <div key={m.userId} style={{ padding: "8px 0", borderBottom: `1px solid ${CP.borderSoft}` }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 4 }}>{m.name} · <Link href="/admin/ruoli" style={{ color: CP.accentSoftText, fontSize: 13 }}>sistema in Membri</Link></div>
              {m.issues.map((x) => <div key={x.code} style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{x.text}</div>)}
            </div>
          ))}
      </section>

      <SectionTitle aside={<>ogni lunedì · il robot apre ogni voce del menu con i permessi della persona · <button onClick={() => setAllPages(!allPages)} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13 }}>{allPages ? "solo i problemi" : "mostra tutte le pagine"}</button></>}>2 · Giro per persona</SectionTitle>
      {!last && <Notice>Nessun rapporto ancora.</Notice>}
      {(last?.personas || []).map((p) => {
        const bad = p.pages.filter((g) => g.status !== "ok");
        const rows = allPages ? p.pages : bad;
        return (
          <Disclosure key={p.key} open={!!open[`g:${p.key}`]} onToggle={() => toggle(`g:${p.key}`)} title={p.label}
            summary={p.error ? `il robot non è entrato: ${p.error}` : `${p.pages.length} pagine · ${p.pages.filter((g) => g.status === "fail").length} in errore · ${p.pages.filter((g) => g.status === "warn").length} da guardare`}>
            {p.error && <Notice danger>{p.error}</Notice>}
            <DataTable rows={rows} minWidth={600} empty="Tutte le pagine del suo menu funzionano."
              columns={[
                { key: "status", label: "", sort: (g) => ({ fail: 0, warn: 1, ok: 2 }[g.status]), render: (g) => <span title={STATUS[g.status].label} style={{ display: "inline-flex" }}><Dot color={STATUS[g.status].color()} /></span> },
                { key: "label", label: "Pagina", sort: (g) => g.label, render: (g) => <Link href={g.href} style={{ color: CP.textPrimary, textDecoration: "none" }}>{g.label || g.href}</Link> },
                { key: "ms", label: "Tempo", sort: (g) => g.ms, render: (g) => <span style={{ color: g.ms > 8000 ? CP.attn : CP.textMuted }}>{(g.ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s</span> },
                { key: "problems", label: "Cosa non va", sortable: false, render: (g) => <span style={{ fontSize: 12.5, color: CP.textSecondary }}>{g.problems.join(" · ") || "—"}</span> },
              ]} />
          </Disclosure>
        );
      })}

      <div style={{ height: 8 }} />
      <SectionTitle aside="stesso robot · ogni compito va dall'inizio alla fine con i permessi della persona">3 · Prova del compito</SectionTitle>
      {(last?.personas || []).filter((p) => p.tasks.length).map((p) => (
        <section key={p.key} style={{ ...card, padding: "12px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 14, color: CP.textPrimary, marginBottom: 6 }}>{p.label}</div>
          {p.tasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "baseline", fontSize: 13, lineHeight: 1.6 }}>
              <Dot color={t.ok ? CP.accentGreen : CP.accentRed} />
              <div><span style={{ color: t.ok ? CP.textSecondary : CP.textPrimary }}>{t.title}</span>{!t.ok && <span style={{ color: CP.accentRed }}> — {t.problem}</span>}</div>
            </div>
          ))}
        </section>
      ))}
      <Disclosure open={!!open.catalog} onToggle={() => toggle("catalog")} title="I compiti che il robot prova" summary={`${tasks.length} compiti per ${Object.keys(KIND).length} tipi di persona`}>
        {Object.entries(KIND).map(([k, label]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 4 }}>{label}</div>
            {tasks.filter((t) => t.for === k).map((t) => <div key={t.id} style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{t.title} <span style={{ color: CP.textMuted }}>— {t.why}</span></div>)}
          </div>
        ))}
        <div style={{ fontSize: 12.5, color: CP.textMuted }}>I compiti si aggiungono in <code>src/lib/qualita-tasks.js</code>: uno nuovo per ogni strumento che si dà in mano a qualcuno.</div>
      </Disclosure>
    </div>
  );
}
