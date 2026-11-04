"use client";
// Piani di lavoro — viste condivise: il piano intero (/admin/piani) e la scheda «Il tuo piano»
// in cima alla pagina dove si lavora (Social › Oggi). Logica in lib/piani-core.js.
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, Circle, CircleDashed, MessageCircle, ArrowRight, ArrowUpRight, ListChecks, ChevronDown, Zap } from "lucide-react";
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

/** Giorni da oggi a `due` (negativo = passato). */
const daysTo = (due, today) => (due && today ? Math.round((Date.parse(due + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000) : null);
/** «mancano 3 giorni», «scade domani», «scaduta da 2 giorni». */
export function countdown(due, today) {
  const d = daysTo(due, today);
  if (d == null) return due ? "entro " + shortDay(due) : "";
  if (d > 1) return `mancano ${d} giorni`;
  if (d === 1) return "scade domani";
  if (d === 0) return "scade oggi";
  return d === -1 ? "scaduta ieri" : `scaduta da ${-d} giorni`;
}

const firstName = (s) => String(s || "").trim().split(/[\s,]+/)[0] || "";

/** Chi fa la maggior parte delle voci di una fase: lo si dice una volta nell'intestazione, non su ogni riga. */
function mainWho(items) {
  const n = {};
  for (const it of items) if (it.who) n[it.who] = (n[it.who] || 0) + 1;
  return Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
}

const chip = { display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 9px", borderRadius: 7, fontSize: 12.5, whiteSpace: "nowrap", fontFamily: FONTS.body, lineHeight: 1 };

/** Mini barra «3 su 5» per le voci che si spuntano dai dati. */
function AutoChip({ st }) {
  const a = st.auto || {};
  const has = Number.isFinite(a.value) && Number.isFinite(a.target) && a.target > 0;
  const pct = has ? Math.min(100, Math.round((a.value / a.target) * 100)) : 0;
  return (
    <span title={`Si spunta da sola leggendo i dati dell'app${a.label ? `: ${a.label}` : ""}`}
      style={{ ...chip, background: CP.surfaceAlt, color: st.done ? CP.accentGreen : CP.textSecondary }}>
      <Zap size={12} />
      {has ? <>
        <span style={{ width: 34, height: 4, borderRadius: 4, background: CP.border, overflow: "hidden" }}><span style={{ display: "block", width: `${pct}%`, height: "100%", background: st.done ? CP.accentGreen : CP.accent }} /></span>
        {a.value}/{a.target}
      </> : (a.label || "dai dati")}
    </span>
  );
}

/**
 * Una voce del piano (31/10, rifatta da capo dopo il feedback di Nicholas sulla pagina «da persona
 * senza esperienza»). Regole:
 * - tre tipi di voce, tre segni diversi: cerchio = la spunti tu; cerchio tratteggiato con fulmine =
 *   si spunta da sola dai dati (puoi comunque spuntarla a mano); fumetto = domanda, si risponde;
 * - a destra, sempre nello stesso punto, al massimo tre cose: avanzamento dai dati, «Rispondi», «Apri»;
 * - chi e scadenza compaiono solo se diversi da quelli della fase (nell'intestazione) o se in ritardo;
 * - la spunta risponde subito (ottimistica) e torna indietro con un errore se il salvataggio fallisce.
 */
export function ItemRow({ plan, item, onChange, onDone, compact = false, condition = false, phaseWho = null, phaseDue = null }) {
  const st0 = item.status;
  const [busy, setBusy] = useState(false);
  const [optim, setOptim] = useState(null); // true/false mentre il salvataggio è in corso
  const [draft, setDraft] = useState(st0.answer || "");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(null);
  const [hover, setHover] = useState(false);
  const done = optim ?? st0.done;
  const st = { ...st0, done };
  const run = async (body) => {
    setBusy(true); setErr(null);
    try { const j = await send({ action: "item", planId: plan.id, itemId: item.id, ...body }); onChange?.(j.plan); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); setOptim(null); }
  };
  const toggle = () => { if (busy) return; if (item.ask) { setOpen((o) => !o); return; } setOptim(!done); if (!done) onDone?.(item.id); run({ done: !done }); };
  const Icon = done ? CheckCircle2 : item.ask ? MessageCircle : item.auto ? CircleDashed : Circle;
  const showWho = !condition && item.who && item.who !== phaseWho;
  const showDue = !done && item.due && (st.late || item.due !== phaseDue);
  const sub = [];
  // le spunte salvate prima del 31/10 possono avere l'id utente al posto del nome: quello non si mostra
  if (st.done && st.via === "mano") sub.push(st.by && !/^user_/.test(st.by) ? `fatto da ${firstName(st.by.includes("@") ? st.by.split("@")[0] : st.by)}` : "fatto");
  // il dettaglio del controllo automatico va sotto solo se dice più del «3/5» già nel chip
  const a = st.auto;
  if (item.auto && a?.label && Number.isFinite(a.value) && a.target > 0 && !new RegExp(`^${a.value}[ /]`).test(a.label)) sub.push(a.label);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: compact ? "6px 8px" : "7px 8px", margin: "0 -8px", borderRadius: 8, background: hover ? CP.surfaceAlt : "transparent", transition: "background .12s" }}>
      <button type="button" onClick={toggle} disabled={busy && !item.ask} aria-pressed={done}
        title={item.ask ? (st.answer ? "Modifica la risposta" : "Rispondi") : done ? "Togli la spunta" : item.auto ? "Si spunta da sola dai dati — puoi spuntarla anche a mano" : "Segna come fatto"}
        style={{ width: 30, height: 30, margin: "-4px -2px -4px -6px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          color: done ? CP.accentGreen : hover ? CP.textSecondary : CP.textMuted, transform: optim === true ? "scale(1.15)" : "none", transition: "transform .15s, color .15s" }}>
        <Icon size={20} strokeWidth={done ? 2.2 : 1.8} />
      </button>
      {/* testo e pulsanti vanno a capo insieme: sul telefono i pulsanti scendono sotto il testo invece di schiacciarlo */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "6px 10px", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0, paddingTop: 2 }}>
        <div style={{ fontSize: 14, lineHeight: 1.4, color: done ? CP.textMuted : CP.textPrimary, textDecorationLine: done && !item.ask ? "line-through" : "none", textDecorationColor: CP.textMuted, transition: "color .2s" }}>
          {item.text}
        </div>
        {(sub.length > 0 || showWho || showDue || (item.ask && st.answer && !open)) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2, fontSize: 12, color: CP.textMuted }}>
            {showWho && <span>{item.who}</span>}
            {showDue && <span style={{ color: st.late ? CP.accentRed : CP.textMuted }}>{dueLabel(item.due, plan.today)}</span>}
            {sub.map((t, i) => <span key={i}>{t}</span>)}
            {item.ask && st.answer && !open && <span style={{ color: CP.textSecondary }}>«{st.answer.length > 120 ? st.answer.slice(0, 120) + "…" : st.answer}»{st.by && !/^user_/.test(st.by) ? ` — ${firstName(st.by)}` : ""}</span>}
          </div>
        )}
        {item.ask && open && (
          <div style={{ marginTop: 8 }}>
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Scrivi la risposta"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) { run({ answer: draft }); setOpen(false); } }}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: FONTS.body, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <button disabled={busy || !draft.trim()} onClick={async () => { await run({ answer: draft }); setOpen(false); }} style={{ ...BTN_PRIMARY_OFF(busy || !draft.trim()), minHeight: 30, padding: "4px 12px" }}>Salva</button>
              <button onClick={() => { setOpen(false); setDraft(st.answer || ""); }} style={{ ...BTN, minHeight: 30, padding: "4px 12px" }}>Annulla</button>
              <span style={{ fontSize: 12, color: CP.textMuted }}>⌘ Invio per salvare</span>
            </div>
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: CP.accentRed, marginTop: 4 }}>Non salvato: {err}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
        {item.auto && <AutoChip st={st} />}
        {item.ask && !open && <button type="button" onClick={() => setOpen(true)} style={{ ...chip, background: st.answer ? "transparent" : CP.accentSoft, color: st.answer ? CP.textSecondary : CP.accentSoftText, border: st.answer ? `1px solid ${CP.border}` : "1px solid transparent", cursor: "pointer" }}>{st.answer ? "Modifica" : "Rispondi"}</button>}
        {item.link && <Link href={item.link} title="Apri la pagina dove si fa" style={{ ...chip, border: `1px solid ${CP.border}`, color: CP.textSecondary, textDecoration: "none", background: CP.surface }}>Apri <ArrowUpRight size={13} /></Link>}
      </div>
      </div>
    </div>
  );
}

/** Dove si lavora per ogni area: da lì si arriva al piano e lì si torna. */
export const AREA_HOME = { social: { href: "/admin/warmup", label: "Clipping" } };

/** La frase di stato in cima: cosa resta e quanto tempo c'è. */
export function planStatus(plan) {
  const cur = plan.phases.find((p) => p.kind !== "decision" && !p.complete);
  const dec = plan.phases.find((p) => p.kind === "decision");
  const parts = [];
  if (cur) { const left = cur.total - cur.done; parts.push(`${cur.title}: ${left} ${left === 1 ? "voce aperta" : "voci aperte"}, ${countdown(cur.due, plan.today)}`); }
  else if (plan.phases.some((p) => p.kind !== "decision")) parts.push("Tutte le voci di lavoro sono fatte");
  if (dec) parts.push(`decisione ${shortDay(dec.due)}: ${dec.done} ${dec.done === 1 ? "condizione vera" : "condizioni vere"} su ${dec.total}`);
  return parts.join(" · ");
}

/**
 * Il piano intero (31/10). Si legge come una lista di lavoro, non come un tabellone:
 * a sinistra la fase di adesso, una colonna sola dall'alto in basso; a destra la decisione
 * (il perché del piano) e le altre fasi. Le voci fatte si ripiegano in fondo a ogni fase.
 */
export function PlanFull({ plan, onChange }) {
  const work = plan.phases.filter((p) => p.kind !== "decision");
  const now = work.find((p) => !p.complete) || work[0] || null;
  const side = [...plan.phases.filter((p) => p.kind === "decision"), ...work.filter((p) => p !== now)];
  return (
    <div className="piani-grid" style={{ display: "grid", gap: 16, alignItems: "start" }}>
      <style>{`.piani-grid{grid-template-columns:minmax(0,1fr)}@media(min-width:1100px){.piani-grid{grid-template-columns:minmax(0,1.5fr) minmax(360px,1fr)}}`}</style>
      {now && <Phase plan={plan} ph={now} onChange={onChange} main />}
      {side.length > 0 && <div style={{ display: "grid", gap: 16 }}>{side.map((ph) => <Phase key={ph.id} plan={plan} ph={ph} onChange={onChange} />)}</div>}
    </div>
  );
}

/** La nota della fase; nelle fasi laterali due righe, il resto con un clic. */
function Note({ text, clamp }) {
  const [open, setOpen] = useState(false);
  const cut = clamp && !open;
  return (
    <p onClick={clamp ? () => setOpen((o) => !o) : undefined} title={cut ? "Leggi tutto" : undefined}
      style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, margin: "6px 0 8px", maxWidth: 680, cursor: clamp ? "pointer" : "default",
        ...(cut ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>
      {text}
    </p>
  );
}

function Phase({ plan, ph, onChange, main = false }) {
  const [showDone, setShowDone] = useState(false);
  // una voce appena spuntata resta un attimo al suo posto (si vede la spunta) prima di ripiegarsi tra le fatte
  const [keep, setKeep] = useState(() => new Set());
  const onDone = (id) => {
    setKeep((k) => new Set(k).add(id));
    setTimeout(() => setKeep((k) => { const n = new Set(k); n.delete(id); return n; }), 1400);
  };
  const dec = ph.kind === "decision";
  const who = dec ? null : mainWho(ph.items);
  const items = ph.items.map((it) => ({ ...it, due: it.due || (dec ? null : ph.due) }));
  // le condizioni di una decisione restano tutte in vista: servono lette insieme
  const open = dec ? items : items.filter((it) => !it.status.done || keep.has(it.id));
  const done = dec ? [] : items.filter((it) => it.status.done && !keep.has(it.id));
  const row = (it) => <ItemRow key={it.id} plan={plan} item={it} condition={dec} onChange={onChange} onDone={onDone} phaseWho={who} phaseDue={dec ? null : ph.due} />;
  const late = !dec && ph.overdue;
  return (
    <section style={{ ...card, padding: main ? "16px 18px 10px" : "14px 16px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {main && <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", color: CP.accentSoftText, background: CP.accentSoft, padding: "2px 7px", borderRadius: 5 }}>Adesso</span>}
        <h2 style={{ fontSize: main ? 17 : 15, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{ph.title}</h2>
        <span style={{ marginLeft: "auto", fontSize: 13, color: late ? CP.accentRed : CP.textSecondary, whiteSpace: "nowrap" }}>
          {dec ? `${shortDay(ph.due)} · ${countdown(ph.due, plan.today).replace("scade", "è")}` : ph.complete ? "fase chiusa" : countdown(ph.due, plan.today)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 4px" }}>
        <div style={{ flex: 1 }}><ProgressBar done={ph.done} total={ph.total} height={5} /></div>
        <span style={{ fontSize: 12.5, color: CP.textMuted, whiteSpace: "nowrap" }}>
          {dec ? `${ph.done} di ${ph.total} condizioni vere` : `${ph.done} di ${ph.total} fatte`}{who ? ` · ${who}` : ""}{!dec && ph.due ? ` · entro ${shortDay(ph.due)}` : ""}
        </span>
      </div>
      {ph.note && <Note text={ph.note} clamp={!main} />}
      <div style={{ marginTop: 4 }}>
        {open.map(row)}
        {!dec && !open.length && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: CP.accentGreen, padding: "10px 0" }}><CheckCircle2 size={18} />Fase chiusa: tutte le voci sono fatte.</div>}
      </div>
      {done.length > 0 && (
        <div style={{ borderTop: `1px solid ${CP.borderSoft || CP.border}`, marginTop: 6 }}>
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "9px 0 4px", cursor: "pointer", fontSize: 13, color: CP.textSecondary, fontFamily: FONTS.body }}>
            <ChevronDown size={14} style={{ transform: showDone ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            {showDone ? "Nascondi le fatte" : `Fatte (${done.length})`}
          </button>
          {showDone && done.map(row)}
        </div>
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
  // stessa scadenza per tutte le voci → si dice una volta in testa, non su ogni riga
  const dues = [...new Set(mine.map((it) => it.due).filter(Boolean))];
  const oneDue = dues.length === 1 && !mine.some((it) => it.status.late) ? dues[0] : null;
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
        {plan.progress.done} su {plan.progress.total} fatte{plan.progress.late ? ` · ${plan.progress.late} in ritardo` : ""}{oneDue ? ` · le tue entro ${shortDay(oneDue)}, ${countdown(oneDue, plan.today)}` : ""}
      </div>
      {mine.length ? mine.map((it) => <ItemRow key={it.id} plan={plan} item={it} onChange={onChange} phaseWho={it.who} phaseDue={oneDue} compact />) : (
        <div style={{ fontSize: 13, color: CP.textSecondary, padding: "8px 0 6px" }}>Niente di aperto per te in questo piano.</div>
      )}
    </section>
  );
}
