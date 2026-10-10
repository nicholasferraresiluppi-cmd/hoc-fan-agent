"use client";
/**
 * Selettore di periodo: un bottone che dice il periodo in parole ("22 ago – 4 set · 14 giorni")
 * e apre un calendario a due mesi con i periodi pronti a lato. Primo clic = inizio, secondo = fine
 * (in qualsiasi ordine), anteprima al passaggio del mouse, "Applica" conferma.
 * Su schermo stretto diventa un foglio dal basso con un mese solo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import {
  parseDay, addDays, lengthOf, previousOf, clampRange, presetsFor, matchPreset,
  monthGrid, shiftMonth, monthTitle, formatRange, daysLabel,
} from "@/lib/period-range";

const WEEK = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const monthOf = (s) => ({ year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)) - 1 });

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/**
 * value: {from, to} | null · onChange(range) · max: ultimo giorno scegliibile (es. ieri)
 * maxDays: durata massima · compare: mostra il periodo di confronto · loading: periodo in caricamento
 */
export default function PeriodPicker({ value, onChange, max, maxDays = 400, compare = true, loading = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // {from, to|null}
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => monthOf(addDays(max, -31)));
  const narrow = useNarrow();
  const box = useRef(null);
  const min = addDays(max, -maxDays);
  const presets = useMemo(() => presetsFor(max), [max]);
  const active = matchPreset(value, presets);

  const show = () => {
    const v = value || presets[0];
    setDraft({ ...v });
    // il mese di destra è quello della fine; su mobile si vede solo quello
    setView(narrow ? monthOf(v.to) : shiftMonth(monthOf(v.to), -1));
    setHover(null);
    setOpen(true);
  };
  const close = () => { setOpen(false); setHover(null); };
  const apply = (r) => { const c = clampRange(r, { min, max }); onChange(c); close(); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  const pick = (d) => {
    if (!draft || draft.to) { setDraft({ from: d, to: null }); return; }
    let r = parseDay(d) < parseDay(draft.from) ? { from: d, to: draft.from } : { from: draft.from, to: d };
    if (lengthOf(r) > maxDays + 1) r = { from: addDays(r.to, -maxDays), to: r.to };
    setDraft(r);
    setHover(null);
  };

  // periodo da evidenziare: quello scelto, o in anteprima mentre si cerca la fine
  const shown = draft ? (draft.to ? draft : hover ? clampRange({ from: draft.from, to: hover }) : { from: draft.from, to: draft.from }) : null;
  const complete = Boolean(draft?.to);
  const prevView = compare && shown ? previousOf(shown) : null;
  const months = narrow ? [view] : [view, shiftMonth(view, 1)];
  const canBack = parseDay(`${monthTitleKey(view)}-01`) > parseDay(min);
  const canFwd = parseDay(`${monthTitleKey(shiftMonth(view, months.length))}-01`) <= parseDay(max);

  const label = value ? formatRange(value) : "Scegli il periodo";
  const sub = value ? (active ? presets.find((p) => p.id === active).label : daysLabel(lengthOf(value))) : "";
  const cmp = value && compare ? `contro ${formatRange(previousOf(value))}` : null;

  return (
    <div ref={box} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button onClick={() => (open ? close() : show())} aria-haspopup="dialog" aria-expanded={open}
        style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontFamily: FONTS.body,
          border: `1px solid ${open ? CP.accent : CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14 }}>
        <CalendarDays size={16} color={CP.accentSoftText} />
        <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{label}</span>
        {sub && <span style={{ fontSize: 12, color: CP.textMuted }}>{sub}</span>}
        {loading && <span aria-label="Caricamento" style={{ width: 6, height: 6, borderRadius: 999, background: CP.accent, animation: "pp-pulse 1s ease-in-out infinite" }} />}
      </button>
      {cmp && <span style={{ fontSize: 13, color: CP.textMuted }}>{cmp}</span>}

      {open && (
        <>
          {narrow && <div onClick={close} style={{ position: "fixed", inset: 0, background: CP.scrim, zIndex: 60 }} />}
          <div role="dialog" aria-label="Scegli il periodo"
            style={narrow
              ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61, background: CP.surface, borderTop: `1px solid ${CP.border}`, borderRadius: "16px 16px 0 0", padding: "16px 16px 20px", maxHeight: "88vh", overflowY: "auto", display: "grid", gap: 14 }
              : { position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 60, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,.35)", display: "grid", gridTemplateColumns: "170px auto", overflow: "hidden" }}>

            <div style={narrow
              ? { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }
              : { display: "grid", alignContent: "start", gap: 2, padding: 10, borderRight: `1px solid ${CP.borderSoft}`, background: CP.bgSunken }}>
              {presets.map((p) => {
                const on = draft?.to && p.from === draft.from && p.to === draft.to;
                return (
                  <button key={p.id} onClick={() => apply(p)}
                    style={{ textAlign: "left", whiteSpace: "nowrap", padding: narrow ? "7px 12px" : "8px 10px", borderRadius: narrow ? 999 : 8, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13,
                      border: narrow ? `1px solid ${on ? CP.accent : CP.border}` : "none", background: on ? CP.accentSoft : narrow ? CP.surface : "transparent", color: on ? CP.accentSoftText : CP.textSecondary }}>
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: narrow ? 0 : "14px 16px 14px", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: narrow ? 0 : 28 }}>
                {months.map((m, i) => (
                  <Month key={`${m.year}-${m.month}`} m={m} shown={shown} prev={prevView} min={min} max={max} narrow={narrow}
                    onPick={pick} onHover={(d) => draft && !draft.to && setHover(d)}
                    nav={<>
                      {i === 0 ? <NavBtn dir="back" disabled={!canBack} onClick={() => setView(shiftMonth(view, -1))} /> : <span style={{ width: 30 }} />}
                      <span style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 500, color: CP.textPrimary, textTransform: "capitalize" }}>{monthTitle(m)}</span>
                      {i === months.length - 1 ? <NavBtn dir="fwd" disabled={!canFwd} onClick={() => setView(shiftMonth(view, 1))} /> : <span style={{ width: 30 }} />}
                    </>} />
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 12 }}>
                <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 14, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                    {shown ? <>{formatRange(shown)} <span style={{ color: CP.textMuted }}>· {daysLabel(lengthOf(shown))}</span></> : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: CP.textMuted }}>
                    {!complete ? "Ora scegli il giorno di fine" : prevView ? <>Confronto con <span style={{ color: CP.textSecondary }}>{formatRange(prevView)}</span>, stessa durata</> : "Clicca un giorno per ricominciare"}
                  </span>
                </div>
                <button onClick={close} style={ghostBtn}>Annulla</button>
                <button onClick={() => complete && apply(draft)} disabled={!complete}
                  style={{ ...ghostBtn, border: "none", background: complete ? CP.accent : CP.surfaceAlt, color: complete ? CP.accentInk : CP.textMuted, cursor: complete ? "pointer" : "default", fontWeight: 500 }}>
                  Applica
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <style>{`@keyframes pp-pulse{0%,100%{opacity:.25}50%{opacity:1}}
        .pp-day:not(:disabled):hover .pp-dot{border-color:${CP.accent}}
        .pp-day:focus-visible{outline:2px solid ${CP.accent};outline-offset:-2px;border-radius:8px}`}</style>
    </div>
  );
}

function monthTitleKey({ year, month }) { return `${year}-${String(month + 1).padStart(2, "0")}`; }

function NavBtn({ dir, disabled, onClick }) {
  const Icon = dir === "back" ? ChevronLeft : ChevronRight;
  return (
    <button onClick={onClick} disabled={disabled} aria-label={dir === "back" ? "Mese prima" : "Mese dopo"}
      style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: `1px solid ${CP.border}`, background: "transparent", color: disabled ? CP.mutedIcons : CP.textSecondary, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      <Icon size={16} />
    </button>
  );
}

function Month({ m, shown, prev, min, max, narrow, onPick, onHover, nav }) {
  const weeks = monthGrid(m.year, m.month);
  const flat = weeks.flat();
  const inside = (d, r) => r && parseDay(d) >= parseDay(r.from) && parseDay(d) <= parseDay(r.to);
  return (
    <div style={{ display: "grid", gap: 6, width: narrow ? "100%" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>{nav}</div>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(7, 1fr)" : "repeat(7, 38px)" }}>
        {WEEK.map((w) => <span key={w} style={{ textAlign: "center", fontSize: 11, color: CP.textMuted, padding: "2px 0 6px" }}>{w}</span>)}
        {flat.map((d, i) => {
          if (!d) return <span key={i} />;
          const off = parseDay(d) > parseDay(max) || parseDay(d) < parseDay(min);
          const inRange = inside(d, shown);
          const edgeFrom = shown && d === shown.from;
          const edgeTo = shown && d === shown.to;
          const edge = edgeFrom || edgeTo;
          const inPrev = !inRange && inside(d, prev);
          const col = i % 7;
          const rowStart = col === 0 || !flat[i - 1];
          const rowEnd = col === 6 || !flat[i + 1];
          // la fascia del periodo: mezza sugli estremi, arrotondata dove la riga inizia o finisce
          const band = inRange && !(edgeFrom && edgeTo) && {
            left: edgeFrom ? "50%" : rowStart ? 3 : 0, right: edgeTo ? "50%" : rowEnd ? 3 : 0,
            borderTopLeftRadius: rowStart && !edgeFrom ? 8 : 0, borderBottomLeftRadius: rowStart && !edgeFrom ? 8 : 0,
            borderTopRightRadius: rowEnd && !edgeTo ? 8 : 0, borderBottomRightRadius: rowEnd && !edgeTo ? 8 : 0,
          };
          return (
            <button key={d} className="pp-day" disabled={off} onClick={() => onPick(d)} onMouseEnter={() => onHover(d)}
              aria-label={d} aria-pressed={edge}
              style={{ position: "relative", height: narrow ? 42 : 38, padding: 0, border: "none", background: "transparent", cursor: off ? "default" : "pointer", fontFamily: FONTS.body }}>
              {band && <span style={{ position: "absolute", top: 3, bottom: 3, background: CP.accentSoft, ...band }} />}
              <span className="pp-dot" style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 999, fontSize: 13, fontVariantNumeric: "tabular-nums",
                border: `1px solid ${edge ? CP.accent : inPrev ? alpha(CP.textMuted, "55") : "transparent"}`,
                borderStyle: inPrev ? "dashed" : "solid",
                background: edge ? CP.accent : "transparent",
                color: off ? CP.mutedIcons : edge ? CP.accentInk : inRange ? CP.accentSoftText : CP.textPrimary,
                fontWeight: edge ? 600 : 400, opacity: off ? 0.45 : 1 }}>
                {Number(d.slice(8))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ghostBtn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: "transparent", color: CP.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };

