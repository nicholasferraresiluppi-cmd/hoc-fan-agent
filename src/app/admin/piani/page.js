"use client";
/**
 * /admin/piani — Piani di lavoro (sprint in app, 30/10/2026).
 * Un piano = fasi con scadenza e voci (chi, entro quando, link alla pagina dove si fa). Le voci
 * che l'app può verificare da sola si spuntano dai dati; una fase «decisione» elenca le
 * condizioni. Chi lavora vede le sue voci anche in cima alla pagina di lavoro (Social › Oggi).
 */
import { useEffect, useState } from "react";
import { PageHead, Tabs, EmptyState, Notice } from "@/components/ds";
import { usePlans, PlanFull } from "@/components/piani/PlanView";
import { CP } from "@/lib/brand";

export default function PianiPage() {
  const { data, error, isLoading, mutate } = usePlans();
  const [sel, setSel] = useState(null);
  useEffect(() => { try { const id = new URLSearchParams(window.location.search).get("id"); if (id) setSel(id); } catch {} }, []);
  const plans = data?.plans || [];
  const plan = plans.find((p) => p.id === sel) || plans.find((p) => !p.archived) || plans[0] || null;
  const choose = (id) => {
    setSel(id);
    try { const u = new URL(window.location.href); u.searchParams.set("id", id); window.history.replaceState(window.history.state, "", u.pathname + u.search); } catch {}
  };
  const onChange = (p) => mutate({ ...data, plans: plans.map((x) => (x.id === p.id ? p : x)) }, { revalidate: false });

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 110px" }}>
      <PageHead title={plan ? plan.title : "Piani"} crumbs={[{ label: "Piani" }]}
        subtitle="Cosa c'è da fare, chi lo fa e per quando. Le voci che l'app può verificare si spuntano da sole." />
      {plans.length > 1 && <Tabs items={plans.map((p) => [p.id, p.title, `${p.progress.done}/${p.progress.total}`])} value={plan?.id} onChange={choose} style={{ marginBottom: 18 }} />}
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data && !plan && <EmptyState title="Nessun piano in corso">Quando c&apos;è un piano di lavoro per la tua area lo trovi qui.</EmptyState>}
      {plan && <PlanFull key={plan.id} plan={plan} onChange={onChange} />}
    </div>
  );
}
