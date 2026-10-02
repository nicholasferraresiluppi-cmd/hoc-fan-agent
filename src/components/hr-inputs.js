"use client";
/**
 * Controlli su misura del Centro HR (01/10/2026, richiesta di Nicholas dopo la prova del modulo):
 * nazionalità da tendina, mansione «Chatter / Altro», lingue con livello per lingua.
 * Restituiscono gli STESSI valori che ClickUp si aspetta (etichette «ENG - B2», «ITA - Native"…),
 * così la sincronizzazione non cambia.
 */
import { CP, FONTS } from "@/lib/brand";
import { useEffect, useState } from "react";
import { searchComuni } from "@/lib/hr-comuni";
import { SKILL_AREAS, SKILL_LEVELS, SKILL_NAME } from "@/lib/hr-skills";


const field = { width: "100%", boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };

// Paesi in italiano: i più frequenti in cima, poi tutti in ordine alfabetico.
const TOP = ["Italia", "Albania", "Romania", "Filippine", "Spagna", "Francia", "Germania", "Regno Unito", "Svizzera", "Brasile", "Argentina", "Marocco", "Ucraina", "Moldavia"];
const ALL = ["Afghanistan","Albania","Algeria","Andorra","Angola","Arabia Saudita","Argentina","Armenia","Australia","Austria","Azerbaigian","Bahamas","Bahrein","Bangladesh","Belgio","Bielorussia","Bolivia","Bosnia ed Erzegovina","Brasile","Bulgaria","Camerun","Canada","Capo Verde","Cile","Cina","Cipro","Colombia","Corea del Sud","Costa d'Avorio","Costa Rica","Croazia","Cuba","Danimarca","Ecuador","Egitto","El Salvador","Emirati Arabi Uniti","Eritrea","Estonia","Etiopia","Filippine","Finlandia","Francia","Georgia","Germania","Ghana","Giamaica","Giappone","Giordania","Grecia","Guatemala","Honduras","India","Indonesia","Iran","Iraq","Irlanda","Islanda","Israele","Kazakistan","Kenya","Kosovo","Kuwait","Lettonia","Libano","Libia","Liechtenstein","Lituania","Lussemburgo","Macedonia del Nord","Malta","Marocco","Messico","Moldavia","Monaco","Montenegro","Nepal","Nicaragua","Nigeria","Norvegia","Nuova Zelanda","Paesi Bassi","Pakistan","Panama","Paraguay","Perù","Polonia","Portogallo","Qatar","Regno Unito","Repubblica Ceca","Repubblica Dominicana","Romania","Russia","San Marino","Senegal","Serbia","Singapore","Siria","Slovacchia","Slovenia","Spagna","Sri Lanka","Stati Uniti","Sudafrica","Svezia","Svizzera","Thailandia","Tunisia","Turchia","Ucraina","Ungheria","Uruguay","Venezuela","Vietnam"];

export function NationalityInput({ id, value, onChange, disabled }) {
  const rest = ALL.filter((p) => !TOP.includes(p));
  const known = TOP.includes(value) || ALL.includes(value);
  return (
    <select id={id} disabled={disabled} style={field} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Scegli il paese</option>
      {value && !known && <option value={value}>{value}</option>}
      <optgroup label="Più frequenti">{TOP.map((p) => <option key={"t" + p} value={p}>{p}</option>)}</optgroup>
      <optgroup label="Tutti i paesi">{rest.map((p) => <option key={p} value={p}>{p}</option>)}</optgroup>
    </select>
  );
}

export const JOB_CHATTER = "Chatter (operatore di chat)";
export function JobInput({ id, value, onChange, disabled }) {
  const isChatter = value === JOB_CHATTER || /^chatter$/i.test(String(value || "").trim());
  const mode = !value ? "" : isChatter ? "chatter" : "altro";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select id={id} disabled={disabled} style={field} value={mode}
        onChange={(e) => onChange(e.target.value === "chatter" ? JOB_CHATTER : e.target.value === "altro" ? (isChatter || !value ? " " : value) : null)}>
        <option value="">Scegli</option>
        <option value="chatter">{JOB_CHATTER}</option>
        <option value="altro">Altro</option>
      </select>
      {mode === "altro" && (
        <input disabled={disabled} style={field} placeholder="Scrivi che cosa fai" value={String(value || "").trim()} onChange={(e) => onChange(e.target.value || " ")} aria-label="Mansione" />
      )}
    </div>
  );
}

// Lingue: livelli leggibili → etichette ClickUp esistenti.
const LANGS = [
  { name: "Italiano", levels: [["Madrelingua", "ITA - Native"]] },
  { name: "Inglese", levels: [["Base", "ENG - A1"], ["Elementare", "ENG - A2"], ["Intermedio", "ENG - B1"], ["Buono", "ENG - B2"], ["Avanzato", "ENG - C1"], ["Ottimo", "ENG - C2"], ["Madrelingua", "ENG - Native"]], hint: "Base A1 · Elementare A2 · Intermedio B1 · Buono B2 · Avanzato C1 · Ottimo C2" },
  { name: "Spagnolo", levels: [["Base", "SPA - Basic"], ["Lavorativo", "SPA - Professional"], ["Madrelingua", "SPA - Native"]] },
  { name: "Tedesco", levels: [["Base", "TED - Basic"], ["Lavorativo", "TED - Professional"], ["Madrelingua", "TED - Native"]] },
  { name: "Francese", levels: [["Base", "FR - Basic"], ["Lavorativo", "FR - Professional"], ["Madrelingua", "FR - Native"]] },
];
const seg = (on) => ({ padding: "6px 11px", borderRadius: 999, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer", border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accentSoft : CP.surface, color: on ? CP.accentSoftText : CP.textSecondary });

export function LanguagesInput({ id, value, onChange, disabled }) {
  const cur = Array.isArray(value) ? value : [];
  const set = (lang, label) => {
    const mine = lang.levels.map((l) => l[1]);
    const others = cur.filter((x) => !mine.includes(x));
    onChange(label ? [...others, label] : others);
  };
  return (
    <div id={id} role="group" style={{ display: "grid", gap: 10 }}>
      {LANGS.map((lang) => {
        const sel = lang.levels.find((l) => cur.includes(l[1]))?.[1] || null;
        return (
          <div key={lang.name} style={{ display: "grid", gap: 6, padding: "10px 12px", border: `1px solid ${CP.borderSoft || CP.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{lang.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" disabled={disabled} aria-pressed={!sel} onClick={() => set(lang, null)} style={seg(!sel)}>{lang.name === "Italiano" ? "Non madrelingua" : "No"}</button>
              {lang.levels.map(([lab, val]) => (
                <button key={val} type="button" disabled={disabled} aria-pressed={sel === val} onClick={() => set(lang, val)} style={seg(sel === val)}>{lab}</button>
              ))}
            </div>
            {lang.hint && sel && sel !== "ENG - Native" && <div style={{ fontSize: 12, color: CP.textMuted }}>{lang.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Comuni (elenco ISTAT, caricato una volta sola) ────────────────────────────
let COMUNI = null, COMUNI_P = null;
function useComuni() {
  const [list, setList] = useState(COMUNI);
  useEffect(() => {
    if (COMUNI) return;
    COMUNI_P = COMUNI_P || fetch("/data/comuni-istat.json").then((r) => r.json()).then((j) => (COMUNI = j));
    COMUNI_P.then(setList).catch(() => {});
  }, []);
  return list;
}

export function ComuneInput({ id, value, onChange, disabled, placeholder = "Scrivi il comune" }) {
  const list = useComuni();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = open ? searchComuni(list, q) : [];
  if (value?.name && !open) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div id={id} style={{ ...field, display: "flex", justifyContent: "space-between" }}>
          <span>{value.name}{value.prov ? ` (${value.prov})` : ""}</span>
          <span style={{ color: CP.textMuted, fontSize: 13 }}>{value.region || ""}</span>
        </div>
        {!disabled && <button type="button" onClick={() => { setQ(""); setOpen(true); }} style={{ ...seg(false), whiteSpace: "nowrap" }}>Cambia</button>}
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <input id={id} disabled={disabled} style={field} autoComplete="off" placeholder={list ? placeholder : "Carico l'elenco dei comuni…"}
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-autocomplete="list" />
      {hits.length > 0 && (
        <div role="listbox" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, top: "100%", marginTop: 4, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
          {hits.map((c) => (
            <button key={c.code} type="button" role="option" onClick={() => { onChange(c); setOpen(false); setQ(""); }}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "9px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${CP.border}`, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, cursor: "pointer", textAlign: "left" }}>
              <span>{c.name} ({c.prov})</span><span style={{ color: CP.textMuted, fontSize: 12 }}>{c.region}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && list && hits.length === 0 && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>Nessun comune trovato con questo nome.</div>}
    </div>
  );
}

export function BirthInput({ id, value, onChange, disabled }) {
  const abroad = Boolean(value?.abroad);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={disabled} aria-pressed={!abroad} onClick={() => onChange(abroad ? null : value)} style={seg(!abroad)}>In Italia</button>
        <button type="button" disabled={disabled} aria-pressed={abroad} onClick={() => onChange(abroad ? value : { abroad: true, country: "" })} style={seg(abroad)}>All'estero</button>
      </div>
      {abroad ? (
        <select id={id} disabled={disabled} style={field} value={value?.country || ""} onChange={(e) => onChange({ abroad: true, country: e.target.value })}>
          <option value="">Scegli il paese</option>
          {ALL.filter((p) => p !== "Italia").map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      ) : (
        <ComuneInput id={id} disabled={disabled} placeholder="Comune di nascita" value={value && !value.abroad ? value : null}
          onChange={(c) => onChange({ abroad: false, name: c.name, prov: c.prov, code: c.code })} />
      )}
    </div>
  );
}

// ── Competenze con livello ───────────────────────────────────────────────────
export function SkillsInput({ id, value, onChange, disabled }) {
  const cur = value && typeof value === "object" ? value : {};
  const [openArea, setOpenArea] = useState(null);
  const setLevel = (k, lvl) => { const n = { ...cur }; if (lvl) n[k] = lvl; else delete n[k]; onChange(n); };
  return (
    <div id={id} style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12.5, color: CP.textMuted, lineHeight: 1.45 }}>Apri le aree che ti riguardano e indica il tuo livello solo dove ce l&apos;hai. «Posso insegnarla» vuol dire che potresti formare un collega.</div>
      {SKILL_AREAS.map((a) => {
        const n = a.skills.filter(([k]) => cur[k]).length;
        const isOpen = openArea === a.area;
        return (
          <div key={a.area} style={{ border: `1px solid ${CP.border}`, borderRadius: 10 }}>
            <button type="button" onClick={() => setOpenArea(isOpen ? null : a.area)} aria-expanded={isOpen}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 12px", background: "transparent", border: "none", color: CP.textPrimary, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" }}>
              <span>{a.area}</span><span style={{ color: n ? CP.accentSoftText : CP.textMuted, fontWeight: 400, fontSize: 13 }}>{n ? `${n} indicate` : "apri"}</span>
            </button>
            {isOpen && (
              <div style={{ display: "grid", gap: 10, padding: "0 12px 12px" }}>
                {a.skills.map(([k, name]) => (
                  <div key={k}>
                    <div style={{ fontSize: 13.5, color: CP.textPrimary, marginBottom: 4 }}>{name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button type="button" disabled={disabled} aria-pressed={!cur[k]} onClick={() => setLevel(k, null)} style={seg(!cur[k])}>No</button>
                      {SKILL_LEVELS.map((l) => <button key={l} type="button" disabled={disabled} aria-pressed={cur[k] === l} onClick={() => setLevel(k, l)} style={seg(cur[k] === l)}>{l}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LearnInput({ id, value, onChange, disabled }) {
  const cur = Array.isArray(value) ? value : [];
  const opts = SKILL_AREAS.flatMap((a) => a.skills.map(([k, name]) => ({ k, name, area: a.area })));
  const setAt = (i, k) => { const n = [...cur]; if (k) n[i] = k; else n.splice(i, 1); onChange([...new Set(n.filter(Boolean))]); };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {[0, 1].map((i) => (
        <select key={i} id={i === 0 ? id : undefined} disabled={disabled || (i === 1 && !cur[0])} style={field} value={cur[i] || ""} onChange={(e) => setAt(i, e.target.value)}>
          <option value="">{i === 0 ? "Scegli una competenza" : "Una seconda (facoltativa)"}</option>
          {SKILL_AREAS.map((a) => <optgroup key={a.area} label={a.area}>{a.skills.map(([k, name]) => <option key={k} value={k}>{name}</option>)}</optgroup>)}
        </select>
      ))}
    </div>
  );
}
export { SKILL_NAME };
