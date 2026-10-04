"use client";

/**
 * La pianta della Sede (04/10/2026) — tutti gli uffici sullo stesso piano, da sinistra a destra
 * come scorre il lavoro: i dati entrano → si lavora → si controlla → si decide.
 *
 * Nata da Nicholas davanti all'edificio 3D: «non riesco a capire chi lavora per chi; forse era più
 * semplice vederli tutti sullo stesso piano; quanti agenti ci sono in una stanza; un agente che fa
 * avanti e indietro, come se ti consegnassi un fascicolo all'altro ufficio».
 *
 * - Ogni stanza dice chi ci lavora (persone, agenti AI, programmi, robot).
 * - I fattorini: un fascicolo dorato viaggia lungo ogni collegamento il cui ufficio di partenza ha
 *   LAVORATO davvero (prova nel database). Un ufficio fermo non consegna niente: il filo resta
 *   tratteggiato e vuoto. Non è decorazione: il movimento è lo stato.
 * - Tocca un ufficio: restano accesi solo i suoi fili; a destra da chi riceve e a chi consegna.
 * - prefers-reduced-motion: niente fattorini, i fili restano.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CP, FONTS, alpha } from "@/lib/brand";

const SERIF = 'var(--f-display), "Instrument Serif", Georgia, serif';

// colonne = tappe del lavoro; dentro, le stanze (una per area)
const COLS = [
  { id: "entra", label: "I dati entrano", x: 16, w: 258, rooms: ["dati"] },
  { id: "lavora", label: "Si lavora", x: 384, w: 318, rooms: ["vendite", "formazione", "persone"] },
  { id: "controlla", label: "Si controlla", x: 812, w: 258, rooms: ["controllo"] },
  { id: "decide", label: "Si decide", x: 1180, w: 214, rooms: ["direzione"] },
];
const VB_W = 1410;
const TOP = 62, HEAD = 62, DESK_H = 52, GAP = 8, PAD = 12, ROOM_GAP = 24;

const TIPO = {
  persona: { one: "persona", many: "persone" },
  AI: { one: "agente AI", many: "agenti AI" },
  codice: { one: "programma", many: "programmi" },
  robot: { one: "robot", many: "robot" },
};
const FERMO = ["in_ritardo", "mai", "errore"];
const working = (o) => o.stato === "lavora" || o.stato === "persona";

function statoTesto(o) {
  if (o.stato === "persona") return "persona";
  if (o.stato === "lavora") return `ha lavorato ${ago(o.at)}`;
  if (FERMO.includes(o.stato)) return o.at ? `fermo · ${ago(o.at)}` : "nessuna traccia";
  if (o.stato === "attesa") return "prima prova stanotte";
  return "lavora a richiesta, senza prova";
}
function statoColore(o) {
  if (o.stato === "lavora") return CP.accentGreen;
  if (FERMO.includes(o.stato)) return CP.accentRed;
  if (o.stato === "persona") return CP.accent;
  return CP.textMuted;
}
const ago = (t) => {
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "ora";
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h fa` : `${Math.round(h / 24)} giorni fa`;
};

function Glyph({ tipo, x, y, color }) {
  const s = { fill: "none", stroke: color, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  const t = `translate(${x} ${y})`;
  if (tipo === "persona") return <g transform={t} style={s}><circle cx="8" cy="5" r="3" /><path d="M2 15c0-3.3 2.7-5 6-5s6 1.7 6 5" /></g>;
  if (tipo === "AI") return <g transform={t} style={s}><path d="M8 1.5l1.5 4.2 4.3 1.6-4.3 1.6L8 13.1 6.5 8.9 2.2 7.3l4.3-1.6z" /></g>;
  if (tipo === "robot") return <g transform={t} style={s}><rect x="2.5" y="5" width="11" height="9" rx="2" /><path d="M8 2v3M6 9.5h.01M10 9.5h.01" /></g>;
  return <g transform={t} style={s}><path d="M5 4L1.5 8 5 12M11 4l3.5 4L11 12M9.3 2.5l-2.6 11" /></g>;
}

function occupancy(list) {
  const n = {};
  for (const o of list) n[o.tipo] = (n[o.tipo] || 0) + 1;
  return ["persona", "AI", "codice", "robot"].filter((k) => n[k]).map((k) => `${n[k]} ${n[k] === 1 ? TIPO[k].one : TIPO[k].many}`).join(" · ");
}

function layout(data) {
  const floors = Object.fromEntries((data.floors || []).map((f) => [f.id, f]));
  const rooms = [], desks = {};
  let maxH = 0;
  const colH = COLS.map((c) => c.rooms.reduce((h, r) => {
    const n = data.offices.filter((o) => o.piano === r).length;
    return h + (n ? HEAD + n * (DESK_H + GAP) - GAP + PAD * 2 + ROOM_GAP : 0);
  }, -ROOM_GAP));
  maxH = Math.max(...colH);
  COLS.forEach((c, ci) => {
    let y = TOP + (maxH - colH[ci]) / 2;
    c.rooms.forEach((rid) => {
      const list = data.offices.filter((o) => o.piano === rid);
      if (!list.length) return;
      const h = HEAD + list.length * (DESK_H + GAP) - GAP + PAD * 2;
      rooms.push({ id: rid, x: c.x, y, w: c.w, h, nome: floors[rid]?.nome || rid, occ: occupancy(list), list });
      list.forEach((o, i) => { desks[o.id] = { o, x: c.x + PAD, y: y + HEAD + PAD + i * (DESK_H + GAP), w: c.w - PAD * 2, h: DESK_H, col: ci }; });
      y += h + ROOM_GAP;
    });
  });
  return { rooms, desks, H: TOP + maxH + 30 };
}

function edgePath(a, b) {
  const ay = a.y + a.h / 2, by = b.y + b.h / 2;
  if (b.col > a.col) {
    const x1 = a.x + a.w, x2 = b.x, dx = Math.max(60, (x2 - x1) * 0.5);
    return `M ${x1} ${ay} C ${x1 + dx} ${ay}, ${x2 - dx} ${by}, ${x2} ${by}`;
  }
  if (b.col < a.col) {
    const x1 = a.x, x2 = b.x + b.w;
    return `M ${x1} ${ay} C ${x1 - 80} ${ay}, ${x2 + 80} ${by}, ${x2} ${by}`;
  }
  // stessa colonna: esce a destra e rientra a destra (un anello nel corridoio)
  const x = a.x + a.w, bulge = 46 + Math.min(60, Math.abs(by - ay) * 0.12);
  return `M ${x} ${ay} C ${x + bulge} ${ay}, ${x + bulge} ${by}, ${x} ${by}`;
}

const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };

export default function SedePianta({ data }) {
  const L = useMemo(() => layout(data), [data]);
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const pathRefs = useRef({});
  const courierRefs = useRef({});
  const ringRefs = useRef({});

  const edges = useMemo(() => (data.edges || []).filter((e) => L.desks[e.from] && L.desks[e.to]).map((e) => {
    const a = L.desks[e.from], b = L.desks[e.to];
    return { ...e, key: `${e.from}>${e.to}`, d: edgePath(a, b), live: working(a.o), seed: hash(`${e.from}>${e.to}`) };
  }), [data.edges, L]);

  const focus = sel || hover;
  const lit = (e) => !focus || e.from === focus || e.to === focus;
  const near = (id) => !focus || id === focus || edges.some((e) => (e.from === focus && e.to === id) || (e.to === focus && e.from === id));

  // fattorini: un fascicolo per filo vivo, a giro continuo e sfalsato
  useEffect(() => {
    let reduce = false;
    try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    if (reduce) return;
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      for (const e of edges) {
        const g = courierRefs.current[e.key], p = pathRefs.current[e.key], ring = ringRefs.current[e.key];
        if (!g || !p) continue;
        if (!e.live || !lit(e)) { g.style.opacity = 0; if (ring) ring.style.opacity = 0; continue; }
        const period = 6 + (e.seed % 5), travel = 2.8 + (e.seed % 3) * 0.4;
        const ph = (t + (e.seed % 97) / 10) % period;
        if (ph < travel) {
          const k = ph / travel, ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const len = p.getTotalLength(), pt = p.getPointAtLength(len * ease);
          g.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
          g.style.opacity = k < 0.08 ? k / 0.08 : k > 0.92 ? (1 - k) / 0.08 : 1;
          if (ring) ring.style.opacity = 0;
        } else {
          g.style.opacity = 0;
          const a = ph - travel; // consegna: un anello si allarga sulla scrivania che riceve
          if (ring && a < 0.7) { const len = p.getTotalLength(), end = p.getPointAtLength(len); ring.setAttribute("cx", end.x); ring.setAttribute("cy", end.y); ring.setAttribute("r", 4 + a * 22); ring.style.opacity = (1 - a / 0.7) * 0.7; }
          else if (ring) ring.style.opacity = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, focus]);

  const selO = sel ? L.desks[sel]?.o : null;
  const tipi = occupancy(data.offices);
  const vivi = edges.filter((e) => e.live).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 16, alignItems: "start" }} className="sede-pianta">
      <style>{`@media (max-width: 1100px){.sede-pianta{grid-template-columns:1fr!important}}`}</style>
      <div style={{ background: CP.bgSunken || CP.bg, border: `1px solid ${CP.border}`, borderRadius: 16, padding: "6px 6px 2px", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${VB_W} ${L.H}`} style={{ width: "100%", minWidth: 980, height: "auto", display: "block", fontFamily: FONTS.body }} role="img" aria-label="Pianta della Sede: gli uffici e il lavoro che si passano">
          {/* tappe */}
          {COLS.map((c, i) => (
            <g key={c.id}>
              <text x={c.x} y={34} style={{ fill: CP.textMuted, fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase" }}>{`${i + 1} · ${c.label}`}</text>
              {i < COLS.length - 1 && <path d={`M ${c.x + c.w + 30} 29 h ${COLS[i + 1].x - c.x - c.w - 60}`} style={{ stroke: CP.border, strokeWidth: 1, markerEnd: "url(#freccia)" }} />}
            </g>
          ))}
          <defs>
            <marker id="freccia" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4 0 8z" style={{ fill: CP.border }} /></marker>
            <marker id="punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4 0 8z" style={{ fill: CP.gold || CP.accent }} /></marker>
          </defs>

          {/* fili (sotto le stanze: dove attraversano una stanza passano "dentro") */}
          {edges.map((e) => (
            <path key={e.key} ref={(n) => { pathRefs.current[e.key] = n; }} d={e.d} markerEnd={e.live && lit(e) ? "url(#punta)" : undefined}
              style={{ fill: "none", stroke: e.live ? (CP.gold || CP.accent) : CP.textMuted, strokeWidth: focus && lit(e) ? 2 : 1.2, strokeDasharray: e.live ? "none" : "4 5", opacity: lit(e) ? (focus ? 0.95 : e.live ? 0.4 : 0.35) : 0.06, transition: "opacity .25s" }} />
          ))}

          {/* stanze */}
          {L.rooms.map((r) => (
            <g key={r.id}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={18} style={{ fill: CP.surface, stroke: CP.border, strokeWidth: 1 }} />
              <text x={r.x + PAD + 2} y={r.y + 30} style={{ fill: CP.textPrimary, fontSize: 22, fontFamily: SERIF }}>{r.nome}</text>
              <text x={r.x + PAD + 2} y={r.y + 51} style={{ fill: CP.textMuted, fontSize: 13.5 }}>{r.occ}</text>
            </g>
          ))}

          {/* scrivanie */}
          {Object.values(L.desks).map(({ o, x, y, w, h }) => {
            const on = near(o.id), isSel = sel === o.id, col = statoColore(o);
            return (
              <g key={o.id} onClick={() => setSel(isSel ? null : o.id)} onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer", opacity: on ? 1 : 0.28, transition: "opacity .25s" }} role="button" aria-label={`${o.nome}: ${statoTesto(o)}`}>
                <rect x={x} y={y} width={w} height={h} rx={11} style={{ fill: isSel ? alpha(CP.accent, "22") : CP.surfaceAlt, stroke: isSel ? CP.accent : o.buchi?.some((b) => b.tipo === "ritardo" || b.tipo === "errore") ? alpha(CP.accentRed, "88") : CP.borderSoft || CP.border, strokeWidth: isSel ? 1.6 : 1 }} />
                <Glyph tipo={o.tipo} x={x + 12} y={y + 10} color={CP.textSecondary} />
                <text x={x + 38} y={y + 22} style={{ fill: CP.textPrimary, fontSize: 15.5 }}>{o.nome}</text>
                <circle cx={x + 42} cy={y + 37} r={3.5} style={{ fill: col }} />
                <text x={x + 51} y={y + 41.5} style={{ fill: CP.textMuted, fontSize: 13 }}>{statoTesto(o)}</text>
              </g>
            );
          })}

          {/* fattorini e consegne (sopra tutto) */}
          {edges.map((e) => (
            <g key={"c" + e.key} style={{ pointerEvents: "none" }}>
              <circle ref={(n) => { ringRefs.current[e.key] = n; }} r="4" style={{ fill: "none", stroke: CP.gold || CP.accent, strokeWidth: 1.5, opacity: 0 }} />
              <g ref={(n) => { courierRefs.current[e.key] = n; }} style={{ opacity: 0 }}>
                <circle r="11" style={{ fill: alpha(CP.gold || CP.accent, "26") }} />
                <rect x="-7" y="-5.5" width="14" height="11" rx="1.5" style={{ fill: CP.gold || CP.accent }} />
                <path d="M-7 -2.5 H7 M-4 1 H3" style={{ stroke: CP.surface, strokeWidth: 1 }} />
              </g>
            </g>
          ))}
        </svg>
      </div>

      {/* a destra: la legenda, o l'ufficio scelto */}
      <aside style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 16, padding: "18px 18px 16px", position: "sticky", top: 16, fontSize: 13.5, lineHeight: 1.5, color: CP.textSecondary }}>
        {selO ? <Scheda o={selO} data={data} onClose={() => setSel(null)} /> : (
          <>
            <div style={{ fontFamily: SERIF, fontSize: 24, color: CP.textPrimary, lineHeight: 1.15, marginBottom: 8 }}>Chi lavora per chi</div>
            <p style={{ margin: "0 0 12px" }}>Il lavoro scorre da sinistra a destra. Ogni stanza è un'area; ogni scrivania è un ufficio con un solo compito.</p>
            <div style={{ display: "grid", gap: 9, marginBottom: 14 }}>
              <Leg icon={<svg width="20" height="16" viewBox="-10 -8 20 16"><rect x="-7" y="-5.5" width="14" height="11" rx="1.5" style={{ fill: CP.gold || CP.accent }} /></svg>}>
                <b style={{ color: CP.textPrimary, fontWeight: 500 }}>Il fascicolo</b>: il risultato che un ufficio consegna al prossimo. Viaggia solo se chi lo manda ha lavorato davvero.
              </Leg>
              <Leg icon={<svg width="20" height="10"><path d="M0 5h20" style={{ stroke: CP.textMuted, strokeDasharray: "4 4" }} /></svg>}>Filo tratteggiato: l'ufficio di partenza è fermo, o lavora solo a richiesta. Non arriva niente.</Leg>
              <Leg icon={<span style={{ width: 9, height: 9, borderRadius: 9, background: CP.accentGreen, display: "inline-block" }} />}>ha lavorato (prova nel database)</Leg>
              <Leg icon={<span style={{ width: 9, height: 9, borderRadius: 9, background: CP.accentRed, display: "inline-block" }} />}>fermo o in ritardo</Leg>
              <Leg icon={<span style={{ width: 9, height: 9, borderRadius: 9, background: CP.textMuted, display: "inline-block" }} />}>lavora a richiesta, senza prova</Leg>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
              {["persona", "AI", "codice", "robot"].map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, color: CP.textSecondary }}>
                  <svg width="16" height="16"><Glyph tipo={k} x={0} y={0} color={CP.textSecondary} /></svg>{TIPO[k].many}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: CP.textMuted }}>In sede: {tipi}. {vivi} consegne attive su {edges.length} collegamenti.</div>
            <div style={{ marginTop: 12, fontSize: 13, color: CP.textPrimary }}>Tocca un ufficio per vedere da chi riceve e a chi consegna.</div>
          </>
        )}
      </aside>
    </div>
  );
}

function Leg({ icon, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8, alignItems: "start" }}><span style={{ display: "grid", placeItems: "center", paddingTop: 3 }}>{icon}</span><span>{children}</span></div>;
}

function Scheda({ o, data, onClose }) {
  const by = Object.fromEntries(data.offices.map((x) => [x.id, x]));
  const da = (data.edges || []).filter((e) => e.to === o.id).map((e) => by[e.from]).filter(Boolean);
  const a = (data.edges || []).filter((e) => e.from === o.id).map((e) => by[e.to]).filter(Boolean);
  const Row = ({ k, children }) => <div style={{ marginTop: 10 }}><div style={{ fontSize: 11.5, letterSpacing: ".08em", textTransform: "uppercase", color: CP.textMuted }}>{k}</div><div style={{ color: CP.textSecondary }}>{children}</div></div>;
  const nomi = (l) => l.length ? l.map((x) => x.nome).join(", ") : "—";
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontFamily: SERIF, fontSize: 24, color: CP.textPrimary, lineHeight: 1.15 }}>{o.nome}</div>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CP.border}`, borderRadius: 999, color: CP.textSecondary, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body }}>Chiudi</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12.5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: statoColore(o) }} />{o.tipo === "persona" ? "persona" : `${TIPO[o.tipo]?.one} · ${statoTesto(o)}`}
      </div>
      <p style={{ margin: "10px 0 0", color: CP.textPrimary }}>{o.compito}</p>
      <Row k="Riceve il fascicolo da">{nomi(da)}</Row>
      <Row k="Consegna">{o.risultato}</Row>
      {a.length > 0 && <Row k="A">{nomi(a)}</Row>}
      {o.tipo !== "persona" && <Row k="Chi controlla il suo lavoro">{o.controllore || <span style={{ color: CP.accentRed }}>nessuno</span>}</Row>}
      {o.tipo !== "persona" && <Row k="Chi ne risponde">{o.owner || <span style={{ color: CP.accentRed }}>nessuno</span>}</Row>}
      {o.link && <div style={{ marginTop: 14 }}><Link href={o.link} style={{ color: CP.accentSoftText, textDecoration: "none", fontSize: 13.5 }}>Apri l'ufficio →</Link></div>}
    </>
  );
}
