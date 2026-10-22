"use client";

// Guida del warm-up: il riassunto delle SOP, uguale a quello della console di prima.
import { CP } from "@/lib/brand";
import { NUM } from "@/components/ds";
import { cardBox, hint, Bullets } from "@/components/warmup/ui";
import {
  WINDOWS, estToIt, STATES, XSTATES, IPROT, IPWARN, XSETUP, XSEMPRE, WFIELDS_X,
} from "@/lib/warmup-plan";

const H = ({ children }) => <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500 }}>{children}</h3>;
const P = ({ children, style }) => <p style={{ margin: "0 0 10px", fontSize: 14.5, lineHeight: 1.6, color: CP.textSecondary, ...style }}>{children}</p>;
const B = ({ children }) => <b style={{ fontWeight: 500, color: CP.textPrimary }}>{children}</b>;
const Card = ({ children }) => <div style={cardBox}>{children}</div>;
const Hint = ({ children }) => <p style={{ ...hint, margin: "10px 0 0" }}>{children}</p>;

function Table({ head, rows }) {
  const cell = { padding: "8px 10px", borderBottom: `1px solid ${CP.borderSoft}`, fontSize: 13.5, verticalAlign: "top", textAlign: "left" };
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: head.length > 2 ? 520 : 0 }}>
        <thead><tr>{head.map((h) => <th key={h} style={{ ...cell, color: CP.textMuted, fontWeight: 500, fontSize: 12 }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...cell, color: j ? CP.textSecondary : CP.textPrimary, fontWeight: j ? 400 : 500 }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function GuideIG() {
  return (
    <div>
      <Card>
        <H>Calendario completo</H>
        <Table head={["Giorno", "Pubblicazione", "Engagement", "Follow"]} rows={[
          ["1", "Foto profilo + bio · niente pubblicazioni", "Reels 20+ min, senza like né commenti", "Nessuno"],
          ["2", "1 carosello (SFW) + 1 storia", "Reels 20+ min + like, commenti leggeri, salvataggi", "5–10 account di nicchia"],
          ["3", "1 carosello + 2 reels (SFW) + 2 storie", "30+ min (like, commenti, salvataggi)", "5 account di nicchia"],
          ["4", "1 carosello + 2 reels (SFW) + 2 storie", "30+ min", "—"],
          ["5", "1 carosello + 3 reels (SFW) + 3 storie", "30+ min", "—"],
          ["6", "1 carosello + 3 reels (SFW) + 3 storie", "30+ min", "—"],
          ["7", "Account professionale (Meta Business Suite) + storie in evidenza · 1 carosello + 3 reels + 3 storie", "30+ min", "—"],
        ]} />
        <Hint>Oltre all&apos;engagement della giornata servono 5–10 minuti prima di ogni pubblicazione e 5–10 subito dopo.</Hint>
      </Card>
      <Card>
        <H>Pubblicazioni e link in bio dopo il warm-up</H>
        <Table head={["Settimana", "Reels al giorno", "Reels a settimana", "Link in bio"]} rows={[
          ["Settimana 1", "1–3", "13 (solo SFW)", "Vietato"],
          ["Settimana 2", "3", "21", "Introduzione soft: 3–4 storie CTA + 1 salvata in evidenza"],
          ["Settimana 3", "3", "21", "Pienamente attivo"],
          ["Settimana 4+", "3", "21", "Pienamente attivo"],
        ]} />
        <Hint>Il SOP dedicato al link in bio aggiunge una condizione: la CTA si introduce dopo che un reel ha superato le 10.000 visualizzazioni e il PM ha consegnato il link. Nelle task la riga compare dalla settimana 2 come dice la tabella, con il promemoria della soglia nel «perché».</Hint>
      </Card>
      <Card>
        <H>Finestre di pubblicazione USA</H>
        <Table head={["Finestra", "EST", "In Italia"]} rows={[
          ...WINDOWS.map((w) => [`Window ${w.n}`, w.est, <span key="t" style={NUM}>{estToIt(w.h)}</span>]),
          ["Storia CTA", "20:00", <span key="c" style={NUM}>{estToIt(20)}</span>],
        ]} />
        <Hint>Se una finestra cade fuori dalle tue ore di veglia va programmata in anticipo con Meta Business Suite. Saltare una finestra non è accettabile.</Hint>
      </Card>
      <Card>
        <H>Stato dell&apos;account</H>
        <P>Il semaforo verde/arancione/rosso indica la gravità delle segnalazioni aperte. Lo <B>stato</B> è un&apos;altra cosa: dice in che situazione è l&apos;account sulla piattaforma.</P>
        <Bullets items={Object.keys(STATES).map((k) => <span key={k}><B>{STATES[k].label}</B> — {STATES[k].desc}</span>)} />
        <P style={{ marginTop: 10 }}>Con stato <B>Sospeso</B> o <B>Bannato</B> il piano del giorno si ferma e il calendario del warm-up resta in pausa: quando l&apos;account torna Online riprende dal giorno in cui si era fermato. Se il ritorno arriva da un recupero, parte il cooldown post-unban. Lo stato si vede anche in Account social.</P>
      </Card>
      <Card>
        <H>Task giornaliere e settimanali</H>
        <P><B>Ogni giorno, per ogni account:</B></P>
        <Bullets items={["Account Status Report: screenshot della salute dell'account in Discord (~5 min)", "Soft engagement prima di pubblicare (~10 min per account)", "Reels nelle finestre USA previste dallo stage", "Trail reels: 5 al giorno se la funzione è attiva", "3–5 storie per account, compresa la CTA e il repost di un reel", "Engagement della giornata: 30+ minuti per account", "Sound USA in trend girati in Discord"]} />
        <P style={{ marginTop: 10 }}><B>Ogni settimana:</B> 3–4 caroselli per account, revisione delle consegne dell&apos;editor, 10 idee di reel virali, 10 sound virali, un report per creator la domenica.</P>
      </Card>
      <Card>
        <H>Stage e paga</H>
        <Table head={["Stage", "Reels/sett.", "Trail", "Paga"]} rows={[
          ["Stage 1 · Creazione", "—", "—", "3 $ una volta"],
          ["Stage 2 · Warm-up", "13", "—", "8,50 $/sett."],
          ["Stage 3 · Full ops", "21", "—", "11 $/sett."],
          ["Stage 4 · Full ops + trail", "21", "35", "13 $/sett."],
          ["Stage 5 · Cooldown", "—", "—", "4 $/sett."],
        ]} />
        <Hint>Lo stage ufficiale lo aggiorna il Project Manager.</Hint>
      </Card>
      <Card>
        <H>Cosa significa engagement</H>
        <P>Scrollare i Reels per qualche minuto e caricare il contenuto <B>non è sufficiente</B>. Ogni sessione deve mescolare più attività:</P>
        <Bullets items={["Guardare i Reels per intero", "Navigare il feed principale", "Guardare le storie degli account nel feed", "Aprire i caroselli e scorrere più immagini", "Like naturali, mai a raffica", "Salvataggi occasionali", "Commenti brevi, autentici e sempre diversi", "Visitare i profili e guardare la griglia", "Rispondere ai commenti di altre persone"]} />
        <P style={{ marginTop: 10 }}><B>Sotto i tuoi post</B> rispondi sempre creando un thread: ogni risposta deve stimolare un&apos;altra risposta.</P>
      </Card>
      <Card>
        <H>Flag arancione: la regola d&apos;oro</H>
        <P><B>Non fare ricorso. Cancella e basta.</B> Risolve il 90% dei flag arancioni all&apos;istante; il ricorso tiene vivo il post e attira ulteriori controlli.</P>
        <P>Rotazione IP obbligatoria prima di accedere a un account segnalato. Nessuna pubblicazione finché il flag non è risolto. Dopo la risoluzione l&apos;account riprende il giorno dopo, con monitoraggio per 48 ore e due controlli al giorno.</P>
      </Card>
      <Card>
        <H>Link e CTA</H>
        <P>Il sistema di link si introduce <B>solo dopo che un reel ha superato le 10.000 visualizzazioni</B> e il management ha approvato. È una soglia di performance, non di calendario.</P>
        <P>Metodo: <B>link in bio + storia in evidenza</B>. Ogni account ha il suo link unico, mai copiato da un altro account. Sul profilo resta visibile una sola storia in evidenza, quella con la CTA. Un dominio bruciato è morto per sempre su quell&apos;account.</P>
        <P><B>Domini:</B> ogni account ha il suo dominio assegnato dal Project Manager. Mai copiare il link di un altro account, nemmeno dello stesso creator.</P>
      </Card>
      <Card>
        <H>Standard di qualità</H>
        <P><B>Reels:</B> guardalo tutto prima di pubblicarlo, scegli strategicamente quale reel va in quale finestra, mai ripubblicare lo stesso reel. Se audio o montaggio sono sbagliati non si pubblica: si scrive al Content Manager.</P>
        <P><B>Caroselli:</B> minimo 2 immagini, sempre un sound adatto al mood, ogni immagine forte, tag della città USA assegnata nel formato &quot;City Name - United States&quot;.</P>
        <P><B>Storie lifestyle:</B> palestra, caffè, cibo, animali, mare, viaggi. Pulite, varie, naturali — non la stessa foto in palestra ogni giorno, niente sticker a raffica.</P>
        <P><B>Storia CTA:</B> foto o video dove il creator è al meglio, layout pulito, call to action naturale che rimanda alla storia in evidenza.</P>
        <P><B>Didascalie:</B> devono sembrare scritte dal creator, coerenti col contenuto, mai spam. Il test è leggerla ad alta voce.</P>
        <P><B>Commenti:</B> l&apos;obiettivo è creare un thread sotto i propri reel. Prima di rispondere controlla che il profilo sia USA o Tier 1.</P>
      </Card>
      <Card>
        <H>Limiti per device</H>
        <Bullets items={["Massimo 1 creazione per device al giorno", "Minimo 24 ore tra due creazioni sullo stesso telefono", "Massimo 3 account per device, 1 per creator", "Un telefono con restrizioni ripetute, flag multipli o avvisi di attività sospetta va riportato alle impostazioni di fabbrica prima di essere riusato", "Quando cambi device, l'altro telefono va spento completamente con le app chiuse"]} />
      </Card>
      <Card>
        <H>Rotazione IP tra un account e l&apos;altro</H>
        <P>Si fa <B>a ogni passaggio</B> da un account all&apos;altro, senza eccezioni nemmeno nelle giornate piene.</P>
        <Bullets ordered items={IPROT} />
        <P style={{ marginTop: 12 }}><B>Da non fare mai:</B></P>
        <Bullets items={IPWARN} />
        <Hint>La sicurezza degli account viene prima della velocità: meglio un accesso in ritardo che un rischio evitabile.</Hint>
      </Card>
      <Card>
        <H>Setup del telefono</H>
        <P>Un telefono configurato male è uno dei rischi nascosti più grossi: abbassa il trust score, fa scattare restrizioni precoci, porta a shadowban e ban. Si configura da zero quando arriva un nuovo manager, quando viene assegnato un nuovo creator, o quando un device ha accumulato restrizioni e flag.</P>
        <P><B>iPhone, dopo il reset di fabbrica:</B> lingua inglese, regione Stati Uniti, aspetto predefinito, «Set Up Without Another Device», connessione solo all&apos;hotspot personale, codice semplice, «Don&apos;t Transfer Apps &amp; Data», nuovo account iCloud gratuito con email sul nome d&apos;arte della creator, <B>Localizzazione disattivata</B>, Apple Pay e Siri più tardi, portachiavi iCloud disattivato, analisi non condivise.</P>
        <P><B>Proxy:</B> si usa Potatso con un proxy mobile, non una VPN. Una VPN maschera l&apos;IP ma Instagram vede comunque le incoerenze a livello di device; il proxy mobile fa risultare il telefono attivo da un operatore mobile USA e alza parecchio il trust score. Dopo la configurazione si verifica su whatismyipaddress.com che la posizione sia Stati Uniti. Il proxy non si spegne mai: se cade, si smette subito di usare Instagram.</P>
        <P><B>App:</B> Instagram, Google Drive e Discord si scaricano <B>solo dopo</B> che il proxy è attivo — l&apos;App Store registra i metadati di regione al momento del download.</P>
      </Card>
      <Card>
        <H>Cooldown post-unban</H>
        <P>Minimo 3 settimane, meglio 4. IP e device puliti, nuova email e nuovo numero, username leggermente modificato, account privato per 2–3 giorni, bio senza link.</P>
        <P><B>Nessun reel durante il cooldown:</B> attirano il massimo controllo algoritmico. Solo contenuti sicuri e neutri, engagement normale e a basso rischio.</P>
      </Card>
      <Card>
        <H>Username: esempi</H>
        <Table head={["Corretti", "Sbagliati"]} rows={[
          [<span key="a">sarabunni<br />saralovesu<br />saradreamy_<br />sara.sfamurri</span>, <span key="b">saraaaalovesmen<br />sara23.fz1zoomie<br />omg123zdjdsaraismyfave<br />lookatsara1body</span>],
        ]} />
        <Hint>Mai solo nome e cognome del creator: può innescare ban di massa.</Hint>
      </Card>
    </div>
  );
}

export function GuideX() {
  return (
    <div>
      <Card>
        <H>Perché X conta</H>
        <P>Un account X fatto bene trasforma in abbonati circa il <B>3-8% dei nuovi follower</B>. Con 2000 follower al mese sono una sessantina di abbonati, che nel tempo valgono attorno ai 9.000 $. Gestito male, gli abbonati sono una decina.</P>
        <P>X non porta tantissimo volume — di solito il 10-20% dei nuovi abbonati — ma porta <B>gente che compra</B>.</P>
        <Hint>Sono medie raccolte da ricerche, non dati ufficiali di OnlyFans: vanno verificate con i nostri tracking link. Per le creator italiane conviene il profilo in inglese puntando all&apos;estero; se il pubblico è solo italiano, X resta un canale secondario.</Hint>
      </Card>
      <Card>
        <H>I numeri da tenere a mente</H>
        <Table head={["Cosa", "Riferimento"]} rows={[
          ["Visualizzazioni per post", "con Premium oltre 600 · senza Premium sotto 100"],
          ["Interazioni", "la media è 0,7% · sopra l'1% va bene"],
          ["Post con link dentro", "non li vede quasi nessuno"],
          ["Conversione dei follower", "3-8% se gestito bene · sotto lo 0,5% se gestito male"],
          ["PPV dopo la sub", "il 30-60% compra entro una settimana, dove la chat lavora bene"],
          ["Abbandono mensile", "tra il 15% e il 60% delle sub, dipende dalla chat"],
          ["Valore di un abbonato", "da 10-50 $ fino a qualche migliaio"],
          ["Soglia per le prime sub", "bastano 500-1000 follower attivi"],
        ]} />
      </Card>
      <Card>
        <H>Quello che dipende da noi</H>
        <Bullets items={[<span key="p">Avere <B>Premium</B></span>, "Non mettere link nei post", "Restare sempre nella stessa nicchia", "Rispondere ai commenti nella prima ora", <span key="m">Fare collaborazioni con altre creator: X spinge i post tra <B>mutual</B>, cioè due account che si seguono a vicenda</span>]} />
        <P style={{ marginTop: 10 }}><B>Quello di cui dobbiamo solo tenere conto:</B> segnalazioni e blocchi pesano tantissimo sulla visibilità; in Italia X ha perso quasi un utente su tre nel 2025; in UK e in Italia c&apos;è la verifica dell&apos;età, quindi qualcuno si perde per strada.</P>
      </Card>
      <Card><H>Prima di iniziare</H><Bullets items={XSETUP.map((x) => x.t)} /></Card>
      <Card>
        <H>Tutti i giorni</H>
        <P><B>2-3 post al giorno.</B></P>
        <Bullets items={["Controllo le notifiche e che l'account non abbia problemi", "10-15 commenti sotto i post di account grandi della stessa nicchia", "Un post personale: una domanda, un sondaggio, cosa sta facendo", "Un teaser etichettato, meglio un video breve, con il link nel primo commento", "Se c'è tempo, un post non esplicito", "Rispondo ai commenti entro un'ora da ogni post", "A fine giornata segno i numeri"]} />
        <Hint>Se puntiamo agli USA gli orari giusti sono la notte italiana: conviene programmare i post.</Hint>
      </Card>
      <Card>
        <H>Ogni settimana</H>
        <Table head={["Giorno", "Cosa si fa"]} rows={[["Lunedì", "report e calendario della settimana"], ["Mercoledì", "una o due collaborazioni"], ["Venerdì", "promo del weekend nel post fissato, se si vuole fare"], ["Domenica", "aggiorno il post fissato e controllo l'account"]]} />
      </Card>
      <Card>
        <H>Regole sui contenuti</H>
        <P>Il mix punta a circa <B>40% teaser, 40% post personali, 20% post non espliciti</B>.</P>
        <Bullets items={XSEMPRE} />
      </Card>
      <Card>
        <H>Cosa non fare</H>
        <P>Mai contenuti espliciti nella foto profilo o nella copertina, mai bot o automazioni, mai gruppi di like, mai post espliciti senza etichetta.</P>
        <P><B>Se le visualizzazioni crollano:</B> controllo le etichette, niente link e menzioni per qualche giorno, solo post personali.</P>
        <P><B>Se l&apos;account viene bloccato:</B> fermo tutto e faccio ricorso a X.</P>
        <P><B>Se escono dei leak:</B> li segnalo e chiedo la rimozione per copyright.</P>
        <P><B>Commenti cattivi:</B> nascondo e blocco, senza rispondere.</P>
      </Card>
      <Card><H>Stato dell&apos;account</H><Bullets items={Object.keys(XSTATES).map((k) => <span key={k}><B>{XSTATES[k].label}</B> — {XSTATES[k].desc}</span>)} /></Card>
      <Card>
        <H>Report del lunedì</H>
        <P>I campi sono nella scheda <B>Dati</B> di ogni profilo:</P>
        <Bullets items={WFIELDS_X.map((f) => <span key={f.k}>{f.lab}{f.goalTxt ? <> — <B>{f.goalTxt}</B></> : null}</span>)} />
      </Card>
    </div>
  );
}
