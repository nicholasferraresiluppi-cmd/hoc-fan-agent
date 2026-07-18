# Scoring algoritmico dei lavoratori — requisiti da validare con consulenza legale

> **Questo NON è un parere legale.** È la lista di aree regolatorie e requisiti di prodotto che HOC deve portare a un legale (interno + esterno specializzato in diritto del lavoro / data protection) **prima** di far incidere lo score algoritmico su compenso, priorità di assegnazione, promozioni o uscite. Redatto da Claude (Strategic PM) come input al gate 0c del benchmark ([BENCHMARK_DEEP_STUDY.md](BENCHMARK_DEEP_STUDY.md)); owner della decisione: Nicholas + board, con validazione di un professionista abilitato. Data: 2026-07-18.

## Perché esiste questo documento

HOC Pro produce e userà decisioni assistite da algoritmo su lavoratori:
- **gate di promozione** su score Infloww operational ([CAREER_LADDER.md](CAREER_LADDER.md) §4);
- **Action Center** che esporta gli underperformer a HR;
- **priorità di assegnazione** sulle bande alte guidata dal livello (leva economica del ladder);
- (fase 5) **pre-screening AI** delle conversazioni per la QA.

Per una società italiana di ~200 persone in crescita verso 400+, questo entra in almeno quattro perimetri regolatori. Nessuno dei 12 prodotti benchmark ha una postura di compliance pubblica utile da copiare: la difendibilità è responsabilità di HOC.

## Le quattro aree (domande da porre al legale)

### 1. EU AI Act — gestione dei lavoratori come area ad alto rischio
L'AI Act classifica come ad alto rischio i sistemi di IA usati per *valutazione, promozione, cessazione e allocazione dei compiti* dei lavoratori; gli obblighi entrano in fase-in nel 2026-2027.
- Il pre-screening AI delle conversazioni (fase 5) è chiaramente in perimetro. Lo **score composito** e i gate — quando la componente qualità sarà LLM-based — probabilmente anche.
- Domande al legale: quali dei nostri usi ricadono come "sistema ad alto rischio" vs "supporto alla decisione umana"? Quali obblighi scattano (gestione del rischio, qualità dei dati, trasparenza, **sorveglianza umana**, log)? Che tempistiche di conformità per una società della nostra dimensione?

### 2. GDPR art. 22 — decisioni automatizzate individuali
Un lavoratore ha diritto a non essere soggetto a una decisione *basata unicamente* su trattamento automatizzato che produca effetti significativi (comp, promozione, cessazione).
- Requisito di prodotto derivato: **mai una decisione solo-automatica** su esiti che incidono sul rapporto. Deve esserci intervento umano significativo (non un timbro), diritto di ottenere spiegazione, di esprimere il proprio punto di vista e di contestare — già disegnato in [CAREER_LADDER.md §8.2](CAREER_LADDER.md).
- Domande al legale: la nostra "calibrazione trimestrale + approvazione umana" costituisce intervento umano *significativo* ai fini dell'art. 22? Serve una DPIA (valutazione d'impatto) per lo scoring? Come formuliamo l'informativa agli operatori?

### 3. Statuto dei Lavoratori art. 4 — controllo a distanza
Il monitoraggio dell'attività (KPI per-chatter, response time, message dashboard, review conversazioni) tocca l'art. 4: gli strumenti da cui deriva anche un controllo a distanza dell'attività richiedono in genere accordo sindacale o autorizzazione, e comunque informativa adeguata.
- Domande al legale: la raccolta KPI da Infloww e la QA sulle conversazioni rientrano nell'art. 4? Serve accordo/autorizzazione? Che informativa e quali limiti d'uso dei dati raccolti (es. non per fini disciplinari senza le garanzie previste)?

### 4. Status contrattuale degli operatori
Molte agenzie del settore lavorano con collaboratori/P.IVA più che con dipendenti. Il perimetro di GDPR art. 22 e Statuto art. 4 e le tutele cambiano con lo status.
- Domande al legale: qual è lo status prevalente dei nostri operatori? Uno scoring che guida priorità di assegnazione e compenso incide sulla qualificazione del rapporto (indice di etero-organizzazione)? Il ladder aumenta questo rischio?

## Requisiti di prodotto che ne discendono (già compatibili con il piano)

Indipendentemente dal parere, questi requisiti sono buona ingegneria e riducono il rischio; molti sono già nel piano:
1. **Human-in-the-loop documentato** su ogni esito che incide sul rapporto (gate, Action Center → HR, comp). La decisione automatica *segnala*, l'umano decide e la decisione è registrata. (Già in CAREER_LADDER §8.)
2. **Spiegabilità dello score**: l'operatore può vedere come si compone il suo score (quali KPI, quali pesi, con quale formula in quel mese) — richiede il [registro versionato formula/pesi](INFLOWW_SURFACE.md) (gate 0b) e una vista "il mio score" scope-own.
3. **Diritto di accesso, replica e appello**: flusso di contestazione strutturato con SLA. (Già in CAREER_LADDER §8.2.)
4. **Nessun cambiamento silenzioso dello storico**: audit log append-only delle correzioni. (Già in CAREER_LADDER §8.2.)
5. **Minimizzazione e finalità**: i transcript/QA usati solo per gli scopi dichiarati; retention definita; accesso RBAC-gated (già scope own/team/all).
6. **Informativa e, se dovuto, accordo/autorizzazione** prima di far incidere lo score su comp/promozioni/uscite.

## Cosa NON blocca

Questo gate blocca l'**uso HR-consequenziale** dello score (comp, promozioni, uscite, pre-screening AI disciplinare). **Non blocca** il lavoro di prodotto sui pezzi senza conseguenza sul rapporto: score di qualità come strumento di coaching, training simulator, trasparenza comp informativa, governance dei cambi score. Si costruisce l'infrastruttura (spiegabilità, audit, appello) *mentre* si chiude il gate legale — anzi, costruirla è parte della risposta.

## Prossimo passo concreto

Portare questo documento + [CAREER_LADDER.md §8.3](CAREER_LADDER.md) a Roberta/Ilaria per l'inquadramento interno e a un legale del lavoro/data protection esterno. Trasformare le risposte in requisiti vincolanti di prodotto (aggiornando questo file da "domande" a "requisiti confermati").
