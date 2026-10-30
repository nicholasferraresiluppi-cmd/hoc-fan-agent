"use client";
// Editor dei piani di lavoro (solo admin): titolo, date, persone, fasi e voci, con il tipo di
// ogni voce (da spuntare / domanda / automatica) e i parametri del controllo automatico.
// Le spunte sono legate all'id della voce: le voci nuove prendono un id nuovo (newId), quelle
// esistenti tengono il loro anche se cambi testo o le sposti — così spostare non sposta le spunte.
import { useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { card, BTN, BTN_PRIMARY_OFF, Notice } from "@/components/ds";
import { AUTO_TYPES, AUTO_FIELDS, newId } from "@/lib/piani-core";

const input = { width: "100%", boxSizing: "border-box", fontFamily: FONTS.body, fontSize: 14, padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
const lab = { display: "block", fontSize: 12, color: CP.textMuted, marginBottom: 4 };
const small = { ...BTN, minHeight: 30, padding: "4px 9px", fontSize: 12.5 };
const icon = { background: "none", border: "none", padding: 4, cursor: "pointer", color: CP.textMuted, display: "inline-flex" };

function Field({ label, children, style }) {
  return <label style={{ display: "block", ...style }}><span style={lab}>{label}</span>{children}</label>;
}

const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };

/** Copia pulita del piano (senza stati calcolati) da modificare. */
function draftOf(plan) {
  if (!plan) return { id: "", title: "", goal: "", area: "", cap: "social.manage", people: [], start: "", end: "", archived: false, phases: [{ id: newId("fase"), title: "", kind: "work", due: "", note: "", items: [] }] };
  return {
    id: plan.id, title: plan.title, goal: plan.goal || "", area: plan.area || "", cap: plan.cap || "", people: plan.people || [],
    start: plan.start || "", end: plan.end || "", archived: Boolean(plan.archived),
    phases: plan.phases.map((ph) => ({
      id: ph.id, title: ph.title, kind: ph.kind, due: ph.due || "", note: ph.note || "",
      items: ph.items.map((it) => ({ id: it.id, text: it.text, who: it.who || "", due: it.due || "", link: it.link || "", ask: it.ask, auto: it.auto ? { ...it.auto } : null })),
    })),
  };
}

const kindOf = (it) => (it.auto ? "auto" : it.ask ? "ask" : "check");

function ItemEditor({ it, people, onChange, onMove, onRemove, condition }) {
  const set = (k, v) => onChange({ ...it, [k]: v });
  const setKind = (k) => onChange({ ...it, ask: k === "ask", auto: k === "auto" ? (it.auto || { type: "radar_profiles", min: 1 }) : null });
  const fields = it.auto ? AUTO_FIELDS[it.auto.type] || [] : [];
  return (
    <div style={{ borderTop: `1px solid ${CP.border}`, padding: "10px 0", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <textarea value={it.text} onChange={(e) => set("text", e.target.value)} rows={2} placeholder={condition ? "Condizione" : "Cosa c'è da fare"} style={{ ...input, resize: "vertical", flex: 1 }} />
        <button type="button" title="Su" style={icon} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
        <button type="button" title="Giù" style={icon} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
        <button type="button" title="Togli la voce" style={{ ...icon, color: CP.accentRed }} onClick={onRemove}><Trash2 size={15} /></button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Tipo" style={{ flex: "1 1 150px" }}>{/* la spiegazione sta sotto: nella tendina si taglierebbe */}
          <select value={kindOf(it)} onChange={(e) => setKind(e.target.value)} style={input}>
            <option value="check">Da spuntare</option>
            <option value="ask">Domanda</option>
            <option value="auto">Automatica</option>
          </select>
        </Field>
        {!condition && (
          <Field label="Chi" style={{ flex: "1 1 130px" }}>
            <input value={it.who} onChange={(e) => set("who", e.target.value)} list="piani-people" placeholder="es. Luis" style={input} />
          </Field>
        )}
        {!condition && (
          <Field label="Entro (vuoto = data della fase)" style={{ flex: "1 1 150px" }}>
            <input type="date" value={it.due} onChange={(e) => set("due", e.target.value)} style={input} />
          </Field>
        )}
        <Field label="Link alla pagina" style={{ flex: "2 1 200px" }}>
          <input value={it.link} onChange={(e) => set("link", e.target.value)} placeholder="/admin/warmup?tab=contenuti" style={input} />
        </Field>
      </div>
      {it.ask && <div style={{ fontSize: 12, color: CP.textMuted }}>Si chiude quando qualcuno scrive la risposta.</div>}
      {it.auto && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 8, background: CP.surfaceAlt }}>
          <Field label="Si spunta da solo quando" style={{ flex: "2 1 220px" }}>
            <select value={it.auto.type} onChange={(e) => set("auto", { type: e.target.value, min: 1 })} style={input}>
              {Object.entries(AUTO_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {fields.map(([k, l, ty]) => (
            <Field key={k} label={l} style={{ flex: "1 1 120px" }}>
              {Array.isArray(ty) ? (
                <select value={it.auto[k] || ""} onChange={(e) => set("auto", { ...it.auto, [k]: e.target.value })} style={input}>
                  {ty.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              ) : (
                <input type={ty === "n" ? "number" : "text"} min={0} value={it.auto[k] ?? ""} onChange={(e) => set("auto", { ...it.auto, [k]: ty === "n" ? Number(e.target.value) : e.target.value })} style={input} />
              )}
            </Field>
          ))}
          {it.auto.type === "feedback_open" && <div style={{ fontSize: 12, color: CP.textMuted, flexBasis: "100%" }}>Fatta quando non ci sono segnalazioni aperte (dall&apos;inizio del piano).</div>}
        </div>
      )}
    </div>
  );
}

export function PlanEditor({ plan, onSaved, onCancel }) {
  const creating = !plan;
  const [d, setD] = useState(() => draftOf(plan));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setPhase = (i, ph) => setD((x) => ({ ...x, phases: x.phases.map((p, j) => (j === i ? ph : p)) }));

  const save = async (patch = {}) => {
    setBusy(true); setErr(null);
    const body = { ...d, ...patch };
    if (creating && !body.id) body.id = body.title;
    try {
      const r = await fetch("/api/admin/piani", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", create: creating, plan: body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
      onSaved(j.plan.id);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div>
      <datalist id="piani-people">{d.people.map((p) => <option key={p} value={p} />)}</datalist>
      <section style={{ ...card, padding: 16, marginBottom: 14, display: "grid", gap: 12 }}>
        <Field label="Titolo"><input value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="es. Social: verso 5 dispositivi" style={input} /></Field>
        <Field label="Obiettivo (cosa vogliamo ottenere e perché)"><textarea value={d.goal} onChange={(e) => set("goal", e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} /></Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Inizio" style={{ flex: "1 1 140px" }}><input type="date" value={d.start} onChange={(e) => set("start", e.target.value)} style={input} /></Field>
          <Field label="Fine" style={{ flex: "1 1 140px" }}><input type="date" value={d.end} onChange={(e) => set("end", e.target.value)} style={input} /></Field>
          <Field label="Persone (separate da virgola)" style={{ flex: "2 1 220px" }}>
            <input value={d.people.join(", ")} onChange={(e) => set("people", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} style={input} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Chi lo vede oltre agli admin" style={{ flex: "1 1 220px" }}>
            <select value={d.cap} onChange={(e) => set("cap", e.target.value)} style={input}>
              <option value="">Solo admin</option>
              <option value="social.manage">Chi lavora sul Social</option>
            </select>
          </Field>
          <Field label="Scheda in cima alla pagina di lavoro" style={{ flex: "1 1 220px" }}>
            <select value={d.area} onChange={(e) => set("area", e.target.value)} style={input}>
              <option value="">Nessuna</option>
              <option value="social">Social › Oggi</option>
            </select>
          </Field>
        </div>
      </section>

      {d.phases.map((ph, i) => {
        const dec = ph.kind === "decision";
        const setItems = (items) => setPhase(i, { ...ph, items });
        return (
          <section key={ph.id} style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Field label={dec ? "Decisione" : `Fase ${i + 1}`} style={{ flex: "3 1 240px" }}>
                <input value={ph.title} onChange={(e) => setPhase(i, { ...ph, title: e.target.value })} placeholder={dec ? "es. Decisione sui 3 dispositivi" : "es. Collaudo dello strumento"} style={input} />
              </Field>
              <Field label={dec ? "Data della decisione" : "Scadenza"} style={{ flex: "1 1 140px" }}>
                <input type="date" value={ph.due} onChange={(e) => setPhase(i, { ...ph, due: e.target.value })} style={input} />
              </Field>
              <Field label="Tipo" style={{ flex: "1 1 140px" }}>
                <select value={ph.kind} onChange={(e) => setPhase(i, { ...ph, kind: e.target.value })} style={input}>
                  <option value="work">Lavoro</option>
                  <option value="decision">Decisione</option>
                </select>
              </Field>
              <span style={{ display: "inline-flex", paddingBottom: 4 }}>
                <button type="button" title="Su" style={icon} onClick={() => set("phases", move(d.phases, i, -1))}><ArrowUp size={15} /></button>
                <button type="button" title="Giù" style={icon} onClick={() => set("phases", move(d.phases, i, 1))}><ArrowDown size={15} /></button>
                <button type="button" title="Togli la fase" style={{ ...icon, color: CP.accentRed }} onClick={() => set("phases", d.phases.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </span>
            </div>
            <Field label="Nota (come si lavora in questa fase)" style={{ marginTop: 10 }}>
              <textarea value={ph.note} onChange={(e) => setPhase(i, { ...ph, note: e.target.value })} rows={2} style={{ ...input, resize: "vertical" }} />
            </Field>
            <div style={{ marginTop: 10 }}>
              {ph.items.map((it, k) => (
                <ItemEditor key={it.id} it={it} people={d.people} condition={dec}
                  onChange={(v) => setItems(ph.items.map((x, j) => (j === k ? v : x)))}
                  onMove={(dir) => setItems(move(ph.items, k, dir))}
                  onRemove={() => setItems(ph.items.filter((_, j) => j !== k))} />
              ))}
              <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setItems([...ph.items, { id: newId(), text: "", who: "", due: "", link: "", ask: false, auto: null }])}>
                <Plus size={13} />{dec ? "Condizione" : "Voce"}
              </button>
            </div>
          </section>
        );
      })}
      <button type="button" style={{ ...BTN, marginBottom: 18 }} onClick={() => set("phases", [...d.phases, { id: newId("fase"), title: "", kind: "work", due: "", note: "", items: [] }])}>
        <Plus size={14} />Fase
      </button>

      {err && <Notice danger>{err}</Notice>}
      <div style={{ position: "sticky", bottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", borderRadius: 12, background: CP.panel || CP.surface, border: `1px solid ${CP.border}` }}>
        <button type="button" disabled={busy || !d.title.trim()} onClick={() => save()} style={BTN_PRIMARY_OFF(busy || !d.title.trim())}>{busy ? "Salvo…" : creating ? "Crea il piano" : "Salva"}</button>
        <button type="button" disabled={busy} onClick={onCancel} style={BTN}>Annulla</button>
        {!creating && (
          <button type="button" disabled={busy} onClick={() => save({ archived: !d.archived })} style={{ ...BTN, marginLeft: "auto" }}>
            {d.archived ? "Riapri il piano" : "Archivia il piano"}
          </button>
        )}
        <span style={{ fontSize: 12, color: CP.textMuted, flexBasis: "100%" }}>Le spunte e le risposte già date restano: sono legate alla voce, non alla sua posizione.</span>
      </div>
    </div>
  );
}
