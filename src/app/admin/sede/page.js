"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, card, SectionTitle, FilterChip } from "@/components/ds";

/**
 * /admin/sede — la Sede: l'azienda come uffici (persone, codice, AI) che si
 * passano il lavoro. Per ogni ufficio: il compito, se ha lavorato davvero
 * (prova nel database), chi controlla il suo lavoro, chi ne risponde, a chi
 * passa il lavoro. In alto i BUCHI: dove manca una delle quattro regole.
 */

const fetcher = (u) => fetch(u, { cache: "no-store" }).then(async (r) => { const j = await r.json().catch(() => ({ error: "Risposta non valida" })); return r.ok ? j : { error: j.error || `Errore ${r.status}` }; });

const STATO = {
  lavora: { label: "Lavora", color: () => CP.accentGreen },
  in_ritardo: { label: "In ritardo", color: () => CP.accentRed },
  errore: { label: "Errore", color: () => CP.accentRed },
  mai: { label: "Nessuna traccia", color: () => CP.accentRed },
  attesa: { label: "Prima prova stanotte", color: () => CP.textMuted },
  senza_prova: { label: "Senza prova", color: () => CP.textMuted },
  persona: { label: "Persona", color: () => CP.accent },
};
const TIPO = { AI: "AI", codice: "codice", robot: "robot", persona: "persona" };
const BUCO = {
  controllore: "Senza controllore",
  responsabile: "Senza responsabile",
  prova: "Senza prova di lavoro",
  ritardo: "Fermo o in ritardo",
  errore: "In errore",
};

const ago = (t) => {
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "ora";
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h fa`;
  return `${Math.round(h / 24)} giorni fa`;
};

export default function Sede() {
  const { data, error, mutate } = useSWR("/api/admin/sede", fetcher, { refreshInterval: 60000, revalidateOnFocus: false });
  const [filtro, setFiltro] = useState(null);
  const [sel, setSel] = useState(null);

  const buchi = useMemo(() => {
    const m = {};
    for (const o of data?.offices || []) for (const b of o.buchi) (m[b.tipo] ||= []).push({ o, b });
    return m;
  }, [data]);

  if (error) return <Wrap><Notice danger>Errore di rete: la pagina non si è caricata.</Notice></Wrap>;
  if (!data) return <Wrap><div style={{ color: CP.textMuted }}>Caricamento…</div></Wrap>;
  if (data.error) return <Wrap><Notice danger>{data.error}</Notice></Wrap>;

  const t = data.totali;
  const visibili = (o) => !filtro || o.buchi.some((b) => b.tipo === filtro);

  return (
    <Wrap>
      <PageHead
        crumbs={[{ label: "Direzione" }, { label: "La Sede" }]}
        title="La Sede"
        subtitle="L'azienda vista come uffici (persone, codice, AI) che si passano il lavoro. Un ufficio lavora bene quando ha un solo compito, un risultato misurabile, qualcuno che controlla il suo lavoro e una persona che ne risponde. Qui vedi chi ha lavorato davvero e dove manca un pezzo."
      />

      {/* il colpo d'occhio */}
      <div style={{ ...card, padding: "16px 20px", marginBottom: 14, display: "flex", gap: 34, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Big label="Uffici al lavoro" value={`${t.lavorano} su ${t.uffici}`} />
        <Big label="Fermi o in ritardo" value={t.fermi} danger={t.fermi > 0} />
        <Big label="Senza controllore" value={t.senza_controllore} danger={t.senza_controllore > 0} />
        <Big label="Senza responsabile" value={t.senza_responsabile} danger={t.senza_responsabile > 0} />
        <span style={{ fontSize: 12.5, color: CP.textMuted, marginLeft: "auto" }}>Aggiornato {ago(data.now)} · si aggiorna da solo</span>
      </div>

      {/* i buchi */}
      <SectionTitle aside={`${t.buchi} in tutto · clicca per vedere solo quegli uffici`}>Dove manca un pezzo</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <FilterChip label={`Tutti gli uffici (${data.offices.length})`} active={!filtro} onClick={() => setFiltro(null)} />
        {Object.keys(BUCO).filter((k) => buchi[k]?.length).map((k) => (
          <FilterChip key={k} label={`${BUCO[k]} (${buchi[k].length})`} active={filtro === k} danger={k === "ritardo" || k === "errore"} onClick={() => setFiltro(filtro === k ? null : k)} />
        ))}
      </div>
      {(buchi.ritardo?.length || buchi.errore?.length) ? (
        <Notice danger>
          {[...(buchi.ritardo || []), ...(buchi.errore || [])].map(({ o, b }) => <div key={o.id + b.tipo}><b style={{ fontWeight: 500, color: CP.textPrimary }}>{o.nome}</b>: {b.testo}{o.at ? ` · ultimo lavoro ${ago(o.at)}` : ""}</div>)}
        </Notice>
      ) : null}

      {/* flusso */}
      <Flusso data={data} sel={sel} onSel={setSel} />

      {/* la pianta, piano per piano */}
      {data.floors.map((f) => {
        const rooms = data.offices.filter((o) => o.piano === f.id && visibili(o));
        if (!rooms.length) return null;
        return (
          <section key={f.id} style={{ marginTop: 22 }}>
            <SectionTitle aside={f.desc}>{f.nome}</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {rooms.map((o) => <Room key={o.id} o={o} sel={sel === o.id} onSel={() => setSel(sel === o.id ? null : o.id)} onSaved={() => mutate()} all={data.offices} />)}
            </div>
          </section>
        );
      })}

      <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 22, lineHeight: 1.55 }}>
        «Prova di lavoro» = il segno che un ufficio lascia nel database ogni volta che lavora. Un ufficio senza prova può lavorare benissimo, ma nessuno se ne accorge se si ferma: è così che il robot Infloww e la coda HR sono rimasti fermi o invisibili senza che nessuno lo vedesse. Il responsabile è una proposta finché non lo confermi (campo nel riquadro).
      </p>
    </Wrap>
  );
}

function Big({ label, value, danger }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 500, color: danger ? CP.accentRed : CP.textPrimary, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}

function Room({ o, sel, onSel, onSaved, all }) {
  const st = STATO[o.stato] || STATO.senza_prova;
  const [edit, setEdit] = useState(false);
  const [owner, setOwner] = useState(o.owner || "");
  const nomi = (ids) => ids.map((id) => all.find((x) => x.id === id)?.nome).filter(Boolean);
  async function save() {
    await fetch("/api/admin/sede", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "owner", id: o.id, owner }) });
    setEdit(false); onSaved();
  }
  return (
    <div onClick={onSel} style={{ ...card, padding: "14px 16px", cursor: "pointer", borderColor: sel ? CP.accent : o.buchi.some((b) => b.tipo === "ritardo" || b.tipo === "errore") ? alpha(CP.accentRed, "66") : CP.border, boxShadow: sel ? `0 0 0 3px ${alpha(CP.accent, "22")}` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span title={st.label} style={{ width: 9, height: 9, borderRadius: 5, background: st.color(), flexShrink: 0 }} />
        <b style={{ fontSize: 14.5, fontWeight: 500, color: CP.textPrimary }}>{o.nome}</b>
        <span style={{ marginLeft: "auto", fontSize: 11, color: CP.textMuted, border: `1px solid ${CP.border}`, borderRadius: 999, padding: "1px 8px" }}>{TIPO[o.tipo]}</span>
      </div>
      <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.45 }}>{o.compito}</div>

      {(o.ultimo || o.at || o.coda || o.stato === "attesa") && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: CP.textPrimary, background: CP.surfaceAlt, borderRadius: "10px 10px 10px 2px", padding: "7px 10px", lineHeight: 1.4 }}>
          {o.coda ? <><b style={{ fontWeight: 500 }}>{o.coda.n}</b> {o.coda.label}</> : (o.ultimo || st.label)}
          {o.at && <div style={{ fontSize: 11, color: o.stato === "lavora" ? CP.textMuted : CP.accentRed, marginTop: 3 }}>{st.label.toLowerCase()} · {ago(o.at)}{o.cadenza ? ` · ${o.cadenza}` : ""}</div>}
        </div>
      )}

      <dl style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.5, display: "grid", gridTemplateColumns: "92px 1fr", rowGap: 3 }}>
        <dt style={{ color: CP.textMuted }}>Risultato</dt><dd style={{ margin: 0, color: CP.textSecondary }}>{o.risultato}</dd>
        {o.tipo !== "persona" && <><dt style={{ color: CP.textMuted }}>Controllore</dt><dd style={{ margin: 0, color: o.controllore ? CP.textSecondary : CP.accentRed }}>{o.controllore || "nessuno"}</dd></>}
        {o.tipo !== "persona" && (
          <>
            <dt style={{ color: CP.textMuted }}>Responsabile</dt>
            <dd style={{ margin: 0 }} onClick={(e) => e.stopPropagation()}>
              {edit ? (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <input autoFocus value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} style={{ width: 120, background: CP.bg, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 6, padding: "2px 6px", fontSize: 12, fontFamily: FONTS.body }} />
                  <button onClick={save} style={{ ...mini, color: CP.accentSoftText }}>Salva</button>
                </span>
              ) : (
                <span style={{ color: o.owner ? CP.textSecondary : CP.accentRed }}>
                  {o.owner || "nessuno"}{o.owner && !o.owner_confermato ? " (proposto)" : ""}{" "}
                  <button onClick={() => setEdit(true)} style={mini}>{o.owner ? "cambia" : "assegna"}</button>
                </span>
              )}
            </dd>
          </>
        )}
        {o.passa_a?.length > 0 && <><dt style={{ color: CP.textMuted }}>Passa a</dt><dd style={{ margin: 0, color: CP.textSecondary }}>{nomi(o.passa_a).join(", ")}</dd></>}
      </dl>

      {o.buchi.filter((b) => b.tipo !== "ritardo").length > 0 && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {o.buchi.filter((b) => b.tipo !== "ritardo").map((b) => <span key={b.tipo} title={b.testo} style={{ fontSize: 11, color: CP.accentRed, background: alpha(CP.accentRed, "14"), borderRadius: 999, padding: "2px 8px" }}>{BUCO[b.tipo]}</span>)}
        </div>
      )}
      {o.link && <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}><Link href={o.link} style={{ fontSize: 12.5, color: CP.accentSoftText, textDecoration: "none" }}>Apri →</Link></div>}
    </div>
  );
}

/* Il flusso del lavoro: fonti → lavoro → controllo → persone. Linee tra uffici. */
function Flusso({ data, sel, onSel }) {
  const COLS = [
    { id: "dati", label: "Fonti dei dati", piani: ["dati"] },
    { id: "lavoro", label: "Lavoro", piani: ["vendite", "persone"] },
    { id: "controllo", label: "Controllo", piani: ["controllo"] },
    { id: "direzione", label: "Persone che rispondono", piani: ["direzione"] },
  ];
  const W = 1100, colW = W / COLS.length, rowH = 30, top = 40;
  const pos = {};
  let maxRows = 0;
  COLS.forEach((c, ci) => {
    const list = data.offices.filter((o) => c.piani.includes(o.piano));
    maxRows = Math.max(maxRows, list.length);
    list.forEach((o, i) => { pos[o.id] = { x: ci * colW + 14, y: top + i * rowH, w: colW - 40, o }; });
  });
  const H = top + maxRows * rowH + 10;
  const hot = (id) => !sel || id === sel || data.edges.some((e) => (e.from === sel && e.to === id) || (e.to === sel && e.from === id));
  return (
    <section style={{ ...card, padding: "14px 16px", marginTop: 6, overflowX: "auto" }}>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Chi passa il lavoro a chi. Clicca un ufficio per vedere i suoi collegamenti.</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 760, height: "auto", display: "block" }} role="img" aria-label="Flusso del lavoro tra gli uffici">
        {COLS.map((c, ci) => <text key={c.id} x={ci * colW + 14} y={20} fontSize="12" fill={CP.textMuted} fontFamily="inherit">{c.label}</text>)}
        {data.edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to];
          if (!a || !b) return null;
          const x1 = a.x + a.w, y1 = a.y + 10, x2 = b.x, y2 = b.y + 10;
          const back = x2 <= x1;
          const d = back ? `M ${a.x + a.w / 2} ${a.y + 20} C ${a.x + a.w / 2} ${a.y + 60}, ${b.x + b.w / 2} ${b.y + 60}, ${b.x + b.w / 2} ${b.y + 20}` : `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;
          const on = !sel || e.from === sel || e.to === sel;
          return <path key={i} d={d} fill="none" stroke={on ? CP.accent : CP.border} strokeOpacity={on ? (sel ? 0.9 : 0.35) : 0.25} strokeWidth={on && sel ? 1.8 : 1} />;
        })}
        {Object.values(pos).map(({ x, y, w, o }) => {
          const st = STATO[o.stato] || STATO.senza_prova;
          return (
            <g key={o.id} onClick={() => onSel(sel === o.id ? null : o.id)} style={{ cursor: "pointer" }} opacity={hot(o.id) ? 1 : 0.35}>
              <rect x={x} y={y} width={w} height={22} rx={6} fill={sel === o.id ? CP.accentSoft : CP.surfaceAlt} stroke={o.buchi.length ? alpha(CP.accentRed, "88") : CP.border} />
              <circle cx={x + 11} cy={y + 11} r={4} fill={st.color()} />
              <text x={x + 21} y={y + 15} fontSize="11.5" fill={CP.textPrimary} fontFamily="inherit">{o.nome}</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

const mini = { background: "none", border: "none", padding: 0, color: CP.textMuted, cursor: "pointer", fontSize: 12, fontFamily: FONTS.body, textDecoration: "underline" };
const Wrap = ({ children }) => <div style={{ padding: "28px 24px 64px", maxWidth: 1200, margin: "0 auto", fontFamily: FONTS.body }}>{children}</div>;
