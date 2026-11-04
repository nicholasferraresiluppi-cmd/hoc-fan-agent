"use client";

// Trend del clipping (scheda del Radar): i formati che in queste settimane fanno numeri su tanti
// account diversi. Logica in lib/clip-trends-core.js, dati da /api/admin/clip-radar?trends=1
// (ricerche giornaliere su TikTok e Instagram con Apify, solo contenuti pubblici) + audio che tornano
// sulle pagine del Radar + musica in salita negli USA.
import { useState } from "react";
import useSWR from "swr";
import { ExternalLink, Music, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { CP } from "@/lib/brand";
import { Notice, NUM, FilterBar, EmptyState, SectionTitle } from "@/components/ds";
import { confirmDialog } from "@/components/AppDialogs";
import { btn, btnPrimary, btnSm, input, cardBox, hint, Seg, Chip, ModalBox, Field } from "@/components/warmup/ui";
import { shortNum, ageLabel, profileUrl } from "@/lib/clip-radar-core";
import { HIT_VIEWS, SMALL_ACCOUNT, TREND_DAYS } from "@/lib/clip-trends-core";
import HeroHead, { BigNum } from "@/components/HeroHead";

const API = "/api/admin/clip-radar";
const URL_T = `${API}?trends=1`;
const fetcher = (u) => fetch(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Errore di caricamento"); return d; });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const HEAT = { "in salita": CP.accentGreen, "nuovo": CP.accent, "stabile": undefined, "in calo": CP.textMuted };
const LIVE_HITS = 3; // «vivo adesso»: almeno tre account diversi sopra le 50 mila nell'ultimo mese
const isLive = (f) => f.hits >= LIVE_HITS;
const pct = (n) => (n == null ? null : `${String(n).replace(".", ",")}%`);
const ageH = (ts) => (ts ? Math.max(0, Math.round((Date.now() - ts) / 3_600_000)) : null);
const searchUrl = (text, platform) => platform === "tt"
  ? `https://www.tiktok.com/search/video?q=${encodeURIComponent(text)}`
  : `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(text)}`;

function Example({ e }) {
  const [broken, setBroken] = useState(false);
  return (
    <a href={e.url} target="_blank" rel="noopener noreferrer" title={e.caption || ""} style={{ display: "block", minWidth: 0, textDecoration: "none", color: CP.textPrimary }}>
      <div style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 12, overflow: "hidden", background: CP.surfaceAlt }}>
        {e.cover && !broken
          ? <img src={e.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: CP.textMuted }}><Play size={22} /></div>}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.78) 100%)" }} />
        <div style={{ position: "absolute", left: 8, right: 8, bottom: 7, color: "#fff" }}>
          <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1, ...NUM }}>{shortNum(e.views)}</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, ...NUM }}>{ageLabel(ageH(e.postedAt))} fa · {e.platform === "tt" ? "TikTok" : "IG"}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        @{e.owner}{e.fans != null && e.fans < SMALL_ACCOUNT ? <span style={{ color: CP.textMuted }}> · {shortNum(e.fans)} follower</span> : null}
      </div>
    </a>
  );
}

/** Una riga di numeri in parole: «12 account sopra le 50 mila · mediana 230 mila · 6,2% condivisioni». */
function statLine(f) {
  return [
    `${f.hits} account sopra le ${shortNum(HIT_VIEWS)}`,
    f.medianViews != null && `di solito ${shortNum(f.medianViews)}`,
    f.shareRate != null && `${pct(f.shareRate)} condivisioni`,
    f.smallHits > 0 && `${f.smallHits} da account piccoli`,
  ].filter(Boolean).join(" · ");
}

function FormatCard({ f }) {
  return (
    <div style={{ ...cardBox, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 500 }}>«{f.text}»</span>
        {isLive(f) && <Chip color={CP.accentGreen} title={`Almeno ${LIVE_HITS} account diversi sopra le ${shortNum(HIT_VIEWS)} negli ultimi ${TREND_DAYS} giorni`}>vivo adesso</Chip>}
        {f.heat && <Chip color={HEAT[f.heat]} title="Rispetto al giro della settimana prima, sugli account che ci fanno numeri">{f.heat}</Chip>}
        <Chip>{f.country === "ita" ? "ITA" : "ENG"}</Chip>
        <span style={{ flex: 1 }} />
        <a href={searchUrl(f.text, "tt")} target="_blank" rel="noopener noreferrer" style={{ ...btnSm, textDecoration: "none" }}><ExternalLink size={13} />TikTok</a>
        <a href={searchUrl(f.text, "ig")} target="_blank" rel="noopener noreferrer" style={{ ...btnSm, textDecoration: "none" }}><ExternalLink size={13} />Instagram</a>
      </div>
      <div style={{ fontSize: 14, color: CP.textSecondary, margin: "6px 0 2px", ...NUM }}>{statLine(f)}</div>
      <div style={{ ...hint, ...NUM }}>
        {f.recent} video degli ultimi {TREND_DAYS} giorni su {f.found} trovati{f.recentShare != null ? ` (${f.recentShare}%)` : ""}{f.newest ? ` · il più recente ${ageLabel(ageH(f.newest))} fa` : ""}
      </div>
      {f.examples?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 10, marginTop: 12, maxWidth: 560 }}>
          {f.examples.map((e) => <Example key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}

// Un profilo proposto: chi ha fatto numeri con i formati cercati e il Radar non segue ancora.
function CandidateRow({ c, busy, onAdd }) {
  const [broken, setBroken] = useState(false);
  const b = c.best || {};
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
      <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ flex: "0 0 auto", width: 54, aspectRatio: "9 / 16", borderRadius: 8, overflow: "hidden", background: CP.surfaceAlt, display: "grid", placeItems: "center", color: CP.textMuted }} title="Il suo video migliore">
        {b.cover && !broken ? <img src={b.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Play size={16} />}
      </a>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <a href={profileUrl({ platform: c.platform, handle: c.handle })} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14.5, fontWeight: 500, color: CP.textPrimary, textDecoration: "none" }}>@{c.handle}</a>
          <span style={{ ...hint, fontSize: 12.5 }}>{c.platform === "tt" ? "TikTok" : "Instagram"}{c.fans != null ? ` · ${shortNum(c.fans)} follower` : ""}</span>
          {c.fans != null && c.fans < SMALL_ACCOUNT && <Chip color={CP.accentGreen} title={`Sotto i ${shortNum(SMALL_ACCOUNT)} follower: i numeri li fa il formato, non il profilo`}>profilo piccolo</Chip>}
        </div>
        <div style={{ ...hint, fontSize: 12.5, ...NUM }}>
          {shortNum(b.views)} visualizzazioni{b.postedAt ? ` · ${ageLabel(ageH(b.postedAt))} fa` : ""}{c.hits > 1 ? ` · ${c.hits} video sopra le ${shortNum(HIT_VIEWS)}` : ""}{c.shareRate != null ? ` · ${pct(c.shareRate)} condivisioni` : ""} · da «{c.queries.join("», «")}»
        </div>
      </div>
      <button type="button" style={{ ...btnSm, flex: "0 0 auto" }} disabled={busy} onClick={() => onAdd(c)}><Plus size={13} />Aggiungi al Radar</button>
    </div>
  );
}

function SoundRow({ s }) {
  const top = s.examples?.[0];
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
      <Music size={15} style={{ color: CP.textMuted, flex: "0 0 auto" }} />
      <span style={{ fontSize: 14.5, fontWeight: 500, minWidth: 0, flex: "1 1 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name || "audio senza nome"}</span>
      <span style={{ ...hint, fontSize: 13, ...NUM }}>{s.accounts} account · {s.hits} sopra le {shortNum(HIT_VIEWS)}{s.medianViews != null ? ` · di solito ${shortNum(s.medianViews)}` : ""}{s.shareRate != null ? ` · ${pct(s.shareRate)} condivisioni` : ""}</span>
      {s.countries?.length > 0 && <Chip>{s.countries.map((c) => c.toUpperCase()).join(" · ")}</Chip>}
      {s.radar > 0 && <Chip color={CP.accentGreen} title="Usato anche dai profili che seguiamo nel Radar">nel Radar</Chip>}
      {top && <a href={top.url} target="_blank" rel="noopener noreferrer" style={{ ...btnSm, textDecoration: "none" }}><ExternalLink size={13} />Ascolta</a>}
    </div>
  );
}

function MusicRow({ m }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
      <Music size={15} style={{ color: CP.textMuted, flex: "0 0 auto" }} />
      <span style={{ fontSize: 14.5, fontWeight: 500, minWidth: 0, flex: "1 1 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}{m.artist ? <span style={{ ...hint, fontWeight: 400 }}> · {m.artist}</span> : null}</span>
      <span style={{ ...hint, fontSize: 13, ...NUM }}>+{shortNum(m.change)} video in 7 giorni{m.growthPct != null ? ` (+${m.growthPct}%)` : ""} · {shortNum(m.usage)} in tutto</span>
      {m.charts?.includes("viral") && <Chip color={CP.accentGreen} title="Nella classifica Viral di TikTok USA: sale di colpo">virale</Chip>}
      {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ ...btnSm, textDecoration: "none" }}><ExternalLink size={13} />Ascolta</a>}
    </div>
  );
}

export default function ClipTrends({ cf, setCf }) {
  const { data, error, mutate } = useSWR(URL_T, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.running ? 20_000 : 0),
  });
  const [adding, setAdding] = useState(null); // { text, country }
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = async (label, body, okText) => {
    setBusy(label); setMsg(null);
    try { const d = await post(body); setMsg(okText ? okText(d) : null); await mutate(); return d; }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  };
  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={hint}>Carico…</p>;

  const inC = (x) => cf === "all" || x.country === cf || x.countries?.includes(cf);
  const queries = data.queries.filter(inC);
  const formats = (data.last?.formats || []).filter(inC);
  const withResults = formats.filter((f) => f.found > 0);
  const empty = formats.filter((f) => f.found === 0);
  // gli audio trovati solo sui profili del Radar non hanno paese: si vedono sempre
  const sounds = (data.last?.sounds || []).filter((s) => !s.countries?.length || inC(s));
  const music = cf === "ita" ? [] : data.last?.music || [];
  const live = formats.filter(isLive).length;
  const candidates = (data.last?.candidates || []).filter(inC);
  const follow = async (c) => {
    await run(`add:${c.id}`, { action: "add", text: c.handle, platform: c.platform, country: c.country || (cf === "all" ? "eng" : cf) }, (r) => (r.exists ? `@${c.handle} è già nel Radar.` : `@${c.handle} aggiunto al Radar: leggo i suoi video (meno di un minuto), li trovi in «Video dei profili».`));
  };
  const where = cf === "ita" ? "in Italia" : cf === "eng" ? "in inglese" : null;
  const when = (ts) => new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const refresh = () => run("refresh", { action: "trend_refresh" }, () => "Ricerche partite: i risultati arrivano in pochi minuti, la pagina si aggiorna da sola.");
  const add = async () => {
    const d = await run("add", { action: "trend_add", text: adding.text, country: adding.country }, (r) => (r.exists ? "Questa ricerca c'è già." : "Ricerca aggiunta: entra nel prossimo giro."));
    if (d) setAdding(null);
  };
  const remove = async (q) => {
    if (!(await confirmDialog(`Togliere la ricerca «${q.text}»? Dal prossimo giro non si cerca più.`, { title: "Togli ricerca", ok: "Togli", danger: true }))) return;
    run("remove", { action: "trend_remove", id: q.id }, null);
  };
  const refreshBtn = (
    <button type="button" style={btn} disabled={!!busy || !!data.running || !data.configured} onClick={refresh}>
      <RefreshCw size={14} />{data.running ? "Sto cercando…" : busy === "refresh" ? "Avvio…" : `Cerca adesso (~${String(data.budget).replace(".", ",")} $)`}
    </button>
  );

  return (
    <div>
      <HeroHead eyebrow="Trend del clipping" title="Formati che girano adesso" accent={where}
        sub="Ogni notte cerchiamo i formati su TikTok e Instagram e guardiamo gli audio delle pagine che seguiamo: un meme è in trend quando ci fanno numeri tanti account diversi, non un video solo."
        numbers={<>
          <BigNum label="Ricerche" value={queries.length} />
          <BigNum label="Vivi adesso" value={live} strong title={`Formati con almeno ${LIVE_HITS} account diversi sopra le ${shortNum(HIT_VIEWS)} negli ultimi ${TREND_DAYS} giorni`} />
          <BigNum label="Profili da seguire" value={candidates.length} title="Account che hanno fatto numeri con questi formati e il Radar non segue ancora" />
        </>}
        actions={<button type="button" style={btnPrimary} onClick={() => setAdding({ text: "", country: cf === "all" ? "eng" : cf })}><Plus size={15} />Aggiungi ricerca</button>} />
      {!data.configured && <Notice danger>Apify non è configurato sul server: le ricerche non possono partire.</Notice>}

      <FilterBar>
        <Seg items={[["ita", `Italia · ${data.queries.filter((q) => q.country === "ita").length}`], ["eng", `Inglese · ${data.queries.filter((q) => q.country === "eng").length}`], ["all", "Tutti i paesi"]]} value={cf} onChange={setCf} />
      </FilterBar>
      {data.running && <Notice>Sto cercando i formati (avviato {when(data.running.startedAt)}): i risultati arrivano in pochi minuti, la pagina si aggiorna da sola.</Notice>}
      {data.last?.errors?.length > 0 && <Notice>Ultimo giro incompleto: {data.last.errors.join("; ")}.</Notice>}
      {msg && <Notice>{msg}</Notice>}

      {sounds.length > 0 && (
        <div style={{ ...cardBox, marginBottom: 12 }}>
          <SectionTitle aside="lo stesso audio su più account, nelle ricerche e sulle pagine del Radar: spesso il meme è l'audio">Audio che tornano · {sounds.length}</SectionTitle>
          {sounds.map((s) => <SoundRow key={s.id} s={s} />)}
        </div>
      )}

      {!data.last ? (
        <EmptyState title="Ancora nessun giro di ricerche"
          action={refreshBtn}>
          Le ricerche partono da sole ogni notte. La prima la puoi far partire adesso: ci vogliono pochi minuti.
        </EmptyState>
      ) : !withResults.length ? (
        <EmptyState title={queries.length ? "Nessun risultato per queste ricerche" : "Nessuna ricerca per questo paese"}
          action={<button type="button" style={btnPrimary} onClick={() => setAdding({ text: "", country: cf === "all" ? "eng" : cf })}><Plus size={15} />Aggiungi ricerca</button>}>
          {queries.length ? "Prova con le parole che usano i video del formato, come le scriveresti nella ricerca di TikTok." : "Aggiungi le parole di un formato da tenere d'occhio."}
        </EmptyState>
      ) : (
        withResults.map((f) => <FormatCard key={f.id} f={f} />)
      )}

      {candidates.length > 0 && (
        <div style={{ ...cardBox, marginTop: 4 }}>
          <SectionTitle aside="hanno fatto numeri con questi formati e il Radar non li segue ancora">Profili da seguire · {candidates.length}</SectionTitle>
          {candidates.map((c) => <CandidateRow key={c.id} c={c} busy={!!busy} onAdd={follow} />)}
        </div>
      )}

      {music.length > 0 && (
        <div style={{ ...cardBox, marginTop: 4 }}>
          <SectionTitle aside="classifiche TikTok USA, chi sale di più in una settimana: sono canzoni, non meme, ma molti meme si montano su queste">Musica in salita negli USA · {music.length}</SectionTitle>
          {music.map((m) => <MusicRow key={m.id} m={m} />)}
        </div>
      )}

      <details style={{ ...cardBox, padding: 0, marginTop: 16 }}>
        <summary style={{ cursor: "pointer", padding: "13px 16px", fontSize: 14, fontWeight: 500 }}>
          Ricerche · {queries.length}{queries.length !== data.queries.length ? ` di ${data.queries.length}` : ""}{empty.length ? <span style={{ ...hint, fontWeight: 400 }}> · {empty.length} senza risultati nell&apos;ultimo giro</span> : null}
        </summary>
        <div style={{ padding: "0 16px 8px" }}>
          {!queries.length ? <p style={{ ...hint, margin: "4px 0 10px" }}>Nessuna ricerca per questo paese.</p>
            : queries.map((q) => (
              <div key={q.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
                <Chip>{q.country === "ita" ? "ITA" : "ENG"}</Chip>
                <span style={{ fontSize: 14.5 }}>«{q.text}»</span>
                <span style={{ ...hint, fontSize: 12.5 }}>{empty.some((f) => f.id === q.id) ? "nessun risultato nell'ultimo giro" : q.addedBy ? `da ${q.addedBy}` : ""}</span>
                <span style={{ flex: 1 }} />
                <button type="button" style={{ ...btnSm, color: CP.accentRed }} disabled={!!busy} onClick={() => remove(q)} aria-label={`Togli «${q.text}»`}><Trash2 size={13} /></button>
              </div>
            ))}
        </div>
      </details>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", ...hint, fontSize: 13 }}>Come si leggono i numeri · ricerche ogni notte{data.last?.at ? `, l'ultima ${when(data.last.at)}` : ""}</summary>
        <p style={{ ...hint, margin: "8px 0", maxWidth: 820 }}>
          Per ogni ricerca prendiamo i video più popolari su TikTok (30, cercati come li vede un utente americano per le ricerche in inglese e italiano per quelle in italiano) e Instagram (20) e contiamo gli ACCOUNT, non i video: «12 account sopra le {shortNum(HIT_VIEWS)}» vuol dire dodici profili diversi che nell&apos;ultimo mese ci hanno fatto almeno {shortNum(HIT_VIEWS)} visualizzazioni. Un video virale da solo può essere un caso; dieci account diversi sono un formato che funziona. «Vivo adesso» = almeno {LIVE_HITS}. Le condivisioni contano più dei like: i meme di coppia si mandano al fidanzato o all&apos;amica, ed è così che un profilo nuovo arriva a chi non lo segue. «Da account piccoli» = profili sotto i {shortNum(SMALL_ACCOUNT)} follower (solo TikTok li dice): lì il merito è del formato. «Profili da seguire» = gli account che in queste ricerche hanno un video sopra le {shortNum(HIT_VIEWS)} e che il Radar non segue ancora (su TikTok solo chi scrive nella lingua del paese): si aggiungono con un clic, non da soli, perché nelle ricerche escono anche pagine fuori nicchia. «In salita / in calo» confronta con il giro di circa una settimana prima. «Audio che tornano» = lo stesso audio usato da almeno 3 account diversi, contando sia i video delle ricerche sia quelli dei profili del Radar («nel Radar»): così un meme nuovo si vede anche se nessuna ricerca lo nomina. «Musica in salita» = le canzoni che nell&apos;ultima settimana sono state usate in più video nuovi su TikTok USA (classifiche Popular e Viral). Le copertine scadono dopo qualche giorno: il video si apre comunque dal link. Spesa del mese (Radar e Trend insieme) ~{String(data.spent).replace(".", ",")} $ su un tetto di {data.cap} $.
        </p>
        {data.last && refreshBtn}
      </details>

      {adding && (
        <ModalBox title="Aggiungi una ricerca" sub="Le parole di un formato, come le scriveresti nella ricerca di TikTok: «me when him», «behind the screen», «io quando lui»."
          onClose={() => setAdding(null)}
          foot={<>
            <button type="button" style={btn} onClick={() => setAdding(null)}>Annulla</button>
            <button type="button" style={btnPrimary} disabled={!!busy || adding.text.trim().length < 3} onClick={add}><Plus size={15} />{busy === "add" ? "Aggiungo…" : "Aggiungi"}</button>
          </>}>
          <Field label="Paese" hint="I meme cambiano da paese a paese: italiano e inglese restano separati."><Seg items={[["ita", "Italia"], ["eng", "Inglese"]]} value={adding.country} onChange={(v) => setAdding((a) => ({ ...a, country: v }))} /></Field>
          <Field label="Ricerca">
            <input autoFocus style={input} value={adding.text} onChange={(e) => setAdding((a) => ({ ...a, text: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && adding.text.trim().length >= 3 && !busy) add(); }} placeholder="me when him" />
          </Field>
        </ModalBox>
      )}
    </div>
  );
}
