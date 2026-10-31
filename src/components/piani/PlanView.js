"use client";
// Piani di lavoro — viste condivise: il piano intero (/admin/piani) e la scheda «Il tuo piano»
// in cima alla pagina dove si lavora (Social › Oggi). Logica in lib/piani-core.js.
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, Circle, ArrowRight, ListChecks, ChevronDown } from "lucide-react";
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
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: compact ? "7px 0" : "10px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>
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

/** Dove si lavora per ogni area: da lì si arriva al piano e lì si torna. */
export const AREA_HOME = { social: { href: "/admin/warmup", label: "Social" } };

/**
 * Il piano intero (31/10, su richiesta di Nicholas: deve stare in una schermata). Le fasi sono
 * colonne affiancate a tutta larghezza; in ogni fase si vedono le voci aperte, quelle fatte
 * stanno ripiegate in fondo («N fatte»), così la lista si accorcia man mano che si lavora.
 */
export function PlanFull({ plan, onChange }) {
  return (
    <div>
      <div style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: CP.textSecondary, whiteSpace: "nowrap" }}>{plan.progress.done} fatte su {plan.progress.total}{plan.progress.late ? ` · ${plan.progress.late} in ritardo` : ""}</div>
        <div style={{ flex: "1 1 200px" }}><ProgressBar done={plan.progress.done} total={plan.progress.total} /></div>
        <div style={{ fontSize: 13, color: CP.textMuted }}>
          {plan.start && plan.end ? `dal ${shortDay(plan.start)} al ${shortDay(plan.end)}` : ""}{plan.people?.length ? ` · ${plan.people.join(", ")}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {plan.phases.map((ph) => <PhaseColumn key={ph.id} plan={plan} ph={ph} onChange={onChange} />)}
      </div>
    </div>
  );
}

function PhaseColumn({ plan, ph, onChange }) {
  const [showDone, setShowDone] = useState(false);
  const dec = ph.kind === "decision";
  const items = ph.items.map((it) => ({ ...it, due: it.due || (dec ? null : ph.due) }));
  // le condizioni di una decisione restano tutte in vista: servono lette insieme
  const open = dec ? items : items.filter((it) => !it.status.done);
  const done = dec ? [] : items.filter((it) => it.status.done);
  const row = (it) => <div key={it.id} style={{ breakInside: "avoid" }}><ItemRow plan={plan} item={it} condition={dec} onChange={onChange} compact /></div>;
  // una fase con tante voci aperte prende tutta la riga e le voci vanno in colonne: niente lista lunga da scorrere
  return (
    <section style={{ ...card, padding: "12px 14px 6px", flex: open.length > 6 ? "1 1 100%" : "1 1 320px", minWidth: 0 }}>
      <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{dec ? "Decisione: " : ""}{ph.title}</h2>
      <div style={{ fontSize: 12.5, color: ph.overdue ? CP.accentRed : CP.textMuted, marginTop: 2 }}>
        {ph.due ? (dec ? shortDay(ph.due) : dueLabel(ph.due, plan.today)) : ""}
        {ph.due ? " · " : ""}{dec ? `condizioni vere ${ph.done} su ${ph.total}` : ph.complete ? "completata" : `${ph.done} su ${ph.total}`}
      </div>
      {ph.note && <p title={ph.note} style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.45, margin: "6px 0 6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ph.note}</p>}
      <div style={{ columnWidth: 320, columnGap: 22 }}>{open.map(row)}</div>
      {!dec && !open.length && <div style={{ fontSize: 13, color: CP.textSecondary, padding: "8px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>Tutto fatto in questa fase.</div>}
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", borderTop: `1px solid ${CP.borderSoft || CP.border}`, padding: "8px 0", cursor: "pointer", fontSize: 12.5, color: CP.textSecondary, fontFamily: FONTS.body, textAlign: "left" }}>
            <ChevronDown size={14} style={{ transform: showDone ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            {done.length} {done.length === 1 ? "fatta" : "fatte"}
          </button>
          {showDone && <div style={{ columnWidth: 320, columnGap: 22 }}>{done.map(row)}</div>}
        </>
      )}
    </section>
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
