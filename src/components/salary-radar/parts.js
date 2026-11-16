"use client";
// Radar salary — pezzi della pagina (16/11/2026): schede delle modelle, scheda di dettaglio,
// finestra «Aggiungi profili». Stile del Radar creator (radar-ui): linee sottili, titoli serif.
import { useMemo, useState } from "react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { DataTable, Notice, Spiega } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { Initials, SERIF, NUM, fmtN, fmtFull, fmtPct, fmtDate, igProfile, btn, btnPrimary, btnQuiet, input } from "@/components/scouting/radar-ui";
import { parseHandles } from "@/lib/salary-radar-core";

export const STATUS = {
  attivo: { label: "Attivo", color: CP.accentGreen },
  fermo: { label: "Nessun reel da 7 giorni", color: CP.textSecondary },
  sparito: { label: "Sparito", color: CP.accentRed },
  da_leggere: { label: "Da leggere", color: CP.textMuted },
};

const plural = (n, one, many) => `${fmtFull(n)} ${n === 1 ? one : many}`;

function Delta({ v, pctV, suffix = "" }) {
  if (v == null && pctV == null) return <span style={{ color: CP.textMuted }}>—</span>;
  const x = pctV ?? v;
  const color = x > 0 ? CP.accentGreen : x < 0 ? CP.accentRed : CP.textSecondary;
  const txt = pctV != null ? fmtPct(pctV) : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtN(Math.abs(v))}`;
  return <span style={{ color, ...NUM }}>{txt}{suffix}</span>;
}

/** Barre delle view giornaliere (30 giorni). Il giorno senza dati resta vuoto, non a zero. */
export function ViewBars({ series, h = 44, big }) {
  const pts = series || [];
  const max = Math.max(1, ...pts.map((p) => p[1] || 0));
  if (!pts.some((p) => p[1] != null)) return <span style={{ fontSize: 12.5, color: CP.textMuted }}>Nessun dato</span>;
  const H = big ? 160 : h, W = pts.length * 10;
  const tot7 = pts.slice(-7).reduce((s, p) => s + (p[1] || 0), 0);
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} role="img" aria-label={`View al giorno negli ultimi ${pts.length} giorni; ultima settimana ${fmtFull(tot7)}`}>
        {pts.map((p, i) => {
          const v = p[1];
          if (v == null) return null;
          const bh = Math.max(1, (v / max) * (H - 2));
          const last7 = i >= pts.length - 7;
          return <rect key={p[0]} x={i * 10 + 1} y={H - bh} width={8} height={bh} rx={1.5} fill={last7 ? CP.accent : alpha(CP.accent, "55")}><title>{`${fmtDate(Date.parse(p[0]))}: ${fmtFull(v)} view`}</title></rect>;
        })}
      </svg>
      {big && (
        <figcaption style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: CP.textMuted, marginTop: 6 }}>
          <span>{fmtDate(Date.parse(pts[0][0]))}</span><span>in viola pieno gli ultimi 7 giorni</span><span>{fmtDate(Date.parse(pts[pts.length - 1][0]))}</span>
        </figcaption>
      )}
    </figure>
  );
}

function Fig({ label, value, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: CP.textMuted }}>{label}</span>
      <span style={{ fontSize: 22, lineHeight: 1.15, color: CP.textPrimary, ...SERIF, ...NUM }}>{value}</span>
      {sub && <span style={{ fontSize: 12.5 }}>{sub}</span>}
    </div>
  );
}

function SideTag({ m }) {
  const text = m.side === "altra" ? (m.agency ? `Altra agenzia · ${m.agency}` : "Altra agenzia") : m.source === "magazzino" ? "Nostra · dal magazzino" : "Nostra · letta da Apify";
  return <span style={{ fontSize: 12, color: m.side === "altra" ? CP.textSecondary : CP.accentSoftText, border: `1px solid ${m.side === "altra" ? CP.border : alpha(CP.accent, "55")}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{text}</span>;
}

/** Scheda di una modella nell'elenco. */
export function ModelCard({ m, onOpen }) {
  const wh = m.source === "magazzino";
  const c = m.counts || {};
  const accLine = wh
    ? [plural(c.total || 0, "account", "account"), c.fermo ? `${c.fermo} senza reel nuovi` : null, c.sparito ? `${c.sparito} spariti` : null].filter(Boolean).join(" · ")
    : [plural(c.total || 0, "account", "account"), c.sparito ? `${c.sparito} spariti` : null, c.da_leggere ? `${c.da_leggere} da leggere` : null].filter(Boolean).join(" · ");
  return (
    <article className="sr-card" onClick={() => onOpen(m)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(m); }}
      style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16, cursor: "pointer", minWidth: 0 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <Initials name={m.name} size={44} pic={m.accounts?.find((a) => a.pic)?.pic} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, ...SERIF, fontSize: 22, lineHeight: 1.15, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: CP.textSecondary }}>{accLine}{wh && c.nuovi ? <span style={{ color: CP.accentSoftText }}> · {c.nuovi} nuov{c.nuovi === 1 ? "o" : "i"} in settimana</span> : null}</p>
        </div>
        <SideTag m={m} />
      </header>
      {wh ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
            <Fig label="View in 7 giorni" value={fmtN(m.views7)} sub={<Delta pctV={m.viewsPct} suffix=" sulla sett. prima" />} />
            <Fig label="Follower" value={fmtN(m.fol)} sub={<Delta v={m.folDelta} suffix=" in 7 giorni" />} />
            <Fig label="Reel in 7 giorni" value={fmtFull(m.reels7)} sub={<span style={{ color: CP.textMuted }}>{m.viewsPerAccount != null ? `${fmtN(m.viewsPerAccount)} view/giorno per account` : "—"}</span>} />
          </div>
          <ViewBars series={m.series} />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
          <Fig label="Follower" value={fmtN(m.fol)} sub={<Delta v={m.folDelta} suffix=" in settimana" />} />
          <Fig label="View mediane per reel" value={fmtN(m.medv)} sub={<span style={{ color: CP.textMuted }}>metà degli account</span>} />
          <Fig label="Account migliore" value={fmtN(m.bestMedv)} sub={<span style={{ color: CP.textMuted }}>{m.checkedAt ? `letti il ${fmtDate(m.checkedAt)}` : "non ancora letti"}</span>} />
        </div>
      )}
    </article>
  );
}

const linkCell = (h) => <a href={igProfile(h)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>@{h}</a>;
const statusCell = (s) => <span style={{ color: STATUS[s]?.color || CP.textMuted, fontSize: 13 }}>{STATUS[s]?.label || s}</span>;

/** Scheda di dettaglio di una modella: numeri, grafico, tutti i suoi account. */
export function ModelSheet({ m, models, onBack, act, busy, onAdd }) {
  const wh = m.source === "magazzino";
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: m.name, agency: m.agency || "", note: m.note || "", side: m.side });
  const others = models.filter((x) => x.source === "apify" && x.id !== m.id);
  const showClicks = wh && m.accounts.some((a) => a.clicks7 || a.subs7);

  const columns = wh ? [
    { key: "h", label: "Account", render: (a) => <span style={{ display: "inline-flex", flexDirection: "column" }}>{linkCell(a.h)}<span style={{ fontSize: 12, color: CP.textMuted }}>{a.creators.join(" · ")}{a.isNew ? " · nuovo" : ""}</span></span> },
    { key: "status", label: "Stato", render: (a) => statusCell(a.status) },
    { key: "fol", label: "Follower", align: "right", render: (a) => fmtFull(a.fol) },
    { key: "folDelta", label: "In 7 giorni", align: "right", render: (a) => <Delta v={a.folDelta} /> },
    { key: "reels7", label: "Reel 7 gg", align: "right" },
    { key: "views7", label: "View 7 gg", align: "right", render: (a) => fmtFull(a.views7) },
    { key: "viewsPct", label: "Sulla sett. prima", align: "right", render: (a) => <Delta pctV={a.viewsPct} /> },
    ...(showClicks ? [
      { key: "clicks7", label: "Clic in bio 7 gg", align: "right" },
      { key: "subs7", label: "Iscritti 7 gg", align: "right" },
    ] : []),
    { key: "lastSeen", label: "Ultimo dato", align: "right", muted: true, render: (a) => fmtDate(Date.parse(a.lastSeen)) },
  ] : [
    { key: "h", label: "Account", render: (a) => linkCell(a.h) },
    { key: "status", label: "Stato", render: (a) => statusCell(a.status) },
    { key: "fol", label: "Follower", align: "right", render: (a) => fmtFull(a.fol) },
    { key: "folDelta", label: "In settimana", align: "right", render: (a) => <Delta v={a.folDelta} /> },
    { key: "medv", label: "View mediane", align: "right", render: (a) => fmtFull(a.medv) },
    { key: "er", label: "Interazioni", align: "right", render: (a) => (a.er == null ? "—" : `${a.er.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`) },
    { key: "link", label: "Link in bio", render: (a) => (a.link ? <a href={a.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: CP.textSecondary, fontSize: 12.5 }}>{a.link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 34)}</a> : <span style={{ color: CP.textMuted }}>—</span>) },
    { key: "checkedAt", label: "Letto il", align: "right", muted: true, render: (a) => fmtDate(a.checkedAt) },
    { key: "act", label: "", sortable: false, render: (a) => (
      <span style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {others.length > 0 && (
          <select aria-label={`Sposta @${a.h}`} value="" disabled={busy} onChange={(e) => e.target.value && act({ action: "move", h: a.h, modelId: e.target.value }, `@${a.h} spostato.`)} style={{ ...input, padding: "4px 6px", fontSize: 12.5 }}>
            <option value="">Sposta…</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button type="button" disabled={busy} onClick={() => window.confirm(`Togliere @${a.h} dal radar?`) && act({ action: "remove", h: a.h }, `@${a.h} tolto.`)} style={{ ...btnQuiet, minHeight: 0, padding: "4px 6px", fontSize: 12.5 }}>Togli</button>
      </span>
    ) },
  ];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <button type="button" onClick={onBack} style={{ ...btnQuiet, alignSelf: "flex-start", padding: 0 }}>← Tutte le modelle</button>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
          <Initials name={m.name} size={64} pic={m.accounts?.find((a) => a.pic)?.pic} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, ...SERIF, fontSize: 36, lineHeight: 1.05, color: CP.textPrimary }}>{m.name}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
              <SideTag m={m} />
              <span style={{ fontSize: 13, color: CP.textSecondary }}>{plural(m.counts.total, "account", "account")}{wh && m.day ? ` · dati al ${fmtDate(Date.parse(m.day))}` : ""}</span>
            </div>
          </div>
        </div>
        {!wh && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={btnPrimary} onClick={() => onAdd(m)}>Aggiungi account</button>
            <button type="button" style={btn} onClick={() => setEdit((v) => !v)}>{edit ? "Chiudi" : "Modifica"}</button>
          </div>
        )}
      </header>

      {edit && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "model", id: m.id, patch: form }, "Salvato.")) setEdit(false); }}
          style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", padding: 16, border: `1px solid ${CP.border}`, borderRadius: 14, background: CP.surface }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted }}>Nome<input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted }}>Di chi è
            <select style={input} value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}><option value="altra">Altra agenzia</option><option value="nostra">Nostra</option></select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted }}>Agenzia (se si sa)<input style={input} value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted, gridColumn: "1 / -1" }}>Nota (cosa ci interessa di lei: format, ritmo, come nasconde il link)
            <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1", justifyContent: "space-between", flexWrap: "wrap" }}>
            <button type="submit" disabled={busy} style={btnPrimary}>Salva</button>
            <button type="button" disabled={busy} style={{ ...btnQuiet, color: CP.accentRed }} onClick={() => window.confirm(`Togliere ${m.name} e i suoi ${m.counts.total} account dal radar?`) && act({ action: "deleteModel", id: m.id }, "Modella tolta.").then((ok) => ok && onBack())}>Togli la modella dal radar</button>
          </div>
        </form>
      )}
      {!edit && m.note && <p style={{ margin: 0, fontSize: 14.5, color: CP.textSecondary, maxWidth: 760, whiteSpace: "pre-wrap" }}>{m.note}</p>}

      {wh ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
            <Fig label="View in 7 giorni" value={fmtN(m.views7)} sub={<Delta pctV={m.viewsPct} suffix=" sulla sett. prima" />} />
            <Fig label="Follower" value={fmtN(m.fol)} sub={<Delta v={m.folDelta} suffix=" in 7 giorni" />} />
            <Fig label="Reel in 7 giorni" value={fmtFull(m.reels7)} sub={<span style={{ color: CP.textMuted }}>{m.counts.attivo} account attivi</span>} />
            <Fig label="View al giorno per account" value={fmtN(m.viewsPerAccount)} sub={<span style={{ color: CP.textMuted }}>media sulla settimana</span>} />
            {showClicks && <Fig label="Iscritti da Instagram" value={fmtFull(m.subs7)} sub={<span style={{ color: CP.textMuted }}>{fmtFull(m.clicks7)} clic in bio</span>} />}
          </div>
          <div>
            <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>View al giorno, tutti gli account</h3>
            <ViewBars series={m.series} big />
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
          <Fig label="Follower" value={fmtN(m.fol)} sub={<Delta v={m.folDelta} suffix=" in settimana" />} />
          <Fig label="View mediane per reel" value={fmtN(m.medv)} sub={<span style={{ color: CP.textMuted }}>l&apos;account a metà</span>} />
          <Fig label="Account migliore" value={fmtN(m.bestMedv)} sub={<span style={{ color: CP.textMuted }}>view mediane</span>} />
          <Fig label="Account attivi" value={fmtFull(m.counts.attivo)} sub={<span style={{ color: CP.textMuted }}>{m.checkedAt ? `letti il ${fmtDate(m.checkedAt)}` : "non ancora letti"}</span>} />
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Gli account</h3>
        <DataTable columns={columns} rows={m.accounts.map((a) => ({ ...a, id: a.h }))} defaultSort={{ key: wh ? "views7" : "fol", dir: -1 }} minWidth={wh ? 820 : 900} empty="Nessun account: aggiungili con «Aggiungi account»." />
        <Spiega style={{ marginTop: 10 }}>
          {wh ? (
            <>
              <p style={{ margin: "0 0 6px" }}>Numeri dal magazzino, un giorno alla volta: le view sono quelle fatte in quei giorni da tutti i reel dell&apos;account, anche i vecchi. «Nessun reel da 7 giorni» = non pubblica, anche se i reel vecchi fanno ancora view. «Sparito» = da 2 giorni il magazzino non lo trova più: bannato, chiuso o scollegato.</p>
              <p style={{ margin: 0 }}>Clic in bio e iscritti compaiono solo quando l&apos;account ha un link tracciato.</p>
            </>
          ) : (
            <p style={{ margin: 0 }}>Numeri letti da Instagram una volta a settimana (lo stesso giro del Radar creator): follower e view MEDIANE dei reel recenti. Non si confrontano con le view al giorno delle nostre, che vengono dal magazzino e si contano in un altro modo. «Sparito» = non trovato per due giri di fila.</p>
          )}
        </Spiega>
      </div>
    </section>
  );
}

/** Finestra «Aggiungi profili»: link o @nomi → una modella esistente o una nuova. */
export function AddDialog({ open, onClose, models, preset, act, busy }) {
  const manual = useMemo(() => models.filter((m) => m.source === "apify"), [models]);
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [nm, setNm] = useState({ name: "", side: "altra", agency: "" });
  const [res, setRes] = useState(null);
  const handles = parseHandles(preset?.handles ? preset.handles.join(" ") : text);
  const modelId = preset?.modelId || target;
  const isNew = !modelId;

  const reset = () => { setText(""); setTarget(""); setNm({ name: "", side: "altra", agency: "" }); setRes(null); };
  const close = () => { reset(); onClose(); };

  async function submit(e) {
    e.preventDefault();
    const out = await act({ action: "add", handles, modelId: modelId || undefined, newModel: isNew ? nm : undefined }, null, true);
    if (out) setRes(out);
  }

  return (
    <Modal open={open} onClose={close} title={preset?.modelName ? `Aggiungi account a ${preset.modelName}` : "Aggiungi profili"} maxWidth={560}>
      {res ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Notice>
            {res.added.length ? `Aggiunti ${plural(res.added.length, "account", "account")}` : "Nessun account aggiunto"}
            {res.added.length ? (res.read ? `, ${res.read} già letti da Instagram.` : ".") : "."}
            {res.skipped?.length ? ` ${res.skipped.map((h) => `@${h}`).join(", ")} ${res.skipped.length === 1 ? "è già" : "sono già"} tra le nostre dal magazzino.` : ""}
            {res.readErr ? ` I numeri non sono arrivati (${res.readErr}): li legge il giro della settimana.` : ""}
          </Notice>
          <div style={{ display: "flex", gap: 8 }}><button type="button" style={btnPrimary} onClick={close}>Fatto</button><button type="button" style={btn} onClick={reset}>Aggiungine altri</button></div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {preset?.handles ? (
            <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>{handles.map((h) => `@${h}`).join(", ")}</p>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: CP.textSecondary }}>
              Link dei profili Instagram o @nomi, anche tanti insieme
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://www.instagram.com/…\n@nome.account"} style={{ ...input, minHeight: 110, resize: "vertical", fontFamily: FONTS.body }} />
              <span style={{ fontSize: 12.5, color: CP.textMuted }}>{handles.length ? `${plural(handles.length, "account riconosciuto", "account riconosciuti")}` : "I link ai reel non bastano: serve il profilo."}</span>
            </label>
          )}
          {!preset?.modelId && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: CP.textSecondary }}>
              Di quale modella sono
              <select value={target} onChange={(e) => setTarget(e.target.value)} style={input}>
                <option value="">Una modella nuova</option>
                {manual.filter((m) => m.side === "altra").length > 0 && <optgroup label="Altre agenzie">{manual.filter((m) => m.side === "altra").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
                {manual.filter((m) => m.side === "nostra").length > 0 && <optgroup label="Nostre (lette da Apify)">{manual.filter((m) => m.side === "nostra").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
              </select>
            </label>
          )}
          {isNew && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted }}>Nome della modella<input required style={input} value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} placeholder="Come la chiamiamo" /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted }}>Di chi è
                <select style={input} value={nm.side} onChange={(e) => setNm({ ...nm, side: e.target.value })}><option value="altra">Altra agenzia</option><option value="nostra">Nostra</option></select>
              </label>
              {nm.side === "altra" && <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CP.textMuted }}>Agenzia (se si sa)<input style={input} value={nm.agency} onChange={(e) => setNm({ ...nm, agency: e.target.value })} /></label>}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12.5, color: CP.textMuted }}>Follower, view mediane e link in bio si leggono subito (circa 1 centesimo ad account), poi ogni settimana. Gli account che il magazzino segue già restano in «Le nostre».</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={busy || !handles.length || (isNew && !nm.name.trim())} style={{ ...btnPrimary, opacity: busy || !handles.length ? 0.6 : 1 }}>{busy ? "Leggo i profili…" : `Aggiungi${handles.length ? ` ${handles.length}` : ""}`}</button>
            <button type="button" style={btn} onClick={close}>Annulla</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
