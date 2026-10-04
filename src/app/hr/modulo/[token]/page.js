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
  { title: "Il tuo lavoro", sub: "partita IVA e lingue", keys: ["partitaIva", "spokenLanguages"] },
  { title: "Le tue competenze", sub: "cosa sai fare, e a che livello", keys: ["skillLevels", "otherSkills", "learnWish"] },
  { title: "La tua esperienza", sub: "da dove arrivi", keys: ["pastRoles", "personalInterests", "source", "referredBy"] },
  { title: "La privacy", sub: "leggi e conferma", keys: [] },
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
.hrf{position:relative;isolation:isolate;overflow-x:clip}
/* 05/10/2026 (Nicholas dal telefono): il capitolo che entra di lato allargava la pagina di 18px e su iPhone
   si poteva scorrere in orizzontale (bordo tagliato + striscia chiara). E l'elenco dei comuni era
   trasparente: i campi sotto si leggevano attraverso. */
html,body{overflow-x:hidden;background:#0b0c10}
.hrf [role=listbox]{background:#16161b!important;z-index:30!important;box-shadow:0 18px 40px rgba(0,0,0,.6)!important}
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
.hrf-alba .hl-ch{opacity:.07;animation:hrfCh 1.1s ease calc(.5s + var(--i) * .12s) forwards}
@keyframes hrfCh{0%{opacity:.07;text-shadow:0 0 0 rgba(255,226,170,0)}45%{opacity:1;text-shadow:0 0 18px rgba(255,226,170,.6)}100%{opacity:1;text-shadow:0 0 0 rgba(255,226,170,0)}}
.hrf-alba .hl-palm{opacity:.08;animation:hrfPalm 1s ease 2.3s forwards}
@keyframes hrfPalm{to{opacity:1}}
.hrf-scene{position:absolute;inset:0;display:grid;place-items:center;perspective:1000px;pointer-events:none;opacity:0;animation:hrfSceneIn .45s ease 2.9s forwards}
@keyframes hrfSceneIn{to{opacity:1}}
.hrf-scard{position:relative;width:300px;height:189px;transform-style:preserve-3d;animation:hrfCardIn 1.6s cubic-bezier(.45,.05,.35,1) 2.9s forwards;transition:transform 1.1s cubic-bezier(.4,0,.2,1)}
/* la dissolvenza sta sulla scena, non sulla tessera: un'opacità sulla tessera 3D la appiattisce
   e durante il giro si vedeva il fronte a specchio invece del retro */
@keyframes hrfCardIn{0%{transform:rotateY(180deg) scale(.85)}100%{transform:rotateY(360deg) scale(1)}}
/* 05/10/2026 sera (Nicholas: «la pagina si deve comporre, niente stacco»): il logo SALE fino
   all'intestazione, la tessera arriva al centro, brilla e SALE al posto della tessera
   d'esempio; poi titolo, testo e pulsanti compaiono uno alla volta. Spostamenti calcolati in
   JS sulle posizioni vere (SplashOverlay); qui solo le uscite. */
.hrf-cardwrap{position:relative;width:300px;height:189px}
.hrf-splash.is-dock .hrf-halo,.hrf-splash.is-compose .hrf-halo{opacity:0!important;transition:opacity .5s ease}
.hrf-splash.is-compose{opacity:0;transition:opacity .35s ease;pointer-events:none}
/* 05/10 notte (Nicholas: «un frame dopo l'altro, poi tutto nero»): niente pause vuote. Il fondo
   dello strato è uno strato a sé che si scioglie MENTRE la tessera vola, così la pagina compare
   intorno a lei; tessera, testo e logo si sovrappongono nel tempo invece di darsi il cambio. */
.hrf-splash-bg{position:absolute;inset:0;background:radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%);transition:opacity .9s ease}
.hrf-splash.is-dock .hrf-splash-bg,.hrf-splash.is-compose .hrf-splash-bg{opacity:0}
#hrf-sample{transition:opacity .35s ease}
.hrf[data-compose="wait"] .hrf-compose{opacity:0}
.hrf[data-compose="go"] .hrf-compose{animation:hrfComp .6s cubic-bezier(.2,.7,.2,1) var(--d,0ms) both}
@keyframes hrfComp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
#hrf-brand{transition:opacity .35s ease}
/* 05/10/2026 (Nicholas: «non è effetto wow»): alone d'oro dietro la tessera e riflesso di luce
   sulla faccia dopo il giro. Sono cambi di LUCE: restano anche con «Riduci movimento». */
.hrf-halo{position:absolute;left:50%;top:50%;width:520px;height:340px;margin:-170px 0 0 -260px;border-radius:50%;background:radial-gradient(closest-side,rgba(217,180,106,.42),rgba(217,180,106,.12) 50%,transparent 75%);opacity:0;filter:blur(6px);animation:hrfHalo 2.4s ease 3.05s forwards;pointer-events:none}
@keyframes hrfHalo{0%{opacity:0;transform:scale(.7)}45%{opacity:1;transform:scale(1.05)}100%{opacity:.75;transform:scale(1)}}
.hrf-sheen{position:absolute;inset:0;border-radius:15px;pointer-events:none;background:linear-gradient(105deg,transparent 30%,rgba(255,236,190,.55) 47%,rgba(255,255,255,.12) 52%,transparent 66%);transform:translateX(-130%);animation:hrfSheenGo 1.1s ease 4.45s forwards}
@keyframes hrfSheenGo{to{transform:translateX(130%)}}
.hrf-scard .hrf-pulse{position:absolute;inset:-2px;border-radius:16px;box-shadow:0 0 0 1px rgba(217,180,106,.9),0 0 34px rgba(217,180,106,.55);opacity:0;animation:hrfPulse 1.4s ease 4.4s forwards;pointer-events:none}
@keyframes hrfPulse{0%{opacity:0}35%{opacity:1}100%{opacity:.25}}
.hrf-sface{position:absolute;inset:0;border-radius:15px;overflow:hidden;background:radial-gradient(140% 100% at 0% 0%,#24211c 0%,#121214 50%,#0b0b0d 100%);box-shadow:0 30px 60px rgba(0,0,0,.55),inset 0 0 0 1px rgba(217,180,106,.5);transform:translateZ(1px)}
.hrf-sface.back{transform:rotateY(180deg) translateZ(1px);display:grid;place-items:center}
/* il retro non deve trasparire durante il giro (Safari ignora backface sui figli SVG senza questo) */
.hrf-sface,.hrf-sface *{-webkit-backface-visibility:hidden;backface-visibility:hidden}
@media (prefers-reduced-motion:reduce){.hrf[data-compose="go"] .hrf-compose{animation:hrfCompStill .5s ease var(--d,0ms) both}@keyframes hrfCompStill{from{opacity:0}to{opacity:1}}.hrf-scard{animation:none}.hrf-scene{animation-duration:.9s}.hrf-halo{animation:hrfHaloStill 2.4s ease 3.1s forwards}@keyframes hrfHaloStill{0%{opacity:0}45%{opacity:1}100%{opacity:.75}}.hrf-sheen{transform:none;opacity:0;animation:hrfSheenStill 1.4s ease 4.4s forwards}@keyframes hrfSheenStill{0%{opacity:0}40%{opacity:.9}100%{opacity:0}}}
.hrf-splash{position:fixed;inset:0;z-index:60;overflow:hidden;display:grid;place-items:center;opacity:1;transition:opacity 1.1s cubic-bezier(.4,0,.2,1)}
.hrf-splash-inner{transition:transform 1.1s cubic-bezier(.4,0,.2,1),opacity .8s ease}
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
// logo e prima pagina — feedback Nicholas 03/10/2026). Fasi: show → logoUp → dock → compose → gone (il logo sale nell'intestazione, la tessera si posa sull'esempio, poi si compone la pagina).
const SplashCtx = createContext("gone");

function SplashOverlay() {
  const phase = useContext(SplashCtx);
  const innerRef = useRef(null);
  const wrapRef = useRef(null);
  // sposta un elemento dello strato sopra il suo "gemello" nella pagina (stesso centro, stessa larghezza)
  const glide = (el, target, ms) => {
    if (!el || !target) return false;
    const a = el.getBoundingClientRect(); const b = target.getBoundingClientRect();
    if (!a.width || !b.width) return false;
    el.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
    el.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${b.width / a.width})`;
    return true;
  };
  useEffect(() => {
    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    if (phase === "logoUp" && innerRef.current) {
      const el = innerRef.current;
      if (reduced || !glide(el, document.getElementById("hrf-brand"), 1100)) { el.style.transition = "opacity .6s ease"; el.style.opacity = "0"; }
    }
    if (phase === "dock" && innerRef.current) { innerRef.current.style.transition = "opacity .35s ease"; innerRef.current.style.opacity = "0"; }
    if (phase === "dock" && wrapRef.current) {
      const el = wrapRef.current;
      if (reduced || !glide(el, document.querySelector("#hrf-sample > div > div"), 1000)) { el.style.transition = "opacity .5s ease"; el.style.opacity = "0"; }
    }
  }, [phase]);
  if (phase === "gone") return null;
  const guil = { position: "absolute", inset: 0, background: `url("${guillocheDataUri()}") 0 0/100% 100% no-repeat`, opacity: 0.75 };
  return (
    <div className={`hrf-splash${phase === "dock" ? " is-dock" : ""}${phase === "compose" ? " is-compose" : ""}`} aria-hidden={phase === "compose"}>
      {/* istante in cui l'apertura è stata letta dal browser = inizio delle animazioni CSS */}
      <script dangerouslySetInnerHTML={{ __html: "window.__hrfT0=window.__hrfT0||performance.now()" }} />
      <div className="hrf-splash-bg" />
      <div className="hrf-sun" />
      <div ref={innerRef} className="hrf-splash-inner" style={{ display: "grid", justifyItems: "center", gap: 22 }}>
        <HocLogo size={22} color="#f2eee6" letters className="hrf-alba" />
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Apro il modulo</span>
      </div>
      <div className="hrf-scene" aria-hidden="true">
        <div ref={wrapRef} className="hrf-cardwrap">
        <div className="hrf-halo" />
        <div className="hrf-scard">
          <span className="hrf-pulse" />
          <div className="hrf-sface">
            <div style={guil} />
            <div style={{ position: "absolute", left: 18, top: 18, color: GOLD, lineHeight: 0 }}><HocPalma width={70} title="" /></div>
            <div style={{ position: "absolute", right: 18, top: 20, fontSize: 9, letterSpacing: "0.22em", color: GOLD, fontFamily: SANS }}>MEMBRO</div>
            <div style={{ position: "absolute", left: 18, bottom: 18, display: "grid", gap: 2 }}>
              <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.05, color: "#f2eee6" }}>La tua tessera</span>
              <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: "rgba(242,238,230,.55)" }}>ti aspetta</span>
            </div>
            <span style={{ position: "absolute", right: 18, bottom: 20, width: 32, height: 24, borderRadius: 5, background: "linear-gradient(135deg,#f3e2b8,#b8975c 45%,#7d6436 70%,#e9d3a0)" }} />
            <span className="hrf-sheen" />
          </div>
          <div className="hrf-sface back">
            <div style={guil} />
            <div style={{ position: "relative", color: GOLD, lineHeight: 0 }}><HocPalma width={140} title="" /></div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }) {
  const phase = useContext(SplashCtx);
  // il testo entra già mentre la tessera vola (dock): niente schermo vuoto tra le due cose
  const waiting = ["show", "logoUp"].includes(phase);
  return (
    <main className="hrf" data-compose={waiting ? "wait" : "go"} style={{ ...CASA_VARS, colorScheme: "dark", minHeight: "100vh", background: "radial-gradient(120% 60% at 50% 0%, #17161c 0%, #0b0c10 55%)", color: "#f2eee6", fontFamily: SANS, padding: "28px 16px 64px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ marginBottom: 18, lineHeight: 0 }}>
          <span id="hrf-brand" style={{ display: "inline-block", opacity: waiting ? 0 : 1 }}><HocLogo size={11} color="rgba(242,238,230,.62)" /></span>
        </div>
        {children}
      </div>
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
  // Apertura composta (05/10/2026 sera): show → logoUp → dock → compose → gone.
  // Tempi contati da quando la pagina è stata disegnata (__hrfT0), non dalla navigazione.
  const [splashPhase, setSplashPhase] = useState("show");
  const [tLogo, setTLogo] = useState(false);
  const [tDock, setTDock] = useState(false);
  const reducedRef = useRef(false);
  useEffect(() => {
    try { reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    let t0 = 0;
    try { t0 = typeof window.__hrfT0 === "number" ? window.__hrfT0 : (performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0); } catch { /* */ }
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const a = setTimeout(() => setTLogo(true), Math.max(300, t0 + 2700 - now));
    const b = setTimeout(() => setTDock(true), Math.max(1500, t0 + 5300 - now));
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => { if (splashPhase === "show" && tLogo) setSplashPhase("logoUp"); }, [splashPhase, tLogo]);
  useEffect(() => {
    if (splashPhase === "dock") { const t = setTimeout(() => setSplashPhase("compose"), 1000); return () => clearTimeout(t); }
    if (splashPhase === "compose") { const t = setTimeout(() => setSplashPhase("gone"), 400); return () => clearTimeout(t); }
    return undefined;
  }, [splashPhase]);
  const [data, setData] = useState({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null); // messaggio generale, vicino ai bottoni
  const [fieldErrs, setFieldErrs] = useState({}); // { chiave: messaggio } sotto i campi
  const [focusKey, setFocusKey] = useState(null); // primo campo con errore: si scorre lì e si mette a fuoco
  const [stage, setStage] = useState("intro"); // intro → form → files → done
  // la tessera atterra su quella d'esempio solo se la prima pagina è l'introduzione
  useEffect(() => {
    if (splashPhase !== "logoUp" || !tDock || !(ctx || loadErr)) return;
    setSplashPhase(ctx && !loadErr && stage === "intro" ? "dock" : "compose");
  }, [splashPhase, tDock, ctx, loadErr, stage]);
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

  // L'apertura sta FUORI dalla pagina e sempre nella stessa posizione (key fissa): prima stava
  // dentro Shell e, quando arrivavano i dati del modulo, React la ricreava → le animazioni CSS
  // ripartivano da capo mentre il timer d'uscita continuava → la tessera non si vedeva mai (04/10).
  const page = loadErr
    ? <Shell><Headline title="Link non disponibile" sub="" size={34} /><p style={{ color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>{loadErr}</p></Shell>
    : !ctx ? <Shell>{null}</Shell> : renderStage();
  return (
    <SplashCtx.Provider value={splashPhase}>
      <div key="page">{page}</div>
      <SplashOverlay key="splash" />
    </SplashCtx.Provider>
  );

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

  if (stage === "files") return <Shell><FilesStep token={uploadToken || token} data={data} total={STEPS.length + 1} onDone={() => setStage("done")} /></Shell>;

  if (stage === "intro") {
    // col link condiviso il nome non lo sappiamo: niente saluto personale
    const first = ctx.shared ? "" : String(ctx.prefill?.firstName || "").trim();
    return (
      <Shell>
        <div className="hrf-fade" style={{ display: "grid", gap: 26 }}>
          <div id="hrf-sample" style={{ opacity: ["show", "logoUp", "dock"].includes(splashPhase) ? 0 : 1 }}><HrTessera key="esempio" data={SAMPLE_CARD} at={Date.now()} sample autoFlip={splashPhase === "gone"} /></div>
          <div className="hrf-compose" style={{ "--d": "300ms" }}><Headline title={first ? `Ciao ${first},` : "Compila il modulo"} sub="e sblocca la tua tessera." size={40} /></div>
          <p className="hrf-compose" style={{ "--d": "450ms", margin: 0, color: CP.textSecondary, fontSize: 15.5, lineHeight: 1.55 }}>
            Questa è una tessera d&apos;esempio: la tua prende forma con le tue risposte. Sette brevi capitoli e poi il documento d&apos;identità, {timeEstimateText().replace(/^Ci vogliono /, "").replace(/\.$/, "")}.
            {" "}Tieni a portata di mano un documento d&apos;identità.
            {ctx.shared ? "" : ` Il link vale fino al ${fmtDate(ctx.expiresAt)}.`}
          </p>
          <button type="button" className="hrf-pill hrf-compose" onClick={() => { setDir("next"); setStage("form"); }} style={{ ...pill(true), width: "100%", "--d": "600ms" }}>Cominciamo</button>
          <TutorialVideoButton id="modulo-collaboratori" render={(open, v) => (
            <button type="button" onClick={open} className="hrf-compose" style={{ ...pill(false), width: "100%", gap: 8, marginTop: -12, "--d": "700ms" }}>
              <PlayCircle size={18} /> Guarda come funziona ({fmtDuration(v.durationSec)})
            </button>
          )} />
          <div className="hrf-compose" style={{ "--d": "780ms", fontSize: 12.5, color: CP.textMuted, textAlign: "center" }}>I tuoi dati restano riservati: li vede solo chi gestisce il personale.</div>
        </div>
      </Shell>
    );
  }

  const s = STEPS[step];
  const required = new Set(requiredKeysFor(data, { cfEnabled: Boolean(ctx?.cfEnabled), cfPresent: Boolean(ctx?.cfPresent) }));
  const last = step === STEPS.length - 1;
  // i documenti sono un capitolo vero: contano nell'avanzamento, così l'ultimo capitolo dei dati
  // non sembra la fine (05/10/2026: chi inviava pensava di aver finito e saltava il documento)
  const withDocs = Boolean(ctx?.uploadsEnabled);
  const total = STEPS.length + (withDocs ? 1 : 0);
  const reallyLast = last && !withDocs;
  return (
    <Shell>
      <div style={{ display: "grid", gap: 22 }}>
        <HrTessera key="dal-vivo" data={data} at={Date.now()} small live />
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: CP.textMuted }}>
            <span style={{ color: reallyLast ? GOLD : CP.textSecondary }}>{progressWords(step, total)}</span><span>{step + 1} di {total}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-valuetext={`Capitolo ${step + 1} di ${total}: ${s.title}`}>
            {Array.from({ length: total }, (_, i) => <div key={i} className="hrf-bar" style={{ flex: 1, height: 2, borderRadius: 2, background: i < step ? GOLD : i === step ? "rgba(217,180,106,.55)" : "rgba(242,238,230,.10)" }} />)}
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
              {busy ? <><HrPalmaLoader width={38} tone="ink" label="Invio in corso" /><span>Invio in corso</span></> : last ? (withDocs ? "Avanti: il documento" : "Invia i miei dati") : "Avanti"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
  }
}

// Esempi disegnati (mai documenti veri): fanno capire COSA fotografare.
function DocSample({ part }) {
  const stroke = "rgba(217,180,106,.75)", soft = "rgba(242,238,230,.22)";
  const W = part === "passaporto" ? 104 : 112, H = part === "passaporto" ? 74 : 70;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flex: "none" }}>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="7" fill="rgba(242,238,230,.04)" stroke={stroke} />
      {part === "fronte" && <>
        <rect x="9" y="14" width="26" height="34" rx="3" fill={soft} /><circle cx="22" cy="26" r="6" fill="rgba(242,238,230,.35)" /><path d="M13 44c2-7 16-7 18 0" fill="rgba(242,238,230,.35)" />
        {[16, 24, 32, 40].map((y) => <rect key={y} x="42" y={y} width={y === 16 ? 52 : 40} height="3.5" rx="1.75" fill={soft} />)}
        <text x="9" y="62" fontSize="7" fill={stroke} fontFamily="sans-serif">FRONTE · con la foto</text>
      </>}
      {part === "retro" && <>
        {[12, 20, 28].map((y) => <rect key={y} x="9" y={y} width={y === 12 ? 70 : 56} height="3.5" rx="1.75" fill={soft} />)}
        {[40, 46, 52].map((y) => <rect key={y} x="9" y={y} width="94" height="3" rx="1.5" fill="rgba(242,238,230,.32)" />)}
        <text x="9" y="64" fontSize="7" fill={stroke} fontFamily="sans-serif">RETRO</text>
      </>}
      {part === "passaporto" && <>
        <rect x="8" y="10" width="24" height="31" rx="3" fill={soft} /><circle cx="20" cy="21" r="5.5" fill="rgba(242,238,230,.35)" /><path d="M12 38c2-6 14-6 16 0" fill="rgba(242,238,230,.35)" />
        {[12, 19, 26, 33].map((y) => <rect key={y} x="38" y={y} width={y === 12 ? 56 : 44} height="3.5" rx="1.75" fill={soft} />)}
        {[52, 58].map((y) => <rect key={y} x="8" y={y} width="88" height="3" rx="1.5" fill="rgba(242,238,230,.32)" />)}
        <text x="8" y="69" fontSize="6.5" fill={stroke} fontFamily="sans-serif">PAGINA CON LA FOTO</text>
      </>}
    </svg>
  );
}

const DOC_TYPES = {
  carta: { label: "Carta d'identità", parts: [
    { id: "fronte", title: "Fronte *", hint: "Il lato con la tua foto, tutto intero e leggibile." },
    { id: "retro", title: "Retro *", hint: "L'altro lato. Hai un solo PDF con i due lati? Caricalo anche qui." },
  ] },
  passaporto: { label: "Passaporto", parts: [
    { id: "passaporto", title: "Pagina con la foto *", hint: "Aperto sulla pagina con foto e dati, tutta inquadrata." },
  ] },
};

function FilesStep({ token, data, total, onDone }) {
  // 05/10/2026 (Nicholas): si sceglie il documento. Carta = fronte + retro (due caricamenti, anche lo
  // stesso PDF due volte), passaporto = una foto. Con un esempio disegnato per ciascun lato.
  const [docType, setDocType] = useState(null);
  // stato per parte: null | { busy: "riduco"|"carico"|"salvo", pct } | "ok" | "messaggio di errore"
  const [state, setState] = useState({});
  const up = async (slot, kind, part, file) => {
    if (!file) return;
    const set = (v) => setState((s) => ({ ...s, [slot]: v }));
    set({ busy: "riduco", pct: 0 });
    try {
      await uploadHrFile(token, kind, file, {
        part,
        onStage: (busy) => setState((s) => ({ ...s, [slot]: { ...(s[slot] && typeof s[slot] === "object" ? s[slot] : {}), busy } })),
        onProgress: (pct) => setState((s) => ({ ...s, [slot]: { busy: "carico", pct } })),
      });
      set("ok");
    } catch (e) { set(e?.message || "Caricamento non riuscito. Riprova."); }
  };
  const anyBusy = Object.values(state).some((v) => v && typeof v === "object");
  const parts = docType ? DOC_TYPES[docType].parts : [];
  const docOk = parts.length > 0 && parts.every((p) => state[p.id] === "ok");
  const docFailed = parts.some((p) => typeof state[p.id] === "string" && state[p.id] !== "ok");
  const Item = ({ slot, kind, part, title, hint }) => {
    const st = state[slot];
    const busy = st && typeof st === "object";
    const text = busy ? (st.busy === "riduco" ? "Preparo il file…" : st.busy === "salvo" ? "Quasi fatto…" : `Carico… ${st.pct || 0}%`) : "";
    return (
      <div style={{ padding: "16px 0", borderTop: `1px solid ${CP.border}` }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {part ? <DocSample part={part} /> : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: CP.textMuted, lineHeight: 1.45 }}>{hint}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          {st === "ok" ? <span style={{ fontSize: 14, color: GOLD }}>Ricevuto</span> : (
            <>
              {!busy && (
                <label style={{ ...pill(false), width: "100%", boxSizing: "border-box", height: 46, fontSize: 14.5, cursor: "pointer" }}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => up(slot, kind, part, e.target.files?.[0])} style={SR_ONLY} aria-label={title} />
                  {typeof st === "string" ? "Riprova" : part === "retro" ? "Carica il retro" : part === "fronte" ? "Carica il fronte" : part === "passaporto" ? "Carica la pagina con la foto" : "Carica il curriculum"}
                </label>
              )}
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
      </div>
    );
  };
  const chooser = (id) => {
    const on = docType === id;
    // si cambia tipo solo se non c'è un caricamento in corso
    return <button key={id} type="button" aria-pressed={on} disabled={anyBusy} onClick={() => setDocType(id)} style={{ ...pill(on), flex: 1, padding: "12px 10px" }}>{DOC_TYPES[id].label}</button>;
  };
  return (
    <div className="hrf-fade" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 22 }}>
      <HrTessera key="documenti" data={data} at={Date.now()} small />
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: CP.textMuted }}>
          <span style={{ color: GOLD }}>Ultimo capitolo</span><span>{total} di {total}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={total} aria-valuetext={`Capitolo ${total} di ${total}: il documento`}>
          {Array.from({ length: total }, (_, i) => <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < total - 1 ? GOLD : "rgba(217,180,106,.55)" }} />)}
        </div>
      </div>
      <div className="hrf-sheet" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 18 }}>
        <Headline title="Il tuo documento" sub="senza, il modulo non è completo." size={34} />
        <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>I tuoi dati li abbiamo. Manca solo il documento d&apos;identità: scegli quale hai sotto mano. PDF, JPG o PNG, fino a 50 MB; le foto le riduciamo noi. Hai un&apos;ora di tempo.</p>
        <div style={{ display: "flex", gap: 10 }}>{chooser("carta")}{chooser("passaporto")}</div>
        {docType && (
          <div style={{ borderBottom: `1px solid ${CP.border}` }}>
            {parts.map((p) => <Item key={p.id} slot={p.id} kind="document" part={p.id} title={p.title} hint={p.hint} />)}
            <Item slot="cv" kind="cv" part={null} title="Curriculum (facoltativo)" hint="L'ultima versione che hai." />
          </div>
        )}
        <button type="button" className="hrf-pill" onClick={onDone} disabled={anyBusy || !docOk} style={{ ...pill(true), width: "100%", opacity: anyBusy || !docOk ? 0.5 : 1 }}>
          {anyBusy ? "Attendi la fine del caricamento" : docOk ? "Ho finito: mostrami la tessera" : !docType ? "Scegli il documento" : docType === "carta" ? "Carica fronte e retro per finire" : "Carica la pagina con la foto per finire"}
        </button>
        {/* via d'uscita SOLO se il caricamento è fallito: la scheda c'è già, HR sa che il documento manca */}
        {docFailed && (
          <button type="button" onClick={onDone} style={{ background: "none", border: 0, padding: 0, color: CP.textMuted, fontSize: 13, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, justifySelf: "start" }}>
            Non riesco a caricarlo adesso: lo mando a HR
          </button>
        )}
      </div>
    </div>
  );
}
