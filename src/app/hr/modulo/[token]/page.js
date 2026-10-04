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
 * figlio restituito dall'invio (`uploadToken`). Il finale è la rivelazione
 * della tessera (components/HrWelcomeCard), forma "D1 · Tessera da club"
 * (components/HrTessera): la stessa tessera è d'esempio nell'intro e piccola,
 * dal vivo, in cima a ogni capitolo.
 */
/*
 * 03/10/2026 sera, "esperienza" (richiesta di Nicholas): sempre "tessera", mai
 * "card"; bozza nel browser (risposte + capitolo, MAI il codice fiscale) con
 * "Ricomincia da capo"; caricamenti con la palma del logo; avanzamento a parole;
 * errori gentili sotto il campo con scorrimento e fuoco sul primo; tastiere e
 * autocompletamento giusti su telefono; messaggio della Casa sotto la tessera
 * finale. Logica pura in lib/hr-form-experience.js.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CP, CP_NOTTE } from "@/lib/brand";
import { FIELD_BY_KEY, FORM_KEYS, SOURCE_REFERRAL } from "@/lib/hr-fields";
import { lbl, FieldInput, fmtDate } from "@/components/hr-ui";
import { cfCoherence } from "@/lib/hr-comuni";
import HrWelcomeCard from "@/components/HrWelcomeCard";
import HrTessera from "@/components/HrTessera";
import HrPalmaLoader from "@/components/HrPalmaLoader";
import HocLogo from "@/components/HocLogo";
import HrHouseLetter from "@/components/HrHouseLetter";
import { PlayCircle } from "lucide-react";
import { TutorialVideoButton } from "@/components/TutorialVideo";
import { fmtDuration } from "@/lib/tutorial-videos";
import { uploadHrFile } from "@/lib/hr-upload-client";
import { GRAIN_DATA_URI, guillocheDataUri } from "@/lib/tessera-material";
import HocPalma from "@/components/HocPalma";
import {
  progressWords, timeEstimateText, fieldErrors, fieldErrorsFromServer, firstStepWithError,
  draftKey, serializeDraft, parseDraft, draftWorthSaving, safeGet, safeSet, safeRemove,
  requiredKeysFor,
} from "@/lib/hr-form-experience";

// carta d'esempio della prima schermata: dati FINTI, dichiarati come esempio a schermo
const SAMPLE_CARD = {
  firstName: "Giulia", surname: "Rossi", gender: "Female",
  skillLevels: { of_chat: "Esperto", ai_prompting: "Autonomo", soc_instagram: "Base" },
  spokenLanguages: ["ITA - Native", "ENG - B2"],
  residenceComune: { name: "Milano", prov: "MI" },
};

const STEPS = [
  { title: "Chi sei", sub: "partiamo dalle basi", keys: ["firstName", "surname", "dateOfBirth", "gender", "nationality", "birthPlace", "codiceFiscale"] },
  { title: "Dove vivi", sub: "ci serve per i documenti", keys: ["residenceComune", "location", "residenceCap"] },
  { title: "Come contattarti", sub: "solo per lavoro", keys: ["personalEmail", "personalPhone", "linkedin"] },
  { title: "Il tuo lavoro", sub: "cosa fai e che lingue parli", keys: ["currentJob", "partitaIva", "spokenLanguages"] },
  { title: "Le tue competenze", sub: "cosa sai fare, e a che livello", keys: ["skillLevels", "otherSkills", "learnWish"] },
  { title: "La tua esperienza", sub: "da dove arrivi", keys: ["pastRoles", "personalInterests", "source", "referredBy"] },
  { title: "Ultimo passo", sub: "privacy e invio", keys: [] },
];
const LABELS = {
  firstName: "Nome", surname: "Cognome", currentJob: "Che cosa fai oggi (facoltativo)", nationality: "Nazionalità", spokenLanguages: "Lingue che parli",
  partitaIva: "Hai una partita IVA?", personalInterests: "Interessi (facoltativo)",
  linkedin: "Profilo LinkedIn (facoltativo)", birthPlace: "Dove sei nato/a",
  location: "Indirizzo (via e numero civico)", residenceCap: "CAP / codice postale", residenceComune: "Dove vivi", skillLevels: "Cosa sai fare, e a che livello",
  learnWish: "Cosa ti piacerebbe imparare (facoltativo, al massimo 2)", gender: "Genere",
  otherSkills: "Cos'altro sai fare che qui non c'è (facoltativo)",
  source: "Come ci hai conosciuto?", referredBy: "Chi ti ha segnalato? Nome e cognome", pastRoles: "Ruoli che hai già ricoperto (facoltativo)",
};

// Palette Casa solo per questa pagina: le variabili --cp-* sovrascritte qui valgono per tutti i figli.
const CASA_VARS = Object.fromEntries(Object.entries(CP_NOTTE).map(([k, v]) => [`--cp-${k}`, v]));
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
const GOLD = "#d9b46a";
// etichetta solo per i lettori di schermo (il titolo del capitolo dice già la stessa cosa)
const SR_ONLY = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
const ERR_COLOR = "#e9a99f"; // rosa tenue: segnala senza allarmare (toni gentili)

// Tastiere e autocompletamento giusti su telefono (solo campi nativi; quelli su misura li gestiscono da sé).
// enterKeyHint "next": Invio porta al campo dopo (gestito in onKeyDown del form), non invia il capitolo.
const KEYBOARD = {
  firstName: { autoComplete: "given-name", autoCapitalize: "words", enterKeyHint: "next" },
  surname: { autoComplete: "family-name", autoCapitalize: "words", enterKeyHint: "next" },
  dateOfBirth: { autoComplete: "bday" },
  codiceFiscale: { autoCapitalize: "characters", enterKeyHint: "next" },
  location: { autoComplete: "street-address", enterKeyHint: "next" },
  residenceCap: { autoComplete: "postal-code", inputMode: "numeric", enterKeyHint: "next" },
  personalEmail: { autoComplete: "email", inputMode: "email", autoCapitalize: "none", spellCheck: false, enterKeyHint: "next" },
  personalPhone: { autoComplete: "tel", inputMode: "tel", enterKeyHint: "next" },
  linkedin: { autoComplete: "url", inputMode: "url", autoCapitalize: "none", spellCheck: false, enterKeyHint: "next" },
};
function keyboardFor(k, data) {
  const kb = KEYBOARD[k];
  // CAP estero (es. UK "SW1A 1AA") può avere lettere: tastiera numerica solo per l'Italia
  if (k === "residenceCap" && data.residenceComune?.abroad) return { ...kb, inputMode: "text" };
  return kb;
}

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

const CSS = `
.hrf{position:relative;isolation:isolate}
.hrf::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:url("${GRAIN_DATA_URI}");background-size:160px 160px;mix-blend-mode:overlay;opacity:.12}
.hrf-sheet{padding:24px 20px;border-radius:18px;background:linear-gradient(180deg,rgba(242,238,230,.05),rgba(242,238,230,.018));border:1px solid rgba(242,238,230,.08);box-shadow:0 22px 48px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,245,225,.07)}
@media (max-width:420px){.hrf-sheet{padding:20px 16px}}
.hrf input,.hrf select,.hrf textarea{background:rgba(0,0,0,.28)!important;border-color:rgba(242,238,230,.13)!important;box-shadow:inset 0 2px 4px rgba(0,0,0,.4);transition:border-color .2s ease,box-shadow .2s ease}
.hrf input:focus,.hrf select:focus,.hrf textarea:focus{border-color:rgba(217,180,106,.7)!important;box-shadow:inset 0 2px 4px rgba(0,0,0,.4),0 0 0 4px rgba(217,180,106,.12)}
.hrf input[type=checkbox],.hrf input[type=radio]{box-shadow:none}
.hrf span,.hrf label,.hrf button,.hrf input,.hrf select,.hrf textarea{font-family:inherit}
.hrf input,.hrf select,.hrf textarea{font-size:16px!important}
.hrf select option{background:#15161c;color:#f2eee6}
.hrf [aria-invalid="true"],.hrf [aria-invalid="true"]:focus{border-color:${ERR_COLOR}!important}
.hrf .hrf-pill{transition:transform .15s ease,opacity .15s ease}
.hrf .hrf-pill:active{transform:scale(.98)}
.hrf-card{position:relative;overflow:hidden;transition:border-color .6s ease,box-shadow .6s ease}
.hrf-card::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,240,210,.10) 50%,transparent 65%);transform:translateX(-120%);pointer-events:none}
.hrf-card.shine::after{animation:hrfShine 1.6s ease .2s 1 forwards}
@keyframes hrfShine{to{transform:translateX(120%)}}
.hrf-fade{animation:hrfFade .35s ease both}
@keyframes hrfFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hrf-next,.hrf-prev{animation:hrfStep .42s cubic-bezier(.2,.7,.2,1) both}
.hrf-next{--hrf-dx:18px}.hrf-prev{--hrf-dx:-18px}
@keyframes hrfStep{from{opacity:0;transform:translateX(var(--hrf-dx))}to{opacity:1;transform:none}}
.hrf-bar{transition:background-color .5s ease}
.hrf-loader-in{animation:hrfFade .6s ease .25s both}
.hrf-splash-word{opacity:0;animation:hrfWord 1.2s ease .9s forwards}
@keyframes hrfWord{from{opacity:0;letter-spacing:.5em}to{opacity:1;letter-spacing:.32em}}
@media (prefers-reduced-motion:reduce){.hrf-splash-word{animation:none;opacity:1}}
.hrf-splash-logo{opacity:0;animation:hrfLogo 1.4s cubic-bezier(.2,.7,.2,1) .2s forwards}
.hrf-splash-light{display:inline-block;position:relative;-webkit-mask-image:linear-gradient(90deg,#000 40%,rgba(0,0,0,.08) 60%);mask-image:linear-gradient(90deg,#000 40%,rgba(0,0,0,.08) 60%);-webkit-mask-size:260% 100%;mask-size:260% 100%;-webkit-mask-position:100% 0;mask-position:100% 0;animation:hrfLight 2.5s cubic-bezier(.45,.05,.35,1) .3s forwards}
@keyframes hrfLight{to{-webkit-mask-position:0 0;mask-position:0 0}}
.hrf-splash-light::after{content:"";position:absolute;inset:-10% -4%;background:linear-gradient(100deg,transparent 35%,rgba(255,236,190,.55) 50%,transparent 65%);mix-blend-mode:overlay;transform:translateX(-110%);animation:hrfSweep 1.4s ease 2.6s forwards;pointer-events:none}
@keyframes hrfSweep{to{transform:translateX(110%)}}
@media (prefers-reduced-motion:reduce){.hrf-splash-light::after{display:none}}
@keyframes hrfLogo{from{opacity:0;transform:translateY(6px);letter-spacing:.24em}to{opacity:1;transform:none;letter-spacing:.16em}}
@media (prefers-reduced-motion:reduce){.hrf-splash-logo{animation:none;opacity:1}}
/* Apertura "alba" (04/10/2026, scelta A di Nicholas): luce calda dietro, lettere che si
   accendono una a una da sinistra, poi la palma; il logo esce e arriva la tessera coperta
   che gira e mostra il fronte; all'uscita sale verso la pagina. Tempi da quando la pagina
   si disegna (CSS), non da quando il JS è pronto. */
.hrf-sun{position:absolute;left:50%;top:50%;width:380px;height:380px;margin:-190px 0 0 -190px;border-radius:50%;background:radial-gradient(closest-side,rgba(217,180,106,.26),rgba(217,180,106,.07) 45%,transparent 70%);opacity:0;animation:hrfSun 3.6s ease .2s forwards;pointer-events:none}
@keyframes hrfSun{0%{opacity:0;transform:scale(.6)}40%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(1.05)}}
.hrf-alba{animation:hrfLogoOut .5s ease 3.3s forwards}
@keyframes hrfLogoOut{to{opacity:0;transform:scale(.92) translateY(-8px)}}
.hrf-alba .hl-ch{opacity:.07;animation:hrfCh 1.1s ease calc(.5s + var(--i) * .12s) forwards}
@keyframes hrfCh{0%{opacity:.07;text-shadow:0 0 0 rgba(255,226,170,0)}45%{opacity:1;text-shadow:0 0 18px rgba(255,226,170,.6)}100%{opacity:1;text-shadow:0 0 0 rgba(255,226,170,0)}}
.hrf-alba .hl-palm{opacity:.08;animation:hrfPalm 1s ease 2.3s forwards}
@keyframes hrfPalm{to{opacity:1}}
.hrf-scene{position:absolute;inset:0;display:grid;place-items:center;perspective:1000px;pointer-events:none}
.hrf-scard{position:relative;width:300px;height:189px;transform-style:preserve-3d;opacity:0;animation:hrfCardIn 1.6s cubic-bezier(.45,.05,.35,1) 3.85s forwards;transition:transform 1.1s cubic-bezier(.4,0,.2,1)}
@keyframes hrfCardIn{0%{opacity:0;transform:rotateY(180deg) scale(.85)}20%{opacity:1}100%{opacity:1;transform:rotateY(360deg) scale(1)}}
.hrf-splash.is-leaving .hrf-scard{transform:translateY(-26vh) scale(.92)}
.hrf-sface{position:absolute;inset:0;border-radius:15px;overflow:hidden;background:radial-gradient(140% 100% at 0% 0%,#24211c 0%,#121214 50%,#0b0b0d 100%);box-shadow:0 30px 60px rgba(0,0,0,.55),inset 0 0 0 1px rgba(217,180,106,.5);transform:translateZ(1px)}
.hrf-sface.back{transform:rotateY(180deg) translateZ(1px);display:grid;place-items:center}
/* il retro non deve trasparire durante il giro (Safari ignora backface sui figli SVG senza questo) */
.hrf-sface,.hrf-sface *{-webkit-backface-visibility:hidden;backface-visibility:hidden}
@media (prefers-reduced-motion:reduce){.hrf-alba{animation:hrfLogoOutStill .5s ease 3.3s forwards}@keyframes hrfLogoOutStill{to{opacity:0}}.hrf-scard{animation:hrfCardFade .8s ease 3.85s forwards}@keyframes hrfCardFade{to{opacity:1;transform:none}}.hrf-splash.is-leaving .hrf-scard{transform:none}}
.hrf-splash{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%);opacity:1;transition:opacity 1.1s cubic-bezier(.4,0,.2,1)}
.hrf-splash-inner{transition:transform 1.1s cubic-bezier(.4,0,.2,1),opacity .8s ease}
.hrf-splash.is-leaving{opacity:0;pointer-events:none}
.hrf-splash.is-leaving .hrf-splash-inner{transform:translateY(-14px) scale(1.04);opacity:.6}
@media (prefers-reduced-motion:reduce){.hrf-splash.is-leaving .hrf-splash-inner{transform:none}}
.hrf-letter{animation:hrfFade 1s ease 2.2s both}
.hrf-err{animation:hrfFade .25s ease both}
@media (prefers-reduced-motion:reduce){.hrf-card.shine::after,.hrf-fade,.hrf-next,.hrf-prev,.hrf-loader-in,.hrf-letter,.hrf-err{animation:none}.hrf-bar{transition:none}}
`;

const pill = (primary) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", height: 52, padding: "0 26px", borderRadius: 999,
  fontFamily: SANS, fontSize: 15.5, fontWeight: 600, cursor: "pointer", textDecoration: "none",
  border: primary ? "1px solid transparent" : `1px solid ${CP.borderStrong}`,
  background: primary ? "#f2eee6" : "transparent", color: primary ? "#0b0c10" : CP.textSecondary,
});

// Apertura: il logo è uno strato SOPRA la pagina che sfuma via (niente taglio netto tra
// logo e prima pagina — feedback Nicholas 03/10/2026). Fasi: show → leaving → gone.
const SplashCtx = createContext("gone");

function SplashOverlay() {
  const phase = useContext(SplashCtx);
  if (phase === "gone") return null;
  const guil = { position: "absolute", inset: 0, background: `url("${guillocheDataUri()}") 0 0/100% 100% no-repeat`, opacity: 0.75 };
  return (
    <div className={`hrf-splash${phase === "leaving" ? " is-leaving" : ""}`} aria-hidden={phase === "leaving"}>
      <div className="hrf-sun" />
      <div className="hrf-splash-inner" style={{ display: "grid", justifyItems: "center", gap: 22 }}>
        <HocLogo size={22} color="#f2eee6" letters className="hrf-alba" />
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Apro il modulo</span>
      </div>
      <div className="hrf-scene" aria-hidden="true">
        <div className="hrf-scard">
          <div className="hrf-sface">
            <div style={guil} />
            <div style={{ position: "absolute", left: 18, top: 18, color: GOLD, lineHeight: 0 }}><HocPalma width={70} title="" /></div>
            <div style={{ position: "absolute", right: 18, top: 20, fontSize: 9, letterSpacing: "0.22em", color: GOLD, fontFamily: SANS }}>MEMBRO</div>
            <div style={{ position: "absolute", left: 18, bottom: 20, fontFamily: SERIF, fontStyle: "italic", fontSize: 25, color: "rgba(242,238,230,.35)" }}>Il tuo nome</div>
            <span style={{ position: "absolute", right: 18, bottom: 20, width: 32, height: 24, borderRadius: 5, background: "linear-gradient(135deg,#f3e2b8,#b8975c 45%,#7d6436 70%,#e9d3a0)" }} />
          </div>
          <div className="hrf-sface back">
            <div style={guil} />
            <div style={{ position: "relative", color: GOLD, lineHeight: 0 }}><HocPalma width={140} title="" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <main className="hrf" style={{ ...CASA_VARS, colorScheme: "dark", minHeight: "100vh", background: "radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%)", color: "#f2eee6", fontFamily: SANS, padding: "28px 16px 64px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 18 }}>House of Creators</div>
        {children}
      </div>
      <SplashOverlay />
    </main>
  );
}

function Headline({ title, sub, size = 40 }) {
  return (
    <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.005em" }}>
      {title}<br /><span style={{ fontStyle: "italic", color: CP.textSecondary }}>{sub}</span>
    </h1>
  );
}

function FieldError({ id, msg }) {
  if (!msg) return null;
  return <div id={id} className="hrf-err" style={{ marginTop: 7, fontSize: 13.5, lineHeight: 1.45, color: ERR_COLOR }}>{msg}</div>;
}

export default function HrFormPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState(null);
  const [splashTimeUp, setSplashTimeUp] = useState(false);
  const [splashPhase, setSplashPhase] = useState("show");
  const reducedRef = useRef(false);
  useEffect(() => {
    try { reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    // 04/10/2026: il logo si deve vedere accendersi anche con "Riduci movimento" attivo
    // (iPhone): accendersi è un cambio di luce, non un movimento. Prima con quell'opzione
    // l'apertura durava 0,9 s senza luce: era quello che si vedeva dal telefono.
    // la sequenza (CSS) parte quando la pagina si disegna e finisce a ~5,5 s: si conta da
    // lì (performance.now ≈ dall'apertura), con un minimo per non tagliare la tessera
    let wait = 5600;
    try { wait = Math.max(1200, 5600 - performance.now()); } catch { /* */ }
    const t = setTimeout(() => setSplashTimeUp(true), wait);
    return () => clearTimeout(t);
  }, []);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => {
    if (splashPhase !== "show" || !splashTimeUp || !(ctx || loadErr)) return;
    setSplashPhase("leaving");
    const t = setTimeout(() => setSplashPhase("gone"), 1100);
    return () => clearTimeout(t);
  }, [splashPhase, splashTimeUp, ctx, loadErr]);
  const [data, setData] = useState({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null); // messaggio generale, vicino ai bottoni
  const [fieldErrs, setFieldErrs] = useState({}); // { chiave: messaggio } sotto i campi
  const [focusKey, setFocusKey] = useState(null); // primo campo con errore: si scorre lì e si mette a fuoco
  const [stage, setStage] = useState("intro"); // intro → form → files → done
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState("next"); // verso della transizione tra capitoli
  const [cfNote, setCfNote] = useState(null);
  const [uploadToken, setUploadToken] = useState(null); // col link condiviso: token figlio per i file
  const [sentAt, setSentAt] = useState(null);
  const [cfWarn, setCfWarn] = useState(null); // avvisi di coerenza CF ↔ data/genere/luogo (non bloccanti)
  const [resumed, setResumed] = useState(false); // bozza ripresa dal browser: avviso discreto
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [canSave, setCanSave] = useState(false); // il browser può tenere la bozza? (in privata può non riuscire)
  const formRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/hr/modulo/${token}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok || !j.ok) { setLoadErr(j.error || "Link non valido."); return; }
      const key = draftKey(token);
      const okSave = safeSet(`${key}:prova`, "1");
      safeRemove(`${key}:prova`);
      setCanSave(okSave);
      if (j.done) {
        safeRemove(key);
        setData({ ...j.prefill });
        setStage("done");
      } else {
        // bozza di questo browser: riprende risposte e capitolo (mai il codice fiscale)
        const dr = parseDraft(safeGet(key), { steps: STEPS.length });
        if (dr) {
          setData({ ...j.prefill, ...dr.data });
          setStep(dr.step);
          setStage("form");
          setResumed(true);
        } else {
          if (safeGet(key)) safeRemove(key); // rotta o scaduta
          setData({ ...j.prefill });
        }
      }
      setCtx(j);
    }).catch(() => alive && setLoadErr("Connessione non riuscita. Riprova tra poco."));
    return () => { alive = false; };
  }, [token]);

  // salva la bozza mentre si compila (piccolo ritardo: niente scritture a ogni tasto)
  useEffect(() => {
    if (!ctx || stage !== "form") return undefined;
    const id = setTimeout(() => {
      if (draftWorthSaving({ data, step })) safeSet(draftKey(token), serializeDraft({ data, step, stage }));
    }, 300);
    return () => clearTimeout(id);
  }, [ctx, data, step, stage, token]);

  // primo campo con errore: scorre lì e lo mette a fuoco (dopo il render del capitolo giusto)
  useEffect(() => {
    if (!focusKey) return undefined;
    const raf = requestAnimationFrame(() => {
      const wrap = document.getElementById(`w-${focusKey}`);
      if (!wrap) return;
      try { wrap.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); } catch { wrap.scrollIntoView(); }
      const el = wrap.querySelector("input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])");
      try { el?.focus({ preventScroll: true }); } catch { el?.focus(); }
      setFocusKey(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusKey, step]);

  const goTo = (n, opts = {}) => {
    setErr(null);
    if (!opts.keepErrors) setFieldErrs({});
    setResumed(false);
    setConfirmRestart(false);
    setDir(n >= step ? "next" : "prev");
    setStep(n);
    if (!opts.noScroll) { try { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); } catch { /* vecchi browser */ } }
  };

  const showErrors = (errs, general) => {
    const at = firstStepWithError(STEPS, errs);
    const target = at >= 0 ? at : step;
    const firstKey = STEPS[target].keys.find((k) => errs[k]) || Object.keys(errs)[0];
    if (target !== step) goTo(target, { keepErrors: true, noScroll: true });
    setFieldErrs(errs);
    setErr(general || "C'è qualcosa da sistemare: te l'abbiamo segnato qui sopra.");
    setFocusKey(firstKey);
  };

  const restart = () => {
    safeRemove(draftKey(token));
    setData({ ...(ctx?.prefill || {}) });
    setConsent(false);
    setCfWarn(null);
    setFieldErrs({});
    setErr(null);
    setResumed(false);
    setConfirmRestart(false);
    setDir("prev");
    setStep(0);
    setStage("intro");
    try { window.scrollTo({ top: 0 }); } catch { /* */ }
  };

  const setField = (k, v) => {
    // "Chi ti ha segnalato" vale solo per chi è arrivato da una reference
    setData((d) => ({ ...d, [k]: v, ...(k === "source" && v !== SOURCE_REFERRAL ? { referredBy: "" } : {}) }));
    if (fieldErrs[k]) setFieldErrs((e) => { const n = { ...e }; delete n[k]; return n; });
    if (["codiceFiscale", "dateOfBirth", "gender", "birthPlace"].includes(k)) setCfWarn(null);
  };

  // Invio su un campo di testo: va al campo dopo (enterKeyHint "next"), invia solo dall'ultimo
  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const t = e.target;
    if (t.tagName !== "INPUT" || ["checkbox", "radio", "file", "submit", "button"].includes(t.type)) return;
    const all = [...(formRef.current?.querySelectorAll("input:not([disabled]):not([type=hidden]):not([type=checkbox]):not([type=file]),select:not([disabled]),textarea:not([disabled])") || [])];
    const next = all[all.indexOf(t) + 1];
    if (next) { e.preventDefault(); next.focus(); }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    const cfEnabled = Boolean(ctx.cfEnabled);
    if (step < STEPS.length - 1) {
      const fe = fieldErrors(data, STEPS[step].keys, { cfEnabled, cfPresent: Boolean(ctx.cfPresent) });
      if (Object.keys(fe).length) { showErrors(fe); return; }
      // codice fiscale valido ma non coerente con data/genere/luogo: avviso, si può andare avanti
      if (step === 0 && cfEnabled && data.codiceFiscale && !cfWarn) {
        const w = cfCoherence(data.codiceFiscale, { dob: data.dateOfBirth, gender: data.gender, birth: data.birthPlace });
        if (w.length) { setCfWarn(w); return; }
      }
      goTo(step + 1);
      return;
    }
    const all = fieldErrors(data, FORM_KEYS, { cfEnabled, cfPresent: Boolean(ctx.cfPresent) });
    if (Object.keys(all).length) { showErrors(all); return; }
    if (!consent) {
      setFieldErrs({ consent: "Per inviare, spunta la casella: ci serve sapere che hai letto l'informativa." });
      setErr(null);
      setFocusKey("consent");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/hr/modulo/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, consent: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        // errori del server che riguardano un campo: si torna lì, sotto il campo
        const { errors, rest } = fieldErrorsFromServer(j.error);
        if (Object.keys(errors).length) { showErrors(errors, rest || undefined); return; }
        throw new Error(j.error || `Invio non riuscito (${r.status}). Riprova tra poco: le risposte restano qui.`);
      }
      safeRemove(draftKey(token)); // inviato: la bozza non serve più
      setCfNote(j.cfNote || null);
      setUploadToken(j.uploadToken || token);
      setSentAt(Date.now());
      setStage(j.uploadsEnabled ? "files" : "done");
      try { window.scrollTo({ top: 0 }); } catch { /* */ }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (loadErr) return <SplashCtx.Provider value={splashPhase}><Shell><Headline title="Link non disponibile" sub="" size={34} /><p style={{ color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>{loadErr}</p></Shell></SplashCtx.Provider>;
  if (!ctx) return <SplashCtx.Provider value={splashPhase}><Shell>{null}</Shell></SplashCtx.Provider>;
  return <SplashCtx.Provider value={splashPhase}>{renderStage()}</SplashCtx.Provider>;

  function renderStage() {
  if (stage === "done") {
    return (
      <Shell>
        <div style={{ display: "grid", gap: 22, paddingTop: 12 }}>
          <HrWelcomeCard data={data} at={sentAt || Date.now()}>
            <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15.5, lineHeight: 1.55, maxWidth: 460 }}>
              Questa è la tua tessera. Abbiamo ricevuto tutto.{" "}
              {ctx.shared
                ? "Se devi correggere qualcosa, scrivi a chi ti ha mandato il link: non serve compilare di nuovo."
                : "Se devi correggere qualcosa, chiedi a chi ti ha mandato il link di mandartene uno nuovo."}
            </p>
            {cfNote && <p style={{ margin: 0, color: CP.textSecondary, fontSize: 14, maxWidth: 460 }}>Il codice fiscale non è stato registrato per un problema tecnico nostro: te lo richiederemo.</p>}
          </HrWelcomeCard>
          <HrHouseLetter />
          <div style={{ fontSize: 12.5, color: CP.textMuted, textAlign: "center", marginTop: 4 }}>Puoi chiudere questa pagina.</div>
        </div>
      </Shell>
    );
  }

  if (stage === "files") return <Shell><FilesStep token={uploadToken || token} data={data} onDone={() => setStage("done")} /></Shell>;

  if (stage === "intro") {
    // col link condiviso il nome non lo sappiamo: niente saluto personale
    const first = ctx.shared ? "" : String(ctx.prefill?.firstName || "").trim();
    return (
      <Shell>
        <div className="hrf-fade" style={{ display: "grid", gap: 26 }}>
          <HrTessera key="esempio" data={SAMPLE_CARD} at={Date.now()} sample autoFlip />
          <Headline title={first ? `Ciao ${first},` : "Compila il modulo"} sub="e sblocca la tua tessera." size={40} />
          <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15.5, lineHeight: 1.55 }}>
            Questa è una tessera d&apos;esempio: la tua prende forma con le tue risposte. Sette brevi capitoli, {timeEstimateText().replace(/^Ci vogliono /, "").replace(/\.$/, "")}.
            {" "}Tieni a portata di mano un documento d&apos;identità.
            {ctx.shared ? "" : ` Il link vale fino al ${fmtDate(ctx.expiresAt)}.`}
          </p>
          <button type="button" className="hrf-pill" onClick={() => { setDir("next"); setStage("form"); }} style={{ ...pill(true), width: "100%" }}>Cominciamo</button>
          <TutorialVideoButton id="modulo-collaboratori" render={(open, v) => (
            <button type="button" onClick={open} style={{ ...pill(false), width: "100%", gap: 8, marginTop: -12 }}>
              <PlayCircle size={18} /> Guarda come funziona ({fmtDuration(v.durationSec)})
            </button>
          )} />
          <div style={{ fontSize: 12.5, color: CP.textMuted, textAlign: "center" }}>I tuoi dati restano riservati: li vede solo chi gestisce il personale.</div>
        </div>
      </Shell>
    );
  }

  const s = STEPS[step];
  const required = new Set(requiredKeysFor(data, { cfEnabled: Boolean(ctx?.cfEnabled), cfPresent: Boolean(ctx?.cfPresent) }));
  const last = step === STEPS.length - 1;
  return (
    <Shell>
      <div style={{ display: "grid", gap: 22 }}>
        <HrTessera key="dal-vivo" data={data} at={Date.now()} small live />
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: CP.textMuted }}>
            <span style={{ color: last ? GOLD : CP.textSecondary }}>{progressWords(step, STEPS.length)}</span><span>{step + 1} di {STEPS.length}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Capitolo ${step + 1} di ${STEPS.length}: ${s.title}`}>
            {STEPS.map((_, i) => <div key={i} className="hrf-bar" style={{ flex: 1, height: 2, borderRadius: 2, background: i < step ? GOLD : i === step ? "rgba(217,180,106,.55)" : "rgba(242,238,230,.10)" }} />)}
          </div>
          {resumed && (
            <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 12px", marginTop: 6, fontSize: 13, color: CP.textSecondary }}>
              <span>
                Ti abbiamo riportato dov&apos;eri rimasto.
                {ctx.cfEnabled ? <span style={{ color: CP.textMuted }}> Il codice fiscale non lo teniamo sul dispositivo: se l&apos;avevi scritto, va riscritto.</span> : null}
              </span>
              {confirmRestart ? (
                <span style={{ display: "inline-flex", gap: 12 }}>
                  <button type="button" onClick={restart} style={{ background: "none", border: 0, padding: 0, color: GOLD, fontSize: 13, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Sì, cancella le risposte</button>
                  <button type="button" onClick={() => setConfirmRestart(false)} style={{ background: "none", border: 0, padding: 0, color: CP.textMuted, fontSize: 13, cursor: "pointer" }}>No</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmRestart(true)} style={{ background: "none", border: 0, padding: 0, color: GOLD, fontSize: 13, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Ricomincia da capo</button>
              )}
            </div>
          )}
        </div>

        <form ref={formRef} key={step} className={`hrf-sheet ${dir === "prev" ? "hrf-prev" : "hrf-next"}`} onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate style={{ display: "grid", gap: 20 }}>
          <Headline title={s.title} sub={s.sub} size={36} />
          {s.keys.some((k) => required.has(k)) && <div style={{ fontSize: 12.5, color: CP.textMuted, marginTop: -8 }}>I campi con * sono obbligatori.</div>}

          {s.keys.filter((k) => FORM_KEYS.includes(k) && (k !== "referredBy" || data.source === SOURCE_REFERRAL)).map((k) => {
            const f = FIELD_BY_KEY[k];
            const cfOff = k === "codiceFiscale" && !ctx.cfEnabled;
            const fe = fieldErrs[k];
            const extra = { ...(keyboardFor(k, data) || {}), ...(k === "spokenLanguages" ? { explicitLanguages: true } : {}), ...(fe ? { "aria-invalid": true, "aria-describedby": `f-${k}-err` } : {}) };
            return (
              <div key={k} id={`w-${k}`} style={{ scrollMarginTop: 24 }}>
                <label id={`f-${k}-l`} htmlFor={`f-${k}`} style={k === "skillLevels" ? SR_ONLY : { ...lbl, fontSize: 13.5, marginBottom: 6 }}>{LABELS[k] || f.label}{required.has(k) ? " *" : ""}</label>
                {cfOff ? (
                  <span style={{ fontSize: 13, color: CP.textMuted }}>Al momento non possiamo raccogliere il codice fiscale da qui: te lo chiederemo a parte.</span>
                ) : (
                  <FieldInput id={`f-${k}`} field={f} value={data[k]} options={ctx.options?.[k]} extra={extra} onChange={(v) => setField(k, v)} />
                )}
                <FieldError id={`f-${k}-err`} msg={fe} />
                {k === "codiceFiscale" && ctx.cfPresent && !cfOff && <span style={{ fontSize: 12, color: CP.textMuted }}>Lo abbiamo già: lascia vuoto per non cambiarlo.</span>}
                {k === "codiceFiscale" && !cfOff && <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>Lo vede solo chi gestisce il personale. Non lo salviamo sul tuo dispositivo.</span>}
              </div>
            );
          })}

          {last && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, padding: "12px 14px", border: `1px solid ${CP.border}`, borderRadius: 12 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: CP.textMuted, marginBottom: 6 }}>Privacy, in breve</div>
                Usiamo i tuoi dati per gestire la collaborazione con House of Creators: contratto, pagamenti, adempimenti di legge e organizzazione del lavoro.
                Li vede solo chi gestisce il personale, non li vendiamo e non li cediamo a nessuno. Puoi chiedere in ogni momento di vederli, correggerli o cancellarli.{" "}
                <a href="/hr/privacy" target="_blank" rel="noopener noreferrer" style={{ color: GOLD }}>Leggi l&apos;informativa completa</a>
              </div>
              <div id="w-consent" style={{ scrollMarginTop: 24 }}>
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14.5, color: CP.textPrimary, cursor: "pointer", lineHeight: 1.5 }}>
                  <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (fieldErrs.consent) setFieldErrs((x) => { const n = { ...x }; delete n.consent; return n; }); }}
                    aria-invalid={fieldErrs.consent ? true : undefined} aria-describedby={fieldErrs.consent ? "f-consent-err" : undefined}
                    style={{ marginTop: 4, width: 18, height: 18, accentColor: GOLD }} required />
                  <span>Ho letto l&apos;informativa privacy.</span>
                </label>
                <FieldError id="f-consent-err" msg={fieldErrs.consent} />
              </div>
            </div>
          )}

          {cfWarn && step === 0 && (
            <div role="alert" style={{ padding: "14px 16px", border: `1px solid rgba(217,180,106,.45)`, borderRadius: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Controlla il codice fiscale</div>
              <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>{cfWarn.map((w) => <li key={w}>{w[0].toUpperCase() + w.slice(1)}.</li>)}</ul>
              <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 12 }}>A volte dipende da un comune che nel frattempo è stato unito a un altro. Se i dati sono giusti, puoi andare avanti lo stesso.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="hrf-pill" onClick={() => { setCfWarn(null); setFocusKey("codiceFiscale"); }} style={{ ...pill(false), height: 44 }}>Correggo</button>
                <button type="submit" className="hrf-pill" style={{ ...pill(true), height: 44 }}>Sono giusti, avanti</button>
              </div>
            </div>
          )}
          {err && <div role="alert" style={{ color: ERR_COLOR, fontSize: 14, lineHeight: 1.5 }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8 }}>
            {step > 0
              ? <button type="button" className="hrf-pill" onClick={() => goTo(step - 1)} disabled={busy} style={pill(false)}>Indietro</button>
              : <button type="button" className="hrf-pill" onClick={() => { setResumed(false); setStage("intro"); }} disabled={busy} style={pill(false)}>Indietro</button>}
            <button type="submit" className="hrf-pill" disabled={busy} aria-busy={busy} style={{ ...pill(true), gap: 10, flex: 1, maxWidth: 260, cursor: busy ? "default" : "pointer" }}>
              {busy ? <><HrPalmaLoader width={38} tone="ink" label="Invio in corso" /><span>Invio in corso</span></> : last ? "Invia i miei dati" : "Avanti"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
  }
}

function FilesStep({ token, data, onDone }) {
  // stato per file: null | { busy: "riduco"|"carico"|"salvo", pct } | "ok" | "messaggio di errore"
  const [state, setState] = useState({ document: null, cv: null });
  const up = async (kind, file) => {
    if (!file) return;
    const set = (v) => setState((s) => ({ ...s, [kind]: v }));
    set({ busy: "riduco", pct: 0 });
    try {
      await uploadHrFile(token, kind, file, {
        onStage: (busy) => setState((s) => ({ ...s, [kind]: { ...(s[kind] && typeof s[kind] === "object" ? s[kind] : {}), busy } })),
        onProgress: (pct) => setState((s) => ({ ...s, [kind]: { busy: "carico", pct } })),
      });
      set("ok");
    } catch (e) { set(e?.message || "Caricamento non riuscito. Riprova."); }
  };
  const anyBusy = Object.values(state).some((v) => v && typeof v === "object");
  const docOk = state.document === "ok";
  const docFailed = typeof state.document === "string" && state.document !== "ok";
  const Item = ({ kind, title, hint }) => {
    const st = state[kind];
    const busy = st && typeof st === "object";
    const text = busy ? (st.busy === "riduco" ? "Preparo il file…" : st.busy === "salvo" ? "Quasi fatto…" : `Carico… ${st.pct || 0}%`) : "";
    return (
      <div style={{ padding: "16px 0", borderTop: `1px solid ${CP.border}` }}>
        <div style={{ fontSize: 15.5, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 10 }}>{hint}</div>
        {st === "ok" ? <span style={{ fontSize: 14, color: GOLD }}>Ricevuto</span> : (
          <>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} onChange={(e) => up(kind, e.target.files?.[0])} style={{ fontSize: 14, color: CP.textSecondary, maxWidth: "100%" }} aria-label={title} />
            {busy && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
                <HrPalmaLoader width={44} tone="gold" label={text} />
                <div aria-hidden="true" style={{ flex: 1, minWidth: 0, fontSize: 13, color: CP.textMuted }}>
                  {text}
                  <div style={{ height: 3, background: CP.border, borderRadius: 2, marginTop: 6, maxWidth: 280 }}>
                    <div style={{ height: 3, width: `${st.busy === "salvo" ? 100 : st.busy === "carico" ? st.pct || 0 : 0}%`, background: GOLD, borderRadius: 2, transition: "width .2s" }} />
                  </div>
                </div>
              </div>
            )}
            {typeof st === "string" && st !== "ok" && <div role="alert" style={{ fontSize: 13, color: ERR_COLOR, marginTop: 6 }}>{st}</div>}
          </>
        )}
      </div>
    );
  };
  return (
    <div className="hrf-fade" style={{ display: "grid", gap: 22 }}>
      <HrTessera key="documenti" data={data} at={Date.now()} small />
      <Headline title="Quasi fatto." sub="Ultimo passo: i documenti." size={36} />
      <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>Il documento d&apos;identità è obbligatorio, il curriculum no. PDF, JPG o PNG, fino a 50 MB. Le foto le riduciamo noi. Hai un&apos;ora di tempo.</p>
      <div style={{ borderBottom: `1px solid ${CP.border}` }}>
        <Item kind="document" title="Documento d'identità *" hint="Fronte e retro nello stesso file, se puoi." />
        <Item kind="cv" title="Curriculum (facoltativo)" hint="L'ultima versione che hai." />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="hrf-pill" onClick={onDone} disabled={anyBusy || !docOk} style={{ ...pill(true), flex: 1, opacity: anyBusy || !docOk ? 0.5 : 1 }}>{anyBusy ? "Attendi la fine del caricamento" : docOk ? "Ho finito" : "Carica il documento per finire"}</button>
      </div>
      {/* via d'uscita SOLO se il caricamento è fallito: la scheda c'è già, HR sa che il documento manca */}
      {docFailed && (
        <button type="button" onClick={onDone} style={{ background: "none", border: 0, padding: 0, color: CP.textMuted, fontSize: 13, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, justifySelf: "start" }}>
          Non riesco a caricarlo adesso: lo mando a HR
        </button>
      )}
    </div>
  );
}
