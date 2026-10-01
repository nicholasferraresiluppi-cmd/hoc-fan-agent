"use client";
/**
 * Controlli su misura del Centro HR (01/10/2026, richiesta di Nicholas dopo la prova del modulo):
 * nazionalità da tendina, mansione «Chatter / Altro», lingue con livello per lingua.
 * Restituiscono gli STESSI valori che ClickUp si aspetta (etichette «ENG - B2», «ITA - Native"…),
 * così la sincronizzazione non cambia.
 */
import { CP, FONTS } from "@/lib/brand";

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
