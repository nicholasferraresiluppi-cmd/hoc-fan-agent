// Informativa privacy del modulo HR (art. 13 GDPR) — 03/10/2026.
// Pagina pubblica (middleware + bare route in AppShell), linkata dall'ultimo
// passo di /hr/modulo. Testo standard per i dati di una collaborazione,
// deciso con Nicholas ("queste cose esistono uguali ovunque"): da allineare
// se cambiano fornitori, finalità o tempi. La versione è PRIVACY_VERSION in
// hr-fields.js: se il testo cambia nella sostanza, va cambiata anche quella
// (il consenso registrato nella scheda porta la versione letta).
import { CP_NOTTE } from "@/lib/brand";
import { PRIVACY_VERSION } from "@/lib/hr-fields";

export const metadata = { title: "Informativa privacy · House of Creators" };

const VARS = Object.fromEntries(Object.entries(CP_NOTTE).map(([k, v]) => [`--cp-${k}`, v]));
const SERIF = "var(--f-display), 'Instrument Serif', Georgia, serif";
const SANS = "var(--f-sans), Manrope, ui-sans-serif, system-ui, sans-serif";
const h2 = { fontFamily: SERIF, fontWeight: 400, fontSize: 24, margin: "30px 0 8px", color: "#f2eee6" };
const p = { fontSize: 15, lineHeight: 1.7, color: "rgba(242,238,230,.72)", margin: "0 0 10px" };
const li = { ...p, margin: "0 0 6px" };

export default function HrPrivacyPage() {
  return (
    <main style={{ ...VARS, colorScheme: "dark", minHeight: "100vh", background: "#0b0c10", color: "#f2eee6", fontFamily: SANS, padding: "40px 16px 72px" }}>
      <article style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,238,230,.46)" }}>House of Creators</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 44, lineHeight: 1.05, margin: "14px 0 6px" }}>
          Informativa privacy<br /><span style={{ fontStyle: "italic", color: "rgba(242,238,230,.62)", fontFamily: SERIF }}>per chi collabora con noi.</span>
        </h1>
        <p style={{ ...p, fontSize: 13 }}>Versione {PRIVACY_VERSION} · ai sensi dell'art. 13 del Regolamento UE 2016/679 (GDPR)</p>

        <h2 style={h2}>Chi tratta i tuoi dati</h2>
        <p style={p}>Titolare del trattamento è la società di House of Creators con cui hai, o avrai, il rapporto di collaborazione, indicata nel tuo contratto. Per qualsiasi richiesta sui tuoi dati puoi scrivere al tuo referente o all'area HR di House of Creators, ai contatti indicati nel contratto o nel messaggio con cui hai ricevuto questo modulo.</p>

        <h2 style={h2}>Quali dati raccogliamo</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 10px", listStyle: "disc" }}>
          <li style={li}>Dati anagrafici: nome, cognome, data e luogo di nascita, genere, nazionalità, codice fiscale.</li>
          <li style={li}>Residenza e recapiti: indirizzo, comune, CAP, email e telefono personali, profilo LinkedIn se lo indichi.</li>
          <li style={li}>Documento d'identità e curriculum, se li carichi.</li>
          <li style={li}>Informazioni sul lavoro: mansione attuale, partita IVA sì/no, lingue, disponibilità oraria, competenze e livello, ruoli già ricoperti, cosa vorresti imparare, interessi.</li>
        </ul>
        <p style={p}>Non ti chiediamo dati bancari in questo modulo e non ti chiediamo dati sanitari, opinioni o altre categorie particolari di dati.</p>

        <h2 style={h2}>Perché li usiamo, e su quale base</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 10px", listStyle: "disc" }}>
          <li style={li}><b style={{ color: "#f2eee6", fontWeight: 500 }}>Gestire la collaborazione</b>: preparare e firmare il contratto, pagarti, gestire inizio e fine del rapporto. Base: esecuzione del contratto o di misure precontrattuali (art. 6.1.b GDPR).</li>
          <li style={li}><b style={{ color: "#f2eee6", fontWeight: 500 }}>Rispettare la legge</b>: adempimenti fiscali, contabili e amministrativi. Base: obbligo di legge (art. 6.1.c).</li>
          <li style={li}><b style={{ color: "#f2eee6", fontWeight: 500 }}>Organizzare il lavoro</b>: assegnare progetti e ruoli in base a competenze, lingue e disponibilità, e proporti percorsi di formazione. Base: legittimo interesse di House of Creators a organizzarsi in modo efficace (art. 6.1.f), bilanciato con i tuoi diritti.</li>
        </ul>
        <p style={p}>I campi indicati come facoltativi puoi lasciarli vuoti. Senza i dati obbligatori non è possibile gestire il contratto. Non prendiamo decisioni basate unicamente su trattamenti automatizzati a partire da questi dati.</p>

        <h2 style={h2}>Chi li vede</h2>
        <p style={p}>Solo le persone di House of Creators che gestiscono il personale e l'amministrazione, autorizzate e tenute alla riservatezza. Non vendiamo né cediamo i tuoi dati.</p>
        <p style={p}>Li trattano per nostro conto, come responsabili del trattamento, i fornitori tecnici che fanno funzionare il servizio: hosting dell'applicazione (Vercel), database (Upstash), gestione dell'anagrafica (ClickUp). Alcuni hanno sede negli Stati Uniti: i trasferimenti avvengono sulla base del Data Privacy Framework UE-USA o delle clausole contrattuali standard approvate dalla Commissione europea. I dati possono essere comunicati anche a consulenti del lavoro e fiscali, e alle autorità quando la legge lo richiede.</p>

        <h2 style={h2}>Per quanto tempo</h2>
        <p style={p}>Per tutta la durata della collaborazione e, dopo la sua fine, per il tempo richiesto dalla legge per gli obblighi fiscali e civilistici (di norma 10 anni). Se la collaborazione non inizia, cancelliamo i dati entro 12 mesi dall'invio del modulo.</p>

        <h2 style={h2}>I tuoi diritti</h2>
        <p style={p}>Puoi chiedere in ogni momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne l'uso, riceverli in un formato leggibile (portabilità) e opporti al trattamento basato sul legittimo interesse (artt. 15-21 GDPR), scrivendo ai contatti indicati sopra. Hai anche il diritto di presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).</p>

        <h2 style={h2}>Sicurezza</h2>
        <p style={p}>Il collegamento è cifrato. Nella nostra applicazione il codice fiscale è conservato cifrato e l'accesso ai dati è limitato alle persone autorizzate.</p>
      </article>
    </main>
  );
}
