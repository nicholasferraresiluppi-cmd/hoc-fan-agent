"use client";
// Radar creator — vista "Valuta" (13/10/2026, richiesta Nicholas: "devo essere sicuro di
// supervisionarle tutte"). Rifatta il 21/10/2026 sul modello degli strumenti di selezione
// (scorecard delle assunzioni, piattaforme influencer):
//   - VOTO a 4 livelli senza punto di mezzo: No · Forse · Sì · Assolutamente (scouting-core RATINGS);
//   - ORDINA PER e FILTRI a intervallo (follower, view per reel, engagement) per decidere da chi partire;
//   - due modi sugli stessi dati: «Una alla volta» (nessuna saltata) ed «Elenco» (su computer elenco
//     a sinistra e scheda a destra, frecce per scorrere; su telefono un tocco apre quella creator);
//   - barra dei voti unica in fondo con «Annulla» dentro; su telefono la barra dell'app e il pulsante
//     dei commenti si nascondono (erano due file di bottoni e «Annulla» finiva sotto il pulsante),
//     e si vota anche scorrendo la creator: destra = Sì, sinistra = No.
// Le decisioni partono in fila (una richiesta alla volta: il CRM si legge e si riscrive, due in
// parallelo si pesterebbero i piedi).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { reviewQueue, whyLines, hookLine, RATINGS, RATING_LABEL, RANGE_FILTERS, QUEUE_SORTS, activeRanges } from "@/lib/scouting-core";
import { FilterChip } from "@/components/ds";
import { SERIF, NUM, fmtFull, fmtN, fmtDate, fmtEr, btn, btnQuiet, input, igProfile, Initials, LinkChip, Growth, rateStyle, useIsPhone } from "./radar-ui";
import RadarReels from "./RadarReels";

const SCOPES = [
  { id: "paid", label: "Con profilo a pagamento" },
  { id: "weak", label: "Con indizi" },
  { id: "all", label: "Tutte" },
  { id: "forse", label: "Da rivedere (Forse)" },
];
const LEGACY_KEYS = { s: "no", v: "forse", i: "si" };
const RATE_ID = Object.fromEntries(RATINGS.map((r) => [r.id, r.v]));
const PREFS_KEY = "hoc:radar:valuta";
const SWIPE = 100; // px oltre cui lo scorrimento vale un voto

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; }
}
function writePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* navigazione privata: si ricomincia dai valori di base */ }
}

/** Schermo largo abbastanza per elenco e scheda affiancati. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1080px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function RadarValuta({ creators, newCut, me, onOpen, onChanged }) {
  const [scope, setScope] = useState("paid");
  const [sort, setSort] = useState("auto");
  const [ranges, setRanges] = useState({});
  const [mode, setMode] = useState("one"); // one | list
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [done, setDone] = useState(() => new Map()); // id → voto (1-4), in questa sessione
  const [last, setLast] = useState(null); // { c, v } per «Annulla»
  const [err, setErr] = useState(null);
  const chain = useRef(Promise.resolve());
  const phone = useIsPhone();
  const wide = useWide();

  // preferenze della vista (per chi guarda, su questo dispositivo)
  const loaded = useRef(false);
  useEffect(() => {
    const p = readPrefs();
    if (SCOPES.some((s) => s.id === p.scope)) setScope(p.scope);
    if (QUEUE_SORTS.some((s) => s.id === p.sort)) setSort(p.sort);
    if (p.ranges && typeof p.ranges === "object") setRanges(p.ranges);
    if (p.mode === "list" || p.mode === "one") setMode(p.mode);
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) writePrefs({ scope, sort, ranges, mode }); }, [scope, sort, ranges, mode]);

  const opts = useMemo(() => ({ newCut, sort, ranges }), [newCut, sort, ranges]);
  const queue = useMemo(() => reviewQueue(creators, { ...opts, scope }).filter((c) => !done.has(c.id)), [creators, opts, scope, done]);
  const counts = useMemo(() => Object.fromEntries(SCOPES.map((s) => [s.id, reviewQueue(creators, { ...opts, scope: s.id }).filter((c) => !done.has(c.id)).length])), [creators, opts, done]);
  const reviewedTotal = creators.filter((c) => c.reviewedAt).length + [...done.keys()].filter((id) => !creators.find((c) => c.id === id)?.reviewedAt).length;
  const cur = queue.find((c) => c.id === focusId) || queue[0] || null;
  const split = mode === "list" && wide;
  const showBar = !!cur && (mode === "one" || split);

  const send = useCallback((body) => {
    chain.current = chain.current.then(async () => {
      const r = await fetch("/api/admin/scouting/creator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, by: me }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Non salvato"); }
    }).catch((e) => setErr(`${e.message}: riprova.`));
    return chain.current;
  }, [me]);

  const rate = useCallback((ratingId, target) => {
    const c = target || cur;
    if (!c) return;
    const i = queue.findIndex((x) => x.id === c.id);
    const next = queue[i + 1] || queue[i - 1] || null;
    setErr(null);
    setDone((m) => new Map(m).set(c.id, RATE_ID[ratingId]));
    setLast({ c, v: RATE_ID[ratingId] });
    // si resta al punto della coda: la prossima è quella dopo, non la prima in cima
    if (c.id === cur?.id) setFocusId(next?.id || null);
    send({ action: "review", id: c.id, decision: ratingId });
    if (mode === "one") window.scrollTo({ top: 0 });
  }, [cur, queue, send, mode]);

  const undo = useCallback(() => {
    if (!last) return;
    setDone((m) => { const n = new Map(m); n.delete(last.c.id); return n; });
    setFocusId(last.c.id);
    send({ action: "unreview", id: last.c.id });
    setLast(null);
    if (mode === "one") window.scrollTo({ top: 0 });
  }, [last, send, mode]);

  const move = useCallback((d) => {
    if (!cur) return;
    const i = queue.findIndex((x) => x.id === cur.id);
    const n = queue[Math.max(0, Math.min(queue.length - 1, i + d))];
    if (n) setFocusId(n.id);
  }, [cur, queue]);

  // all'uscita dalla vista i dati del radar si ricaricano (fasi nuove in Esplora/Contatti)
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;
  useEffect(() => () => { chain.current.then(() => changedRef.current?.()); }, []);

  // modalità valutazione: su telefono via la barra dell'app e il pulsante dei commenti (regole in page.js)
  useEffect(() => {
    if (!showBar) return;
    document.documentElement.classList.add("rv-focus");
    return () => document.documentElement.classList.remove("rv-focus");
  }, [showBar]);

  // tastiera (computer): 1-4 voto (anche S/V/I come prima), Z annulla, frecce o J/K nell'elenco
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const r = RATINGS.find((x) => String(x.v) === k);
      if (r) rate(r.id);
      else if (LEGACY_KEYS[k]) rate(LEGACY_KEYS[k]);
      else if (k === "z") undo();
      else if (split && (k === "arrowdown" || k === "j")) { e.preventDefault(); move(1); }
      else if (split && (k === "arrowup" || k === "k")) { e.preventDefault(); move(-1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [rate, undo, move, split]);

  const total = counts[scope] + [...done.keys()].length;
  const nFilters = activeRanges(ranges);
  const pill = (active) => ({ flexShrink: 0, whiteSpace: "nowrap", borderRadius: 999, padding: "7px 13px", fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${active ? CP.gold : CP.border}`, background: active ? CP.surface : "transparent", color: active ? CP.textPrimary : CP.textSecondary });

  const controls = (
    <>
      <div className="rx-strip" role="group" aria-label="Quale coda">
        {SCOPES.map((s) => (
          <button key={s.id} onClick={() => { setScope(s.id); setFocusId(null); }} aria-pressed={scope === s.id} style={pill(scope === s.id)}>
            {s.label} <span style={{ color: CP.textMuted, ...NUM }}>{fmtFull(counts[s.id])}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <label htmlFor="rv-sort" style={{ fontSize: 13, color: CP.textMuted }}>Ordina per</label>
        <select id="rv-sort" value={sort} onChange={(e) => { setSort(e.target.value); setFocusId(null); }} style={{ ...input, padding: "7px 10px", fontSize: phone ? 16 : 14 }}>
          {QUEUE_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={() => setFiltersOpen((x) => !x)} aria-expanded={filtersOpen} style={{ ...btn, minHeight: 36, padding: "6px 14px", borderColor: nFilters ? CP.gold : CP.border }}>
          Filtri{nFilters ? ` · ${nFilters}` : ""}
        </button>
        <span style={{ flex: "1 1 auto" }} />
        <div role="group" aria-label="Come vederle" style={{ display: "inline-flex", border: `1px solid ${CP.border}`, borderRadius: 999, padding: 3 }}>
          {[["one", "Una alla volta"], ["list", "Elenco"]].map(([id, l]) => (
            <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id}
              style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer", background: mode === id ? CP.surface : "transparent", color: mode === id ? CP.textPrimary : CP.textSecondary }}>{l}</button>
          ))}
        </div>
      </div>

      {filtersOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 14, border: `1px solid ${CP.border}`, background: CP.surface }}>
          {Object.entries(RANGE_FILTERS).map(([k, def]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, color: CP.textMuted }}>{def.label}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {def.opts.map((o) => (
                  <FilterChip key={o.id} label={o.label} active={(ranges[k] || "all") === o.id} onClick={() => { setRanges((r) => ({ ...r, [k]: o.id })); setFocusId(null); }} />
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: CP.textMuted }}>L&apos;engagement arriva col giro settimanale: chi non l&apos;ha ancora non passa il filtro.</span>
            {nFilters > 0 && <button onClick={() => setRanges({})} style={{ ...btnQuiet, minHeight: 0, padding: "4px 0", color: CP.textPrimary }}>Togli i filtri</button>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: CP.textMuted, ...NUM }}>
          <span>{fmtFull(counts[scope])} da vedere</span>
          <span>{fmtFull(reviewedTotal)} valutate in tutto</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: CP.border, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${total ? Math.round(((total - counts[scope]) / total) * 100) : 100}%`, background: CP.gold, transition: "width .3s" }} />
        </div>
      </div>

      {err && <p style={{ margin: 0, color: CP.attn, fontSize: 14 }}>{err}</p>}
    </>
  );

  const empty = (
    <div style={{ padding: "40px 0", textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, ...SERIF, fontSize: 28 }}>{nFilters ? "Nessuna creator con questi filtri." : scope === "forse" ? "Niente da rivedere." : "Hai visto tutta questa coda."}</p>
      <p style={{ margin: 0, color: CP.textSecondary, fontSize: 14.5 }}>{nFilters ? "Allarga i filtri o toglili." : scope === "forse" ? "Qui tornano le creator a cui hai dato Forse." : "Le nuove creator, segnalate o trovate dal giro, entrano qui da sole."}</p>
    </div>
  );

  const bar = showBar && (
    <div className="rv-bar" style={{ position: "sticky", bottom: 12, zIndex: 20, display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 18, background: alpha(CP.bg, "e6"), border: `1px solid ${CP.border}`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      {last && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "0 6px", fontSize: 13, color: CP.textSecondary }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{RATING_LABEL[last.v]}: {last.c.name}</span>
          <button onClick={undo} style={{ ...btnQuiet, padding: "2px 0", minHeight: 0, color: CP.textPrimary, flexShrink: 0 }}>Annulla{phone ? "" : " (Z)"}</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.7fr", gap: 6 }}>
        {RATINGS.map((r) => (
          <button key={r.v} onClick={() => rate(r.id)} title={`Tasto ${r.v}`} style={rateStyle(r.v, { big: true })}>{r.label}</button>
        ))}
      </div>
      <span style={{ textAlign: "center", fontSize: 11.5, color: CP.textMuted }}>{phone ? "Scorri la creator: a destra Sì, a sinistra No" : split ? "Tasti 1-4 per votare · frecce per scorrere · Z annulla" : "Tasti 1-4 per votare · Z annulla"}</span>
    </div>
  );

  if (mode === "list") {
    const list = (
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {queue.slice(0, 300).map((c) => (
          <ListRow key={c.id} c={c} active={split && c.id === cur?.id} phone={phone}
            onSelect={() => { setFocusId(c.id); if (!split) setMode("one"); }} onRate={(id) => rate(id, c)} />
        ))}
        {queue.length > 300 && <li style={{ padding: "12px 0", fontSize: 13, color: CP.textMuted }}>Le prime 300: usa i filtri per stringere.</li>}
      </ul>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {controls}
        {!cur ? empty : split ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)", gap: 28, alignItems: "start" }}>
            <div className="rv-list" style={{ position: "sticky", top: 12, maxHeight: "calc(100vh - 24px)", overflowY: "auto", paddingRight: 6 }}>{list}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card key={cur.id} c={cur} newCut={newCut} onOpen={onOpen} />
              {bar}
            </div>
          </div>
        ) : list}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
      {controls}
      {!cur ? empty : <Card key={cur.id} c={cur} newCut={newCut} onOpen={onOpen} onSwipe={phone ? (dir) => rate(dir > 0 ? "si" : "no") : null} />}
      {bar}
    </div>
  );
}

function Card({ c, newCut, onOpen, onSwipe }) {
  const why = whyLines(c, { newCut });
  const hook = hookLine(c, { newCut });
  const [dx, setDx] = useState(0);
  const t = useRef(null);

  const start = (e) => {
    if (!onSwipe || e.target.closest?.("video, button, a, input, select, textarea")) { t.current = null; return; }
    const p = e.touches[0];
    t.current = { x: p.clientX, y: p.clientY, h: null };
  };
  const moveT = (e) => {
    const s = t.current;
    if (!s) return;
    const p = e.touches[0];
    const x = p.clientX - s.x, y = p.clientY - s.y;
    if (s.h == null && Math.abs(x) + Math.abs(y) > 10) s.h = Math.abs(x) > Math.abs(y);
    if (s.h) setDx(x);
  };
  const end = () => {
    const s = t.current;
    t.current = null;
    if (s?.h && Math.abs(dx) >= SWIPE) onSwipe(dx);
    setDx(0);
  };
  const hint = Math.min(1, Math.abs(dx) / SWIPE);

  return (
    <article className="rv-card" onTouchStart={start} onTouchMove={moveT} onTouchEnd={end} onTouchCancel={() => { t.current = null; setDx(0); }}
      style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16, touchAction: "pan-y", transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined, transition: dx ? "none" : "transform .2s" }}>
      {dx !== 0 && (
        <span aria-hidden="true" style={{ position: "absolute", top: 8, [dx > 0 ? "left" : "right"]: 8, zIndex: 2, padding: "6px 14px", borderRadius: 10, fontSize: 18, fontWeight: 600, opacity: hint, border: `2px solid ${dx > 0 ? CP.gold : CP.textSecondary}`, color: dx > 0 ? CP.gold : CP.textSecondary, background: alpha(CP.bg, "cc") }}>{dx > 0 ? "Sì" : "No"}</span>
      )}
      <header style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Initials name={c.name} size={76} gold={c.sig === "forte"} pic={c.pic} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, ...SERIF, fontSize: 30, lineHeight: 1.05, overflowWrap: "anywhere" }}>{c.name}</h2>
          <span style={{ fontSize: 13, color: CP.textMuted }}>{[c.agency ? (c.agency === "Indipendente" ? "indipendente" : `con ${c.agency}`) : null, c.nic || c.g, c.firstSeen ? `nel radar dal ${fmtDate(c.firstSeen)}` : null, c.n > 1 ? `${c.n} account` : null, c.rating === 2 ? "avevi detto Forse" : null].filter(Boolean).join(" · ")}</span>
        </div>
      </header>

      {hook && <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 21, lineHeight: 1.3, color: CP.gold }}>{hook.replace(/\.$/, "")}</p>}
      {why.filter((w) => w !== hook).length > 0 && <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>{why.filter((w) => w !== hook).join(" ")}</p>}

      <div className="rv-figs" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
        <Fig v={fmtFull(c.fol)} l="follower" />
        <Fig v={fmtFull(c.medv)} l="view per reel" />
        <Fig v={fmtEr(c.er)} l="engagement" />
        <Fig v={<Growth v={c.g4} />} l="in 4 settimane" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <LinkChip link={c.link} sig={c.sig} />
        {c.link?.url && <a href={c.link.url} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: 13, color: CP.textSecondary }}>Apri il link ↗</a>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {c.handles.map((h) => <a key={h} href={igProfile(h)} target="_blank" rel="noopener noreferrer" style={btn}>Instagram @{h} ↗</a>)}
        <button style={btnQuiet} onClick={() => onOpen(c)}>Scheda completa</button>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <RadarReels c={c} compact />
      </section>
    </article>
  );
}

function ListRow({ c, active, phone, onSelect, onRate }) {
  return (
    <li style={{ borderBottom: `1px solid ${CP.borderSoft || CP.border}`, background: active ? alpha(CP.gold, "14") : "transparent", borderLeft: `2px solid ${active ? CP.gold : "transparent"}`, display: "flex", flexDirection: phone ? "column" : "row", alignItems: phone ? "stretch" : "center", gap: phone ? 8 : 12, padding: phone ? "12px 0" : "10px 8px" }}>
      <button onClick={onSelect} aria-current={active || undefined} style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", flex: "1 1 auto", minWidth: 0, display: "grid", gridTemplateColumns: "40px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
        <Initials name={c.name} size={40} gold={c.sig === "forte"} pic={c.pic} />
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: 12.5, color: CP.textMuted, ...NUM }}>
            <span>{fmtN(c.fol)} follower</span>
            <span>{fmtN(c.medv)} view</span>
            <span>ER {fmtEr(c.er)}</span>
            {c.g4 != null && <Growth v={c.g4} />}
          </span>
        </span>
      </button>
      <div role="group" aria-label={`Voto per ${c.name}`} style={{ display: "grid", gridTemplateColumns: phone ? "1fr 1fr 1fr 1.6fr" : "repeat(4, auto)", gap: 5, flexShrink: 0 }}>
        {RATINGS.map((r) => (
          <button key={r.v} onClick={() => onRate(r.id)} style={{ ...rateStyle(r.v), minHeight: phone ? 36 : 30, padding: phone ? "0 4px" : "0 9px" }}>{r.label}</button>
        ))}
      </div>
    </li>
  );
}

function Fig({ v, l }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="rv-fig" style={{ fontSize: 19, ...NUM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
      <div style={{ fontSize: 12.5, color: CP.textMuted }}>{l}</div>
    </div>
  );
}
