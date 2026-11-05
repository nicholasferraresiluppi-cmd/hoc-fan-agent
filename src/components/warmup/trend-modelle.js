"use client";

// Trend modelle, livello 1 (scheda di Social): i reel esplosi rispetto al solito del loro profilo,
// letti ogni notte dal warehouse (profili stranieri di trendfinder + i nostri), con il format
// descritto dall'AI dalla copertina. Qui si raggruppano a mano in FORMAT: un format è un trend
// quando lo fanno almeno 3 profili stranieri diversi. Logica in lib/trend-modelle-core.js.
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check, ExternalLink, FolderPlus, Layers, Music, Pencil, Play, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { CP, alpha } from "@/lib/brand";
import { Notice, NUM, FilterBar, Tabs, Spiega } from "@/components/ds";
import { confirmDialog } from "@/components/AppDialogs";
import { btn, btnPrimary, btnSm, input, cardBox, hint, Seg, Chip, ModalBox, Field } from "@/components/warmup/ui";
import { shortNum, ageLabel, timesLabel } from "@/lib/clip-radar-core";
import { LANES, LEVEL_LABEL, levelHint, HIT_TIMES, HIT_VIEWS, TREND_ACCOUNTS, FRESH_DAYS } from "@/lib/trend-modelle-core";
import HeroHead, { BigNum } from "@/components/HeroHead";

const API = "/api/admin/trend-modelle";
const fetcher = (u) => fetch(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Errore di caricamento"); return d; });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const reelUrl = (id) => `https://www.instagram.com/reel/${id}/`;
const igUrl = (h) => `https://www.instagram.com/${h}/`;
const day = (t) => (t ? new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");
const LEVEL_COLOR = { trend: CP.accentGreen, watch: CP.accent, single: CP.textMuted };
const ADATTO = { si: ["adatto", CP.accentGreen], forse: ["forse adatto", CP.attn], no: ["non adatto", CP.textMuted] };
const SCRIM = "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.78) 100%)";
const SORTS = [["times", "Più fuori dal solito"], ["recent", "Più recenti"], ["views", "Più visualizzazioni"]];
const selSt = { ...input, width: "auto", fontSize: 13.5, padding: "7px 10px" };

// La copertina con sopra il multiplo e le visualizzazioni (stesso disegno del Radar del clipping)
function Cover({ h, small }) {
  const [broken, setBroken] = useState(false);
  return (
    <a href={reelUrl(h.id)} target="_blank" rel="noopener noreferrer" className="tm-cover" style={{ position: "relative", display: "block", aspectRatio: "9 / 16", borderRadius: small ? 10 : 14, overflow: "hidden", background: CP.surfaceAlt }}>
      {h.cover && !broken
        ? <img src={h.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: CP.textMuted }}><Play size={small ? 20 : 28} /></div>}
      <div style={{ position: "absolute", inset: 0, background: SCRIM, pointerEvents: "none" }} />
      {h.times != null && (
        <span title={`${String(h.times).replace(".", ",")} volte le visualizzazioni tipiche di questo profilo (di solito ${shortNum(h.base)})`}
          style={{ position: "absolute", top: small ? 6 : 10, left: small ? 6 : 10, padding: small ? "2px 7px" : "3px 9px", borderRadius: 999, fontSize: small ? 11.5 : 13.5, fontWeight: 500, background: h.collab ? CP.panel : h.times >= 5 ? CP.accentGreen : CP.accent, color: h.collab ? CP.textSecondary : CP.accentInk, ...NUM }}>
          {timesLabel(h.times, { short: small })}
        </span>
      )}
      {!small && h.ageH != null && <span style={{ position: "absolute", top: 10, right: 10, padding: "3px 8px", borderRadius: 999, fontSize: 11.5, background: "rgba(0,0,0,.45)", color: "#fff" }}>{ageLabel(h.ageH)}</span>}
      <div style={{ position: "absolute", left: small ? 7 : 12, right: small ? 7 : 12, bottom: small ? 6 : 10, color: "#fff" }}>
        <div style={{ fontSize: small ? 15 : 24, fontWeight: 500, lineHeight: 1, letterSpacing: -0.5, ...NUM }}>{shortNum(h.views)}</div>
        {!small && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3, ...NUM }}>di solito {shortNum(h.base)}</div>}
      </div>
    </a>
  );
}

// Quello che l'AI ha letto nella copertina: il format in una riga, la scritta, se è adatto
function Desc({ d }) {
  const [label, color] = ADATTO[d.adatto] || ADATTO.forse;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 13.5, color: CP.textPrimary, lineHeight: 1.4 }}>{d.formato}</div>
      {d.scritta && <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.4 }}>«{d.scritta}»</div>}
      {d.svolta && <div style={{ ...hint, fontSize: 12 }}>Svolta: {d.svolta}</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Chip color={color} title={d.perche || undefined}>{label}</Chip>
        {d.perche && <span style={{ ...hint, fontSize: 12 }}>{d.perche}</span>}
      </div>
    </div>
  );
}

function HitCard({ h, i, formatsById, ai, busy, onDescribe, onFormat }) {
  const inF = (h.formats || []).map((id) => formatsById[id]).filter(Boolean);
  return (
    <div className="tm-card" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 9, animationDelay: `${Math.min(i, 16) * 35}ms` }}>
      <Cover h={h} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 2px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <a href={igUrl(h.handle)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: CP.textPrimary, textDecoration: "none", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>@{h.handle}</a>
          <span style={{ fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap" }}>{LANES[h.lane]}</span>
        </div>
        {(h.collab || h.young || inF.length > 0) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {h.collab && <Chip color={CP.attn} title="Reel pubblicato insieme a un altro profilo: la spinta può venire dal suo pubblico, non dal format. Non conta per i trend.">collab con @{h.coauthors[0]}{h.coauthors.length > 1 ? ` +${h.coauthors.length - 1}` : ""}</Chip>}
            {h.young && <Chip title="Uscito da meno di 3 giorni: sta ancora crescendo">giovane</Chip>}
            {inF.map((f) => <Chip key={f.id} color={CP.accent}>{f.name}</Chip>)}
          </div>
        )}
        {h.desc ? <Desc d={h.desc} />
          : h.caption ? <p style={{ fontSize: 12.5, color: CP.textSecondary, margin: 0, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.caption}</p> : null}
        {h.audioTitle && h.audioTitle !== "Original audio" && <div style={{ ...hint, fontSize: 12, display: "flex", gap: 5, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><Music size={12} style={{ flex: "0 0 auto" }} />{h.audioTitle}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        {!h.desc && ai && <button type="button" style={{ ...btnSm, flex: 1 }} disabled={!!busy} onClick={() => onDescribe(h.id)} title="L'AI legge la copertina e scrive il format (~1 cent)"><Sparkles size={13} />{busy === `d:${h.id}` ? "Leggo…" : "Descrivi"}</button>}
        <button type="button" style={{ ...btnSm, flex: 1 }} onClick={() => onFormat(h)}><FolderPlus size={13} />{inF.length ? "Altro format" : "Al format"}</button>
      </div>
    </div>
  );
}

function FormatCard({ f, busy, onEdit, onDelete, onRemove }) {
  const st = f.status;
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(f.name);
  const [note, setNote] = useState(f.note || "");
  const example = f.items.find((it) => it.desc)?.desc;
  return (
    <div style={{ ...cardBox, padding: "16px 18px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{f.name}</span>
            <Chip color={LEVEL_COLOR[st.level]}>{LEVEL_LABEL[st.level]}</Chip>
          </div>
          <div style={{ ...hint, marginTop: 4 }}>{levelHint(st)}</div>
          {f.note && !edit && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>{f.note}</div>}
          {example && !f.note && !edit && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>{example.formato}</div>}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Num label="Profili stranieri" v={st.intAccounts} strong={st.level === "trend"} />
          <Num label="Nostre" v={st.oursAccounts} />
          <Num label="Primo straniero" v={day(st.firstInt)} />
          {st.leadDays != null && <Num label="Anticipo" v={`${st.leadDays} g`} title="Giorni fra il primo profilo straniero e la prima delle nostre: è l'anticipo che misuriamo noi" />}
        </div>
      </div>
      {edit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input style={{ ...input, flex: "1 1 200px" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome del format" />
          <input style={{ ...input, flex: "2 1 280px" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Come si rifà, in una frase (facoltativo)" />
          <button type="button" style={btnSm} disabled={!!busy} onClick={async () => { if (await onEdit(f.id, name, note)) setEdit(false); }}><Check size={13} />Salva</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10, marginTop: 14 }}>
        {f.items.map((it) => (
          <div key={it.id} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <Cover h={it} small />
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 11.5, color: it.lane === "ours" ? CP.accent : CP.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={`${LANES[it.lane]} · ${day(it.postedAt)}`}>@{it.handle}</span>
              <button type="button" aria-label="Togli dal format" disabled={!!busy} onClick={() => onRemove(f.id, it.id)} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: CP.textMuted, display: "flex" }}><X size={12} /></button>
            </div>
            <span style={{ fontSize: 11, color: CP.textMuted, ...NUM }}>{day(it.postedAt)}{it.collab ? " · collab" : ""}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button type="button" style={btnSm} onClick={() => setEdit(!edit)}><Pencil size={13} />{edit ? "Chiudi" : "Nome e nota"}</button>
        <button type="button" style={{ ...btnSm, color: CP.accentRed }} disabled={!!busy} onClick={() => onDelete(f)}><Trash2 size={13} />Cancella</button>
      </div>
    </div>
  );
}

function Num({ label, v, strong, title }) {
  return (
    <div title={title} style={{ minWidth: 64 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: strong ? CP.accentGreen : CP.textPrimary, ...NUM }}>{v}</div>
    </div>
  );
}

const TM_CSS = `
  @keyframes tmIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
  .tm-card { animation: tmIn .45s cubic-bezier(.2,.7,.2,1) both }
  .tm-cover { transition: transform .2s ease, box-shadow .2s ease }
  .tm-cover:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,.18) }
  @media (prefers-reduced-motion: reduce) { .tm-card { animation: none } .tm-cover { transition: none } }
`;

export default function TrendModelle() {
  const { data, error, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [view, setView] = useState("hits");
  const [lane, setLane] = useState("int");
  const [period, setPeriod] = useState("7");
  const [collabs, setCollabs] = useState("out");
  const [sort, setSort] = useState("times");
  const [picking, setPicking] = useState(null); // il reel da mettere in un format
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 720px)");
    const f = () => setWide(m.matches);
    f(); m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  const run = async (label, body, okText) => {
    setBusy(label); setMsg(null);
    try { const d = await post(body); setMsg(okText ? okText(d) : null); await mutate(); return d || true; }
    catch (e) { setMsg(e.message); return null; }
    finally { setBusy(null); }
  };

  const hits = data?.hits || [];
  const shown = useMemo(() => {
    const now = data?.now || Date.now();
    const key = { times: (h) => h.times, recent: (h) => h.postedAt, views: (h) => h.views }[sort];
    return hits
      .filter((h) => h.lane === lane && (collabs === "in" || !h.collab) && now - h.postedAt <= Number(period) * 86_400_000)
      .sort((a, b) => key(b) - key(a))
      .slice(0, 80);
  }, [hits, lane, collabs, period, sort, data?.now]);

  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={hint}>Carico…</p>;

  const formats = data.formats || [];
  const formatsById = Object.fromEntries(formats.map((f) => [f.id, f]));
  const week = hits.filter((h) => !h.collab && data.now - h.postedAt <= 7 * 86_400_000);
  const nTrend = formats.filter((f) => f.status.level === "trend").length;
  const nWatch = formats.filter((f) => f.status.level === "watch").length;
  const lastRun = data.at ? new Date(data.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const laneCount = (l) => hits.filter((h) => h.lane === l && (collabs === "in" || !h.collab) && data.now - h.postedAt <= Number(period) * 86_400_000).length;
  const autos = (data.auto || []).filter((g) => !formats.some((f) => g.ids.every((id) => f.items.some((it) => it.id === id))));

  const toFormat = async (fid, name) => {
    const ok = fid
      ? await run("fmt", { action: "format_add", id: fid, hitId: picking.id }, () => `Aggiunto a «${formatsById[fid]?.name}».`)
      : await run("fmt", { action: "format_new", name, hitId: picking.id }, () => `Format «${name.trim()}» creato.`);
    if (ok) setPicking(null);
  };
  const fromAuto = async (g) => {
    const name = g.kind === "audio" ? `Audio «${g.label}»` : g.label;
    const d = await run("auto", { action: "format_new", name: name.slice(0, 80) }, null);
    if (!d?.id) return;
    for (const id of g.ids) await post({ action: "format_add", id: d.id, hitId: id }).catch(() => {});
    await mutate();
    setView("formats");
  };

  return (
    <div>
      <style>{TM_CSS}</style>
      <HeroHead eyebrow="Trend modelle" title="Reel esplosi" accent={view === "hits" ? (lane === "int" ? "da fuori" : "delle nostre") : "e format"}
        sub={`«5× il solito» = cinque volte le visualizzazioni di un reel normale di quel profilo. Un format è un trend quando lo fanno ${TREND_ACCOUNTS} profili stranieri diversi.`}
        numbers={<>
          <BigNum label="Profili osservati" value={(data.accounts?.int || 0) + (data.accounts?.ours || 0)} title={`${data.accounts?.int || 0} stranieri, ${data.accounts?.ours || 0} nostri`} />
          <BigNum label="Esplosi in 7 giorni" value={week.length} title="Collab escluse" />
          <BigNum label="In osservazione" value={nWatch} />
          <BigNum label="Trend" value={nTrend} strong />
        </>} />
      {!data.configured && <Notice danger>BigQuery non è configurato su questo ambiente: i reel non si possono leggere.</Notice>}
      {data.configured && !data.at && <Notice>Nessuna lettura ancora: la prima arriva con il giro di stanotte, oppure premi «Rileggi adesso» in fondo.</Notice>}
      {data.run && data.run.ok === false && <Notice danger>L'ultima lettura non è riuscita: {data.run.error}</Notice>}

      <Tabs small items={[["hits", "Reel esplosi"], ["formats", `Format · ${formats.length}`]]} value={view} onChange={setView} />
      {msg && <Notice>{msg}</Notice>}

      {view === "hits" ? (
        <>
          <FilterBar onReset={period !== "7" || collabs !== "out" || sort !== "times" ? () => { setPeriod("7"); setCollabs("out"); setSort("times"); } : null}>
            <Seg items={[["int", `Da fuori · ${laneCount("int")}`], ["ours", `Le nostre · ${laneCount("ours")}`]]} value={lane} onChange={setLane} />
            <select aria-label="Periodo" style={selSt} value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="3">Ultimi 3 giorni</option><option value="7">Ultimi 7 giorni</option><option value={String(FRESH_DAYS)}>Ultimi {FRESH_DAYS} giorni</option>
            </select>
            <select aria-label="Collab" style={selSt} value={collabs} onChange={(e) => setCollabs(e.target.value)}>
              <option value="out">Senza collab</option><option value="in">Anche le collab</option>
            </select>
            <select aria-label="Ordina" style={selSt} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>Ordina: {l.toLowerCase()}</option>)}
            </select>
          </FilterBar>

          {autos.length > 0 && lane === "int" && (
            <div style={{ ...cardBox, padding: "12px 16px" }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}><Layers size={15} />Già insieme nei dati</div>
              <p style={{ ...hint, margin: "0 0 8px" }}>Reel con lo stesso audio o fatti con lo stesso modello di Instagram, su più profili stranieri.</p>
              {autos.map((g) => (
                <div key={g.key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                  <span style={{ fontSize: 13.5, color: CP.textPrimary, display: "flex", gap: 5, alignItems: "center" }}>{g.kind === "audio" ? <Music size={13} /> : <Layers size={13} />}{g.label}</span>
                  <span style={{ ...hint, ...NUM }}>{g.status.intAccounts} profili stranieri{g.status.oursAccounts ? ` · ${g.status.oursAccounts} nostre` : ""} · {g.ids.length} reel</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" style={btnSm} disabled={!!busy} onClick={() => fromAuto(g)}><FolderPlus size={13} />{busy === "auto" ? "Creo…" : "Crea format"}</button>
                </div>
              ))}
            </div>
          )}

          {!shown.length ? (
            <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
              <p style={{ ...hint, margin: "0 0 12px", fontSize: 14 }}>{!data.at ? "Ancora nessuna lettura." : "Nessun reel esploso con questi filtri."}</p>
              {data.at && period !== String(FRESH_DAYS) && <button type="button" style={btn} onClick={() => setPeriod(String(FRESH_DAYS))}>Mostra gli ultimi {FRESH_DAYS} giorni</button>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(auto-fill, minmax(200px, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: wide ? 18 : 12, alignItems: "start", marginTop: 4 }}>
              {shown.map((h, i) => (
                <HitCard key={`${lane}|${sort}|${h.id}`} h={h} i={i} formatsById={formatsById} ai={data.ai} busy={busy}
                  onDescribe={(id) => run(`d:${id}`, { action: "describe", hitId: id }, null)} onFormat={setPicking} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {!formats.length ? (
            <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
              <p style={{ ...hint, margin: "0 0 12px", fontSize: 14 }}>Nessun format ancora. Nei reel esplosi, quando vedi la stessa idea su più profili, premi «Al format» e dagli un nome.</p>
              <button type="button" style={btn} onClick={() => setView("hits")}>Vai ai reel esplosi</button>
            </div>
          ) : formats.map((f) => (
            <FormatCard key={f.id} f={f} busy={busy}
              onEdit={(id, name, note) => run("edit", { action: "format_edit", id, name, note }, null)}
              onRemove={(id, hitId) => run("rm", { action: "format_remove", id, hitId }, null)}
              onDelete={async (fm) => {
                if (!(await confirmDialog(`Cancellare il format «${fm.name}»? I reel restano negli esplosi.`, { title: "Cancella format", ok: "Cancella", danger: true }))) return;
                run("del", { action: "format_delete", id: fm.id }, null);
              }} />
          ))}
        </>
      )}

      <Spiega label={`Come si leggono i numeri · lettura ogni notte${lastRun ? `, l'ultima ${lastRun}` : ""}`} style={{ marginTop: 14 }}>
        <p style={{ margin: 0 }}>
          <b>Da dove arrivano i reel.</b> «Da fuori» sono {data.accounts?.int || 0} profili Instagram stranieri della nostra nicchia, fotografati ogni giorno nel warehouse (trendfinder). «Le nostre» sono i profili delle nostre creator. Niente TikTok e niente profili italiani di altri, per ora.
        </p>
        <p style={{ margin: 0 }}>
          <b>Esploso.</b> Almeno {HIT_TIMES} volte il solito del profilo e almeno {shortNum(HIT_VIEWS)} visualizzazioni, uscito negli ultimi {FRESH_DAYS} giorni. Il solito è la mediana dei suoi reel di 7-60 giorni (servono almeno 5; i fissati non contano). I profili che di solito fanno meno di mille sono esclusi: lì basta poco per un multiplo enorme.
        </p>
        <p style={{ margin: 0 }}>
          <b>Collab.</b> Un reel pubblicato insieme a un altro profilo prende anche il pubblico dell&apos;altro: si vede, ma non conta per i trend (il caso della GTR di Giulia: 1,85 milioni, ma la spinta era della collab).
        </p>
        <p style={{ margin: 0 }}>
          <b>Format e trend.</b> L&apos;AI legge la copertina e scrive il format in una riga; raggruppare resta a voi, perché i confronti automatici tra video sbagliano spesso. Un format con 2 profili stranieri è «in osservazione», con {TREND_ACCOUNTS} è un «trend». Le nostre non contano nel conteggio (le sorelle della stessa creator rifanno lo stesso reel), ma il format dice se l&apos;abbiamo già fatto e con quanti giorni di ritardo sul primo straniero.
        </p>
        <p style={{ margin: 0, ...NUM }}>
          Ultima lettura {data.gb != null ? `${String(data.gb).replace(".", ",")} GB di warehouse (~${String(Math.round(data.gb * 0.00625 * 100) / 100).replace(".", ",")} $)` : "—"} · descrizioni AI del mese ~{String(data.spent).replace(".", ",")} $ su un tetto di {data.cap} $.
        </p>
        <div><button type="button" style={btnSm} disabled={!!busy} onClick={() => run("refresh", { action: "refresh" }, (d) => `Letti ${d.hits} reel esplosi${d.ai?.described ? `, ${d.ai.described} descritti` : ""}.`)}><RefreshCw size={13} />{busy === "refresh" ? "Leggo… (fino a due minuti)" : "Rileggi adesso"}</button></div>
      </Spiega>

      {picking && (
        <PickFormat h={picking} formats={formats} busy={busy === "fmt"} onClose={() => setPicking(null)} onPick={toFormat} />
      )}
    </div>
  );
}

function PickFormat({ h, formats, busy, onClose, onPick }) {
  const free = formats.filter((f) => !f.items.some((it) => it.id === h.id));
  const [sel, setSel] = useState(free.length ? free[0].id : "new");
  const [name, setName] = useState(h.desc?.formato?.slice(0, 80) || "");
  const canGo = sel !== "new" || name.trim().length >= 3;
  return (
    <ModalBox title="Metti il reel in un format" sub={`@${h.handle} · ${timesLabel(h.times)}. Un format raccoglie i reel con la stessa idea: quando lo fanno ${TREND_ACCOUNTS} profili stranieri è un trend.`}
      onClose={onClose}
      foot={<>
        <button type="button" style={btn} onClick={onClose}>Annulla</button>
        <button type="button" style={btnPrimary} disabled={busy || !canGo} onClick={() => onPick(sel === "new" ? null : sel, name)}><FolderPlus size={15} />{busy ? "Salvo…" : sel === "new" ? "Crea format" : "Aggiungi"}</button>
      </>}>
      {free.length > 0 && (
        <Field label="Format esistente">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {free.map((f) => (
              <label key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                <input type="radio" name="fmt" checked={sel === f.id} onChange={() => setSel(f.id)} />
                <span style={{ flex: 1 }}>{f.name}</span>
                <span style={{ ...hint, ...NUM }}>{f.status.intAccounts} stranieri</span>
              </label>
            ))}
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="radio" name="fmt" checked={sel === "new"} onChange={() => setSel("new")} />
              <span>Nuovo format</span>
            </label>
          </div>
        </Field>
      )}
      {sel === "new" && (
        <Field label="Nome del nuovo format" hint="Generico, rifacibile da un'altra creator: «Domanda giudicante + reveal sotto la tuta».">
          <input autoFocus style={input} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canGo && !busy) onPick(null, name); }} placeholder="Nome del format" />
        </Field>
      )}
      <a href={reelUrl(h.id)} target="_blank" rel="noopener noreferrer" style={{ ...hint, display: "inline-flex", gap: 5, alignItems: "center", color: CP.accentSoftText || CP.accent }}><ExternalLink size={12} />Apri il reel su Instagram</a>
    </ModalBox>
  );
}
