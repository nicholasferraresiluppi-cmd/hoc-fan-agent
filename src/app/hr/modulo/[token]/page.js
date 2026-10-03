"use client";

/**
 * /hr/modulo/[token] — modulo "i tuoi dati" per la persona (Centro HR, 29/09/2026).
 *
 * Pagina ESTERNA, senza chrome interno (AppShell.isBareRoute): chi la apre può
 * non avere un account. Tutto passa da /api/hr/modulo/[token] (il token è
 * l'auth). Il codice fiscale già inserito non viene mai rimandato al browser.
 *
 * Estetica "La tessera della Casa" (03/10/2026, direzione C scelta da Nicholas):
 * stile Casa sempre scuro (palette CP_NOTTE applicata SOLO a questa pagina via
 * variabili --cp-*, così i campi di hr-ui/hr-inputs la seguono senza modifiche),
 * un capitolo per schermata e in cima una tessera che si compila mentre la
 * persona risponde. NIENTE numero di membro: non si dichiara quanti siamo.
 * Il nome arriva dal link: è generato dalla scheda della persona (prefill);
 * per una persona nuova la tessera resta senza nome finché non lo scrive.
 *
 * 03/10/2026: link UNICO uguale per tutti (`ctx.shared`): nessun dato
 * precompilato, ogni invio crea una scheda nuova, i file si caricano col token
 * figlio restituito dall'invio (`uploadToken`). Il finale è la "carta della
 * Casa" che si gira (components/HrWelcomeCard).
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CP, CP_NOTTE } from "@/lib/brand";
import { FIELD_BY_KEY, FORM_KEYS, validateCodiceFiscale } from "@/lib/hr-fields";
import { lbl, FieldInput, fmtDate } from "@/components/hr-ui";
import { cfCoherence } from "@/lib/hr-comuni";
import { normalizeSkillMap, levelRank, skillName } from "@/lib/hr-skills";
import HrWelcomeCard from "@/components/HrWelcomeCard";

// carta d'esempio della prima schermata: dati FINTI, dichiarati come esempio a schermo
const SAMPLE_CARD = {
  firstName: "Giulia", surname: "Rossi", gender: "Female", currentJob: "Chatter (operatore di chat)",
  skillLevels: { of_chat: "Esperto", ai_prompting: "Autonomo", soc_instagram: "Base" },
  spokenLanguages: ["ITA - Native", "ENG - B2"],
  residenceComune: { name: "Milano", prov: "MI" },
};

const STEPS = [
  { title: "Chi sei", sub: "partiamo dalle basi", keys: ["firstName", "surname", "dateOfBirth", "gender", "nationality", "birthPlace", "codiceFiscale"] },
  { title: "Dove vivi", sub: "ci serve per i documenti", keys: ["residenceComune", "location", "residenceCap"] },
  { title: "Come contattarti", sub: "solo per lavoro", keys: ["personalEmail", "personalPhone", "linkedin"] },
  { title: "Il tuo lavoro", sub: "cosa fai e quando ci sei", keys: ["currentJob", "partitaIva", "spokenLanguages", "timeSlots"] },
  { title: "Le tue competenze", sub: "cosa sai fare, e a che livello", keys: ["skillLevels", "otherSkills", "learnWish"] },
  { title: "La tua esperienza", sub: "da dove arrivi", keys: ["pastRoles", "personalInterests"] },
  { title: "Ultimo passo", sub: "privacy e invio", keys: [] },
];
const LABELS = {
  firstName: "Nome", surname: "Cognome", currentJob: "Che cosa fai oggi (mansione)", nationality: "Nazionalità", spokenLanguages: "Lingue che parli",
  partitaIva: "Hai una partita IVA?", timeSlots: "Fasce orarie in cui sei disponibile", personalInterests: "Interessi (facoltativo)",
  linkedin: "Profilo LinkedIn (facoltativo)", birthPlace: "Dove sei nato/a",
  location: "Indirizzo (via e numero civico)", residenceCap: "CAP / codice postale", residenceComune: "Dove vivi", skillLevels: "Cosa sai fare, e a che livello",
  learnWish: "Cosa ti piacerebbe imparare (facoltativo, al massimo 2)", gender: "Genere",
  otherSkills: "Cos'altro sai fare che qui non c'è (facoltativo)", pastRoles: "Ruoli che hai già ricoperto (facoltativo)",
};

// Palette Casa solo per questa pagina: le variabili --cp-* sovrascritte qui valgono per tutti i figli.
const CASA_VARS = Object.fromEntries(Object.entries(CP_NOTTE).map(([k, v]) => [`--cp-${k}`, v]));
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
const GOLD = "#d9b46a";
// etichetta solo per i lettori di schermo (il titolo del capitolo dice già la stessa cosa)
const SR_ONLY = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

const CSS = `
.hrf span,.hrf label,.hrf button,.hrf input,.hrf select,.hrf textarea{font-family:inherit}
.hrf input,.hrf select,.hrf textarea{font-size:16px!important}
.hrf select option{background:#15161c;color:#f2eee6}
.hrf .hrf-pill{transition:transform .15s ease,opacity .15s ease}
.hrf .hrf-pill:active{transform:scale(.98)}
.hrf-card{position:relative;overflow:hidden;transition:border-color .6s ease,box-shadow .6s ease}
.hrf-card::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,240,210,.10) 50%,transparent 65%);transform:translateX(-120%);pointer-events:none}
.hrf-card.shine::after{animation:hrfShine 1.6s ease .2s 1 forwards}
@keyframes hrfShine{to{transform:translateX(120%)}}
.hrf-fade{animation:hrfFade .35s ease both}
@keyframes hrfFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.hrf-card.shine::after,.hrf-fade{animation:none}}
`;

const pill = (primary) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", height: 52, padding: "0 26px", borderRadius: 999,
  fontFamily: SANS, fontSize: 15.5, fontWeight: 600, cursor: "pointer", textDecoration: "none",
  border: primary ? "1px solid transparent" : `1px solid ${CP.borderStrong}`,
  background: primary ? "#f2eee6" : "transparent", color: primary ? "#0b0c10" : CP.textSecondary,
});

function Shell({ children }) {
  return (
    <main className="hrf" style={{ ...CASA_VARS, colorScheme: "dark", minHeight: "100vh", background: "radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%)", color: "#f2eee6", fontFamily: SANS, padding: "28px 16px 64px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 18 }}>House of Creators</div>
        {children}
      </div>
    </main>
  );
}

// ── La tessera ────────────────────────────────────────────────────────────────
const LANG_NAME = { ITA: "Italiano", ENG: "Inglese", SPA: "Spagnolo", TED: "Tedesco", FR: "Francese" };
const LANG_LEVEL = { Native: "madrelingua", Basic: "base", Professional: "lavorativo" };
function langText(label) {
  const [p, l] = String(label).split(" - ");
  const name = LANG_NAME[p] || p;
  if (p === "ITA") return name;
  return l ? `${name} ${LANG_LEVEL[l] || l}` : name;
}
function cardData(d) {
  const first = String(d.firstName || "").trim();
  const last = String(d.surname || "").trim();
  const name = first ? `${first}${last ? ` ${last[0].toUpperCase()}.` : ""}` : "";
  const jobRaw = String(d.currentJob || "").trim();
  const job = /^chatter/i.test(jobRaw) ? "Chatter" : jobRaw;
  const rc = d.residenceComune;
  const place = rc?.abroad ? (String(rc.city || "").trim() || rc.country || "") : rc?.name ? `${rc.name}${rc.prov ? ` (${rc.prov})` : ""}` : "";
  const langs = (Array.isArray(d.spokenLanguages) ? d.spokenLanguages : []).map(langText);
  const sm = normalizeSkillMap(d.skillLevels);
  const skills = Object.entries(sm).sort((a, b) => levelRank(b[1]) - levelRank(a[1])).slice(0, 2).map(([k, l]) => `${skillName(k)} · ${l}`);
  const filled = [name, job || place, langs.length, skills.length].filter(Boolean).length;
  return { name, line: [job, place].filter(Boolean).join(" · "), langs, skills, filled };
}

function Tessera({ data, final = false }) {
  const c = cardData(data);
  const glow = final ? 0.6 : 0.22 + c.filled * 0.08;
  return (
    <div className={`hrf-card${final ? " shine" : ""}`} aria-label="La tua tessera"
      style={{ borderRadius: 18, padding: "18px 20px", minHeight: final ? 210 : 178, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14,
        background: final ? "linear-gradient(135deg,#24211a 0%,#141418 50%,#2a2316 100%)" : "linear-gradient(135deg,#1b1a1f 0%,#121216 55%,#1d1912 100%)",
        border: `1px solid rgba(217,180,106,${glow})`, boxShadow: final ? "0 30px 60px rgba(0,0,0,.45)" : "0 14px 30px rgba(0,0,0,.25)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD }}>Membro della Casa</span>
        <span aria-hidden="true" style={{ width: 34, height: 26, borderRadius: 5, background: "linear-gradient(135deg,#e3cd9c,#8f7646)" }} />
      </div>
      <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
        {c.name
          ? <div style={{ fontFamily: SERIF, fontSize: final ? 34 : 30, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          : <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1, color: "rgba(242,238,230,.28)", fontStyle: "italic" }}>Il tuo nome</div>}
        <div style={{ fontSize: 13, color: CP.textSecondary, minHeight: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.line || <span style={{ color: "rgba(242,238,230,.28)" }}>Cosa fai · dove vivi</span>}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          {c.skills.length ? c.skills.map((s, i) => (
            <span key={s} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 999, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: `1px solid ${i === 0 ? "rgba(217,180,106,.55)" : "rgba(242,238,230,.2)"}`, color: i === 0 ? "#e3cd9c" : CP.textSecondary }}>{s}</span>
          )) : <span style={{ fontSize: 11, color: CP.textMuted }}>{c.langs.length ? c.langs.join(" · ") : "si compila con te"}</span>}
        </div>
        {c.skills.length > 0 && c.langs.length > 0 && <span style={{ fontSize: 11, color: CP.textMuted, whiteSpace: "nowrap" }}>{c.langs.slice(0, 2).join(" · ")}</span>}
      </div>
    </div>
  );
}

function Headline({ title, sub, size = 40 }) {
  return (
    <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.005em" }}>
      {title}<br /><span style={{ fontStyle: "italic", color: CP.textSecondary }}>{sub}</span>
    </h1>
  );
}

export default function HrFormPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [data, setData] = useState({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [stage, setStage] = useState("intro"); // intro → form → files → done
  const [step, setStep] = useState(0);
  const [cfNote, setCfNote] = useState(null);
  const [uploadToken, setUploadToken] = useState(null); // col link condiviso: token figlio per i file
  const [sentAt, setSentAt] = useState(null);
  const [cfWarn, setCfWarn] = useState(null); // avvisi di coerenza CF ↔ data/genere/luogo (non bloccanti)

  useEffect(() => {
    let alive = true;
    fetch(`/api/hr/modulo/${token}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok || !j.ok) { setLoadErr(j.error || "Link non valido."); return; }
      setCtx(j);
      if (j.done) setStage("done");
      setData({ ...j.prefill });
    }).catch(() => alive && setLoadErr("Connessione non riuscita. Riprova tra poco."));
    return () => { alive = false; };
  }, [token]);

  const goTo = (n) => { setErr(null); setStep(n); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* vecchi browser */ } };

  // controlli del primo capitolo (nome obbligatorio, codice fiscale valido e coerente)
  const checkFirst = () => {
    if (!String(data.firstName || "").trim()) return "Scrivi il tuo nome.";
    if (data.codiceFiscale) {
      const r = validateCodiceFiscale(data.codiceFiscale);
      if (!r.ok) return `Codice fiscale: ${r.error}`;
      if (!cfWarn) {
        const w = cfCoherence(data.codiceFiscale, { dob: data.dateOfBirth, gender: data.gender, birth: data.birthPlace });
        if (w.length) { setCfWarn(w); return "warn"; }
      }
    }
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (step === 0) {
      const m = checkFirst();
      if (m === "warn") return;
      if (m) { setErr(m); return; }
    }
    if (step < STEPS.length - 1) { goTo(step + 1); return; }
    const m = checkFirst();
    if (m && m !== "warn") { setErr(m); goTo(0); return; }
    if (!consent) { setErr("Per inviare serve il consenso all'informativa privacy."); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/hr/modulo/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, consent: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `Invio non riuscito (${r.status}).`);
      setCfNote(j.cfNote || null);
      setUploadToken(j.uploadToken || token);
      setSentAt(Date.now());
      setStage(j.uploadsEnabled ? "files" : "done");
      try { window.scrollTo({ top: 0 }); } catch { /* */ }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (loadErr) return <Shell><Headline title="Link non disponibile" sub="" size={34} /><p style={{ color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>{loadErr}</p></Shell>;
  if (!ctx) return <Shell><p style={{ color: CP.textMuted }}>Caricamento…</p></Shell>;

  if (stage === "done") {
    return (
      <Shell>
        <div style={{ display: "grid", gap: 22, paddingTop: 12 }}>
          <HrWelcomeCard data={data} at={sentAt || Date.now()}>
            <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15.5, lineHeight: 1.55, maxWidth: 460 }}>
              Questa è la tua carta. Abbiamo ricevuto tutto.{" "}
              {ctx.shared
                ? "Se devi correggere qualcosa, scrivi a chi ti ha mandato il link: non serve compilare di nuovo."
                : "Se devi correggere qualcosa, chiedi a chi ti ha mandato il link di mandartene uno nuovo."}
            </p>
            {cfNote && <p style={{ margin: 0, color: CP.textSecondary, fontSize: 14, maxWidth: 460 }}>Il codice fiscale non è stato registrato per un problema tecnico nostro: te lo richiederemo.</p>}
          </HrWelcomeCard>
          <div style={{ fontSize: 12.5, color: CP.textMuted, textAlign: "center", marginTop: 4 }}>Puoi chiudere questa pagina.</div>
        </div>
      </Shell>
    );
  }

  if (stage === "files") return <Shell><FilesStep token={uploadToken || token} max={ctx.maxUploadBytes} data={data} onDone={() => setStage("done")} /></Shell>;

  if (stage === "intro") {
    // col link condiviso il nome non lo sappiamo: niente saluto personale
    const first = ctx.shared ? "" : String(ctx.prefill?.firstName || "").trim();
    return (
      <Shell>
        <div className="hrf-fade" style={{ display: "grid", gap: 26 }}>
          <HrWelcomeCard preview data={SAMPLE_CARD} at={Date.now()} />
          <Headline title={first ? `Ciao ${first},` : "Compila il modulo"} sub="e sblocca la tua card." size={40} />
          <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15.5, lineHeight: 1.55 }}>
            Questa è una card d'esempio: la tua prende forma con le tue risposte, in sette brevi capitoli. Ci vogliono circa cinque minuti.
            {ctx.shared ? " Compilalo una volta sola." : ` Il link vale fino al ${fmtDate(ctx.expiresAt)} e si usa una volta sola.`} Non ti chiediamo l'IBAN.
          </p>
          <button type="button" className="hrf-pill" onClick={() => setStage("form")} style={{ ...pill(true), width: "100%" }}>Cominciamo</button>
          <div style={{ fontSize: 12.5, color: CP.textMuted, textAlign: "center" }}>I tuoi dati restano riservati. Il codice fiscale lo conserviamo cifrato.</div>
        </div>
      </Shell>
    );
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <Shell>
      <div style={{ display: "grid", gap: 22 }}>
        <Tessera data={data} />
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: CP.textMuted }}>
            <span>{s.title}</span><span>{step + 1} di {STEPS.length}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
            {STEPS.map((_, i) => <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < step ? GOLD : i === step ? "rgba(217,180,106,.55)" : "rgba(242,238,230,.10)" }} />)}
          </div>
        </div>

        <form key={step} className="hrf-fade" onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 20 }}>
          <Headline title={s.title} sub={s.sub} size={36} />

          {s.keys.filter((k) => FORM_KEYS.includes(k)).map((k) => {
            const f = FIELD_BY_KEY[k];
            const cfOff = k === "codiceFiscale" && !ctx.cfEnabled;
            return (
              <div key={k}>
                <label id={`f-${k}-l`} htmlFor={`f-${k}`} style={k === "skillLevels" ? SR_ONLY : { ...lbl, fontSize: 13.5, marginBottom: 6 }}>{LABELS[k] || f.label}{k === "firstName" ? " *" : ""}</label>
                {cfOff ? (
                  <span style={{ fontSize: 13, color: CP.textMuted }}>Al momento non possiamo raccogliere il codice fiscale da qui: te lo chiederemo a parte.</span>
                ) : (
                  <FieldInput id={`f-${k}`} field={f} value={data[k]} options={ctx.options?.[k]} onChange={(v) => { setData((d) => ({ ...d, [k]: v })); if (["codiceFiscale", "dateOfBirth", "gender", "birthPlace"].includes(k)) setCfWarn(null); }} />
                )}
                {k === "codiceFiscale" && ctx.cfPresent && !cfOff && <span style={{ fontSize: 12, color: CP.textMuted }}>Lo abbiamo già: lascia vuoto per non cambiarlo.</span>}
                {k === "codiceFiscale" && !cfOff && <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>Lo conserviamo cifrato.</span>}
              </div>
            );
          })}

          {last && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, padding: "12px 14px", border: `1px solid ${CP.border}`, borderRadius: 12 }}>
                Informativa privacy (in revisione legale). Il testo definitivo sarà pubblicato qui prima dell'uso con le persone.
              </div>
              <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14.5, color: CP.textPrimary, cursor: "pointer", lineHeight: 1.5 }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18, accentColor: GOLD }} required />
                <span>Ho letto l'informativa privacy e acconsento al trattamento dei miei dati per la gestione del rapporto di collaborazione.</span>
              </label>
            </div>
          )}

          {cfWarn && step === 0 && (
            <div role="alert" style={{ padding: "14px 16px", border: `1px solid rgba(217,180,106,.45)`, borderRadius: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Controlla il codice fiscale</div>
              <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>{cfWarn.map((w) => <li key={w}>{w[0].toUpperCase() + w.slice(1)}.</li>)}</ul>
              <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 12 }}>A volte dipende da un comune che nel frattempo è stato unito a un altro. Se i dati sono giusti, puoi andare avanti lo stesso.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="hrf-pill" onClick={() => setCfWarn(null)} style={{ ...pill(false), height: 44 }}>Correggo</button>
                <button type="submit" className="hrf-pill" style={{ ...pill(true), height: 44 }}>Sono giusti, avanti</button>
              </div>
            </div>
          )}
          {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 14 }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8 }}>
            {step > 0
              ? <button type="button" className="hrf-pill" onClick={() => goTo(step - 1)} style={pill(false)}>Indietro</button>
              : <button type="button" className="hrf-pill" onClick={() => setStage("intro")} style={pill(false)}>Indietro</button>}
            <button type="submit" className="hrf-pill" disabled={busy} style={{ ...pill(true), opacity: busy ? 0.5 : 1, flex: 1, maxWidth: 260 }}>
              {busy ? "Invio…" : last ? "Invia i miei dati" : "Avanti"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function FilesStep({ token, max, data, onDone }) {
  const [state, setState] = useState({ document: null, cv: null }); // null | "busy" | "ok" | "errore…"
  const up = async (kind, file) => {
    if (!file) return;
    if (file.size > max) { setState((s) => ({ ...s, [kind]: "File troppo grande: massimo 10 MB." })); return; }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) { setState((s) => ({ ...s, [kind]: "Formato non ammesso: solo PDF, JPG o PNG." })); return; }
    setState((s) => ({ ...s, [kind]: "busy" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/hr/modulo/${token}/file?kind=${kind}`, { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (r.status === 413) throw new Error("Il file è troppo pesante per il caricamento: prova con un PDF compresso o una foto più leggera (meglio sotto i 4 MB).");
      if (!r.ok || !j?.ok) throw new Error(j?.error || `Caricamento non riuscito (${r.status}).`);
      setState((s) => ({ ...s, [kind]: "ok" }));
    } catch (e) { setState((s) => ({ ...s, [kind]: e.message })); }
  };
  const Item = ({ kind, title, hint }) => {
    const st = state[kind];
    return (
      <div style={{ padding: "16px 0", borderTop: `1px solid ${CP.border}` }}>
        <div style={{ fontSize: 15.5, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 10 }}>{hint}</div>
        {st === "ok" ? <span style={{ fontSize: 14, color: GOLD }}>Caricato</span> : (
          <>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={st === "busy"} onChange={(e) => up(kind, e.target.files?.[0])} style={{ fontSize: 14, color: CP.textSecondary, maxWidth: "100%" }} aria-label={title} />
            {st === "busy" && <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: 8 }}>Carico…</span>}
            {st && st !== "busy" && <div role="alert" style={{ fontSize: 13, color: CP.accentRed, marginTop: 6 }}>{st}</div>}
          </>
        )}
      </div>
    );
  };
  return (
    <div className="hrf-fade" style={{ display: "grid", gap: 22 }}>
      <Tessera data={data} />
      <Headline title="Quasi fatto." sub="Ultimo passo: i documenti." size={36} />
      <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>Facoltativo ma utile. PDF, JPG o PNG, massimo 10 MB ciascuno. Hai un'ora di tempo.</p>
      <div style={{ borderBottom: `1px solid ${CP.border}` }}>
        <Item kind="document" title="Documento d'identità" hint="Fronte e retro nello stesso file, se puoi." />
        <Item kind="cv" title="Curriculum (CV)" hint="L'ultima versione che hai." />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="hrf-pill" onClick={onDone} style={{ ...pill(true), flex: 1 }}>Ho finito</button>
        {!state.document && !state.cv && <button type="button" className="hrf-pill" onClick={onDone} style={pill(false)}>Salta per ora</button>}
      </div>
    </div>
  );
}
