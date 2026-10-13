"use client";
// Radar creator — vista "Valuta" (13/10/2026, richiesta Nicholas: "devo essere sicuro di
// supervisionarle tutte"). Una creator alla volta: Scarta / Vista / Interessante, poi la prossima.
// Le decisioni partono in fila (una richiesta alla volta: il CRM si legge e si riscrive, due in
// parallelo si pesterebbero i piedi); «Annulla» torna alla creator di prima.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { reviewQueue, whyLines, hookLine } from "@/lib/scouting-core";
import { SERIF, NUM, fmtFull, fmtDate, btn, btnQuiet, igProfile, Initials, LinkChip, Growth } from "./radar-ui";
import RadarReels from "./RadarReels";

const SCOPES = [
  { id: "paid", label: "Con profilo a pagamento" },
  { id: "weak", label: "Con indizi" },
  { id: "all", label: "Tutte" },
];
const LABEL = { scartata: "Scartata", vista: "Vista", interessante: "Interessante" };

export default function RadarValuta({ creators, newCut, me, onOpen, onChanged }) {
  const [scope, setScope] = useState("paid");
  const [done, setDone] = useState(() => new Map()); // id → decisione, in questa sessione
  const [last, setLast] = useState(null); // { c, decision } per «Annulla»
  const [err, setErr] = useState(null);
  const chain = useRef(Promise.resolve());

  const queue = useMemo(() => reviewQueue(creators, { scope, newCut }).filter((c) => !done.has(c.id)), [creators, scope, newCut, done]);
  const counts = useMemo(() => Object.fromEntries(SCOPES.map((s) => [s.id, reviewQueue(creators, { scope: s.id, newCut }).filter((c) => !done.has(c.id)).length])), [creators, newCut, done]);
  const reviewedTotal = creators.filter((c) => c.reviewedAt).length + [...done.keys()].filter((id) => !creators.find((c) => c.id === id)?.reviewedAt).length;
  const cur = queue[0];

  const send = useCallback((body) => {
    chain.current = chain.current.then(async () => {
      const r = await fetch("/api/admin/scouting/creator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, by: me }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Non salvato"); }
    }).catch((e) => setErr(`${e.message}: riprova.`));
    return chain.current;
  }, [me]);

  const decide = useCallback((decision) => {
    if (!cur) return;
    setErr(null);
    setDone((m) => new Map(m).set(cur.id, decision));
    setLast({ c: cur, decision });
    send({ action: "review", id: cur.id, decision });
    window.scrollTo({ top: 0 });
  }, [cur, send]);

  const undo = useCallback(() => {
    if (!last) return;
    setDone((m) => { const n = new Map(m); n.delete(last.c.id); return n; });
    send({ action: "unreview", id: last.c.id });
    setLast(null);
    window.scrollTo({ top: 0 });
  }, [last, send]);

  // all'uscita dalla vista i dati del radar si ricaricano (fasi nuove in Esplora/Contatti)
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;
  useEffect(() => () => { chain.current.then(() => changedRef.current?.()); }, []);

  // tastiera (computer): S scarta, V vista, I interessante, Z annulla
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") decide("scartata"); else if (k === "v") decide("vista"); else if (k === "i") decide("interessante"); else if (k === "z") undo();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [decide, undo]);

  const why = cur ? whyLines(cur, { newCut }) : [];
  const hook = cur ? hookLine(cur, { newCut }) : null;
  const total = counts[scope] + [...done.values()].length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
      <div className="rx-strip" role="group" aria-label="Quale coda">
        {SCOPES.map((s) => (
          <button key={s.id} onClick={() => setScope(s.id)} aria-pressed={scope === s.id}
            style={{ flexShrink: 0, whiteSpace: "nowrap", borderRadius: 999, padding: "7px 13px", fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${scope === s.id ? CP.gold : CP.border}`, background: scope === s.id ? CP.surface : "transparent", color: scope === s.id ? CP.textPrimary : CP.textSecondary }}>
            {s.label} <span style={{ color: CP.textMuted, ...NUM }}>{fmtFull(counts[s.id])}</span>
          </button>
        ))}
      </div>

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

      {!cur ? (
        <div style={{ padding: "40px 0", textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, ...SERIF, fontSize: 28 }}>Hai visto tutta questa coda.</p>
          <p style={{ margin: 0, color: CP.textSecondary, fontSize: 14.5 }}>Le nuove creator, segnalate o trovate dal giro, entrano qui da sole.</p>
        </div>
      ) : (
        <article key={cur.id} className="rv-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <header style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Initials name={cur.name} size={76} gold={cur.sig === "forte"} pic={cur.pic} />
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={{ margin: 0, ...SERIF, fontSize: 30, lineHeight: 1.05, overflowWrap: "anywhere" }}>{cur.name}</h2>
              <span style={{ fontSize: 13, color: CP.textMuted }}>{[cur.agency ? (cur.agency === "Indipendente" ? "indipendente" : `con ${cur.agency}`) : null, cur.nic || cur.g, cur.firstSeen ? `nel radar dal ${fmtDate(cur.firstSeen)}` : null, cur.n > 1 ? `${cur.n} account` : null].filter(Boolean).join(" · ")}</span>
            </div>
          </header>

          {hook && <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 21, lineHeight: 1.3, color: CP.gold }}>{hook.replace(/\.$/, "")}</p>}
          {why.filter((w) => w !== hook).length > 0 && <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>{why.filter((w) => w !== hook).join(" ")}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
            <Fig v={fmtFull(cur.fol)} l="follower" />
            <Fig v={fmtFull(cur.medv)} l="view per reel" />
            <Fig v={<Growth v={cur.g4} />} l="in 4 settimane" />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <LinkChip link={cur.link} sig={cur.sig} />
            {cur.link?.url && <a href={cur.link.url} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: 13, color: CP.textSecondary }}>Apri il link ↗</a>}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {cur.handles.map((h) => <a key={h} href={igProfile(h)} target="_blank" rel="noopener noreferrer" style={btn}>Instagram @{h} ↗</a>)}
            <button style={btnQuiet} onClick={() => onOpen(cur)}>Scheda completa</button>
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <RadarReels c={cur} compact />
          </section>
        </article>
      )}

      {cur && (
        <div className="rv-bar" style={{ position: "sticky", bottom: 12, zIndex: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 8, padding: 8, borderRadius: 18, background: alpha(CP.bg, "e6"), border: `1px solid ${CP.border}`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
          <Act onClick={() => decide("scartata")} k="S">Scarta</Act>
          <Act onClick={() => decide("vista")} k="V">Vista</Act>
          <Act onClick={() => decide("interessante")} k="I" gold>Interessante</Act>
        </div>
      )}

      {last && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13.5, color: CP.textSecondary }}>
          <span>{LABEL[last.decision]}: {last.c.name}</span>
          <button onClick={undo} style={{ ...btnQuiet, padding: "4px 0", minHeight: 0, color: CP.textPrimary }}>Annulla (Z)</button>
        </div>
      )}
    </div>
  );
}

function Act({ children, onClick, k, gold }) {
  return (
    <button onClick={onClick} title={`Tasto ${k}`}
      style={{ minHeight: 54, borderRadius: 13, fontSize: 15.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${gold ? CP.gold : CP.border}`, background: gold ? CP.gold : CP.surface, color: gold ? "#111" : CP.textPrimary }}>
      {children}
    </button>
  );
}

function Fig({ v, l }) {
  return (
    <div>
      <div style={{ fontSize: 19, ...NUM }}>{v}</div>
      <div style={{ fontSize: 12.5, color: CP.textMuted }}>{l}</div>
    </div>
  );
}
