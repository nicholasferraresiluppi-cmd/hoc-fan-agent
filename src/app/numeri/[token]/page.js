"use client";

/**
 * /numeri/[token] — «Scheda numeri» per la creator (19/11/2026).
 *
 * Pagina ESTERNA senza chrome interno (AppShell.isBareRoute): la creator non ha un account,
 * il link personale è l'auth. Cinque capitoli brevi; per ogni screenshot, DI FIANCO, la
 * schermata d'esempio disegnata (con evidenziato cosa deve vedersi) e il suo caricamento.
 * Si salva da sola mentre scrive: può chiudere e riprendere dallo stesso link.
 *
 * Le schermate d'esempio sono disegnate (numeri inventati, dichiarato a schermo), senza
 * loghi delle piattaforme. I percorsi dei menu vengono da guide di terzi (19/11/2026):
 * ogni passo ha il ripiego «se non lo trovi qui, guarda lì».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CHAPTERS, SHOT_STEPS, CONTENT_TYPES, CONTENT_LEVELS, FACE_OPTIONS, PLATFORM_OPTIONS, PAGE_KIND_OPTIONS,
  EARN_BANDS, YES_NO, MAX_FILES_PER_STEP, missingForSubmit, shotProgress, groupFiles,
} from "@/lib/creator-numeri-core";
import { shrinkImage } from "@/lib/hr-upload-client";

const API = (t) => `/api/numeri/${encodeURIComponent(t)}`;

async function postJson(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw Object.assign(new Error(j?.error || `Qualcosa non ha funzionato (${r.status}).`), { data: j });
  return j;
}

async function uploadShot(token, step, original, onProgress) {
  if (!/^image\//.test(original?.type || "")) throw new Error("Carica una foto o uno screenshot.");
  const file = await shrinkImage(original);
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Formato non letto: prova a fare lo screenshot di nuovo.");
  const slot = await postJson(`${API(token)}/upload`, { type: "slot", step, contentType: file.type, size: file.size });
  const { upload } = await import("@vercel/blob/client");
  try {
    await upload(slot.pathname, file, {
      access: "private", handleUploadUrl: `${API(token)}/upload`, contentType: file.type,
      onUploadProgress: (e) => onProgress?.(Math.round(e?.percentage || 0)),
    });
  } catch {
    throw new Error("Caricamento interrotto. Controlla la connessione e riprova.");
  }
  const done = await postJson(`${API(token)}/file`, { pathname: slot.pathname });
  return done.file;
}

export default function SchedaNumeri() {
  const { token } = useParams();
  const [load, setLoad] = useState({ status: "loading" });
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState([]);
  const [screen, setScreen] = useState("intro"); // intro | 0..4 | done
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const dirty = useRef(false);
  const topRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(API(token), { cache: "no-store" })
      .then(async (r) => ({ r, j: await r.json().catch(() => null) }))
      .then(({ r, j }) => {
        if (!alive) return;
        if (!r.ok || !j?.ok) { setLoad({ status: "error", error: j?.error || "Link non valido." }); return; }
        setAnswers(j.answers || {});
        setFiles(j.files || []);
        setLoad({ status: "ok", state: j.state, name: j.name, uploads: j.uploads, resumed: Object.keys(j.answers || {}).length > 0 || (j.files || []).length > 0 });
        if (j.state === "submitted") setScreen("done");
      })
      .catch(() => alive && setLoad({ status: "error", error: "Non riesco a caricare la pagina. Controlla la connessione e riprova." }));
    return () => { alive = false; };
  }, [token]);

  // salvataggio automatico: 1,2 s dopo l'ultima modifica
  useEffect(() => {
    if (!dirty.current || load.state !== "open") return;
    setSaveState("saving");
    const t = setTimeout(() => {
      postJson(API(token), { type: "save", answers })
        .then(() => { dirty.current = false; setSaveState("saved"); })
        .catch(() => setSaveState("error"));
    }, 1200);
    return () => clearTimeout(t);
  }, [answers, token, load.state]);

  const set = useCallback((k, v) => { dirty.current = true; setAnswers((a) => ({ ...a, [k]: v })); }, []);
  const setIn = useCallback((group, k, v) => { dirty.current = true; setAnswers((a) => ({ ...a, [group]: { ...(a[group] || {}), [k]: v } })); }, []);

  const go = (s) => { setScreen(s); setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const byStep = useMemo(() => groupFiles(files), [files]);
  const prog = shotProgress(byStep, answers.skip, answers.platform);
  const missing = missingForSubmit(answers);
  const errOf = (k) => (showErrors ? missing.find((m) => m.key === k)?.msg : null);

  async function onSubmit() {
    setSubmitErr(null);
    if (missing.length) {
      setShowErrors(true);
      const ch = CHAPTERS.findIndex((c) => c.id === missing[0].chapter);
      setSubmitErr(missing[0].msg);
      if (ch >= 0 && ch !== screen) go(ch);
      return;
    }
    setSubmitting(true);
    try {
      await postJson(API(token), { type: "submit", answers });
      dirty.current = false;
      setLoad((l) => ({ ...l, state: "submitted" }));
      go("done");
    } catch (e) {
      setSubmitErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (load.status === "loading") return <Shell><p className="muted center">Un attimo…</p></Shell>;
  if (load.status === "error") return <Shell><Message title="Questo link non funziona" text={load.error} /></Shell>;
  if (load.state === "expired") return <Shell><Message title="Il link è scaduto" text="Chiedine uno nuovo a chi te l'ha mandato: quello che avevi già scritto non si perde." /></Shell>;

  const readOnly = load.state !== "open";
  const chIdx = typeof screen === "number" ? screen : -1;

  return (
    <Shell>
      <div ref={topRef} />
      {screen === "intro" && (
        <Intro name={load.name} resumed={load.resumed} onStart={() => go(0)} />
      )}

      {chIdx >= 0 && (
        <>
          <Stepper current={chIdx} onGo={go} prog={prog} saveState={saveState} />
          {chIdx === 0 && <ChapterChi a={answers} set={set} errOf={errOf} />}
          {chIdx === 1 && <ChapterContenuti a={answers} set={set} setIn={setIn} />}
          {chIdx === 2 && (
            <ChapterPagina a={answers} set={set}>
              {answers.platform !== "Non ho ancora una pagina" && SHOT_STEPS.filter((s) => s.chapter === "pagina").map((s, i) => (
                <ShotStep key={s.id} n={i + 1} step={s} token={token} files={byStep[s.id] || []} setFiles={setFiles}
                  skipped={answers.skip?.[s.id] === true} onSkip={(v) => setIn("skip", s.id, v)} readOnly={readOnly} uploads={load.uploads}
                  fanvue={answers.platform === "Fanvue"} />
              ))}
            </ChapterPagina>
          )}
          {chIdx === 3 && (
            <section className="chapter">
              <ChapterHead n={4} title="Instagram e TikTok" text="Quanta gente ti vede e chi è. Se un social non lo usi, segna «Non lo uso» e vai avanti." />
              {SHOT_STEPS.filter((s) => s.chapter === "social").map((s, i) => (
                <ShotStep key={s.id} n={i + 1} step={s} token={token} files={byStep[s.id] || []} setFiles={setFiles}
                  skipped={answers.skip?.[s.id] === true} onSkip={(v) => setIn("skip", s.id, v)} readOnly={readOnly} uploads={load.uploads} />
              ))}
            </section>
          )}
          {chIdx === 4 && (
            <ChapterDomande a={answers} set={set} errOf={errOf}>
              {SHOT_STEPS.filter((s) => s.chapter === "domande").map((s) => (
                <ShotStep key={s.id} step={s} token={token} files={byStep[s.id] || []} setFiles={setFiles}
                  skipped={false} readOnly={readOnly} uploads={load.uploads} />
              ))}
            </ChapterDomande>
          )}

          <nav className="pager">
            {chIdx > 0 ? <button type="button" className="btn ghost" onClick={() => go(chIdx - 1)}>Indietro</button> : <span />}
            {chIdx < CHAPTERS.length - 1
              ? <button type="button" className="btn" onClick={() => go(chIdx + 1)}>Avanti: {CHAPTERS[chIdx + 1].label.toLowerCase()}</button>
              : <button type="button" className="btn" disabled={submitting || readOnly} onClick={onSubmit}>{submitting ? "Invio…" : "Invia la scheda"}</button>}
          </nav>
          {submitErr && <p className="err center" role="alert">{submitErr}</p>}
          {chIdx === CHAPTERS.length - 1 && prog.done < prog.total && !submitErr && (
            <p className="muted center small">Hai caricato o segnato {prog.done} screenshot su {prog.total}. Puoi inviare lo stesso: quelli che mancano ce li puoi mandare dopo.</p>
          )}
        </>
      )}

      {screen === "done" && <Done name={answers.stageName || load.name} />}
    </Shell>
  );
}

// ── Cornice ─────────────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div className="numeri">
      <style>{CSS}</style>
      <div className="wrap">
        <header className="brand"><span className="wordmark">House of Creators</span></header>
        {children}
        <footer className="foot">I dati che ci mandi servono solo a valutare una collaborazione con te. Puoi chiederci di cancellarli quando vuoi. <a href="/privacy" target="_blank" rel="noreferrer">Informativa privacy</a></footer>
      </div>
    </div>
  );
}

function Message({ title, text }) {
  return <div className="card msg"><h1>{title}</h1><p className="muted">{text}</p></div>;
}

function Intro({ name, resumed, onStart }) {
  const first = String(name || "").trim().split(/\s+/)[0];
  return (
    <section className="intro">
      <p className="eyebrow">La tua scheda</p>
      <h1>{first ? `Ciao ${first},` : "Ciao,"} raccontaci a che punto sei</h1>
      <p className="lead">Prima di proporti qualcosa vogliamo capire dove sei oggi e quanto puoi crescere davvero. Ti chiediamo qualche informazione, cosa ti va di fare e alcuni screenshot delle tue statistiche. Per ogni screenshot trovi un esempio con evidenziato cosa deve vedersi, e lo carichi lì accanto.</p>
      <div className="rules">
        <div className="rule"><b>Circa 15 minuti</b><span>Si salva da solo: puoi chiudere e riprendere da questo link quando vuoi.</span></div>
        <div className="rule"><b>Mai password</b><span>Solo screenshot. Non dare mai le tue credenziali a nessuno, nemmeno a noi.</span></div>
        <div className="rule"><b>Copri i nomi dei fan</b><span>Ci servono i numeri, non chi sono. Passa il dito sopra i nomi con la modifica foto.</span></div>
      </div>
      <button type="button" className="btn big" onClick={onStart}>{resumed ? "Riprendi da dove eri" : "Iniziamo"}</button>
    </section>
  );
}

function Done({ name }) {
  return (
    <section className="intro done">
      <p className="eyebrow">Fatto</p>
      <h1>Grazie{name ? `, ${String(name).trim()}` : ""}. Abbiamo ricevuto tutto.</h1>
      <p className="lead">Guardiamo con calma i tuoi numeri e ti ricontattiamo noi. Se ti viene in mente qualcosa da aggiungere, scrivilo a chi ti ha mandato questo link.</p>
    </section>
  );
}

function Stepper({ current, onGo, prog, saveState }) {
  return (
    <div className="stepper">
      <ol>
        {CHAPTERS.map((c, i) => (
          <li key={c.id}>
            <button type="button" className={i === current ? "on" : i < current ? "past" : ""} onClick={() => onGo(i)} aria-current={i === current ? "step" : undefined}>
              <span className="dot">{i + 1}</span><span className="lbl">{c.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="stepmeta">
        <span>Screenshot {prog.done} di {prog.total}</span>
        <span className={saveState === "error" ? "err" : ""}>{saveState === "saving" ? "Salvo…" : saveState === "saved" ? "Salvato" : saveState === "error" ? "Non salvato: controlla la connessione" : ""}</span>
      </div>
    </div>
  );
}

function ChapterHead({ n, title, text }) {
  return (
    <div className="chhead">
      <p className="eyebrow">Parte {n} di {CHAPTERS.length}</p>
      <h2>{title}</h2>
      {text && <p className="muted">{text}</p>}
    </div>
  );
}

// ── Campi ───────────────────────────────────────────────────────────────────
function Field({ label, hint, error, children, id }) {
  return (
    <label className={`field${error ? " bad" : ""}`} htmlFor={id}>
      <span className="flabel">{label}</span>
      {children}
      {hint && !error && <span className="fhint">{hint}</span>}
      {error && <span className="ferr">{error}</span>}
    </label>
  );
}
function Text({ id, a, set, k, placeholder, type = "text", inputMode, autoComplete }) {
  return <input id={id || k} type={type} inputMode={inputMode} autoComplete={autoComplete || "off"} value={a[k] || ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />;
}
function Area({ a, set, k, placeholder, rows = 3 }) {
  return <textarea id={k} rows={rows} value={a[k] || ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />;
}
function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? "chip on" : "chip"} onClick={() => onChange(value === o ? undefined : o)}>{o}</button>
      ))}
    </div>
  );
}
function Check({ checked, onChange, children, error, id }) {
  return (
    <div className={`check${error ? " bad" : ""}`}>
      <label htmlFor={id}><input id={id} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>
      {error && <span className="ferr">{error}</span>}
    </div>
  );
}

function ChapterChi({ a, set, errOf }) {
  return (
    <section className="chapter">
      <ChapterHead n={1} title="Chi sei" text="Il nome con cui lavori e dove ti troviamo online." />
      <div className="card form">
        <div className="grid2">
          <Field label="Nome con cui lavori" error={errOf("stageName")} id="stageName"><Text a={a} set={set} k="stageName" placeholder="Es. Giulia Rossi" autoComplete="nickname" /></Field>
          <Field label="Nome e cognome veri" hint="Facoltativo" id="realName"><Text a={a} set={set} k="realName" autoComplete="name" /></Field>
          <Field label="Città" hint="Facoltativo" id="city"><Text a={a} set={set} k="city" autoComplete="address-level2" /></Field>
          <Field label="Dove ti scriviamo" hint="Telegram o WhatsApp, facoltativo" id="contact"><Text a={a} set={set} k="contact" placeholder="@nome o numero" /></Field>
        </div>
      </div>
      <div className="card form">
        <h3>I tuoi profili</h3>
        <p className="muted small">Incolla il link o scrivi il nome utente. Ne basta uno, ma più ne metti meglio è.</p>
        {errOf("ig") && <p className="ferr">{errOf("ig")}</p>}
        <div className="grid2">
          <Field label="Instagram" id="ig"><Text a={a} set={set} k="ig" placeholder="instagram.com/…" inputMode="url" /></Field>
          <Field label="TikTok" id="tiktok"><Text a={a} set={set} k="tiktok" placeholder="tiktok.com/@…" inputMode="url" /></Field>
          <Field label="X (Twitter)" id="x"><Text a={a} set={set} k="x" placeholder="x.com/…" inputMode="url" /></Field>
          <Field label="Canale Telegram" id="telegram"><Text a={a} set={set} k="telegram" placeholder="t.me/…" inputMode="url" /></Field>
          <Field label="OnlyFans" id="onlyfans"><Text a={a} set={set} k="onlyfans" placeholder="onlyfans.com/…" inputMode="url" /></Field>
          <Field label="Fanvue" id="fanvue"><Text a={a} set={set} k="fanvue" placeholder="fanvue.com/…" inputMode="url" /></Field>
        </div>
        <Field label="Altri profili" hint="Reddit, YouTube, Twitch, un secondo Instagram…" id="otherSocial"><Area a={a} set={set} k="otherSocial" rows={2} /></Field>
      </div>
      <Check id="adult" checked={a.adult} onChange={(v) => set("adult", v || undefined)} error={errOf("adult")}>Confermo di avere almeno 18 anni.</Check>
    </section>
  );
}

function ChapterContenuti({ a, set, setIn }) {
  return (
    <section className="chapter">
      <ChapterHead n={2} title="I tuoi contenuti" text="Per ogni tipo dicci se lo fai già, se lo faresti o se per te è un no. Nessuna risposta è sbagliata: ci serve solo per sapere cosa proporti e cosa no." />
      <div className="card ctable">
        <div className="crow head" aria-hidden="true"><span />{CONTENT_LEVELS.map((l) => <span key={l.id}><span className="long">{l.label}</span><span className="short">{l.short}</span></span>)}</div>
        {CONTENT_TYPES.map((t) => {
          const v = a.content?.[t.id];
          return (
            <div className="crow" key={t.id} role="radiogroup" aria-label={t.label}>
              <span className="cname">{t.label}</span>
              {CONTENT_LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={v === l.id} aria-label={`${t.label}: ${l.label}`}
                  className={`lvl lvl-${l.id}${v === l.id ? " on" : ""}`} onClick={() => setIn("content", t.id, v === l.id ? undefined : l.id)}>
                  <span className="lvl-txt">{l.label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="card form">
        <Field label="Mostri il viso nei contenuti?"><Chips label="Mostri il viso" options={FACE_OPTIONS} value={a.face} onChange={(v) => set("face", v)} /></Field>
      </div>
    </section>
  );
}

function ChapterPagina({ a, set, children }) {
  const none = a.platform === "Non ho ancora una pagina";
  return (
    <section className="chapter">
      <ChapterHead n={3} title="La tua pagina" text="Qui ci sono i numeri più importanti. Puoi fare gli screenshot dall'app o dal sito: dal sito si vede di più." />
      <div className="card form">
        <Field label="Dove vendi i tuoi contenuti?"><Chips label="Piattaforma" options={PLATFORM_OPTIONS} value={a.platform} onChange={(v) => set("platform", v)} /></Field>
        {!none && (
          <div className="grid2">
            <Field label="Prezzo dell'abbonamento" hint="Es. 9,99 $ o gratis" id="subPrice"><Text a={a} set={set} k="subPrice" /></Field>
            <Field label="Da quando hai la pagina" hint="Mese e anno, anche a occhio" id="since"><Text a={a} set={set} k="since" placeholder="Es. marzo 2024" /></Field>
            <Field label="La pagina è…"><Chips label="Tipo di pagina" options={PAGE_KIND_OPTIONS} value={a.pageKind} onChange={(v) => set("pageKind", v)} /></Field>
            <Field label="Quanto guadagni in un mese normale" hint="Più o meno, in dollari"><select value={a.earnBand || ""} onChange={(e) => set("earnBand", e.target.value || undefined)}><option value="">Scegli…</option>{EARN_BANDS.map((b) => <option key={b}>{b}</option>)}</select></Field>
          </div>
        )}
        {none && <p className="muted small">Nessun problema: salta pure questa parte e passa a Instagram e TikTok.</p>}
      </div>
      {children}
    </section>
  );
}

function ChapterDomande({ a, set, errOf, children }) {
  return (
    <section className="chapter">
      <ChapterHead n={5} title="Ultime domande" text="Queste non stanno in nessuno screenshot. Scrivi come ti viene, anche poche parole." />
      <div className="card form">
        <Field label="Quanti contenuti hai già pronti che non hai ancora pubblicato o venduto?" id="readyContent"><Area a={a} set={set} k="readyContent" rows={2} /></Field>
        <Field label="Quanti contenuti nuovi riesci a fare in una settimana?" id="perWeek"><Area a={a} set={set} k="perWeek" rows={2} /></Field>
        <Field label="Chi risponde oggi ai messaggi dei fan, e per quante ore al giorno?" id="chatToday"><Area a={a} set={set} k="chatToday" rows={2} /></Field>
        <Field label="Hai già lavorato con un'agenzia? Com'è andata, e hai ancora vincoli di contratto?" id="agency"><Area a={a} set={set} k="agency" /></Field>
        <Field label="Quanto tempo puoi dedicarci a settimana, e che obiettivo hai?" id="timeGoal"><Area a={a} set={set} k="timeGoal" /></Field>
        <Field label="Ti hanno mai bloccato o limitato un profilo?"><Chips label="Profili bloccati" options={YES_NO} value={a.banned} onChange={(v) => set("banned", v)} /></Field>
        {a.banned === "Sì" && <Field label="Quale, e quando?" id="banDetail"><Area a={a} set={set} k="banDetail" rows={2} /></Field>}
        <Field label="Che lingue parli?" id="languages"><Text a={a} set={set} k="languages" placeholder="Es. italiano, inglese" /></Field>
        <Field label="Vuoi aggiungere altro?" hint="Facoltativo" id="notes"><Area a={a} set={set} k="notes" /></Field>
      </div>
      {children}
      <Check id="privacy" checked={a.privacy} onChange={(v) => set("privacy", v || undefined)} error={errOf("privacy")}>
        Acconsento al trattamento dei miei dati e degli screenshot per valutare una collaborazione con House of Creators (<a href="/privacy" target="_blank" rel="noreferrer">informativa</a>).
      </Check>
    </section>
  );
}

// ── Uno screenshot: spiegazione, esempio e caricamento di fianco ───────────
function ShotStep({ n, step, token, files, setFiles, skipped, onSkip, readOnly, uploads, fanvue }) {
  const [busy, setBusy] = useState(null); // { progress } | null
  const [err, setErr] = useState(null);
  const [local, setLocal] = useState({}); // pathname → objectURL (anteprima appena caricata)
  const inputRef = useRef(null);
  const full = files.length >= MAX_FILES_PER_STEP;

  async function onPick(e) {
    const picked = Array.from(e.target.files || []).slice(0, MAX_FILES_PER_STEP - files.length);
    e.target.value = "";
    if (!picked.length) return;
    setErr(null);
    for (const f of picked) {
      setBusy({ progress: 0 });
      try {
        const saved = await uploadShot(token, step.id, f, (p) => setBusy({ progress: p }));
        setLocal((m) => ({ ...m, [saved.pathname]: URL.createObjectURL(f) }));
        setFiles((list) => [...list, saved]);
        if (skipped) onSkip?.(undefined);
      } catch (ex) {
        setErr(ex.message);
        break;
      }
    }
    setBusy(null);
  }

  async function onRemove(pathname) {
    setErr(null);
    const r = await fetch(`${API(token)}/file?p=${encodeURIComponent(pathname)}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) { setErr("Non è stato possibile toglierlo. Riprova."); return; }
    setFiles((list) => list.filter((f) => f.pathname !== pathname));
  }

  const done = files.length > 0 || skipped;
  return (
    <article className={`card shot${done ? " done" : ""}`}>
      <div className="shot-head">
        <div className="shot-title">
          {n ? <span className="stepno">{done ? "✓" : n}</span> : null}
          <h3>{step.title}</h3>
        </div>
        <span className="period">{step.period}</span>
      </div>
      {step.path.length > 0 && (
        <div className="path" aria-label="Dove trovarlo">
          {step.path.map((p, i) => <span key={i} className="crumb">{i > 0 && <i>›</i>}<span>{p}</span></span>)}
        </div>
      )}
      {fanvue && <p className="small muted">Su Fanvue trovi gli stessi dati nella pagina Insights.</p>}
      <ul className="look">
        {step.look.map((l, i) => <li key={i}><span className="n">{i + 1}</span><span>{l}</span></li>)}
      </ul>
      {step.tip && <p className="tip">{step.tip}</p>}

      <div className="pair">
        {step.mock && (
          <figure className="example">
            <figcaption>Esempio</figcaption>
            <Mock kind={step.mock} />
            <span className="cap">Numeri inventati, solo per farti vedere cosa inquadrare</span>
          </figure>
        )}
        <div className="mine">
          <span className="figlabel">Il tuo screenshot</span>
          {files.length > 0 && (
            <div className="thumbs">
              {files.map((f) => (
                <div className="thumb" key={f.pathname}>
                  <img src={local[f.pathname] || `${API(token)}/file?p=${encodeURIComponent(f.pathname)}`} alt="Screenshot caricato" />
                  {!readOnly && <button type="button" className="x" aria-label="Togli questo screenshot" onClick={() => onRemove(f.pathname)}>×</button>}
                </div>
              ))}
            </div>
          )}
          {!readOnly && uploads && !full && (
            <button type="button" className={`drop${files.length ? " small" : ""}`} disabled={!!busy} onClick={() => inputRef.current?.click()}>
              {busy ? (
                <span className="busy"><span className="bar"><b style={{ width: `${busy.progress}%` }} /></span>Carico…</span>
              ) : (
                <><span className="plus">+</span><span>{files.length ? "Aggiungi un altro" : "Carica lo screenshot"}</span></>
              )}
            </button>
          )}
          {!uploads && !readOnly && <p className="small muted">Il caricamento non è attivo in questo momento: riprova più tardi.</p>}
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
          {err && <p className="ferr" role="alert">{err}</p>}
          {!step.optional && onSkip && files.length === 0 && !readOnly && (
            <label className="skip"><input type="checkbox" checked={!!skipped} onChange={(e) => onSkip(e.target.checked || undefined)} /> {step.chapter === "social" ? "Non lo uso" : "Non ce l'ho"}</label>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Schermate d'esempio (disegnate, numeri inventati) ───────────────────────
function Phone({ title, tabs, on, children }) {
  return (
    <div className="phone"><div className="scr">
      <div className="sbar"><span>9:41</span><em>●●●</em></div>
      <div className="ahead"><span className="back">‹</span>{title}</div>
      {tabs && <div className="tabs">{tabs.map((t) => <span key={t} className={t === on ? "on" : ""}>{t}</span>)}</div>}
      {children}
    </div></div>
  );
}
const Hl = ({ n, children, className = "", style }) => <div className={`hl ${className}`} data-n={n} style={style}>{children}</div>;
const Row = ({ k, v, tot }) => <div className={`row${tot ? " tot" : ""}`}><span className="k">{k}</span><span>{v}</span></div>;
const Bars = ({ h }) => <div className="bars" aria-hidden="true">{h.map((x, i) => <i key={i} className={i === h.length - 1 ? "hi" : ""} style={{ height: `${x}%` }} />)}</div>;
const Meter = ({ k, v }) => <div className="meter"><div className="top"><span>{k}</span><span>{v}%</span></div><div className="mbar"><b style={{ width: `${v}%` }} /></div></div>;

function Mock({ kind }) {
  switch (kind) {
    case "earnings":
      return (
        <Phone title="Statistics" tabs={["Statements", "Overview", "Engagement", "Reach"]} on="Overview">
          <Hl n={1} className="sel">Last 12 months ▾</Hl>
          <Bars h={[40, 52, 48, 61, 58, 70, 66, 74, 69, 83, 88, 96]} />
          <Hl n={2} className="rows">
            <Row k="Subscriptions" v="$41.280" /><Row k="Messages" v="$29.940" /><Row k="Tips" v="$6.410" />
            <Row k="Posts" v="$1.220" /><Row k="Streams" v="$0" /><Row k="Total" v="$78.850" tot />
          </Hl>
        </Phone>
      );
    case "fans":
    case "fans_30": {
      const last = kind === "fans_30";
      const v = last ? ["1.284", "342", "527", "211"] : ["1.284", "3.906", "527", "2.622"];
      return (
        <Phone title="Statistics" tabs={["Reach", "Fans", "Engagement"]} on="Fans">
          <Hl n={1} className="sel">{last ? "Last 30 days ▾" : "Last 12 months ▾"}</Hl>
          <Hl n={2} style={{ display: "grid", gap: 8 }}>
            <div className="cards">
              <div className="mcard"><span className="k">Active fans</span><span className="v">{v[0]}</span></div>
              <div className="mcard"><span className="k">New subscribers</span><span className="v">{v[1]}</span></div>
              <div className="mcard"><span className="k">Renew on</span><span className="v">{v[2]}</span></div>
              <div className="mcard"><span className="k">Expired</span><span className="v">{v[3]}</span></div>
            </div>
            <Bars h={last ? [30, 45, 38, 52, 47, 61, 55, 49, 66, 58, 72, 64] : [55, 60, 42, 66, 71, 58, 62, 80, 76, 85, 90, 94]} />
          </Hl>
        </Phone>
      );
    }
    case "reach":
      return (
        <Phone title="Statistics" tabs={["Overview", "Reach", "Fans"]} on="Reach">
          <Hl n={1} className="sel">Last 12 months ▾</Hl>
          <Hl n={2} style={{ display: "grid", gap: 8 }}>
            <div className="cards">
              <div className="mcard"><span className="k">Profile visitors</span><span className="v">184.300</span></div>
              <div className="mcard"><span className="k">Guests</span><span className="v">121.000</span></div>
              <div className="mcard"><span className="k">Users</span><span className="v">63.300</span></div>
              <div className="mcard"><span className="k">Subscribed</span><span className="v">3.906</span></div>
            </div>
            <Bars h={[48, 52, 46, 60, 64, 57, 61, 72, 70, 79, 86, 92]} />
          </Hl>
        </Phone>
      );
    case "topfans":
    case "topfans_30": {
      const last = kind === "topfans_30";
      const vals = last ? ["$640", "$410", "$380", "$220", "$150", "$90"] : ["$3.420", "$2.180", "$1.960", "$1.340", "$990", "$870"];
      return (
        <Phone title="Top fans">
          <Hl n={1} className="sel">{last ? "Last 30 days ▾" : "All time ▾"}</Hl>
          <div className="rows">
            {vals.map((v, i) => (
              <div className="fan" key={v}><span className="av" />{i === 0 ? <Hl n={2} className="covered" /> : <span className="covered" />}<span>{v}</span></div>
            ))}
          </div>
        </Phone>
      );
    }
    case "links":
      return (
        <Phone title="Tracking links">
          <div className="rows">
            <div className="lnk h"><span>Link</span><span>Clic</span><span>Iscritti</span><span>$</span></div>
            <Hl n={1} style={{ display: "grid" }}>
              {[["instagram bio", "8.420", "612", "9.870"], ["tiktok", "3.100", "140", "1.920"], ["telegram", "1.240", "96", "2.640"], ["reddit", "950", "88", "2.410"]].map((r) => (
                <div className="lnk" key={r[0]}>{r.map((c, i) => <span key={i}>{c}</span>)}</div>
              ))}
            </Hl>
          </div>
        </Phone>
      );
    case "ig_overview":
      return (
        <Phone title="Insight">
          <Hl n={1} className="sel">Ultimi 90 giorni ▾</Hl>
          <Hl n={2} className="rows">
            <Row k="Visualizzazioni" v="2,4 Mln" /><Row k="Account raggiunti" v="410.000" /><Row k="Interazioni" v="86.200" /><Row k="Nuovi follower" v="+3.120" />
          </Hl>
        </Phone>
      );
    case "ig_link":
      return (
        <Phone title="Visualizzazioni">
          <Hl n={1} className="sel">Ultimi 90 giorni ▾</Hl>
          <div className="lbl">Attività del profilo</div>
          <Hl n={2} className="rows"><Row k="Visite al profilo" v="52.300" /><Row k="Tocchi sul link esterno" v="6.940" /></Hl>
        </Phone>
      );
    case "audience":
      return (
        <Phone title="Follower">
          <Hl n={1} style={{ display: "grid", gap: 8 }}>
            <div className="lbl">Paesi principali</div><Meter k="Italia" v={78} /><Meter k="Svizzera" v={6} />
            <div className="lbl">Fasce d'età</div><Meter k="25-34" v={44} /><Meter k="18-24" v={27} />
            <div className="lbl">Genere</div><Meter k="Uomini" v={91} />
          </Hl>
        </Phone>
      );
    case "tt_overview":
      return (
        <Phone title="Analisi" tabs={["Panoramica", "Contenuti", "Spettatori", "Follower"]} on="Panoramica">
          <Hl n={1} className="sel">Ultimi 60 giorni ▾</Hl>
          <Hl n={2} className="cards">
            <div className="mcard"><span className="k">Visualizz. video</span><span className="v">5,1 Mln</span></div>
            <div className="mcard"><span className="k">Visualizz. profilo</span><span className="v">48.000</span></div>
            <div className="mcard"><span className="k">Mi piace</span><span className="v">412.000</span></div>
            <div className="mcard"><span className="k">Follower</span><span className="v">+9.400</span></div>
          </Hl>
        </Phone>
      );
    case "tt_audience":
      return (
        <Phone title="Analisi" tabs={["Panoramica", "Contenuti", "Spettatori", "Follower"]} on="Follower">
          <Hl n={1} style={{ display: "grid", gap: 8 }}>
            <div className="lbl">Genere</div><Meter k="Uomini" v={84} />
            <div className="lbl">Età</div><Meter k="18-24" v={48} />
            <div className="lbl">Paesi</div><Meter k="Italia" v={62} /><Meter k="Stati Uniti" v={9} />
          </Hl>
        </Phone>
      );
    default:
      return null;
  }
}

// Palette fissa chiara (scelta voluta: la creator la apre da un messaggio, quasi sempre di giorno
// sul telefono). Un solo accento, superfici bianche su fondo caldo, gerarchia per peso e grigio.
const CSS = `
body { background: #F5F4F0; }
.numeri { --bg:#F5F4F0; --surface:#FFFFFF; --ink:#16161A; --muted:#6A6A72; --line:#E4E2DC; --soft:#F0EFEA;
  --accent:#2F54D6; --accent-soft:#EAEFFD; --ok:#1F7A4D; --ok-soft:#E7F3EC; --bad:#B4332E; --no:#8E8E96;
  --scr:#FFFFFF; --scr-ink:#111114; --scr-mute:#8A8A92; --scr-line:#EEEDE8; --scr-chip:#F2F1ED; --frame:#1C1C1F;
  min-height:100vh; background:var(--bg); color:var(--ink); color-scheme: light;
  font-family: var(--cp-font), Inter, -apple-system, system-ui, "Segoe UI", sans-serif; font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; }
.numeri *{ box-sizing:border-box; }
.numeri .wrap{ max-width:880px; margin:0 auto; padding: 20px max(16px, env(safe-area-inset-right,0px)) 64px max(16px, env(safe-area-inset-left,0px)); display:grid; gap:20px; }
.numeri h1,.numeri h2,.numeri h3{ margin:0; letter-spacing:-0.015em; text-wrap:balance; }
.numeri h1{ font-size:clamp(1.8rem,5.5vw,2.5rem); line-height:1.1; font-weight:650; }
.numeri h2{ font-size:1.5rem; font-weight:650; }
.numeri h3{ font-size:1.08rem; font-weight:600; line-height:1.3; }
.numeri p{ margin:0; }
.numeri a{ color:var(--accent); }
.numeri .brand{ display:flex; justify-content:center; padding:4px 0 6px; }
.numeri .wordmark{ font-size:.78rem; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.numeri .eyebrow{ font-size:.76rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.numeri .muted{ color:var(--muted); }
.numeri .small{ font-size:.88rem; }
.numeri .center{ text-align:center; }
.numeri .err{ color:var(--bad); }
.numeri .lead{ font-size:1.06rem; color:var(--muted); max-width:62ch; }
.numeri .card{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:22px; }
.numeri .msg{ display:grid; gap:10px; text-align:center; padding:40px 22px; }
.numeri .intro{ display:grid; gap:18px; padding:12px 0; }
.numeri .rules{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.numeri .rule{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 16px; display:grid; gap:4px; min-width:0; }
.numeri .rule span{ color:var(--muted); font-size:.9rem; }
.numeri .btn{ font:inherit; font-weight:600; font-size:.98rem; background:var(--ink); color:#fff; border:0; border-radius:12px; padding:13px 20px; cursor:pointer; min-height:48px; }
.numeri .btn:disabled{ opacity:.5; cursor:default; }
.numeri .btn.big{ justify-self:start; padding:15px 28px; }
.numeri .btn.ghost{ background:transparent; color:var(--ink); border:1px solid var(--line); }
.numeri button:focus-visible, .numeri input:focus-visible, .numeri select:focus-visible, .numeri textarea:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }

.numeri .stepper{ position:sticky; top:0; z-index:5; background:var(--bg); padding:10px 0 12px; border-bottom:1px solid var(--line); display:grid; gap:8px; }
.numeri .stepper ol{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; }
.numeri .stepper button{ width:100%; background:none; border:0; padding:0; cursor:pointer; display:grid; justify-items:start; gap:6px; color:var(--muted); font:inherit; font-size:.8rem; text-align:left; }
.numeri .stepper button::before{ content:""; display:block; width:100%; height:4px; border-radius:9px; background:var(--line); }
.numeri .stepper button.past::before{ background:var(--ink); opacity:.35; }
.numeri .stepper button.on::before{ background:var(--accent); }
.numeri .stepper button.on{ color:var(--ink); font-weight:600; }
.numeri .stepper .dot{ display:none; }
.numeri .stepmeta{ display:flex; justify-content:space-between; gap:12px; font-size:.82rem; color:var(--muted); font-variant-numeric:tabular-nums; }

.numeri .chapter{ display:grid; gap:16px; }
.numeri .chhead{ display:grid; gap:6px; padding-top:6px; }
.numeri .chhead .muted{ max-width:62ch; }
.numeri .form{ display:grid; gap:16px; }
.numeri .grid2{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 16px; }
.numeri .field{ display:grid; gap:6px; min-width:0; align-content:start; }
.numeri .flabel{ font-size:.92rem; font-weight:500; }
.numeri .fhint{ font-size:.8rem; color:var(--muted); }
.numeri .ferr{ font-size:.85rem; color:var(--bad); }
.numeri input[type=text], .numeri input:not([type]), .numeri textarea, .numeri select{ font:inherit; font-size:16px; width:100%; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:11px 12px; }
.numeri textarea{ resize:vertical; min-height:64px; }
.numeri .field.bad input{ border-color:var(--bad); }
.numeri .chips{ display:flex; flex-wrap:wrap; gap:8px; }
.numeri .chip{ font:inherit; font-size:.92rem; background:var(--surface); border:1px solid var(--line); color:var(--ink); border-radius:999px; padding:8px 14px; cursor:pointer; min-height:40px; }
.numeri .chip.on{ background:var(--ink); color:#fff; border-color:var(--ink); }
.numeri .check{ display:grid; gap:4px; }
.numeri .check label{ display:flex; gap:12px; align-items:flex-start; cursor:pointer; background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
.numeri .check.bad label{ border-color:var(--bad); }
.numeri .check input{ width:20px; height:20px; margin:2px 0 0; accent-color:var(--ink); flex:none; }

.numeri .ctable{ padding:8px 0; }
.numeri .crow{ display:grid; grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr)); gap:6px; align-items:center; padding:7px 16px; border-top:1px solid var(--soft); }
.numeri .crow:first-child{ border-top:0; }
.numeri .crow.head{ font-size:.78rem; color:var(--muted); font-weight:600; text-align:center; }
.numeri .cname{ font-size:.94rem; }
.numeri .crow.head .short{ display:none; }
.numeri .lvl{ font:inherit; font-size:.84rem; border:1px solid var(--line); background:var(--surface); color:var(--muted); border-radius:10px; min-height:40px; cursor:pointer; padding:4px; }
.numeri .lvl-txt{ display:none; }
.numeri .lvl::after{ content:""; display:inline-block; width:12px; height:12px; border-radius:50%; border:1.5px solid var(--line); vertical-align:middle; }
.numeri .lvl.on::after{ border:0; }
.numeri .lvl-si.on{ background:var(--ok-soft); border-color:var(--ok); }
.numeri .lvl-si.on::after{ background:var(--ok); }
.numeri .lvl-farei.on{ background:var(--accent-soft); border-color:var(--accent); }
.numeri .lvl-farei.on::after{ background:var(--accent); }
.numeri .lvl-no.on{ background:var(--soft); border-color:var(--no); }
.numeri .lvl-no.on::after{ background:var(--no); }

.numeri .shot{ display:grid; gap:12px; }
.numeri .shot.done{ border-color:color-mix(in srgb, var(--ok) 45%, var(--line)); }
.numeri .shot-head{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; }
.numeri .shot-title{ display:flex; gap:10px; align-items:center; min-width:0; }
.numeri .stepno{ width:28px; height:28px; border-radius:50%; background:var(--soft); display:grid; place-items:center; font-size:.85rem; font-weight:600; flex:none; }
.numeri .shot.done .stepno{ background:var(--ok); color:#fff; }
.numeri .period{ font-size:.82rem; font-weight:600; background:var(--accent-soft); color:var(--accent); padding:5px 11px; border-radius:999px; white-space:nowrap; }
.numeri .path{ display:flex; flex-wrap:wrap; align-items:center; gap:4px; font-size:.86rem; }
.numeri .crumb{ display:inline-flex; align-items:center; gap:4px; }
.numeri .crumb > span{ background:var(--soft); padding:3px 9px; border-radius:7px; font-weight:500; }
.numeri .crumb i{ font-style:normal; color:var(--muted); }
.numeri .look{ list-style:none; margin:0; padding:0; display:grid; gap:7px; }
.numeri .look li{ display:grid; grid-template-columns:22px minmax(0,1fr); gap:10px; font-size:.95rem; }
.numeri .look .n{ width:22px; height:22px; border-radius:50%; background:var(--accent); color:#fff; font-size:.72rem; font-weight:700; display:grid; place-items:center; margin-top:1px; }
.numeri .tip{ font-size:.88rem; color:var(--muted); }
.numeri .pair{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; align-items:start; margin-top:4px; }
.numeri .example, .numeri .mine{ margin:0; display:grid; gap:8px; justify-items:center; background:var(--soft); border-radius:14px; padding:14px; min-width:0; }
.numeri .example figcaption, .numeri .figlabel{ font-size:.76rem; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:600; justify-self:start; }
.numeri .example .cap{ font-size:.74rem; color:var(--muted); text-align:center; }
.numeri .mine{ align-content:start; justify-items:stretch; }
.numeri .drop{ font:inherit; display:grid; justify-items:center; align-content:center; gap:6px; min-height:220px; border:1.5px dashed color-mix(in srgb, var(--ink) 25%, transparent); border-radius:12px; background:var(--surface); color:var(--ink); cursor:pointer; padding:16px; font-weight:500; }
.numeri .drop.small{ min-height:56px; grid-auto-flow:column; justify-content:center; gap:10px; }
.numeri .drop:disabled{ cursor:default; }
.numeri .plus{ font-size:1.6rem; line-height:1; color:var(--accent); }
.numeri .busy{ display:grid; gap:8px; justify-items:center; width:80%; font-size:.9rem; color:var(--muted); }
.numeri .busy .bar{ width:100%; height:6px; background:var(--line); border-radius:9px; overflow:hidden; }
.numeri .busy .bar b{ display:block; height:100%; background:var(--accent); transition:width .2s; }
.numeri .thumbs{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.numeri .thumb{ position:relative; border-radius:10px; overflow:hidden; background:var(--surface); border:1px solid var(--line); aspect-ratio:9/16; max-width:100%; }
.numeri .thumb img{ width:100%; height:100%; object-fit:cover; object-position:top; display:block; }
.numeri .thumb .x{ position:absolute; top:6px; right:6px; width:30px; height:30px; border-radius:50%; border:0; background:rgba(0,0,0,.6); color:#fff; font-size:18px; line-height:1; cursor:pointer; }
.numeri .skip{ display:flex; gap:8px; align-items:center; font-size:.9rem; color:var(--muted); cursor:pointer; }
.numeri .skip input{ width:18px; height:18px; accent-color:var(--ink); margin:0; }
.numeri .pager{ display:flex; justify-content:space-between; gap:12px; padding-top:8px; }
.numeri .foot{ font-size:.8rem; color:var(--muted); text-align:center; max-width:60ch; justify-self:center; padding-top:24px; }

/* telefono d'esempio */
.numeri .phone{ width:100%; max-width:230px; background:var(--frame); border-radius:30px; padding:8px; }
.numeri .scr{ background:var(--scr); color:var(--scr-ink); border-radius:23px; padding:11px 13px 16px; font-size:11.5px; line-height:1.35; display:grid; gap:9px; overflow:hidden; }
.numeri .sbar{ display:flex; justify-content:space-between; font-size:10.5px; font-weight:600; padding:0 4px; }
.numeri .sbar em{ font-style:normal; letter-spacing:1px; }
.numeri .ahead{ display:flex; align-items:center; gap:8px; font-weight:700; font-size:13.5px; }
.numeri .ahead .back{ color:var(--scr-mute); font-weight:400; font-size:17px; line-height:1; }
.numeri .tabs{ display:flex; gap:11px; font-size:10.5px; color:var(--scr-mute); border-bottom:1px solid var(--scr-line); padding-bottom:6px; overflow:hidden; white-space:nowrap; }
.numeri .tabs .on{ color:var(--scr-ink); font-weight:600; box-shadow:0 7px 0 -5px var(--scr-ink); }
.numeri .sel{ display:inline-flex; gap:6px; align-items:center; background:var(--scr-chip); border-radius:8px; padding:5px 9px; font-size:10.5px; font-weight:600; width:fit-content; }
.numeri .rows{ display:grid; }
.numeri .row{ display:flex; justify-content:space-between; gap:8px; padding:5px 0; border-bottom:1px solid var(--scr-line); font-variant-numeric:tabular-nums; }
.numeri .row:last-child{ border-bottom:0; }
.numeri .row .k{ color:var(--scr-mute); }
.numeri .row.tot{ font-weight:700; } .numeri .row.tot .k{ color:var(--scr-ink); }
.numeri .cards{ display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.numeri .mcard{ background:var(--scr-chip); border-radius:9px; padding:7px; display:grid; gap:2px; }
.numeri .mcard .k{ font-size:9.5px; color:var(--scr-mute); }
.numeri .mcard .v{ font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; }
.numeri .bars{ display:flex; align-items:flex-end; gap:3px; height:38px; }
.numeri .bars i{ flex:1; background:var(--scr-line); border-radius:2px 2px 0 0; }
.numeri .bars i.hi{ background:var(--scr-mute); }
.numeri .fan{ display:grid; grid-template-columns:20px minmax(0,1fr) auto; gap:8px; align-items:center; padding:5px 0; border-bottom:1px solid var(--scr-line); font-variant-numeric:tabular-nums; }
.numeri .fan:last-child{ border-bottom:0; }
.numeri .av{ width:20px; height:20px; border-radius:50%; background:var(--scr-line); }
.numeri .covered{ height:10px; border-radius:3px; background:#18181B; }
.numeri .lnk{ display:grid; grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr)); gap:4px; padding:5px 0; border-bottom:1px solid var(--scr-line); font-variant-numeric:tabular-nums; }
.numeri .lnk:last-child{ border-bottom:0; }
.numeri .lnk.h{ color:var(--scr-mute); font-size:9.5px; }
.numeri .lnk span:not(:first-child){ text-align:right; }
.numeri .meter{ display:grid; gap:3px; }
.numeri .meter .top{ display:flex; justify-content:space-between; font-variant-numeric:tabular-nums; }
.numeri .mbar{ height:5px; border-radius:9px; background:var(--scr-line); overflow:hidden; }
.numeri .mbar b{ display:block; height:100%; background:var(--scr-mute); border-radius:9px; }
.numeri .lbl{ font-size:9.5px; color:var(--scr-mute); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
.numeri .hl{ position:relative; outline:2px solid var(--accent); outline-offset:3px; border-radius:6px; }
.numeri .hl::after{ content:attr(data-n); position:absolute; top:-12px; right:-12px; width:20px; height:20px; border-radius:50%; background:var(--accent); color:#fff; font:700 11px/20px Inter, system-ui, sans-serif; text-align:center; }

@media (max-width: 680px){
  .numeri .rules, .numeri .grid2, .numeri .pair{ grid-template-columns:minmax(0,1fr); }
  .numeri .card{ padding:18px; }
  .numeri .stepper .lbl{ display:none; }
  .numeri .crow{ grid-template-columns:minmax(0,1fr) repeat(3,44px); padding:7px 12px; }
  .numeri .crow.head{ font-size:.74rem; }
  .numeri .crow.head .long{ display:none; } .numeri .crow.head .short{ display:inline; }
  .numeri .drop{ min-height:140px; }
}
@media (prefers-reduced-motion: reduce){ .numeri *{ transition:none !important; scroll-behavior:auto !important; } }
`;
