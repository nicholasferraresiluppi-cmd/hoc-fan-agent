"use client";
/**
 * Pezzi di interfaccia del Centro HR (29/09/2026): stili, campo modificabile
 * per tipo, valore leggibile, link da copiare. Usati da /admin/hr, dalla
 * scheda /admin/hr/[id] e dal modulo pubblico /hr/modulo/[token].
 * Solo token CP (seguono il tema), niente colori scritti a mano.
 */
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { NationalityInput, JobInput, LanguagesInput, ComuneInput, BirthInput, SkillsInput, LearnInput, SKILL_NAME } from "@/components/hr-inputs";

export const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 };
export const input = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`,
  borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none",
};
export const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", background: CP.accent, color: CP.accentInk, border: "1px solid transparent", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
export const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer", textDecoration: "none" };
export const chip = { display: "inline-block", fontSize: 12, padding: "2px 8px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textSecondary, marginRight: 4, marginBottom: 2 };
export const chipAccent = { ...chip, background: CP.accentSoft, color: CP.accentSoftText };

export function fmtDate(v) {
  if (!v) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const SYNC_LABEL = {
  ok: "Allineata",
  partial: "Allineata in parte",
  error: "Errore di sincronizzazione",
  pending: "Da sincronizzare",
  off: "Sincronizzazione spenta",
  deleted: "Task cancellato su ClickUp",
  missing: "Task non più nella lista",
};

/** Valore leggibile di un campo (sola lettura). */
export function displayValue(field, v) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return <span style={{ color: CP.textMuted }}>—</span>;
  switch (field.type) {
    case "comune": return `${v.name}${v.prov ? ` (${v.prov})` : ""}`;
    case "birth": return v.abroad ? v.country : `${v.name}${v.prov ? ` (${v.prov})` : ""}`;
    case "skillmap": { const e = Object.entries(v || {}); return e.length ? <span>{e.map(([k, l]) => <span key={k} style={chip}>{SKILL_NAME[k] || k} · {l}</span>)}</span> : <span style={{ color: CP.textMuted }}>—</span>; }
    case "learn": return <span>{v.map((k) => <span key={k} style={chip}>{SKILL_NAME[k] || k}</span>)}</span>;
    case "date": return fmtDate(v);
    case "bool": return v ? "Sì" : "No";
    case "labels": return <span>{v.map((x) => <span key={x} style={chip}>{x}</span>)}</span>;
    case "location": return <span>{v.address || "—"}{(v.lat == null || v.lng == null) && v.address ? <span style={{ color: CP.textMuted, fontSize: 12 }}> · senza posizione su mappa</span> : null}</span>;
    case "users": return v.map((u) => u.name || u.email).join(", ");
    case "attachment": return <span>{v.map((a) => <span key={a.id} style={chip}>{a.title || "allegato"}</span>)}</span>;
    case "fileRef": return <span>{v.title} <span style={{ color: CP.textMuted, fontSize: 12 }}>· caricato il {fmtDate(v.at)}</span></span>;
    case "url": return <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: CP.accentSoftText }}>{v.replace(/^https?:\/\//, "")}</a>;
    case "email": return <a href={`mailto:${v}`} style={{ color: CP.textPrimary }}>{v}</a>;
    default: return String(v);
  }
}

/**
 * Controllo di modifica per tipo. `options` = elenco scelte (drop_down /
 * labels) — per le etichette senza opzioni si scrive separato da virgole.
 */
export function FieldInput({ field, value, onChange, options, id, disabled }) {
  const common = { id, disabled, style: { ...input, opacity: disabled ? 0.6 : 1 } };
  // controlli su misura (01/10): nazionalità da tendina, mansione Chatter/Altro, lingue con livello
  if (field.key === "nationality") return <NationalityInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  if (field.key === "currentJob") return <JobInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  if (field.key === "spokenLanguages") return <LanguagesInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  if (field.type === "comune") return <ComuneInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  if (field.type === "birth") return <BirthInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  if (field.type === "skillmap") return <SkillsInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  if (field.type === "learn") return <LearnInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  switch (field.type) {
    case "date":
      return <input type="date" {...common} value={value || ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "number":
      return <input type="number" min={0} step={1} {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
    case "email":
      return <input type="email" autoComplete="email" {...common} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <input type="tel" autoComplete="tel" placeholder="+39 …" {...common} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    case "longtext":
      return <textarea rows={3} {...common} style={{ ...common.style, resize: "vertical" }} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    case "bool":
      return (
        <select {...common} value={value === true ? "true" : value === false ? "false" : ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}>
          <option value="">Non indicato</option>
          <option value="true">Sì</option>
          <option value="false">No</option>
        </select>
      );
    case "option": {
      const opts = options?.length ? options : field.options || [];
      if (!opts.length) return <input {...common} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
      return (
        <select {...common} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {value && !opts.includes(value) && <option value={value}>{value}</option>}
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    case "labels": {
      const cur = Array.isArray(value) ? value : [];
      if (!options?.length) {
        return <input {...common} placeholder="separati da virgola" value={cur.join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />;
      }
      const all = [...new Set([...options, ...cur])];
      return (
        <div role="group" aria-labelledby={id ? `${id}-l` : undefined} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {all.map((o) => {
            const on = cur.includes(o);
            return (
              <button key={o} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange(on ? cur.filter((x) => x !== o) : [...cur, o])}
                style={{ padding: "5px 10px", borderRadius: 999, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accentSoft : CP.surface, color: on ? CP.accentSoftText : CP.textPrimary }}>
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case "location":
      return <input {...common} placeholder={field.key === "location" ? "Via e numero civico" : "Città, paese"} value={value?.address || ""} onChange={(e) => onChange({ address: e.target.value, lat: value?.lat ?? null, lng: value?.lng ?? null })} />;
    case "cf":
      return <input {...common} autoComplete="off" spellCheck={false} maxLength={16} placeholder="16 caratteri" value={value || ""} onChange={(e) => onChange(e.target.value.toUpperCase())} />;
    default:
      return <input {...common} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function CopyLink({ link, note }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch { /* il testo resta selezionabile */ }
  };
  return (
    <div style={{ padding: 14, borderRadius: 10, background: CP.surfaceAlt }}>
      {note && <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 8 }}>{note}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...input, flex: "1 1 280px", fontSize: 13 }} aria-label="Link da copiare" />
        <button type="button" onClick={copy} style={btnGhost}>{done ? <Check size={14} /> : <Copy size={14} />}{done ? "Copiato" : "Copia"}</button>
      </div>
    </div>
  );
}

/** Fetcher SWR che porta il messaggio d'errore dell'API. */
export async function fetcher(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(j?.error || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

export async function postJson(url, body, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `Errore ${r.status}`);
  return j;
}
