"use client";

// Radar del clipping (scheda di Social): i profili Instagram/TikTok che il publisher tiene
// d'occhio e i loro video usciti dal solito. Logica in lib/clip-radar-core.js, dati da
// /api/admin/clip-radar (lettura notturna con Apify, solo profili pubblici).
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Bookmark, BookmarkCheck, Download, ExternalLink, Music, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { CP, alpha } from "@/lib/brand";
import { Notice, NUM, FilterBar } from "@/components/ds";
import { confirmDialog } from "@/components/AppDialogs";
import { btn, btnPrimary, btnSm, input, cardBox, hint, Seg, Chip, ModalBox, Field } from "@/components/warmup/ui";
import { shortNum, ageLabel, profileUrl, timesLabel, isSmallBase } from "@/lib/clip-radar-core";
import { deliverFiles } from "@/lib/editoriale-download";
import HeroHead, { BigNum } from "@/components/HeroHead";

const API = "/api/admin/clip-radar";
const fetcher = (u) => fetch(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Errore di caricamento"); return d; });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const PLAT = { ig: "Instagram", tt: "TikTok" };
const outColor = (o) => (o == null ? CP.textMuted : o >= 3 ? CP.accentGreen : o >= 1.5 ? CP.accent : CP.textMuted);
const SORTS = [["outlier", "Fuori dal solito"], ["speed", "Più veloci adesso"], ["views", "Più visualizzazioni"], ["likes", "Più like"], ["comments", "Più commenti"], ["shares", "Più condivisioni"], ["recent", "Più recenti"]];

// Copertina protagonista (29/10, stile del reel scelto da Nicholas: «più chiaro»): il video in
// grande, sopra l'immagine solo il multiplo e le visualizzazioni. Il velo scuro in basso è fisso
// (sta su una foto, non su una superficie dell'app: in tema chiaro il testo bianco resta leggibile).
const SCRIM = "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.78) 100%)";
function Cover({ v, big }) {
  const [broken, setBroken] = useState(false);
  return (
    <a href={v.url} target="_blank" rel="noopener noreferrer" className="cr-cover" style={{ position: "relative", display: "block", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", background: CP.surfaceAlt }}>
      {v.cover && !broken
        ? <img src={v.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: CP.textMuted }}><Play size={big ? 40 : 28} /></div>}
      <div style={{ position: "absolute", inset: 0, background: SCRIM, pointerEvents: "none" }} />
      {v.outlier != null && !big && (
        <span title={`${String(v.outlier).replace(".", ",")} volte le visualizzazioni tipiche di questo profilo (di solito ${shortNum(v.base)}, mediana dei suoi video degli ultimi 30 giorni)`} style={{ position: "absolute", top: 10, left: 10, padding: big ? "5px 12px" : "3px 9px", borderRadius: 999, fontSize: big ? 17 : 13.5, fontWeight: 500, background: v.outlier >= 1.5 && !isSmallBase(v.base) ? (v.outlier >= 3 ? CP.accentGreen : CP.accent) : CP.panel, color: v.outlier >= 1.5 && !isSmallBase(v.base) ? CP.accentInk : CP.textSecondary, ...NUM }}>{timesLabel(v.outlier)}</span>
      )}
      <span style={{ position: "absolute", top: 10, right: 10, padding: "3px 8px", borderRadius: 999, fontSize: 11.5, background: "rgba(0,0,0,.45)", color: "#fff" }}>{ageLabel(v.ageH)}</span>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 10, color: "#fff", display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: big ? 38 : 24, fontWeight: 500, lineHeight: 1, letterSpacing: -0.5, ...NUM }}>{shortNum(v.views)}</div>
          <div style={{ fontSize: big ? 13.5 : 12, opacity: 0.85, marginTop: 3, ...NUM }}>{v.base != null ? `di solito ${shortNum(v.base)}` : "visualizzazioni"}</div>
        </div>
        {v.duration != null && <span style={{ fontSize: 12, opacity: 0.85, ...NUM }}>{v.duration}s</span>}
      </div>
    </a>
  );
}

// «Scarica»: il file originale a pezzi dal server (ogni risposta resta piccola), poi rullino o download
async function fetchVideo(v, onProgress) {
  const url = `${API}?media=${encodeURIComponent(v.id)}&p=${encodeURIComponent(v.profileId)}`;
  const parts = [];
  let pos = 0, size = null, type = "video/mp4", name = v.id.replace(":", "-");
  do {
    const r = await fetch(url, { headers: { Range: `bytes=${pos}-` } });
    if (!r.ok && r.status !== 206) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Il video non si scarica: riprova"); }
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(r.headers.get("content-range") || "");
    type = r.headers.get("content-type") || type;
    name = r.headers.get("x-file-name") || name;
    parts.push(await r.blob());
    if (!m) break;
    pos = Number(m[2]) + 1; size = Number(m[3]);
    onProgress?.(Math.min(1, pos / size));
  } while (pos < size);
  return new File(parts, `${name}.mp4`, { type });
}

function DownloadBtn({ v }) {
  const [st, setSt] = useState(null); // null | number (avanzamento) | File pronto | "err:…"
  if (!v.canDownload) return <a href={v.url} target="_blank" rel="noopener noreferrer" title={v.platform === "tt" ? "Da TikTok per ora si scarica dall'app" : "Link del video non ancora letto: arriva con la prossima lettura"} style={{ ...btnSm, flex: 1, textDecoration: "none" }}><ExternalLink size={13} />Apri</a>;
  if (st instanceof File) return <button type="button" style={{ ...btnSm, flex: 1, color: CP.accent }} onClick={async () => { await deliverFiles([st], { share: true }); setSt(null); }}><Download size={13} />Salva</button>;
  return (
    <button type="button" style={{ ...btnSm, flex: 1 }} disabled={typeof st === "number"} title={typeof st === "string" ? st.slice(4) : "Il video originale, in alta qualità"}
      onClick={async () => {
        setSt(0);
        try {
          const f = await fetchVideo(v, (p) => setSt(p));
          const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
          if (phone) setSt(f); // il telefono apre il menu di condivisione solo subito dopo un tocco
          else { await deliverFiles([f]); setSt(null); }
        } catch (e) { setSt("err:" + e.message); }
      }}>
      <Download size={13} />{typeof st === "number" ? `${Math.round(st * 100)}%` : typeof st === "string" ? "Riprova" : "Scarica"}
    </button>
  );
}

function VideoCard({ v, saved, onSave, busy, big, i = 0 }) {
  const extra = [
    v.perHour != null && `${shortNum(v.perHour)}/ora`,
    v.likes != null && `${shortNum(v.likes)} like`,
    v.comments != null && `${shortNum(v.comments)} commenti`,
    v.shares != null && `${shortNum(v.shares)} condivisioni`,
  ].filter(Boolean);
  const actions = (
    <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
      <DownloadBtn v={v} />
      <button type="button" style={{ ...btnSm, flex: 1, ...(saved ? { color: CP.accent, borderColor: alpha(CP.accent, "66") } : {}) }} disabled={busy} onClick={() => onSave(v.id, !saved)}>
        {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}{saved ? "Salvata" : "Salva idea"}
      </button>
    </div>
  );
  return (
    <div className="cr-card" style={{ minWidth: 0, animationDelay: `${Math.min(i, 16) * 35}ms`, ...(big
      // il protagonista: due colonne, copertina a sinistra (alta come le altre) e tutto il resto accanto
      ? { gridColumn: "span 2", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18, alignItems: "stretch" }
      : { display: "flex", flexDirection: "column", gap: 10 }) }}>
      <Cover v={v} big={big} />
      <div style={{ display: "flex", flexDirection: "column", gap: big ? 8 : 5, padding: big ? "4px 0" : "0 2px", minWidth: 0 }}>
        {big && (
          <>
            <div style={{ fontSize: 13, color: CP.textMuted }}>Il più forte adesso</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              {v.outlier != null && <span style={{ fontSize: 44, fontWeight: 500, letterSpacing: -1, lineHeight: 1, color: v.outlier >= 3 ? CP.accentGreen : CP.accent, ...NUM }}>{timesLabel(v.outlier, { short: true })}</span>}
              <span style={{ fontSize: 14, color: CP.textSecondary }}>{v.outlier != null ? "le visualizzazioni di un suo video normale" : ""}</span>
            </div>
            <div style={{ fontSize: 14, color: CP.textSecondary, ...NUM }}>{shortNum(v.views)} visualizzazioni{v.base != null ? `, di solito ${shortNum(v.base)}` : ""} · uscito {ageLabel(v.ageH)} fa</div>
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <a href={profileUrl({ platform: v.platform, handle: v.handle })} target="_blank" rel="noopener noreferrer" style={{ fontSize: big ? 16 : 14, color: CP.textPrimary, textDecoration: "none", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{v.label || `@${v.handle}`}</a>
          <span style={{ fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap" }}>{PLAT[v.platform]}{v.country ? ` · ${v.country.toUpperCase()}` : ""}</span>
        </div>
        {extra.length > 0 && <div style={{ ...hint, fontSize: 12, ...NUM }}>{extra.join(" · ")}</div>}
        {v.caption && <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: big ? 4 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.caption}</p>}
        {v.sound && <div style={{ ...hint, fontSize: 12, display: "flex", gap: 5, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><Music size={12} style={{ flex: "0 0 auto" }} />{v.sound}</div>}
        {(v.ours || v.fresh || (v.outlier != null && isSmallBase(v.base))) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {v.outlier != null && isSmallBase(v.base) && <Chip color={CP.attn} title={`Di solito fa ${shortNum(v.base)} visualizzazioni: su una pagina così piccola basta poco per un multiplo alto, può essere un caso`}>profilo piccolo</Chip>}
            {v.ours && <Chip color={CP.accent} title="Un nostro profilo, da Account social">nostro{v.creator ? ` · ${v.creator}` : ""}</Chip>}
            {v.fresh && <Chip title="Un video di meno di 3 giorni sta ancora crescendo: il multiplo salirà">giovane, sta crescendo</Chip>}
          </div>
        )}
        {big && actions}
      </div>
      {!big && actions}
    </div>
  );
}

const CR_CSS = `
  @keyframes crIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
  .cr-card { animation: crIn .45s cubic-bezier(.2,.7,.2,1) both }
  .cr-cover { transition: transform .2s ease, box-shadow .2s ease }
  .cr-cover:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,.18) }
  @media (prefers-reduced-motion: reduce) { .cr-card { animation: none } .cr-cover { transition: none } }
`;

function ProfileRow({ p, onRemove, onLabel, busy }) {
  const [edit, setEdit] = useState(false);
  const [label, setLabel] = useState(p.label || "");
  const [note, setNote] = useState(p.note || "");
  const [country, setCountry] = useState(p.country || "");
  const st = p.stats || {};
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Chip>{PLAT[p.platform]}</Chip>
        <Chip color={p.country ? undefined : CP.attn} title={p.country ? "Paese del profilo" : "Paese non indicato: sceglilo in «Nome e nota»"}>{p.country ? p.country.toUpperCase() : "paese?"}</Chip>
        {p.ours && <Chip color={CP.accent} title="Entra da solo da Account social">nostro{p.creator ? ` · ${p.creator}` : ""}</Chip>}
        <a href={profileUrl(p)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14.5, fontWeight: 500, color: CP.textPrimary, textDecoration: "none" }}>{p.label ? `${p.label} · ` : ""}@{p.handle}</a>
        <span style={{ ...hint, fontSize: 12.5, ...NUM }}>
          {p.reading ? "sto leggendo i video…" : st.median != null ? `di solito ${shortNum(st.median)} visualizzazioni · ${String(st.perWeek).replace(".", ",")} video a settimana` : p.lastRead ? `${st.count || 0} video negli ultimi 30 giorni: pochi per un confronto` : "non ancora letto"}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btnSm} onClick={() => setEdit(!edit)}>{edit ? "Chiudi" : "Nome e nota"}</button>
        {!p.ours && <button type="button" style={{ ...btnSm, color: CP.accentRed }} disabled={busy} onClick={() => onRemove(p)} aria-label="Togli"><Trash2 size={13} /></button>}
      </div>
      {p.error && !p.reading && <div style={{ ...hint, color: CP.attn, marginTop: 4 }}>{p.error}</div>}
      {p.note && !edit && <div style={{ ...hint, marginTop: 4 }}>{p.note}</div>}
      {edit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input style={{ ...input, flex: "1 1 160px" }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome (facoltativo)" />
          <input style={{ ...input, flex: "2 1 240px" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Perché lo seguiamo: formato, nicchia…" />
          <Seg items={[["ita", "ITA"], ["eng", "ENG"]]} value={country} onChange={setCountry} />
          <button type="button" style={btnSm} disabled={busy} onClick={() => { onLabel(p.id, label, note, country || null); setEdit(false); }}>Salva</button>
        </div>
      )}
    </div>
  );
}

// Una sola barra filtri in cima (29/10, Nicholas: «è normale che ci siano filtri differenti?» — no):
// paese, piattaforma, profili, periodo e ordine valgono per TUTTA la pagina, video e profili.
// Aggiungere un profilo è un'azione, non un filtro: pulsante + finestra con le sue scelte.
const selSt = { ...input, width: "auto", fontSize: 13.5, padding: "7px 10px" };

export default function ClipRadar() {
  const { data, error, mutate } = useSWR(API, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.profiles?.some((p) => p.reading) ? 6000 : 0),
  });
  // paese = la divisione principale («i meme sono diversi per country»), ricordata per persona
  const [cf, setCfState] = useState(() => { try { return localStorage.getItem("hoc:clipradar:country") || "ita"; } catch { return "ita"; } });
  const setCf = (v) => { setCfState(v); try { localStorage.setItem("hoc:clipradar:country", v); } catch {} };
  const [pf, setPf] = useState("all");          // piattaforma
  const [who, setWho] = useState("all");        // all | ext | ours | id di un profilo
  const [period, setPeriod] = useState("7");    // 7 | 30 | saved
  const [sort, setSort] = useState("outlier");
  const [adding, setAdding] = useState(null);   // { platform, country, text } quando la finestra è aperta
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  // il video protagonista occupa due colonne: solo dove ce ne stanno almeno due
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 720px)");
    const f = () => setWide(m.matches);
    f(); m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  const run = async (label, body, okText) => {
    setBusy(label); setMsg(null);
    try { const d = await post(body); setMsg(okText ? okText(d) : null); await mutate(); return d; }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  };
  const saved = data?.saved || {};
  const profiles = data?.profiles || [];
  // i profili che passano paese + piattaforma: base sia per l'elenco sia per la tendina «Profili»
  const inScope = profiles.filter((p) => (cf === "all" || p.country === cf) && (pf === "all" || p.platform === pf));
  const profOk = (p) => inScope.includes(p) && (who === "all" || (who === "ext" ? !p.ours : who === "ours" ? p.ours : p.id === who));
  const okIds = new Set(profiles.filter(profOk).map((p) => p.id));
  const shown = useMemo(() => {
    if (!data) return [];
    const now = data.now || Date.now();
    const key = { outlier: (v) => v.outlier ?? -1, views: (v) => v.views ?? -1, likes: (v) => v.likes ?? -1, comments: (v) => v.comments ?? -1, shares: (v) => v.shares ?? -1, recent: (v) => v.postedAt || 0, speed: (v) => v.perHour ?? -1 }[sort];
    return data.videos
      .filter((v) => okIds.has(v.profileId))
      .filter((v) => (period === "saved" ? saved[v.id] : v.postedAt && now - v.postedAt <= Number(period) * 86_400_000))
      .sort((a, b) => key(b) - key(a))
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period, sort, saved, cf, pf, who]);

  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={hint}>Carico…</p>;
  const nSaved = Object.keys(saved).filter((id) => data.videos.some((v) => v.id === id && okIds.has(v.profileId))).length;
  const listed = profiles.filter(profOk);
  const add = async () => {
    const d = await run("add", { action: "add", text: adding.text, platform: adding.platform, country: adding.country }, (r) => (r.exists ? "Questo profilo è già nel radar." : "Aggiunto: leggo i suoi video (meno di un minuto)."));
    if (d) setAdding(null);
  };
  const remove = async (p) => {
    if (!(await confirmDialog(`Togliere @${p.handle} dal radar? I suoi video escono dall'elenco (le idee salvate restano).`, { title: "Togli profilo", ok: "Togli", danger: true }))) return;
    run("remove", { action: "remove", id: p.id }, null);
  };
  const lastRun = data.run?.at ? new Date(data.run.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const noCountry = profiles.filter((p) => !p.country).length;
  const resetFilters = () => { setPf("all"); setWho("all"); setPeriod("30"); };

  const inPeriod = shown.length;
  const strong = shown.filter((v) => (v.outlier ?? 0) >= 3 && !isSmallBase(v.base)).length;
  const where = cf === "ita" ? "in Italia" : cf === "eng" ? "in inglese" : null;
  // protagonista = il primo video che non viene da un profilo piccolo (lì un multiplo alto può essere un caso)
  const heroIdx = wide && shown.length >= 4 && period !== "saved" ? shown.findIndex((v) => v.outlier != null && !isSmallBase(v.base)) : -1;
  const ordered = heroIdx > 0 ? [shown[heroIdx], ...shown.filter((_, i) => i !== heroIdx)] : shown;
  const big = heroIdx >= 0;
  return (
    <div>
      <style>{CR_CSS}</style>
      {/* in cima, come nel reel: un titolo, pochi numeri grandi, un alone di colore */}
      <HeroHead eyebrow="Radar del clipping" title="Video che funzionano" accent={where}
        sub="«10× il solito» = dieci volte le visualizzazioni di un video normale di quel profilo."
        numbers={<>
          <BigNum label="Profili" value={listed.length} />
          <BigNum label={period === "saved" ? "Idee salvate" : `Video in ${period} giorni`} value={period === "saved" ? nSaved : inPeriod} />
          {period !== "saved" && <BigNum label="Oltre 3× il solito" value={strong} strong title="Video con almeno tre volte le visualizzazioni tipiche del loro profilo (profili piccoli esclusi)" />}
        </>}
        actions={<button type="button" style={btnPrimary} onClick={() => setAdding({ platform: "ig", country: cf === "all" ? "ita" : cf, text: "" })}><Plus size={15} />Aggiungi profilo</button>} />
      {!data.configured && <Notice danger>Apify non è configurato sul server: i video non si possono leggere.</Notice>}

      {/* l'unica barra filtri: vale per video e profili */}
      <FilterBar onReset={pf !== "all" || who !== "all" || period !== "7" || sort !== "outlier" ? () => { setPf("all"); setWho("all"); setPeriod("7"); setSort("outlier"); } : null}>
        <Seg items={[["ita", `Italia · ${profiles.filter((p) => p.country === "ita").length}`], ["eng", `Inglese · ${profiles.filter((p) => p.country === "eng").length}`], ["all", "Tutti i paesi"]]} value={cf} onChange={(v) => { setCf(v); setWho("all"); }} />
        <select aria-label="Piattaforma" style={selSt} value={pf} onChange={(e) => { setPf(e.target.value); setWho("all"); }}>
          <option value="all">Instagram e TikTok</option><option value="ig">Solo Instagram</option><option value="tt">Solo TikTok</option>
        </select>
        <select aria-label="Profili" style={selSt} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Tutti i profili</option>
          <option value="ext">Solo da fuori</option>
          <option value="ours">Solo i nostri</option>
          <optgroup label="Un profilo">
            {inScope.map((p) => <option key={p.id} value={p.id}>{p.label || `@${p.handle}`}{p.ours ? " (nostro)" : ""}</option>)}
          </optgroup>
        </select>
        <select aria-label="Periodo" style={selSt} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">Ultimi 7 giorni</option><option value="30">Ultimi 30 giorni</option><option value="saved">Idee salvate</option>
        </select>
        <select aria-label="Ordina" style={selSt} value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>Ordina: {l.toLowerCase()}</option>)}
        </select>
      </FilterBar>
      {noCountry > 0 && cf !== "all" && <p style={{ ...hint, margin: "-4px 0 10px" }}>{noCountry} profili senza paese si vedono solo in «Tutti i paesi».</p>}
      {msg && <Notice>{msg}</Notice>}

      {!profiles.length ? (
        <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
          <p style={{ ...hint, margin: "0 0 12px", fontSize: 14 }}>Il radar è vuoto: aggiungi una pagina di clipping che fa numeri.</p>
          <button type="button" style={btnPrimary} onClick={() => setAdding({ platform: "ig", country: cf === "all" ? "ita" : cf, text: "" })}><Plus size={15} />Aggiungi profilo</button>
        </div>
      ) : (
        <>
          {!shown.length ? (
            <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
              <p style={{ ...hint, margin: "0 0 12px", fontSize: 14 }}>
                {!listed.length ? (cf !== "all" && !profiles.some((p) => p.country === cf) ? `Nessun profilo ${cf === "ita" ? "italiano" : "inglese"} nel radar: aggiungine uno.` : "Nessun profilo con questi filtri.")
                  : period === "saved" ? "Nessuna idea salvata qui: premi «Salva idea» sotto un video da rifare."
                  : listed.some((p) => p.reading) ? "Sto leggendo i video dei profili appena aggiunti…"
                  : "Nessun video in questo periodo."}
              </p>
              {listed.length > 0 && period !== "30" && <button type="button" style={btn} onClick={resetFilters}>Mostra gli ultimi 30 giorni di tutti</button>}
              {!listed.length && cf !== "all" && !profiles.some((p) => p.country === cf) && <button type="button" style={btnPrimary} onClick={() => setAdding({ platform: "ig", country: cf, text: "" })}><Plus size={15} />Aggiungi un profilo {cf === "ita" ? "italiano" : "inglese"}</button>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(auto-fill, minmax(200px, 1fr))" : "repeat(2, minmax(0, 1fr))", gridAutoFlow: "row dense", gap: wide ? 18 : 12, alignItems: "start", marginTop: 4 }}>
              {ordered.map((v, i) => <VideoCard key={`${sort}|${period}|${v.id}`} i={i} big={big && i === 0} v={v} saved={Boolean(saved[v.id])} busy={busy === "save"} onSave={(id, on) => run("save", { action: "save", videoId: id, on }, null)} />)}
            </div>
          )}

          <details style={{ ...cardBox, padding: 0, marginTop: 16 }}>
            <summary style={{ cursor: "pointer", padding: "13px 16px", fontSize: 14, fontWeight: 500 }}>
              Profili monitorati · {listed.length}{listed.length !== profiles.length ? ` di ${profiles.length}` : ""} <span style={{ ...hint, fontWeight: 400 }}>· i nostri entrano da soli da Account social</span>
            </summary>
            <div style={{ padding: "0 16px 8px" }}>
              {!listed.length ? <p style={{ ...hint, margin: "4px 0 10px" }}>Nessun profilo con questi filtri.</p>
                : listed.map((p) => (
                  <ProfileRow key={p.id} p={p} busy={!!busy} onRemove={remove} onLabel={(id, label, note, country) => run("label", { action: "label", id, label, note, country }, null)} />
                ))}
            </div>
          </details>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", ...hint, fontSize: 13 }}>Come si leggono i numeri · lettura ogni notte{lastRun ? `, l'ultima ${lastRun}` : ""}</summary>
            <p style={{ ...hint, margin: "8px 0", maxWidth: 820 }}>
              «4× il solito» = quattro volte le visualizzazioni tipiche del profilo («di solito»: mediana dei suoi video degli ultimi 30 giorni, servono almeno 3 video; i fissati non contano). È il segno che quel video — gancio, formato, audio — ha preso. Sotto le 1.000 visualizzazioni di solito il profilo è «piccolo»: basta poco per un multiplo alto, quindi il video non fa da protagonista e non conta tra gli «oltre 3×». «/ora» = visualizzazioni prese nelle ultime 24 ore lette, o dall&apos;uscita. Spesa del mese ~{String(data.spent).replace(".", ",")} $ su un tetto di {data.cap} $.
            </p>
            <button type="button" style={btnSm} disabled={!!busy} onClick={() => run("refresh", { action: "refresh" }, (d) => `Riletti ${d.result.read} profili, ${d.result.videos} video (~${String(d.result.usd).replace(".", ",")} $).`)}><RefreshCw size={13} />{busy === "refresh" ? "Rileggo… (fino a due minuti)" : "Rileggi adesso"}</button>
          </details>
        </>
      )}

      {adding && (
        <ModalBox title="Aggiungi un profilo al radar" sub="Una pagina che fa numeri e da cui prendere idee. I nostri profili non serve aggiungerli: entrano da soli da Account social."
          onClose={() => setAdding(null)}
          foot={<>
            <button type="button" style={btn} onClick={() => setAdding(null)}>Annulla</button>
            <button type="button" style={btnPrimary} disabled={!!busy || !adding.text.trim()} onClick={add}><Plus size={15} />{busy === "add" ? "Aggiungo…" : "Aggiungi"}</button>
          </>}>
          <Field label="Piattaforma"><Seg items={[["ig", "Instagram"], ["tt", "TikTok"]]} value={adding.platform} onChange={(v) => setAdding((a) => ({ ...a, platform: v }))} /></Field>
          <Field label="Paese del profilo" hint="I meme cambiano da paese a paese: il radar li tiene separati."><Seg items={[["ita", "Italia"], ["eng", "Inglese"]]} value={adding.country} onChange={(v) => setAdding((a) => ({ ...a, country: v }))} /></Field>
          <Field label="Link o nome">
            <input autoFocus style={input} value={adding.text} onChange={(e) => setAdding((a) => ({ ...a, text: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && adding.text.trim() && !busy) add(); }} placeholder={adding.platform === "tt" ? "tiktok.com/@… oppure @nome" : "instagram.com/… oppure @nome"} />
          </Field>
        </ModalBox>
      )}
    </div>
  );
}
