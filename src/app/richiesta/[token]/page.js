"use client";

/**
 * /richiesta/[token] — le riprese da girare, viste dalla modella (26/11/2026).
 *
 * Pagina ESTERNA senza chrome interno (AppShell.isBareRoute): la modella non ha un account, il link
 * personale è l'auth. Una ripresa alla volta, in fila: il video di esempio che parte da solo, cosa
 * fare, outfit, cosa dire, la nota vocale; sotto, il caricamento dal telefono (dritto nello spazio
 * privato, a pezzi, con lo schermo tenuto acceso) e lo stato di ogni ripresa.
 *
 * Regole dallo studio (reports/richieste-modella-cp.html): riferimento per OGNI ripresa, scadenza
 * scritta in parole, le modifiche si chiedono solo su ciò che è scritto qui, la nota di «da rifare»
 * accanto alla ripresa. Il tono non mette fretta: la scadenza si dice, non si urla.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { uploadMedia, keepAwake } from "@/lib/richieste-upload-client";
import { fmtBytes, firstName } from "@/lib/richieste-core";

const API = (t) => `/api/richiesta/${encodeURIComponent(t)}`;
const STATE_LABEL = { da_girare: "Da girare", da_rifare: "Da rifare", da_vedere: "Caricata", approvata: "Approvata" };

export default function RichiestaModella() {
  const { token } = useParams();
  const [load, setLoad] = useState({ status: "loading" });
  const [busy, setBusy] = useState({}); // shotId → { pct, err }
  const [inlineErr, setInlineErr] = useState(null);
  const alertInline = (m) => { setInlineErr(m); setTimeout(() => setInlineErr(null), 5000); };

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(API(token), { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setLoad({ status: r.status === 404 ? "invalid" : "error", error: j?.error }); return; }
      setLoad({ status: j.link === "expired" ? "expired" : "ready", data: j });
    } catch { setLoad({ status: "error" }); }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onFile(shot, file) {
    if (!file) return;
    setBusy((b) => ({ ...b, [shot.id]: { pct: 0 } }));
    const release = await keepAwake();
    try {
      await uploadMedia({ base: API(token), kind: "take", shotId: shot.id, file, onProgress: (pct) => setBusy((b) => ({ ...b, [shot.id]: { pct } })) });
      setBusy((b) => { const n = { ...b }; delete n[shot.id]; return n; });
      await refresh();
    } catch (e) {
      setBusy((b) => ({ ...b, [shot.id]: { err: e.message } }));
    } finally { release(); }
  }

  async function removeTake(pathname) {
    try {
      const r = await fetch(`${API(token)}/file?p=${encodeURIComponent(pathname)}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "Non è stato possibile togliere il file.");
      await refresh();
    } catch (e) { alertInline(e.message); }
  }
  const uploading = Object.values(busy).some((b) => b && b.pct != null);
  useEffect(() => {
    if (!uploading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  return (
    <div className="ric">
      <style>{CSS}</style>
      <main className="wrap">
        <div className="brand"><span className="wordmark">House of Creators</span></div>
        {load.status === "loading" && <div className="card msg"><p className="muted">Apro le tue riprese…</p></div>}
        {load.status === "invalid" && <div className="card msg"><h2>Link non valido</h2><p className="muted">Controlla di averlo copiato tutto, o chiedine uno nuovo a chi te l'ha mandato.</p></div>}
        {load.status === "expired" && <div className="card msg"><h2>Questo link è scaduto</h2><p className="muted">Chiedine uno nuovo a chi te l'ha mandato.</p></div>}
        {load.status === "error" && <div className="card msg"><h2>Non riesco ad aprire la pagina</h2><p className="muted">{load.error || "Controlla la connessione e riprova."}</p><button className="btn ghost" onClick={refresh}>Riprova</button></div>}
        {load.status === "ready" && <Ready d={load.data} busy={busy} onFile={onFile} onRemove={removeTake} />}
        {inlineErr && <div className="toast" role="alert">{inlineErr}</div>}
      </main>
    </div>
  );
}

function Ready({ d, busy, onFile, onRemove }) {
  const hi = firstName(d.creatorName);
  const pct = d.total ? Math.round((d.delivered / d.total) * 100) : 0;
  const allIn = d.total > 0 && d.delivered === d.total;
  const allOk = d.state === "approvata";
  const redo = d.counts?.da_rifare || 0;
  return (
    <>
      <header className="head">
        <p className="eyebrow">{hi ? `Ciao ${hi}` : "Le tue riprese"}</p>
        <h1>{d.title}</h1>
        {!allIn && <p className={`due${d.deadlineText?.late ? " late" : ""}`}>
          {d.deadlineText?.late ? `La scadenza è ${d.deadlineText.text.replace("scaduta", "passata")}: carica appena puoi.` : `Da caricare ${d.deadlineText?.text}${d.deadlineText?.left ? ` · ${d.deadlineText.left}` : ""}.`}
        </p>}
        <div className="progress" aria-label={`${d.delivered} di ${d.total} riprese caricate`}>
          <div className="bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="small muted">{d.delivered} di {d.total} {d.total === 1 ? "ripresa caricata" : "riprese caricate"}{redo ? ` · ${redo} da rifare` : ""}</span>
        </div>
      </header>

      {allOk && <div className="card done"><h2>Tutto approvato</h2><p className="muted">Grazie! Le riprese sono tutte a posto.</p></div>}
      {!allOk && allIn && !redo && <div className="card done"><h2>Hai caricato tutto</h2><p className="muted">Grazie! Le guardiamo e, se serve rifare qualcosa, la trovi segnata qui sotto con la nota.</p></div>}

      {d.note && <section className="card note"><p className="eyebrow">Per questa volta</p><p className="pre">{d.note}</p></section>}

      <p className="small muted rule-line">Le modifiche te le chiediamo solo su ciò che è scritto qui. Dove c'è un video di esempio, guardalo prima di girare.</p>

      <ol className="shots">
        {d.shots.map((s) => <Shot key={s.id} s={s} total={d.total} b={busy[s.id]} onFile={onFile} onRemove={onRemove} uploads={d.uploads} />)}
      </ol>
      <p className="small muted center">Puoi chiudere la pagina e riaprire lo stesso link quando vuoi: ciò che hai caricato resta qui.</p>
    </>
  );
}

function Shot({ s, total, b, onFile, onRemove, uploads }) {
  const uploadingHere = b && b.pct != null;
  const label = STATE_LABEL[s.state];
  return (
    <li className={`card shot st-${s.state}`}>
      <div className="shot-head">
        <span className="eyebrow">Ripresa {s.n} di {total}</span>
        <span className={`chip c-${s.state}`}>{s.state === "approvata" ? "✓ " : ""}{label}</span>
      </div>
      <h2>{s.title}</h2>

      {s.state === "da_rifare" && s.redoNote && <div className="redo"><strong>Da rifare:</strong> {s.redoNote}</div>}

      {(s.ref?.url || s.refLink) && (
        <div className="ref">
          {s.ref?.url && s.ref.family === "video" && <video src={s.ref.url} autoPlay muted loop playsInline controls preload="metadata" />}
          {s.ref?.url && s.ref.family === "photo" && <img src={s.ref.url} alt={`Esempio per ${s.title}`} />}
          {s.refLink && <a className="btn ghost small-btn" href={s.refLink} target="_blank" rel="noopener noreferrer">{s.ref?.url ? "Apri anche il link di esempio" : "Apri il video di esempio"} ↗</a>}
        </div>
      )}

      <dl className="brief">
        {s.what && <><dt>Cosa fare</dt><dd className="pre">{s.what}</dd></>}
        {s.outfit && <><dt>Outfit</dt><dd>{s.outfit}</dd></>}
        {s.line && <><dt>Cosa dire</dt><dd className="quote pre">«{s.line}»</dd></>}
      </dl>
      {s.voice?.url && <div className="voice"><span className="small muted">Nota vocale</span><audio src={s.voice.url} controls preload="none" /></div>}

      {s.takes.length > 0 && (
        <div className="takes">
          <p className="small muted">{s.takes.length === 1 ? "Il tuo file" : `I tuoi ${s.takes.length} file`}</p>
          <ul>
            {s.takes.map((t) => (
              <li key={t.pathname}>
                {t.url && t.family === "video" && <video src={`${t.url}#t=0.1`} preload="metadata" playsInline controls />}
                {t.url && t.family === "photo" && <img src={t.url} alt="La tua ripresa" />}
                {!t.url && <div className="noprev small muted">Anteprima non disponibile</div>}
                <div className="take-meta small muted">
                  <span>{new Date(t.at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {fmtBytes(t.size)}</span>
                  {t.removable && !uploadingHere && <button className="link" onClick={() => onRemove(t.pathname)}>Togli</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploadingHere && (
        <div className="uploading" role="status">
          <div className="bar"><span style={{ width: `${b.pct}%` }} /></div>
          <span className="small">Carico… {b.pct}% · tieni aperta questa pagina finché non arriva in fondo</span>
        </div>
      )}
      {b?.err && <p className="err small" role="alert">{b.err}</p>}

      {!uploadingHere && s.upload?.ok && uploads && (
        <label className={`btn upload${s.takes.length ? " ghost" : ""}`}>
          {s.state === "da_rifare" ? "Carica la nuova versione" : s.takes.length ? "Carica un'altra versione" : "Carica la ripresa"}
          <input type="file" accept="video/*,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(s, f); }} />
        </label>
      )}
      {!uploads && <p className="small muted">Il caricamento non è attivo in questo momento: riprova più tardi.</p>}
      {s.state === "da_vedere" && !uploadingHere && <p className="small muted">La stiamo guardando. Se serve rifarla te la segniamo qui con una nota.</p>}
    </li>
  );
}

// Palette fissa chiara, come la scheda numeri: la modella la apre da un messaggio, sul telefono.
const CSS = `
body { background: #F5F4F0; }
.ric { --bg:#F5F4F0; --surface:#FFFFFF; --ink:#16161A; --muted:#6A6A72; --line:#E4E2DC; --soft:#F0EFEA;
  --accent:#2F54D6; --accent-soft:#EAEFFD; --ok:#1F7A4D; --ok-soft:#E7F3EC; --warn:#9A5B00; --warn-soft:#FBF1DF; --bad:#B4332E;
  min-height:100vh; background:var(--bg); color:var(--ink); color-scheme: light;
  font-family: var(--cp-font), Inter, -apple-system, system-ui, "Segoe UI", sans-serif; font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; }
.ric *{ box-sizing:border-box; }
.ric .wrap{ max-width:720px; margin:0 auto; padding: 18px max(16px, env(safe-area-inset-right,0px)) 64px max(16px, env(safe-area-inset-left,0px)); display:grid; gap:18px; }
.ric h1,.ric h2{ margin:0; letter-spacing:-0.015em; text-wrap:balance; }
.ric h1{ font-size:clamp(1.7rem,6vw,2.3rem); line-height:1.1; font-weight:650; }
.ric h2{ font-size:1.25rem; font-weight:650; line-height:1.25; }
.ric p{ margin:0; }
.ric a{ color:var(--accent); }
.ric .brand{ display:flex; justify-content:center; padding:2px 0 4px; }
.ric .wordmark{ font-size:.74rem; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.ric .eyebrow{ font-size:.74rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.ric .muted{ color:var(--muted); }
.ric .small{ font-size:.88rem; }
.ric .center{ text-align:center; }
.ric .err{ color:var(--bad); }
.ric .pre{ white-space:pre-wrap; }
.ric .card{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:20px; min-width:0; }
.ric .msg{ display:grid; gap:10px; text-align:center; padding:40px 22px; justify-items:center; }
.ric .head{ display:grid; gap:10px; padding:6px 0 2px; }
.ric .due{ font-size:1.02rem; }
.ric .due.late{ color:var(--warn); }
.ric .progress{ display:grid; gap:6px; }
.ric .bar{ height:6px; border-radius:9px; background:var(--line); overflow:hidden; }
.ric .bar span{ display:block; height:100%; background:var(--ink); border-radius:9px; transition:width .25s ease; }
.ric .done{ border-color:var(--ok); background:var(--ok-soft); display:grid; gap:4px; }
.ric .note{ display:grid; gap:6px; }
.ric .rule-line{ padding:0 4px; }
.ric .shots{ list-style:none; margin:0; padding:0; display:grid; gap:16px; }
.ric .shot{ display:grid; gap:14px; }
.ric .shot.st-approvata{ opacity:.86; }
.ric .shot-head{ display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.ric .chip{ font-size:.8rem; font-weight:600; border-radius:999px; padding:4px 10px; border:1px solid var(--line); background:var(--soft); color:var(--muted); white-space:nowrap; }
.ric .chip.c-da_rifare{ background:var(--warn-soft); border-color:var(--warn); color:var(--warn); }
.ric .chip.c-da_vedere{ background:var(--accent-soft); border-color:var(--accent); color:var(--accent); border-style:dashed; }
.ric .chip.c-approvata{ background:var(--ok-soft); border-color:var(--ok); color:var(--ok); }
.ric .redo{ background:var(--warn-soft); border:1px solid var(--warn); color:#5c3700; border-radius:12px; padding:12px 14px; }
.ric .ref{ display:grid; gap:10px; }
.ric .ref video, .ric .ref img{ width:100%; max-height:70vh; border-radius:14px; background:#111; object-fit:contain; display:block; }
.ric .brief{ margin:0; display:grid; gap:4px 0; }
.ric .brief dt{ font-size:.74rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; margin-top:8px; }
.ric .brief dt:first-child{ margin-top:0; }
.ric .brief dd{ margin:0; }
.ric .quote{ font-size:1.08rem; font-weight:500; }
.ric .voice{ display:grid; gap:6px; }
.ric .voice audio{ width:100%; }
.ric .takes{ display:grid; gap:8px; border-top:1px solid var(--line); padding-top:12px; }
.ric .takes ul{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; }
.ric .takes li{ display:grid; gap:4px; min-width:0; }
.ric .takes video, .ric .takes img{ width:100%; aspect-ratio:9/16; object-fit:cover; border-radius:10px; background:#111; display:block; }
.ric .noprev{ aspect-ratio:9/16; border-radius:10px; background:var(--soft); display:grid; place-items:center; text-align:center; padding:8px; }
.ric .take-meta{ display:flex; justify-content:space-between; gap:6px; flex-wrap:wrap; }
.ric .link{ font:inherit; background:none; border:0; color:var(--accent); padding:0; cursor:pointer; text-decoration:underline; }
.ric .uploading{ display:grid; gap:6px; }
.ric .uploading .bar span{ background:var(--accent); }
.ric .btn{ font:inherit; font-weight:600; font-size:1rem; background:var(--ink); color:#fff; border:1px solid var(--ink); border-radius:12px; padding:13px 20px; cursor:pointer; min-height:50px; display:inline-flex; align-items:center; justify-content:center; text-decoration:none; text-align:center; }
.ric .btn.ghost{ background:transparent; color:var(--ink); border-color:var(--line); }
.ric .small-btn{ min-height:42px; font-size:.92rem; justify-self:start; }
.ric .upload{ position:relative; width:100%; }
.ric .upload input{ position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; }
.ric .toast{ position:fixed; left:16px; right:16px; bottom:max(16px, env(safe-area-inset-bottom,0px)); background:var(--ink); color:#fff; border-radius:12px; padding:12px 16px; max-width:688px; margin:0 auto; }
.ric button:focus-visible, .ric a:focus-visible, .ric .upload:focus-within{ outline:2px solid var(--accent); outline-offset:2px; }
`;
