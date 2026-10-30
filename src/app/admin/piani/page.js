"use client";
/**
 * /admin/piani — Piani di lavoro (sprint in app, 30/10/2026).
 * Un piano = fasi con scadenza e voci (chi, entro quando, link alla pagina dove si fa). Le voci
 * che l'app può verificare da sola si spuntano dai dati; una fase «decisione» elenca le
 * condizioni. Chi lavora vede le sue voci anche in cima alla pagina di lavoro (Social › Oggi).
 * Gli admin creano, modificano e archiviano i piani da qui (editor, 30/10).
 */
import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { PageHead, Tabs, EmptyState, Notice, BTN, BTN_PRIMARY } from "@/components/ds";
import { usePlans, PlanFull } from "@/components/piani/PlanView";
import { PlanEditor } from "@/components/piani/PlanEditor";
import { CP } from "@/lib/brand";

export default function PianiPage() {
  const { data, error, isLoading, mutate } = usePlans();
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null); // null | "new" | id
  useEffect(() => { try { const id = new URLSearchParams(window.location.search).get("id"); if (id) setSel(id); } catch {} }, []);
  const plans = data?.plans || [];
  const admin = Boolean(data?.me?.admin);
  const plan = plans.find((p) => p.id === sel) || plans.find((p) => !p.archived) || plans[0] || null;
  const choose = (id) => {
    setSel(id);
    try { const u = new URL(window.location.href); u.searchParams.set("id", id); window.history.replaceState(window.history.state, "", u.pathname + u.search); } catch {}
  };
  const onChange = (p) => mutate({ ...data, plans: plans.map((x) => (x.id === p.id ? p : x)) }, { revalidate: false });
  const onDeleted = async () => {
    await mutate(); setEdit(null); setSel(null);
    try { const u = new URL(window.location.href); u.searchParams.delete("id"); window.history.replaceState(window.history.state, "", u.pathname + u.search); } catch {}
    window.scrollTo(0, 0);
  };
  const onSaved = async (id) => { await mutate(); setEdit(null); choose(id); window.scrollTo(0, 0); };

  const editing = edit === "new" ? null : edit ? plans.find((p) => p.id === edit) : undefined;
  const title = edit === "new" ? "Nuovo piano" : edit ? `Modifica: ${editing?.title || ""}` : plan ? plan.title : "Piani";

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 110px" }}>
      <PageHead title={title} crumbs={[{ label: "Piani" }]}
        subtitle="Cosa c'è da fare, chi lo fa e per quando. Le voci che l'app può verificare si spuntano da sole."
        actions={admin && !edit ? <>
          {plan && <button type="button" style={BTN} onClick={() => setEdit(plan.id)}><Pencil size={14} />Modifica</button>}
          <button type="button" style={plan ? BTN : BTN_PRIMARY} onClick={() => setEdit("new")}><Plus size={14} />Nuovo piano</button>
        </> : null} />
      {edit ? (
        <PlanEditor key={edit} plan={editing} onSaved={onSaved} onCancel={() => setEdit(null)} onDeleted={onDeleted} />
      ) : (
        <>
          {plans.length > 1 && <Tabs items={plans.map((p) => [p.id, p.archived ? `${p.title} (archiviato)` : p.title, `${p.progress.done}/${p.progress.total}`])} value={plan?.id} onChange={choose} style={{ marginBottom: 18 }} />}
          {error && <Notice danger>{error.message}</Notice>}
          {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
          {data && !plan && <EmptyState title="Nessun piano in corso">Quando c&apos;è un piano di lavoro per la tua area lo trovi qui.</EmptyState>}
          {plan?.archived && <Notice>Questo piano è archiviato: non compare più in cima alla pagina di lavoro.</Notice>}
          {plan && <PlanFull key={plan.id} plan={plan} onChange={onChange} />}
        </>
      )}
    </div>
  );
}
