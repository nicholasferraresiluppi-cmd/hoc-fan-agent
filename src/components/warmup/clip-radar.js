"use client";

// Radar del clipping (scheda di Social): i profili Instagram/TikTok che il publisher tiene
// d'occhio e i loro video usciti dal solito. Logica in lib/clip-radar-core.js, dati da
// /api/admin/clip-radar (lettura notturna con Apify, solo profili pubblici).
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Bookmark, BookmarkCheck, Download, ExternalLink, Music, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { CP, alpha } from "@/lib/brand";
import { Notice, NUM } from "@/components/ds";
import { confirmDialog } from "@/components/AppDialogs";
import { btn, btnPrimary, btnSm, input, cardBox, hint, SectionHead, Seg, Chip } from "@/components/warmup/ui";
import { shortNum, ageLabel, profileUrl } from "@/lib/clip-radar-core";
import { deliverFiles } from "@/lib/editoriale-download";

const API = "/api/admin/clip-radar";
const fetcher = (u) => fetch(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Errore di caricamento"); return d; });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const PLAT = { ig: "Instagram", tt: "TikTok" };
const x10 = (n) => `×${String(n).replace(".", ",")}`;
const outColor = (o) => (o == null ? CP.textMuted : o >= 3 ? CP.accentGreen : o >= 1.5 ? CP.accent : CP.textMuted);
const SORTS = [["outlier", "Fuori dal solito"], ["speed", "Più veloci adesso"], ["views", "Più visualizzazioni"], ["likes", "Più like"], ["comments", "Più commenti"], ["shares", "Più condivisioni"], ["recent", "Più recenti"]];

function Cover({ v }) {
  const [broken, setBroken] = useState(false);
  return (
    <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ position: "relative", display: "block", aspectRatio: "9 / 16", borderRadius: 8, overflow: "hidden", background: CP.surfaceAlt }}>
      {v.cover && !broken
        ? <img src={v.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: CP.textMuted }}><Play size={28} /></div>}
      {v.outlier != null && (
        <span title={`${String(v.outlier).replace(".", ",")} volte le visualizzazioni tipiche di questo profilo (di solito ${shortNum(v.base)}, mediana dei suoi video degli ultimi 30 giorni)`} style={{ position: "absolute", top: 8, left: 8, padding: "3px 8px", borderRadius: 999, fontSize: 13, fontWeight: 500, background: CP.panel, color: outColor(v.outlier), border: `1px solid ${alpha(outColor(v.outlier), "66")}`, ...NUM }}>{x10(v.outlier)}</span>
      )}
      <span style={{ position: "absolute", top: 8, right: 8, padding: "2px 7px", borderRadius: 999, fontSize: 11.5, background: CP.panel, color: CP.textSecondary }}>{PLAT[v.platform]}</span>
      {v.duration != null && <span style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 7px", borderRadius: 6, fontSize: 12, background: CP.panel, color: CP.textPrimary, ...NUM }}>{v.duration}s</span>}
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

function VideoCard({ v, saved, onSave, busy }) {
  return (
    <div style={{ ...cardBox, marginBottom: 0, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <Cover v={v} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 500, ...NUM }}>{shortNum(v.views)}</span>
        <span style={{ ...hint, fontSize: 12 }}>visualizzazioni</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...hint, fontSize: 12, ...NUM }} title="Da quanto è uscito">{ageLabel(v.ageH)}</span>
      </div>
      <div style={{ ...hint, fontSize: 12, ...NUM, marginTop: -4 }}>
        {v.base != null ? <>di solito {shortNum(v.base)}</> : <>pochi video per un confronto</>}
        {v.perHour != null && <> · {shortNum(v.perHour)}/ora</>}
        {v.likes != null && <> · {shortNum(v.likes)} like</>}
        {v.comments != null && <> · {shortNum(v.comments)} commenti</>}
        {v.shares != null && <> · {shortNum(v.shares)} condivisioni</>}
      </div>
      <a href={profileUrl({ platform: v.platform, handle: v.handle })} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: CP.textPrimary, textDecoration: "none", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label || `@${v.handle}`}</a>
      {v.caption && <p style={{ fontSize: 13, color: CP.textSecondary, margin: 0, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.caption}</p>}
      {v.sound && <div style={{ ...hint, fontSize: 12, display: "flex", gap: 5, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><Music size={12} style={{ flex: "0 0 auto" }} />{v.sound}</div>}
      {v.ours && <div><Chip color={CP.accent} title="Un nostro profilo, da Account social">nostro{v.creator ? ` · ${v.creator}` : ""}</Chip></div>}
      {v.fresh && <div><Chip title="Un video di meno di 3 giorni sta ancora crescendo: il multiplo salirà">giovane, sta crescendo</Chip></div>}
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        <DownloadBtn v={v} />
        <button type="button" style={{ ...btnSm, flex: 1, ...(saved ? { color: CP.accent, borderColor: alpha(CP.accent, "66") } : {}) }} disabled={busy} onClick={() => onSave(v.id, !saved)}>
          {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}{saved ? "Salvata" : "Salva idea"}
        </button>
      </div>
    </div>
  );
}

function ProfileRow({ p, onRemove, onLabel, busy }) {
  const [edit, setEdit] = useState(false);
  const [label, setLabel] = useState(p.label || "");
  const [note, setNote] = useState(p.note || "");
  const st = p.stats || {};
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Chip>{PLAT[p.platform]}</Chip>
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
          <button type="button" style={btnSm} disabled={busy} onClick={() => { onLabel(p.id, label, note); setEdit(false); }}>Salva</button>
        </div>
      )}
    </div>
  );
}

export default function ClipRadar() {
  const { data, error, mutate } = useSWR(API, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.profiles?.some((p) => p.reading) ? 6000 : 0),
  });
  const [plat, setPlat] = useState("ig");
  const [text, setText] = useState("");
  const [days, setDays] = useState("7");
  const [pf, setPf] = useState("all");
  const [sort, setSort] = useState("outlier");
  const [who, setWho] = useState("");
  const [side, setSide] = useState("all"); // all | ours | ext
  const [onlySaved, setOnlySaved] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = async (label, body, okText) => {
    setBusy(label); setMsg(null);
    try { const d = await post(body); setMsg(okText ? okText(d) : null); await mutate(); return d; }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  };
  const saved = data?.saved || {};
  const shown = useMemo(() => {
    if (!data) return [];
    const now = data.now || Date.now();
    const key = { outlier: (v) => v.outlier ?? -1, views: (v) => v.views ?? -1, likes: (v) => v.likes ?? -1, comments: (v) => v.comments ?? -1, shares: (v) => v.shares ?? -1, recent: (v) => v.postedAt || 0, speed: (v) => v.perHour ?? -1 }[sort];
    return data.videos
      .filter((v) => (onlySaved ? saved[v.id] : v.postedAt && now - v.postedAt <= Number(days) * 86_400_000))
      .filter((v) => (pf === "all" || v.platform === pf) && (!who || v.profileId === who) && (side === "all" || (side === "ours" ? v.ours : !v.ours)))
      .sort((a, b) => key(b) - key(a))
      .slice(0, 60);
  }, [data, days, pf, who, side, sort, onlySaved, saved]);

  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={hint}>Carico…</p>;
  const profiles = data.profiles || [];
  const nSaved = Object.keys(saved).length;
  const add = async () => {
    const d = await run("add", { action: "add", text, platform: plat }, (r) => (r.exists ? "Questo profilo è già nel radar." : "Aggiunto: leggo i suoi video (meno di un minuto)."));
    if (d) setText("");
  };
  const remove = async (p) => {
    if (!(await confirmDialog(`Togliere @${p.handle} dal radar? I suoi video escono dall'elenco (le idee salvate restano).`, { title: "Togli profilo", ok: "Togli", danger: true }))) return;
    run("remove", { action: "remove", id: p.id }, null);
  };
  const lastRun = data.run?.at ? new Date(data.run.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div>
      <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 14px", maxWidth: 820, lineHeight: 1.55 }}>
        I profili di clipping che volete tenere d&apos;occhio, su Instagram e TikTok: ogni notte si leggono i loro ultimi video e qui vedete quelli che hanno funzionato. Il numero grande sulla copertina è il <b style={{ fontWeight: 500 }}>multiplo sul solito del profilo</b>: «×4» vuol dire quattro volte le visualizzazioni che quella pagina fa di norma — è il segno che quel video (gancio, formato, audio) ha preso, anche su una pagina piccola.
      </p>
      {!data.configured && <Notice danger>Apify non è configurato sul server: i video non si possono leggere.</Notice>}

      <div style={{ ...cardBox, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Seg items={[["ig", "Instagram"], ["tt", "TikTok"]]} value={plat} onChange={setPlat} />
        <input style={{ ...input, flex: "1 1 240px" }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim() && !busy) add(); }} placeholder={plat === "tt" ? "link tiktok.com/@… oppure @nome" : "link instagram.com/… oppure @nome"} />
        <button type="button" style={btnPrimary} disabled={!!busy || !text.trim()} onClick={add}><Plus size={15} />{busy === "add" ? "Aggiungo…" : "Aggiungi al radar"}</button>
      </div>
      {msg && <Notice>{msg}</Notice>}

      <SectionHead aside={`${profiles.filter((p) => !p.ours).length} di ${data.max} da fuori · ${profiles.filter((p) => p.ours).length} nostri (entrano da soli da Account social)`}>Profili monitorati</SectionHead>
      {!profiles.length ? (
        <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
          <p style={{ ...hint, margin: 0, fontSize: 14 }}>Nessun profilo nel radar: incolla qui sopra il link di una pagina di clipping che fa numeri.</p>
        </div>
      ) : (
        <div style={{ ...cardBox, paddingTop: 6, paddingBottom: 6 }}>
          {profiles.map((p) => (
            <ProfileRow key={p.id} p={p} busy={!!busy} onRemove={remove} onLabel={(id, label, note) => run("label", { action: "label", id, label, note }, null)} />
          ))}
        </div>
      )}

      {profiles.length > 0 && (
        <>
          <SectionHead aside={onlySaved ? "le idee salvate da chi pubblica" : `ultimi ${days} giorni`}>Video che funzionano</SectionHead>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <Seg items={[["7", "7 giorni"], ["30", "30 giorni"]]} value={onlySaved ? "" : days} onChange={(v) => { setDays(v); setOnlySaved(false); }} />
            <Seg items={[["saved", `Idee salvate · ${nSaved}`]]} value={onlySaved ? "saved" : ""} onChange={() => setOnlySaved(!onlySaved)} />
            <span style={{ flex: 1 }} />
            <select style={{ ...input, width: "auto", fontSize: 13.5, padding: "7px 10px" }} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <Seg items={[["all", "Tutte"], ["ig", "Instagram"], ["tt", "TikTok"]]} value={pf} onChange={(v) => { setPf(v); setWho(""); }} />
            <Seg items={[["all", "Tutti i profili"], ["ext", "Da fuori"], ["ours", "I nostri"]]} value={side} onChange={(v) => { setSide(v); setWho(""); }} />
            <select style={{ ...input, width: "auto", fontSize: 13.5, padding: "7px 10px" }} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Tutti i profili</option>
              {profiles.filter((p) => (pf === "all" || p.platform === pf) && (side === "all" || (side === "ours" ? p.ours : !p.ours))).map((p) => <option key={p.id} value={p.id}>{p.label || `@${p.handle}`}</option>)}
            </select>
          </div>
          {!shown.length ? (
            <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
              <p style={{ ...hint, margin: 0, fontSize: 14 }}>
                {onlySaved ? "Nessuna idea salvata: premi «Salva idea» sotto un video da rifare." : profiles.some((p) => p.reading) ? "Sto leggendo i video dei profili appena aggiunti…" : "Nessun video in questo periodo: prova «30 giorni» o aggiungi altri profili."}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 12, alignItems: "stretch" }}>
              {shown.map((v) => <VideoCard key={v.id} v={v} saved={Boolean(saved[v.id])} busy={busy === "save"} onSave={(id, on) => run("save", { action: "save", videoId: id, on }, null)} />)}
            </div>
          )}
          <p style={{ ...hint, marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>«Di solito» = mediana delle visualizzazioni dei video del profilo negli ultimi 30 giorni (servono almeno 3 video; i fissati non contano). «/ora» = visualizzazioni prese nelle ultime 24 ore lette, o dall&apos;uscita. Lettura ogni notte{lastRun ? `, l'ultima ${lastRun}` : ""} · spesa del mese ~{String(data.spent).replace(".", ",")} $ su un tetto di {data.cap} $.</span>
            <button type="button" style={btnSm} disabled={!!busy} onClick={() => run("refresh", { action: "refresh" }, (d) => `Riletti ${d.result.read} profili, ${d.result.videos} video (~${String(d.result.usd).replace(".", ",")} $).`)}><RefreshCw size={13} />{busy === "refresh" ? "Rileggo… (fino a due minuti)" : "Rileggi adesso"}</button>
          </p>
        </>
      )}
    </div>
  );
}
