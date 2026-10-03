"use client";

/**
 * Questa settimana (28/09/2026, pannello pilota: il team lead voleva «una lista unica, 2-3 nomi in ordine
 * di priorità, i cali forti inclusi» invece di tre pagine da incrociare a mano).
 * Unisce, sulle SOLE creator visibili a chi guarda (le API sono già filtrate per creator):
 *   - sotto soglia (Action Center: score ≤ 25, almeno 5 turni)          → priorità alta
 *   - in calo forte sul mese prima (Classifica vendite: −15 punti o più) → anche se sopra soglia
 *   - da far crescere (Coaching Center: 25-50, con il training suggerito)
 * Coaching, non giudizio: nessuna classifica nuova, solo chi seguire e perché.
 */
import { useMemo, useState } from "react";
import { isEarlyMonth } from "@/lib/use-smart-period";
import Link from "next/link";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, EarlyMonthNote, card } from "@/components/ds";
import { TutorialVideoButton } from "@/components/TutorialVideo";

const fetcher = (u) => fetch(u).then((r) => r.json()).catch(() => null);
const month = (k = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const dec = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 1 }));

export default function SettimanaPage() {
  // inizio mese: il mese in corso ha 2-3 turni a testa → si parte dal mese chiuso (lib/use-smart-period)
  const [forceCurrent, setForceCurrent] = useState(false);
  const early = isEarlyMonth() && !forceCurrent;
  const cur = month(early ? 1 : 0), prev = month(early ? 2 : 1);
  const { data: rank } = useSWR(`/api/leaderboard/sales-cp?period_id=${cur}&include_no_cp=0`, fetcher, { revalidateOnFocus: false });
  const { data: rankPrev } = useSWR(`/api/leaderboard/sales-cp?period_id=${prev}&include_no_cp=0`, fetcher, { revalidateOnFocus: false });
  const { data: ac } = useSWR(`/api/admin/action-center?period_id=${cur}`, fetcher, { revalidateOnFocus: false });
  const { data: cc } = useSWR(`/api/admin/coaching-center?period_id=${cur}`, fetcher, { revalidateOnFocus: false });
  const loading = !rank || !ac || !cc;
  const vis = rank?.visibility;
  const noCreators = vis && !vis.all && !(vis.creators || []).length;

  const list = useMemo(() => {
    const byName = {};
    const add = (emp, pri, reason, extra = {}) => {
      const e = (byName[emp] ||= { employee: emp, pri: 0, reasons: [], ...extra });
      e.pri = Math.max(e.pri, pri) + (e.reasons.length ? 10 : 0);
      e.reasons.push(reason);
      Object.assign(e, Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null)));
    };
    // creator principale dalla classifica (la lista dell'Action Center porta il GRUPPO, non la creator)
    const creatorOf = Object.fromEntries((rank?.ranking || []).map((r) => [r.employee, r.cp_breakdown?.top_creator || null]));
    // l'Action Center manda una lista più larga (fino a 50) e la pagina filtra alla soglia: qui lo stesso
    const thr = ac?.config?.score_threshold_default_ui ?? 25, minSh = ac?.config?.min_shifts ?? 5;
    for (const c of ac?.candidates || []) {
      if (c.score == null || c.score > thr || (c.total_shifts ?? c.cp_aggregates?.total_shifts ?? minSh) < minSh) continue;
      add(c.employee, 200 - (c.score || 0), `sotto soglia (score ${dec(c.score)})`, { creator: creatorOf[c.employee] || null });
    }
    const prevBy = Object.fromEntries((rankPrev?.ranking || []).map((r) => [r.employee, r.score]));
    for (const r of rank?.ranking || []) {
      const p = prevBy[r.employee];
      if (r.score == null || p == null || (r.cp_aggregates?.total_shifts || 0) < 5) continue;
      const d = r.score - p;
      if (d <= -15) add(r.employee, 60 + Math.abs(d), `in calo di ${dec(Math.abs(d))} punti sul mese scorso (${dec(p)} → ${dec(r.score)})`, { creator: creatorOf[r.employee] || null });
    }
    for (const c of cc?.candidates || []) {
      if (c.assignment?.status === "completed") continue;
      add(c.employee, 40 + (50 - (c.score || 50)), `da far crescere (score ${dec(c.score)})`, { creator: creatorOf[c.employee] || c.top_creator || null, training: c.training?.categoryName || null, why: c.training?.rationale || null, assigned: c.assignment?.status || null });
    }
    return Object.values(byName).sort((a, b) => b.pri - a.pri).slice(0, 5);
  }, [rank, rankPrev, ac, cc]);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 900, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead title="Questa settimana" line2="Chi seguire, e perché." actions={<TutorialVideoButton id="sales-manager" />}
        subtitle="Al massimo cinque persone della tua squadra, in ordine: prima chi è sotto soglia, poi chi cala forte rispetto al mese scorso (anche se è sopra soglia), poi chi può crescere. Non è una classifica: è da dove cominciare." />
      <EarlyMonthNote info={{ early, current: month(0) }} periodId={cur} onSwitch={() => setForceCurrent(true)} />
      {noCreators && <Notice>Non hai ancora creator assegnate: chiedi a un admin di assegnarti le tue creator.</Notice>}
      {loading && !noCreators && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {!loading && !noCreators && list.length === 0 && <Notice>Questa settimana nessuno ha bisogno di attenzione particolare. Buon segno: usa il tempo per chi può crescere.</Notice>}
      <div style={{ display: "grid", gap: 12 }}>
        {list.map((p, i) => (
          <section key={p.employee} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: CP.textMuted }}>{i + 1}</span>
              <span style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{p.employee}</span>
              {p.creator && <span style={{ fontSize: 13, color: CP.textSecondary }}>soprattutto su {p.creator}</span>}
            </div>
            <ul style={{ margin: "8px 0 0 30px", padding: 0, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
              {p.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            {p.training && <p style={{ margin: "8px 0 0 30px", fontSize: 13.5, color: CP.textSecondary }}>Da allenare: <b style={{ fontWeight: 500, color: CP.textPrimary }}>{p.training}</b>{p.why ? ` — ${p.why}` : ""}{p.assigned ? ` · coaching ${p.assigned === "assigned" ? "già assegnato" : p.assigned}` : ""}</p>}
            <div style={{ display: "flex", gap: 14, margin: "10px 0 0 30px", fontSize: 13.5 }}>
              <Link href={`/leaderboard/operational/${encodeURIComponent(p.employee)}`} style={{ color: CP.accentSoftText }}>Apri la scheda</Link>
              <Link href="/admin/coaching-center" style={{ color: CP.accentSoftText }}>Assegna un coaching</Link>
              <Link href="/admin/coaching-sessions" style={{ color: CP.accentSoftText }}>Apri una sessione</Link>
            </div>
          </section>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 16, lineHeight: 1.55 }}>Sotto soglia = score vendite ≤ 25 con almeno 5 turni. In calo = almeno 15 punti in meno del mese scorso, con almeno 5 turni. Da far crescere = score tra 25 e 50. Solo le creator assegnate a te.</p>
    </div>
  );
}
