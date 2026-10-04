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
import { langNo } from "@/lib/hr-fields";
import { TOP_COUNTRIES, COUNTRIES } from "@/lib/hr-countries";
import { SKILL_AREAS, SKILL_LEVELS, SKILL_LEVEL_HINT, SKILL_NAME, AREA_BY_KEY, PAST_ROLES, PAST_ROLE_NAME, ROLE_DURATIONS, normalizeSkillMap, normalizeLearnList, normalizePastRoles, areasOfSkillMap, skillName, pastRoleText } from "@/lib/hr-skills";


const field = { width: "100%", boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };

// Paesi in italiano: i più frequenti in cima, poi tutti in ordine alfabetico (elenco in lib/hr-countries.js).
const TOP = TOP_COUNTRIES;
const ALL = COUNTRIES;

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

// Lingue (04/10/2026, decisione del titolare): quattro livelli UGUALI per tutte le lingue —
// Base, Intermedio, Avanzato, Madrelingua — su etichette ClickUp "XXX - Basic/Intermediate/
// Advanced/Native" (aggiunte al campo "Spoken Languages" lo stesso giorno). Le etichette
// vecchie (ENG A1…C2, "Professional") restano valide nelle schede: si mostrano sul livello
// equivalente e si sostituiscono appena qualcuno sceglie un livello nuovo.
const LEVELS = [["Base", "Basic"], ["Intermedio", "Intermediate"], ["Avanzato", "Advanced"], ["Madrelingua", "Native"]];
const LANGS = [["Italiano", "ITA"], ["Inglese", "ENG"], ["Spagnolo", "SPA"], ["Tedesco", "TED"], ["Francese", "FR"]]
  .map(([name, code]) => ({ name, code, levels: LEVELS.map(([lab, lvl]) => [lab, `${code} - ${lvl}`]) }));
const LEGACY_LEVEL = { A1: "Basic", A2: "Basic", B1: "Intermediate", B2: "Intermediate", C1: "Advanced", C2: "Advanced", Professional: "Intermediate" };
const LEVEL_HINT = "Base: capisci e scrivi frasi semplici · Intermedio: ti fai capire senza problemi · Avanzato: scrivi in modo fluido e naturale, come al lavoro · Madrelingua: è la tua lingua.";

/** Livello attuale di una lingua (anche da etichetta vecchia) → etichetta nuova, o null. */
function currentLevel(cur, code) {
  for (const x of cur) {
    const [c, lvl] = String(x || "").split(" - ").map((t) => t.trim());
    if (c !== code || !lvl || lvl === "No") continue;
    const norm = LEGACY_LEVEL[lvl] || lvl;
    return `${code} - ${norm}`;
  }
  return null;
}

// explicit (modulo pubblico, 04/10/2026): nessuna risposta già scelta; "No" si salva come
// "ENG - No" (il server lo toglie) così si sa che la persona ha risposto per ogni lingua.
export function LanguagesInput({ id, value, onChange, disabled, explicit = false }) {
  const cur = Array.isArray(value) ? value : [];
  const set = (lang, label) => {
    const others = cur.filter((x) => !String(x || "").trim().startsWith(`${lang.code} - `));
    onChange(label ? [...others, label] : explicit ? [...others, langNo(lang.code)] : others);
  };
  return (
    <div id={id} role="group" style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.45 }}>{LEVEL_HINT}</div>
      {LANGS.map((lang) => {
        const sel = currentLevel(cur, lang.code);
        const saidNo = !sel && (!explicit || cur.includes(langNo(lang.code)));
        return (
          <div key={lang.name} style={{ display: "grid", gap: 6, padding: "10px 12px", border: `1px solid ${CP.borderSoft || CP.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{lang.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" disabled={disabled} aria-pressed={saidNo} onClick={() => set(lang, null)} style={seg(saidNo)}>No</button>
              {lang.levels.map(([lab, val]) => (
                <button key={val} type="button" disabled={disabled} aria-pressed={sel === val} onClick={() => set(lang, val)} style={seg(sel === val)}>{lab}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Referente (04/10/2026): persone della lista ClickUp, si aggiungono e si tolgono ──
export function UsersInput({ id, value, onChange, options = [], disabled }) {
  const cur = Array.isArray(value) ? value : [];
  const ids = new Set(cur.map((u) => String(u.id)));
  const free = (Array.isArray(options) ? options : []).filter((m) => !ids.has(String(m.id)));
  const chipS = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 13, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {cur.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cur.map((u) => (
            <span key={u.id} style={chipS}>
              {u.name || u.email}
              <button type="button" disabled={disabled} aria-label={`Togli ${u.name || u.email}`} onClick={() => onChange(cur.filter((x) => String(x.id) !== String(u.id)))}
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: CP.textMuted, fontSize: 15, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <select id={id} disabled={disabled || !free.length} value="" onChange={(e) => { const m = free.find((x) => String(x.id) === e.target.value); if (m) onChange([...cur, m]); }}
        style={{ boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body }}>
        <option value="">{free.length ? "Aggiungi un referente…" : "Nessun'altra persona disponibile su ClickUp"}</option>
        {free.map((m) => <option key={m.id} value={m.id}>{m.name}{m.email ? ` · ${m.email}` : ""}</option>)}
      </select>
    </div>
  );
}

// ── Telefono con prefisso (04/10/2026) ────────────────────────────────────────
// Prefisso da tendina (Italia di base) + numero: si salva "+39 333…" → ClickUp lo accetta.
export const PHONE_PREFIXES = [
  ["Italia", "+39"], ["Svizzera", "+41"], ["San Marino", "+378"], ["Spagna", "+34"], ["Francia", "+33"], ["Germania", "+49"],
  ["Austria", "+43"], ["Regno Unito", "+44"], ["Romania", "+40"], ["Albania", "+355"], ["Portogallo", "+351"], ["Belgio", "+32"],
  ["Paesi Bassi", "+31"], ["Polonia", "+48"], ["Grecia", "+30"], ["Croazia", "+385"], ["Ucraina", "+380"], ["Moldavia", "+373"],
  ["Brasile", "+55"], ["Argentina", "+54"], ["Stati Uniti / Canada", "+1"],
];
/** "+41 79 123…" → { prefix: "+41", rest: "79 123…" }; senza + → Italia. */
export function splitPhone(v) {
  const raw = String(v || "").trim();
  if (!raw.startsWith("+")) return { prefix: "+39", rest: raw };
  // scritto dalla tendina: "+41 79 123…" (lo spazio separa il prefisso, si tengono gli spazi del numero)
  const typed = PHONE_PREFIXES.find(([, p]) => raw.startsWith(`${p} `));
  if (typed) return { prefix: typed[1], rest: raw.slice(typed[1].length + 1) };
  const digits = raw.replace(/[^\d+]/g, "");
  const hit = [...PHONE_PREFIXES].sort((a, b) => b[1].length - a[1].length).find(([, p]) => digits.startsWith(p));
  if (hit) return { prefix: hit[1], rest: digits.slice(hit[1].length) };
  return { prefix: "altro", rest: raw };
}
export function PhoneInput({ id, value, onChange, disabled, extra }) {
  const { prefix, rest } = splitPhone(value);
  const [pre, setPre] = useState(prefix);
  useEffect(() => { if (value) setPre(splitPhone(value).prefix); }, [value]);
  const emit = (p, r) => {
    const num = String(r || "").trim();
    if (!num) return onChange("");
    onChange(p === "altro" ? (num.startsWith("+") ? num : `+${num}`) : `${p} ${num}`);
  };
  const box = { boxSizing: "border-box", padding: "8px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none" };
  return (
    <div style={{ display: "flex", gap: 8, minWidth: 0, maxWidth: "100%" }}>
      <select aria-label="Prefisso" disabled={disabled} value={pre} onChange={(e) => { setPre(e.target.value); emit(e.target.value, rest); }} style={{ ...box, flex: "0 0 128px", width: 128, minWidth: 0 }}>
        {PHONE_PREFIXES.map(([n, p]) => <option key={p + n} value={p}>{p} {n}</option>)}
        <option value="altro">Altro (scrivi +…)</option>
      </select>
      <input id={id} type="tel" disabled={disabled} {...(extra || {})} value={rest} placeholder={pre === "altro" ? "+…" : "333 123 4567"} onChange={(e) => emit(pre, e.target.value)} style={{ ...box, flex: 1, minWidth: 0 }} />
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

// ── Competenze con livello (v2, 03/10) ──────────────────────────────────────
// Prima le aree («In quali aree hai esperienza?»), poi si aprono SOLO quelle scelte.
const box = { border: `1px solid ${CP.border}`, borderRadius: 10, padding: "10px 12px" };
const hint = { fontSize: 12.5, color: CP.textMuted, lineHeight: 1.45 };

export function LevelLegend() {
  return (
    <div style={{ ...hint, display: "grid", gap: 2 }}>
      {SKILL_LEVELS.map((l) => <div key={l}><span style={{ color: CP.textSecondary }}>{l}</span> = {SKILL_LEVEL_HINT[l]}</div>)}
    </div>
  );
}

export function SkillsInput({ id, value, onChange, disabled }) {
  const cur = normalizeSkillMap(value);
  const [areas, setAreas] = useState(() => areasOfSkillMap(value));
  const setLevel = (k, lvl) => { const n = { ...cur }; if (lvl) n[k] = lvl; else delete n[k]; onChange(n); };
  const toggleArea = (key) => {
    if (areas.includes(key)) {
      setAreas(areas.filter((a) => a !== key));
      // chiudere un'area toglie anche i livelli indicati lì dentro
      const inArea = AREA_BY_KEY[key].skills.map((x) => x.key);
      if (inArea.some((k) => cur[k])) onChange(Object.fromEntries(Object.entries(cur).filter(([k]) => !inArea.includes(k))));
    } else setAreas([...areas, key]);
  };
  const shown = SKILL_AREAS.filter((a) => areas.includes(a.key));
  return (
    <div id={id} style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 14, color: CP.textPrimary }}>In quali aree hai esperienza?</div>
      <div role="group" aria-label="Aree di esperienza" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SKILL_AREAS.map((a) => {
          const on = areas.includes(a.key);
          return <button key={a.key} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggleArea(a.key)} style={seg(on)}>{a.area}</button>;
        })}
      </div>
      {shown.length === 0 && <div style={hint}>Scegli una o più aree: si apriranno le voci per indicare il tuo livello.</div>}
      {shown.length > 0 && (
        <>
          <div style={{ ...hint, paddingTop: 2 }}>Indica il livello solo dove ce l&apos;hai. I livelli vogliono dire:</div>
          <LevelLegend />
        </>
      )}
      {shown.map((a) => {
        const n = a.skills.filter((x) => cur[x.key]).length;
        return (
          <div key={a.key} style={box}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{a.area}</span>
              <span style={{ fontSize: 13, color: n ? CP.accentSoftText : CP.textMuted }}>{n ? `${n} indicate` : "nessuna indicata"}</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {a.skills.map((x) => (
                <div key={x.key}>
                  <div style={{ fontSize: 13.5, color: CP.textPrimary, marginBottom: 4 }}>{x.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button type="button" disabled={disabled} aria-pressed={!cur[x.key]} onClick={() => setLevel(x.key, null)} style={seg(!cur[x.key])}>No</button>
                    {SKILL_LEVELS.map((l) => <button key={l} type="button" disabled={disabled} title={SKILL_LEVEL_HINT[l]} aria-pressed={cur[x.key] === l} onClick={() => setLevel(x.key, l)} style={seg(cur[x.key] === l)}>{l}</button>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LearnInput({ id, value, onChange, disabled }) {
  const cur = normalizeLearnList(value);
  const setAt = (i, k) => { const n = [...cur]; if (k) n[i] = k; else n.splice(i, 1); onChange([...new Set(n.filter(Boolean))]); };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {[0, 1].map((i) => (
        <select key={i} id={i === 0 ? id : undefined} disabled={disabled || (i === 1 && !cur[0])} style={field} value={cur[i] || ""} onChange={(e) => setAt(i, e.target.value)}>
          <option value="">{i === 0 ? "Scegli una competenza" : "Una seconda (facoltativa)"}</option>
          {SKILL_AREAS.map((a) => <optgroup key={a.key} label={a.area}>{a.skills.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</optgroup>)}
        </select>
      ))}
    </div>
  );
}

// ── Ruoli già ricoperti, con durata ──────────────────────────────────────────
export function PastRolesInput({ id, value, onChange, disabled }) {
  const cur = normalizePastRoles(value);
  const byRole = Object.fromEntries(cur.map((r) => [r.role, r]));
  const toggle = (role) => onChange(byRole[role] ? cur.filter((r) => r.role !== role) : [...cur, role === "other" ? { role, duration: null, other: "" } : { role, duration: null }]);
  const patch = (role, p) => onChange(cur.map((r) => (r.role === role ? { ...r, ...p } : r)));
  return (
    <div id={id} style={{ display: "grid", gap: 10 }}>
      <div role="group" aria-label="Ruoli" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PAST_ROLES.map(([k, name]) => <button key={k} type="button" disabled={disabled} aria-pressed={Boolean(byRole[k])} onClick={() => toggle(k)} style={seg(Boolean(byRole[k]))}>{name}</button>)}
      </div>
      {cur.length > 0 && <div style={hint}>Per ognuno, quanto è durato in tutto?</div>}
      {cur.map((r) => (
        <div key={r.role} style={{ ...box, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13.5, color: CP.textPrimary }}>{PAST_ROLE_NAME[r.role]}</div>
          {r.role === "other" && (
            <input disabled={disabled} style={field} maxLength={80} placeholder="Che ruolo era?" value={r.other || ""} onChange={(e) => patch("other", { other: e.target.value })} aria-label="Altro ruolo" />
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ROLE_DURATIONS.map(([k, name]) => <button key={k} type="button" disabled={disabled} aria-pressed={r.duration === k} onClick={() => patch(r.role, { duration: k })} style={seg(r.duration === k)}>{name}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}
export { SKILL_NAME, skillName, pastRoleText };

export function ResidenceInput({ id, value, onChange, disabled }) {
  const abroad = Boolean(value?.abroad);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={disabled} aria-pressed={!abroad} onClick={() => onChange(abroad ? null : value)} style={seg(!abroad)}>In Italia</button>
        <button type="button" disabled={disabled} aria-pressed={abroad} onClick={() => onChange(abroad ? value : { abroad: true, country: "", city: "" })} style={seg(abroad)}>All'estero</button>
      </div>
      {abroad ? (
        <>
          <select id={id} disabled={disabled} style={field} value={value?.country || ""} onChange={(e) => onChange({ ...value, abroad: true, country: e.target.value })}>
            <option value="">Scegli il paese</option>
            {ALL.filter((p) => p !== "Italia").map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input disabled={disabled} style={field} placeholder="Città" value={value?.city || ""} onChange={(e) => onChange({ ...value, abroad: true, city: e.target.value })} aria-label="Città" />
        </>
      ) : (
        <ComuneInput id={id} disabled={disabled} value={value && !value.abroad ? value : null} onChange={onChange} />
      )}
    </div>
  );
}
