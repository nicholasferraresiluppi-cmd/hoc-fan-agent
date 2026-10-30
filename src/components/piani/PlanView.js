"use client";
// Piani di lavoro — viste condivise: il piano intero (/admin/piani) e la scheda «Il tuo piano»
// in cima alla pagina dove si lavora (Social › Oggi). Logica in lib/piani-core.js.
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, Circle, ArrowRight, ListChecks } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { card, BTN, BTN_PRIMARY_OFF } from "@/components/ds";
import { dueLabel, shortDay, openItemsFor, currentPhase } from "@/lib/piani-core";

const fetcher = async (u) => {
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
};
export const usePlans = (q) => useSWR(`/api/admin/piani${q ? "?" + q : ""}`, fetcher, { revalidateOnFocus: false });

async function send(body) {
  const r = await fetch("/api/admin/piani", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}

export function ProgressBar({ done, total, height = 6 }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ height, borderRadius: height, background: CP.surfaceAlt, overflow: "hidden" }} aria-label={`${done} su ${total}`}>
      <div style={{ width: `${pct}%`, height: "100%", background: CP.accent, transition: "width .3s" }} />
    </div>
  );
}

function DueTag({ due, today, done, late }) {
  if (!due || done) return null;
  return <span style={{ fontSize: 12, color: late ? CP.accentRed : CP.textMuted, whiteSpace: "nowrap" }}>{dueLabel(due, today)}</span>;
}

/** Una voce: spunta (o risposta), testo, chi, scadenza, link, stato del controllo automatico. */
export function ItemRow({ plan, item, onChange, compact = false, condition = false }) {
  const st = item.status;
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(st.answer || "");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (body) => {
    setBusy(true); setErr(null);
    try { const j = await send({ action: "item", planId: plan.id, itemId: item.id, ...body }); onChange?.(j.plan); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const toggle = () => { if (!busy && !item.ask) run({ done: !st.done }); };
  const autoNote = st.auto && (st.via !== "mano") ? st.auto.label : null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: compact ? "8px 0" : "10px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>
      <button onClick={item.ask ? () => setOpen((o) => !o) : toggle} disabled={busy}
        title={item.ask ? "Rispondi" : st.done ? "Togli la spunta" : "Segna come fatto"}
        style={{ background: "none", border: "none", padding: 2, cursor: busy ? "wait" : "pointer", color: st.done ? CP.accentGreen : CP.textMuted, flexShrink: 0, display: "inline-flex" }}>
        {st.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: st.done ? CP.textSecondary : CP.textPrimary, textDecoration: st.done && !item.ask ? "line-through" : "none", textDecorationColor: CP.textMuted }}>
          {item.text}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 3, fontSize: 12, color: CP.textMuted }}>
          {!condition && item.who && <span>{item.who}</span>}
          <DueTag due={item.due} today={plan.today} done={st.done} late={st.late} />
          {item.auto && <span title="Si spunta da solo leggendo i dati dell'app">{st.done && st.via === "dati" ? "fatto, dai dati" : "si spunta da solo"}{autoNote ? ` · ${autoNote}` : ""}</span>}
          {st.done && st.via === "mano" && st.by && <span>fatto da {st.by.split(" ")[0]}</span>}
          {item.ask && st.answer && !open && <span style={{ color: CP.textSecondary }}>«{st.answer.length > 90 ? st.answer.slice(0, 90) + "…" : st.answer}»{st.by ? ` — ${st.by.split(" ")[0]}` : ""}</span>}
          {item.ask && !open && <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", padding: 0, color: CP.textSecondary, cursor: "pointer", fontSize: 12, textDecoration: "underline", fontFamily: FONTS.body }}>{st.answer ? "modifica" : "rispondi"}</button>}
          {item.link && <Link href={item.link} style={{ color: CP.textSecondary, display: "inline-flex", alignItems: "center", gap: 3, textDecoration: "none" }}>apri <ArrowRight size={12} /></Link>}
        </div>
        {item.ask && open && (
          <div style={{ marginTop: 8 }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Scrivi la risposta"
              style={{ width: "100%", boxSizing: "border-box", fontFamily: FONTS.body, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button disabled={busy || !draft.trim()} onClick={async () => { await run({ answer: draft }); setOpen(false); }} style={{ ...BTN_PRIMARY_OFF(busy || !draft.trim()), minHeight: 32, padding: "5px 12px" }}>Salva</button>
              <button onClick={() => { setOpen(false); setDraft(st.answer || ""); }} style={{ ...BTN, minHeight: 32, padding: "5px 12px" }}>Annulla</button>
            </div>
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: CP.accentRed, marginTop: 4 }}>{err}</div>}
      </div>
    </div>
  );
}

/** Il piano intero, fase per fase. */
export function PlanFull({ plan, onChange }) {
  return (
    <div>
      {plan.goal && <p style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, margin: "0 0 16px", maxWidth: 820 }}>{plan.goal}</p>}
      <div style={{ ...card, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>{plan.progress.done} voci fatte su {plan.progress.total}{plan.progress.late ? ` · ${plan.progress.late} in ritardo` : ""}</div>
          <ProgressBar done={plan.progress.done} total={plan.progress.total} />
        </div>
        <div style={{ fontSize: 13, color: CP.textMuted }}>
          {plan.start && plan.end ? `dal ${shortDay(plan.start)} al ${shortDay(plan.end)}` : ""}{plan.people?.length ? ` · ${plan.people.join(", ")}` : ""}
        </div>
      </div>
      {plan.phases.map((ph) => (
        <section key={ph.id} style={{ ...card, padding: "14px 16px 6px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{ph.kind === "decision" ? "Decisione: " : ""}{ph.title}</h2>
            <span style={{ fontSize: 13, color: ph.overdue ? CP.accentRed : CP.textMuted }}>
              {ph.due ? (ph.kind === "decision" ? shortDay(ph.due) : dueLabel(ph.due, plan.today)) : ""}
              {" · "}{ph.kind === "decision" ? `condizioni vere ${ph.done} su ${ph.total}` : ph.complete ? "completata" : `${ph.done} su ${ph.total}`}
            </span>
          </div>
          {ph.note && <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, margin: "6px 0 8px" }}>{ph.note}</p>}
          {ph.items.map((it) => <ItemRow key={it.id} plan={plan} item={{ ...it, due: it.due || (ph.kind === "decision" ? null : ph.due) }} condition={ph.kind === "decision"} onChange={onChange} />)}
        </section>
      ))}
    </div>
  );
}

/**
 * Scheda in cima alla pagina di lavoro: il piano in corso dell'area, le prossime voci di chi la
 * apre. Non c'è nessun piano → non si vede niente.
 */
export function PlanCard({ area }) {
  const { data, mutate } = usePlans(`area=${encodeURIComponent(area)}`);
  const plan = data?.plan;
  if (!plan) return null;
  const mine = openItemsFor(plan, data.me?.name, 4);
  const cur = currentPhase(plan);
  const dec = plan.phases.find((p) => p.kind === "decision");
  const onChange = (p) => mutate({ ...data, plan: p }, { revalidate: false });
  return (
    <section style={{ ...card, padding: "14px 16px 8px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <ListChecks size={17} color={CP.textMuted} />
        <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{plan.title}</span>
        <span style={{ fontSize: 13, color: CP.textMuted }}>
          {cur && cur.kind !== "decision" ? `adesso: ${cur.title.toLowerCase()}` : ""}
          {dec ? `${cur && cur.kind !== "decision" ? " · " : ""}decisione ${shortDay(dec.due)}` : ""}
        </span>
        <Link href={`/admin/piani?id=${plan.id}`} style={{ marginLeft: "auto", fontSize: 13, color: CP.textSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          tutto il piano <ArrowRight size={13} />
        </Link>
      </div>
      <ProgressBar done={plan.progress.done} total={plan.progress.total} height={5} />
      <div style={{ fontSize: 12, color: CP.textMuted, margin: "6px 0 2px" }}>
        {plan.progress.done} su {plan.progress.total} fatte{plan.progress.late ? ` · ${plan.progress.late} in ritardo` : ""}
      </div>
      {mine.length ? mine.map((it) => <ItemRow key={it.id} plan={plan} item={it} onChange={onChange} compact />) : (
        <div style={{ fontSize: 13, color: CP.textSecondary, padding: "8px 0 6px" }}>Niente di aperto per te in questo piano.</div>
      )}
    </section>
  );
}
