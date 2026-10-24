"use client";

// Ispirazioni X: reference di creator che usano X per portare su OnlyFans (scheda del Warm-up, piattaforma X).
// Logica in lib/warmup-xrefs-core.js, dati da /api/admin/warmup/xrefs.
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ExternalLink, Plus, RefreshCw, Search, Share2 } from "lucide-react";
import { CP } from "@/lib/brand";
import { Notice, NUM } from "@/components/ds";
import { btn, btnPrimary, btnSm, input, cardBox, hint, muted, SectionHead, Seg, Chip, Metric2, Field } from "@/components/warmup/ui";
import { etToIt } from "@/lib/warmup-xrefs-core";

const API = "/api/admin/warmup/xrefs";
const fetcher = (u) => fetch(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Errore di caricamento"); return d; });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT"));
const pct = (v) => (v == null ? "—" : `${v}%`);
const hoursIt = (hs) => (hs || []).map((h) => `${String(etToIt(h)).padStart(2, "0")}:00`).join(" · ");
const day = (d) => { const t = Date.parse(d); return isNaN(t) ? "" : new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }); };
const linkKind = (site) => (/onlyfans/i.test(site) ? "OnlyFans" : /fansly|fans\.ly/i.test(site) ? "Fansly" : /fanvue/i.test(site) ? "Fanvue" : site ? "Aggregatore" : "—");

function Patterns({ p }) {
  if (!p) return <p style={{ ...hint, margin: "0 0 8px" }}>Quando avrete tenuto qualche reference e letto i suoi post, qui compare la sintesi di come pubblicano: ritmo, formati, link, orari.</p>;
  return (
    <div style={{ ...cardBox }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        <Metric2 value={String(p.perDay).replace(".", ",")} label="Post al giorno" />
        <Metric2 value={fmt(p.medViews)} label="Visualizzazioni a post (mediana)" />
        <Metric2 value={pct(p.pctVideo)} label="Post con video" />
        <Metric2 value={pct(p.pctPhoto)} label="Post con foto" />
        <Metric2 value={pct(p.pctText)} label="Solo testo" />
        <Metric2 value={pct(p.pctLinkInPost)} label="Link dentro il post" />
        <Metric2 value={p.medTextLen != null ? `${p.medTextLen}` : "—"} label="Caratteri di testo (mediana)" />
      </div>
      {p.topHoursET?.length > 0 && <p style={{ fontSize: 14, margin: "10px 0 0", color: CP.textSecondary }}>Orari in cui pubblicano di più: <b style={{ fontWeight: 500, color: CP.textPrimary, ...NUM }}>{hoursIt(p.topHoursET)}</b> in Italia ({p.topHoursET.map((h) => `${h}:00`).join(" · ")} a New York).</p>}
      <p style={{ ...hint, margin: "8px 0 0" }}>Mediane sulle {p.refs} reference tenute con i post letti (ultimi 40 post, senza repost e risposte).</p>
    </div>
  );
}

function RefCard({ r, onStatus, onSave, busy }) {
  const [open, setOpen] = useState(false);
  const [niches, setNiches] = useState((r.niches || []).join(", "));
  const [note, setNote] = useState(r.note || "");
  const s = r.stats;
  return (
    <div style={{ ...cardBox, marginBottom: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {r.pic ? <img src={r.pic.replace("_normal", "_bigger")} alt="" referrerPolicy="no-referrer" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", background: CP.surfaceAlt }} /> : <div style={{ width: 44, height: 44, borderRadius: "50%", background: CP.surfaceAlt }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.u}</div>
          <a href={`https://x.com/${r.u}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: CP.textSecondary, textDecoration: "none" }}>@{r.u} <ExternalLink size={11} /></a>
        </div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 17, fontWeight: 500, ...NUM }}>{fmt(r.f)}</div><div style={{ ...hint, fontSize: 12 }}>follower</div></div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {r.us && <Chip color={CP.accentGreen}>USA</Chip>}
        {r.female && <Chip>Donna</Chip>}
        {r.loc && !r.us && <Chip>{r.loc.slice(0, 24)}</Chip>}
        <Chip>{linkKind(r.site)}</Chip>
        {r.blue && <Chip>Premium</Chip>}
        {(r.niches || []).map((n) => <Chip key={n}>{n}</Chip>)}
      </div>
      {r.bio && <p style={{ fontSize: 13.5, color: CP.textSecondary, margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.bio}</p>}
      {r.via?.length > 0 && !s?.n && <p style={{ ...hint, margin: 0 }}>Trovata tra chi seguono {r.via.map((x) => "@" + x).join(", ")}</p>}
      {s?.n ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, fontSize: 13 }}>
          <div><b style={{ fontWeight: 500, ...NUM }}>{String(s.perDay).replace(".", ",")}</b><div style={muted}>post/giorno</div></div>
          <div><b style={{ fontWeight: 500, ...NUM }}>{fmt(s.medViews)}</b><div style={muted}>view a post</div></div>
          <div><b style={{ fontWeight: 500, ...NUM }}>{pct(s.pctVideo)}</b><div style={muted}>video</div></div>
          <div><b style={{ fontWeight: 500, ...NUM }}>{pct(s.pctLinkInPost)}</b><div style={muted}>link nel post</div></div>
        </div>
      ) : r.foundPost ? (
        <div style={{ fontSize: 13, color: CP.textSecondary, borderLeft: `2px solid ${CP.borderStrong}`, paddingLeft: 10 }}>
          «{r.foundPost.text?.replace(/https?:\/\/\S+/g, "").trim().slice(0, 140) || "post con solo media"}» · <span style={NUM}>{fmt(r.foundPost.views)}</span> view
        </div>
      ) : <p style={{ ...hint, margin: 0 }}>Post non ancora letti: arrivano con «Leggi i post».</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
        {r.status !== "tenuta" && <button type="button" style={btnSm} disabled={busy} onClick={() => onStatus(r.key, "tenuta")}>Tieni</button>}
        {r.status !== "scartata" && <button type="button" style={btnSm} disabled={busy} onClick={() => onStatus(r.key, "scartata")}>Scarta</button>}
        {r.status !== "nuova" && <button type="button" style={btnSm} disabled={busy} onClick={() => onStatus(r.key, "nuova")}>Rimetti da valutare</button>}
        <button type="button" style={{ ...btnSm, marginLeft: "auto" }} onClick={() => setOpen(!open)}>{open ? "Chiudi" : s?.top?.length ? "Post migliori e note" : "Note"}</button>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 10 }}>
          {s?.top?.length > 0 && (
            <>
              <div style={{ fontSize: 13.5, color: CP.textSecondary, marginBottom: 6 }}>I post che hanno girato di più (ultimi 40)</div>
              {s.top.map((t) => (
                <a key={t.id} href={`https://x.com/${r.u}/status/${t.id}`} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, textDecoration: "none", color: CP.textPrimary }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{t.text?.replace(/https?:\/\/\S+/g, "").trim() || <span style={muted}>solo media</span>}</div>
                  <div style={{ ...hint, fontSize: 12, marginTop: 3, ...NUM }}>{day(t.createdAt)} · {fmt(t.views)} view · {fmt(t.likes)} like · {fmt(t.replies)} risposte{t.media ? ` · ${t.media}` : " · solo testo"}{t.linkInPost ? " · link nel post" : ""} · apri su X ↗</div>
                </a>
              ))}
              {s.topHoursET?.length > 0 && <p style={{ ...hint, margin: "8px 0 0" }}>Pubblica soprattutto alle {hoursIt(s.topHoursET)} (ora italiana).</p>}
            </>
          )}
          <div style={{ marginTop: 10 }}>
            <Field label="Nicchie (separate da virgola)" hint="es. tattoo, latina, fitness: servono a filtrare e a cercarne di simili"><input style={input} value={niches} onChange={(e) => setNiches(e.target.value)} /></Field>
            <Field label="Nota per chi pubblica"><textarea style={{ ...input, minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cosa prendere da lei: tono, formato, idea…" /></Field>
            <button type="button" style={btnSm} disabled={busy} onClick={() => onSave(r.key, note, niches.split(",").map((x) => x.trim()).filter(Boolean))}>Salva</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function XRefs() {
  const { data, error, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [status, setStatusF] = useState("nuova");
  const [sort, setSort] = useState("f");
  const [nicheF, setNicheF] = useState("");
  const [onlyF, setOnlyF] = useState("0");
  const [niche, setNiche] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = async (label, body, okText) => {
    setBusy(label); setMsg(null);
    try { const d = await post(body); setMsg(okText ? okText(d) : null); await mutate(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  };
  const refs = data?.refs || [];
  const niches = useMemo(() => [...new Set(refs.flatMap((r) => r.niches || []))].sort(), [refs]);
  const shown = refs.filter((r) => r.status === status && (!nicheF || (r.niches || []).includes(nicheF)) && (onlyF === "0" || r.female))
    .sort((a, b) => (b.female ? 1 : 0) - (a.female ? 1 : 0) || (sort === "views" ? (b.stats?.medViews || 0) - (a.stats?.medViews || 0) : sort === "new" ? (b.addedAt || 0) - (a.addedAt || 0) : (b.f || 0) - (a.f || 0)));
  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={hint}>Carico…</p>;
  const c = data.counts || {};
  return (
    <div>
      <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 14px", maxWidth: 820, lineHeight: 1.55 }}>
        Creator, soprattutto americane, che usano X per portare su OnlyFans: esempi per chi pubblica per le nostre creator. Voi tenete quelle utili e scartate le altre; delle tenute si leggono i post (ritmo, formati, link, orari, post che hanno girato di più). Il modo migliore per trovarne di nuove è <b style={{ fontWeight: 500 }}>«Allarga dalla rete»</b>: le creator si seguono tra loro, quindi chi seguono le vostre tenute sono creator simili.
      </p>
      {!data.configured && <Notice danger>Apify non è configurato sul server: la ricerca non può partire.</Notice>}
      <div style={{ ...cardBox, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", fontSize: 14, color: CP.textSecondary }}>Trova creator simili a quelle tenute (o, all&apos;inizio, alle più grandi da valutare) leggendo chi seguono. ~8 centesimi a creator di partenza, fino a 5 per volta.</div>
        <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => run("network", { action: "network" }, (d) => `Partita da ${d.result.seeds.map((x) => "@" + x).join(", ")}: letti ${d.result.read} seguiti, ${d.result.added} creator nuove da valutare.`)}>
          <Share2 size={15} />{busy === "network" ? "Leggo la rete… (fino a due minuti)" : "Allarga dalla rete"}
        </button>
      </div>
      <div style={{ ...cardBox, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <Field label="Cerca nei post" hint="Per partire o per una nicchia (es. tattoo, latina, goth, fitness). X nasconde molti contenuti sensibili a chi cerca da fuori: rende meno della rete.">
            <input style={input} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="nicchia (facoltativa)" />
          </Field>
        </div>
        <button type="button" style={{ ...btn, marginBottom: 12 }} disabled={!!busy} onClick={() => run("discover", { action: "discover", niche: niche.trim() || null }, (d) => `Letti ${d.result.posts} post, ${d.result.creators} creator con link OnlyFans, ${d.result.added} nuove da valutare.`)}>
          <Search size={15} />{busy === "discover" ? "Cerco… (fino a un minuto)" : "Cerca"}
        </button>
        <div style={{ flex: "1 1 200px" }}>
          <Field label="Aggiungi a mano" hint="Una reference che conoscete già: handle X o link"><input style={input} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" /></Field>
        </div>
        <button type="button" style={{ ...btn, marginBottom: 12 }} disabled={!!busy || !handle.trim()} onClick={() => run("add", { action: "add", handle }, () => { setHandle(""); return "Aggiunta tra le tenute: «Leggi i post» per i numeri."; })}><Plus size={15} />Aggiungi</button>
      </div>
      {msg && <Notice>{msg}</Notice>}

      <SectionHead aside="sulle reference tenute">Cosa fanno le migliori</SectionHead>
      <Patterns p={data.patterns} />

      <SectionHead aside={status === "tenuta" ? "si rileggono da sole ogni settimana" : null}>Reference</SectionHead>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Seg items={[["nuova", `Da valutare · ${c.nuova || 0}`], ["tenuta", `Tenute · ${c.tenuta || 0}`], ["scartata", `Scartate · ${c.scartata || 0}`]]} value={status} onChange={setStatusF} />
        <span style={{ flex: 1 }} />
        <select style={{ ...input, width: "auto", fontSize: 13.5, padding: "7px 10px" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="f">più follower</option><option value="views">più visualizzazioni</option><option value="new">più recenti</option>
        </select>
        {status === "tenuta" && <button type="button" style={btnSm} disabled={!!busy} onClick={() => run("analyze", { action: "analyze" }, (d) => (d.result.read ? `Letti i post di ${d.result.read} reference.` : "Le tenute sono già aggiornate (si rileggono ogni 7 giorni)."))}><RefreshCw size={13} />{busy === "analyze" ? "Leggo… (fino a due minuti)" : "Leggi i post"}</button>}
      </div>
      <div style={{ marginBottom: 12 }}><Seg items={[["0", "Tutte"], ["1", "Solo chi si dichiara donna"]]} value={onlyF} onChange={setOnlyF} /></div>
      {niches.length > 0 && <div style={{ marginBottom: 12 }}><Seg items={[["", "Tutte le nicchie"], ...niches.map((n) => [n, n])]} value={nicheF} onChange={setNicheF} /></div>}
      {!shown.length ? (
        <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}>
          <p style={{ ...hint, margin: 0, fontSize: 14 }}>{status === "nuova" ? "Nessuna reference da valutare: premi «Cerca» per trovarne di nuove." : status === "tenuta" ? "Nessuna reference tenuta: valuta quelle trovate e premi «Tieni» sulle utili." : "Nessuna reference scartata."}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12, alignItems: "stretch" }}>
          {shown.map((r) => (
            <RefCard key={r.key} r={r} busy={!!busy}
              onStatus={(key, st) => run("status", { action: "status", key, status: st }, null)}
              onSave={(key, note, ns) => run("note", { action: "note", key, note, niches: ns }, () => "Salvato")} />
          ))}
        </div>
      )}
      {data.log?.length > 0 && (
        <p style={{ ...hint, marginTop: 16 }}>Ultimi giri: {data.log.slice(0, 4).map((l) => `${new Date(l.at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} ${l.kind}${l.niche ? ` «${l.niche}»` : ""}${l.added != null ? ` · +${l.added}` : ""}${l.read != null ? ` · ${l.read} lette` : ""} · ~${String(l.usd ?? 0).replace(".", ",")} $`).join("  ·  ")}</p>
      )}
    </div>
  );
}
