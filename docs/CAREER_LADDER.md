# HOC Career Ladder — Chat Sales

**Versione:** 0.2 (bozza per review Nicholas, poi board)
**Data:** 2026-07-13
**Owner:** Nicholas · **DRI stesura:** Claude (Strategic PM)
**Stato:** PROPOSED — numeri dei gate da calibrare su distribuzione storica reale prima dell'adozione

**Changelog v0.2:** naming "Sales Operator" confermato da Nicholas · §10 comp riscritta sul modello reale a scaglioni per turno (dati CP maggio 2026 + P&L Finance Nov/25-Apr/26) · aggiunto §8.1 processo QA · piazzamento iniziale data-driven (no grandfathering manuale) · integrazione con seniority training e certificazioni esistenti in HOC Pro

---

## 1. Scopo

Definire livelli, titoli, criteri di passaggio e struttura di progressione per la forza vendita chat di HOC. Questo documento è l'artefatto sorgente: le fasi software di HOC Pro (profili, onboarding, progression engine) lo implementano, non lo sostituiscono.

Problema che risolve: oggi la progressione è informale ("fai i numeri e vedremo"), come nel resto del settore. A 150-300 ingressi/anno e attrition di settore 30-45%, l'assenza di un percorso visibile è la prima causa dichiarata di abbandono volontario (Gallup) e il ladder pubblicato è la leva di retention più documentata (LinkedIn: aziende forti in mobilità interna trattengono 5,4 anni vs 2,9).

## 2. Principi di design (evidence-based)

1. **Livello ≠ titolo.** Il livello (L1-L6) guida banda retributiva e progressione; il titolo descrive il lavoro. Il livello intermedio non ha prefisso: mai "Mid".
2. **Levels + Steps** (modello Buffer). I **Level** sono salti veri: banda retributiva, calibrazione formale, rari. Gli **Steps** sono micro-avanzamenti dentro il livello: frequenti, economici, triggerati dai dati.
3. **Ogni gate = KPI sostenuto + contrappeso qualità + time floor + certificazioni.** Mai promozione su un mese caldo o su sola revenue (dati SDR: promossi con <11 mesi di ruolo falliscono ~55%, con 16+ mesi ~6%; Wells Fargo come caso limite del gate a metrica singola).
4. **Doppio binario a L4.** Il miglior venditore non diventa manager per default: la performance di vendita predice *negativamente* la qualità manageriale, i segnali di collaborazione la predicono positivamente (Benson/Li/Shue, QJE 2019). Il track esperto trattiene i top seller senza costringerli a gestire persone.
5. **Promozione = pipeline, non colpo di spalla.** Verso i ruoli di gestione si entra candidandosi a un percorso (TL Academy, modello Teleperformance JUMP), non per nomina improvvisa.
6. **La promozione è una finestra di rischio.** Il 29% lascia entro un mese dalla prima promozione vs 18% baseline (ADP, 1,2M lavoratori): ogni passaggio di livello ha un piano strutturato dei primi 90 giorni.
7. **Ladder corto e pubblico.** 4 livelli operator + 2 di gestione. I livelli cosmetici si svalutano (il 92% dei lavoratori considera i titoli gonfiati un surrogato di crescita); i criteri sono pubblicati dal giorno uno.

## 3. Il ladder

| Livello | Titolo | Missione | Riporta a |
|---|---|---|---|
| L0 | **Trainee** | Completare l'onboarding a fasi (§9). Non in classifica pubblica. | Mentor + Team Lead |
| L1 | **Sales Operator I** | Operare in autonomia su account assegnati con qualità costante | Team Lead |
| L2 | **Sales Operator II** | Performance sopra la media del team, affidabilità su più creator/fasce | Team Lead |
| L3 | **Sales Operator III (Senior)** | Riferimento del team: performance alta sostenuta + mentoring dei nuovi | Team Lead |
| L4a | **Team Lead** *(track gestione)* | Far performare un turno/team: coaching, qualità, coperture | Sales Manager |
| L4b | **Senior Sales Specialist** *(track esperto)* | Vendere ai massimi livelli su account critici; zero riporti | Sales Manager |
| L5 | **Sales Manager** | Risultato aggregato di più team; calibrazione; pipeline promozioni | Head of Sales / Board |
| L6 | **Head of Sales / Performance** | Da formalizzare a scala (18-24 mesi) | Board |

Nota naming: "Sales Operator" sostituisce "chatter" come titolo formale (professionale, presentabile esternamente, coerente col vocabolario Sales già in uso in ClickUp). "Chatter" resta gergo interno accettabile, non compare su contratti/organigrammi.

## 4. Gate di promozione

Base dati: Score operativo 0-100 di HOC Pro (9 KPI pesati: Fan CVR, Unlock Rate, Avg Earnings/Paying Fan, Golden Ratio, ecc.) e relativi tier (Critical <51, Weak 51-60, Average 61-70, Good 71-80, Strong 81-90, Elite 91+).

> ⚠️ **Nota tecnica vincolante:** lo Score è normalizzato sulla media del Group — misura la posizione *relativa al team*. Un gate su metrica relativa penalizza chi sta in team forti. Mitigazioni obbligatorie: (a) i gate combinano tier + minimi assoluti di volume, (b) la calibrazione trimestrale (§8) confronta cross-group prima di approvare, (c) prima dell'adozione va fatta un'analisi di distribuzione sui dati storici per validare le soglie proposte.

Tutti i numeri sotto sono **proposte iniziali, confidence ~60%**, da calibrare sui dati storici reali.

| Passaggio | Time floor | Performance sostenuta | Qualità (contrappeso) | Altro |
|---|---|---|---|---|
| L0 → L1 | 4-6 settimane | Graduazione onboarding: benchmark minimi su trial shift supervisionati | QA pass su conversazioni campione + compliance | Checklist onboarding completa |
| L1 → L2 | ≥ 6 mesi in L1 | Tier ≥ **Average** in 3 degli ultimi 4 mesi, nessun mese Critical | QA trimestrale pass; response time nei limiti | Certificazioni base complete |
| L2 → L3 | ≥ 10 mesi in L2 | Tier ≥ **Good** in 4 degli ultimi 6 mesi | QA pass; zero violazioni compliance in 6 mesi | **Mentoring di ≥ 2 nuovi ingressi con esito positivo** |
| L3 → L4a (TL) | ≥ 6 mesi in L3 | Tier ≥ Good mantenuto (floor, non gate primario) | — | **TL Academy completata (§6) + selezione su segnali di coaching/collaborazione, non su classifica** |
| L3 → L4b (Specialist) | ≥ 6 mesi in L3 | Tier ≥ **Strong** in 5 degli ultimi 6 mesi | QA eccellente | Nessun requisito di gestione persone |
| L4a → L5 | ≥ 12 mesi in L4a | Risultati aggregati del team (score medio, retention team, coperture) | — | Decisione collegiale (comitato, come hiring) |

Il requisito di mentoring a L2→L3 è deliberato: crea il segnale di collaborazione osservabile su cui si seleziona il futuro Team Lead (principio 4) e dà a ogni team capacità di onboarding distribuita.

## 5. Steps (progressione dentro il livello)

Ogni livello L1-L3 ha 3 Steps (es. L2.1 → L2.2 → L2.3). Uno Step scatta al verificarsi di trigger predefiniti e comporta un micro-incremento economico fisso `[DA DEFINIRE con Roberta/Ilaria]`. Decisione del Team Lead su trigger oggettivi, nessun comitato.

Trigger proposti (2 su 3 richiesti): (a) tier migliorato e mantenuto per 2 mesi consecutivi; (b) certificazione per creator completata — **il sistema esiste già in HOC Pro** (`certifications.js`: L1 Base ≥10 sessioni/media 65, L2 Expert ≥25/75, L3 Master ≥50/85, badge permanenti per creator); (c) contributo operativo riconosciuto (copertura turni critici, mentoring spot, contributo a script/playbook).

Razionale: nei livelli lunghi (10+ mesi) lo Step mantiene momentum ed evita che l'unico riconoscimento possibile sia la promozione (pratica micro-promotion documentata nelle sales org, es. Chili Piper).

**Integrazione col sistema seniority esistente:** HOC Pro ha già una seniority training a 3 tier (junior 🌱 / senior ⭐ / master 👑, auto-calcolata da sessioni training + overall medio, con override manuale). Al lancio del ladder quel sistema non resta parallelo: i privilegi training (daily drill, scenari sbloccati, scoring boost) diventano funzione del livello ladder, e il naming junior/senior/master viene ritirato in favore di L1/L2/L3 — un solo sistema di progressione visibile all'operatore.

## 6. TL Academy (pipeline verso la gestione)

Modello apply-in (Teleperformance JUMP: ~80% delle promozioni passa dal programma):

1. **Candidatura aperta** a tutti gli L3 (+ L2.3 su segnalazione TL) — ci si candida, non si viene scelti in silenzio.
2. **Percorso 8-12 settimane** in parallelo al lavoro: coaching, gestione turni, lettura KPI del team, feedback, colloqui difficili. Materiale: playbook interni + affiancamento a un TL attivo.
3. **Interim TL reversibile** (modello GitLab): 4-8 settimane da TL facente funzione su un turno, con rientro in L3/L4b senza stigma se non funziona — da entrambe le parti.
4. **Selezione finale collegiale** (Sales Manager + HR + un TL non coinvolto), pesata su segnali di coaching osservati, non sulla posizione in classifica.

## 7. Primi 90 giorni post-promozione

Ogni passaggio di livello attiva automaticamente (in HOC Pro, fase 4): check-in a 2 settimane / 30 / 60 / 90 giorni col diretto responsabile; obiettivi del nuovo livello espliciti dal giorno uno; per L4a, pairing con un TL/SM esperto. Il sistema segnala HR se i check-in saltano. Razionale: finestra di churn post-promozione (principio 6).

## 8. Governance e manutenzione del sistema

- **Chi decide:** L1→L3 proposti dal TL, approvati da Sales Manager con verifica HR. L4+ decisione collegiale (stesso principio del hiring committee). Nessuna promozione fuori ciclo salvo eccezione approvata dal board.
- **Calibrazione trimestrale:** Sales Manager + HR rivedono le promozioni del trimestre cross-group, correggono le soglie se un Group risulta strutturalmente penalizzato/avvantaggiato dalla normalizzazione relativa.
- **Anti-Goodhart — KPI del ladder stesso**, monitorati in HOC Pro: tasso di fallimento dei promossi per time-in-level; churn a 6 mesi post-promozione (finestra ADP); segnali di gaming delle metriche (pattern anomali su unlock rate/PPV, reclami). Se una metrica inizia a essere "coltivata", si rivede il gate — è manutenzione attesa, non fallimento del sistema.
- **Versioning:** ogni modifica a livelli/gate è un cambio versione di questo documento con changelog. Gli operatori vedono sempre la versione corrente e i propri progressi verso il gate successivo.

### 8.1 Processo QA (il contrappeso qualità dei gate)

I gate richiedono un segnale di qualità che i dati Infloww/CP non contengono (misurano vendita, non *come* si vende). Processo proposto, volutamente leggero:

- **Campione:** 3 conversazioni/mese per operatore attivo, estratte random dal sistema (non scelte dall'operatore né dal reviewer).
- **Chi valuta:** mai il TL diretto da solo (valuterebbe chi propone per promozione — conflitto). Rotazione: Trainer + un TL di *altro* team. Carico stimato: ~10 min/operatore/mese ≈ 30h/mese totali su ~176 operatori attivi, distribuite su 4-6 reviewer.
- **Rubrica (scala 1-4 per dimensione):** (1) compliance e safety; (2) aderenza a brand voice/persona della creator; (3) tecnica di vendita non pressante (no spam PPV, escalation corretta); (4) retention del fan (riapertura conversazione, follow-up); (5) qualità di scrittura. **Pass = media ≥ 3 e nessun fail su compliance.** Un fail compliance congela qualsiasi promozione in corso.
- **Dove vive:** HOC Pro (fase 2/4 del progetto): form reviewer + storico per operatore, alimenta automaticamente il fascicolo promozione.
- **Evoluzione (fase 5):** pre-screening AI delle conversazioni campione (l'app ha già l'SDK Anthropic) con conferma umana — riduce il carico reviewer a ~1/3. Non si parte da qui: prima la rubrica deve stabilizzarsi con giudizio umano.

## 9. Onboarding (L0) — struttura a fasi

Dettaglio in documento dedicato (Fase 2 del progetto). Struttura, coerente con le pratiche verificate di settore:

| Fase | Durata | Contenuto | Gate di uscita |
|---|---|---|---|
| A — Setup | Giorni 1-2 | Contratto, NDA, security, accessi, cultura HOC | Checklist completa |
| B — Shadowing | Settimane 1-2 | Affiancamento a operatore L3+ (il mentor del §4), studio playbook e brand voice | Valutazione mentor |
| C — Trial supervisionato | Settimane 2-4 | Turni reali con supervisione, volumi crescenti | Benchmark minimi + QA |
| D — Graduazione | Fine settimana 4-6 | Review finale mentor + TL | → **Sales Operator I** |

## 10. Compensation per livello — proposta sul modello reale

### 10.1 Il modello attuale (non si tocca)

Il comp operatori HOC **non è oraria + commissione** come nel resto del settore: è **percentuale per creator con scaglioni per turno** — bracket {5/8/10/12/15%} applicati al venduto del wage-shift rispetto a soglie mid/top calibrate per banda di fatturato creator (30K→150K+) e classe cosellers (1×/2×/3×). Decisione board già presa e vincolante per questo documento: **si calibrano solo le soglie, le percentuali non si toccano** (cfr. `/admin/threshold-study`).

Dati di ancoraggio (CP maggio 2026, 176 operatori, 35 alias creator; P&L Finance Nov/25-Apr/26):

| Grandezza | Valore |
|---|---|
| Take effettivo per team | 7,5% – 16,1% del venduto attribuito (mediana ~12%; team EN più bassi degli IT) |
| Take totale operatori | ~$304k/mese → media ~$1,7k/operatore (mediana più bassa: molti part-time — da calcolare) |
| Venduto/turno mediano (P50, turni mono 1×) | $154 (banda 30K) → $253 (50K) → $394 (75K) → $530 (100K) → $618 (125K) → $759 (150K+) |
| Pool agency fee | ~€870k/mese; spese di progetto ~€545k/mese (62,6% della fee); EBIT ~22% della fee |

### 10.2 Cosa aggiunge il ladder (tre layer sopra il modello, che resta invariato)

1. **Priorità di assegnazione per livello — la leva economica vera, a costo zero.** Il P50 del venduto/turno in banda 150K+ è ~5× quello in banda 30K: a parità di percentuali, spostare un operatore su creator di banda alta ne moltiplica il take. Oggi questa assegnazione è informale; il ladder la formalizza: L1 opera su bande 30-50K, L2 sblocca 75-100K, L3/L4b ha priorità su 125K-150K+. La progressione di guadagno è già nel sistema — il livello la rende un diritto guadagnato e trasparente invece di una concessione.
2. **Level premium** — importo fisso mensile legato al livello, pagato se attivo nel mese (≥ soglia minima turni): L2 **+$75/mese**, L3 **+$150/mese**, L4b **+$300/mese**. Riconosce il livello indipendentemente dal creator assegnato quel mese (protegge dal "mese sfortunato" e dalla lotteria assegnazioni).
3. **Step bump** — **+$25/mese** per Step (2 bump per livello, §5): un L3.3 vale +$200/mese sopra il take.

**Sostenibilità** (ipotesi distribuzione a regime: ~60 L1 / 70 L2 / 30 L3 / 16 L4): premi ≈ $14,5k/mese + step ≈ $2-3k/mese → **~$17k/mese ≈ 2% del pool fee, ~5,6% del monte take operatori**. Per un L2/L3 medio è un aumento del 5-15% — percepibile — a fronte di un costo aggregato marginale. Confidence 60%: le cifre vanno validate simulando sulla distribuzione reale dei take (fase "analisi soglie") e verificate da Roberta/Ilaria per il lato fiscale/contrattuale.

| Livello | Take da scaglioni | Priorità bande | Premium | Potenziale Step |
|---|---|---|---|---|
| L1 Operator I | invariato | 30-50K | — | +$50 max |
| L2 Operator II | invariato | fino a 100K | +$75/m | +$50 max |
| L3 Operator III | invariato | tutte, priorità 125K+ | +$150/m | +$50 max |
| L4b Senior Specialist | invariato | account critici, priorità massima | +$300/m | — |
| L4a Team Lead | struttura dedicata → §10.3 | — | — | — |

Nota valuta: comp operatori in USD (valuta CP); P&L aziendale in EUR. Il ladder eredita questa convenzione.

### 10.3 Team Lead (L4a) — proposta

**Oggi (chatter manager):** €28 per turno di supervisione + €500/mese per gestione progetto modella. Solo input-based: paga la presenza, non il risultato né la crescita del team.

**Direzione** (idea di Nicholas 2026-07-13, raffinata): collegare il variabile del CM al risultato dei turni che supervisiona — un *manager override*, pratica standard nelle sales org. Tre correzioni al meccanismo grezzo "sopra $500 → 3%":

1. **Soglia calibrata per banda, non flat.** Una soglia fissa a $500 pagherebbe *sempre* i CM dei team 150K+ (venduto/turno mediano $759, già sopra soglia) e *mai* quelli dei team 30K (mediano $154). Ricreerebbe l'iniquità che il modello a bande ha appena risolto per gli operatori. Soluzione: si riusano le soglie top (P77) già calibrate per banda × classe — infrastruttura esistente, zero calibrazione nuova.
2. **Percentuale sull'eccedenza, non sull'intero.** Il 3% "da quel momento" su tutto il turno crea un cliff alla soglia (incentivo a spostare vendite tra turni per scavallarla). Sull'eccedenza sopra soglia l'incentivo è pulito e monotono.
3. **Condizione compliance.** Un CM pagato solo sul venduto del turno tenderà a spremere i forti e trascurare *come* si vende. Guardia: fail compliance QA nel team nel mese → variabile del mese congelata.

E la gamba mancante — **il bonus sviluppo**: l'evidenza (QJE 2019) dice che i TL vanno selezionati e premiati sul far crescere le persone, non solo sul risultato immediato. Se il CM guadagna solo dai turni supervisionati, il coaching fuori turno non ha prezzo.

**Pacchetto L4a proposto:**

| Componente | Meccanica | Status |
|---|---|---|
| Fisso per turno | €28/turno supervisione | invariato |
| Project fee | €500/mese per progetto modella gestito | invariato |
| Override risultato | **2-3% dell'eccedenza** del venduto del turno supervisionato sopra la **soglia top (P77) della banda×classe** | nuovo — % da fissare via simulazione |
| Bonus sviluppo | importo fisso per ogni operatore del team che sale di Step (+€X) o di livello (+€Y) nel mese | nuovo — `[X, Y DA FISSARE]` |
| Condizione | zero fail compliance QA nel team nel mese | nuovo |

**Sizing — simulazione su maggio 2026** (`/api/admin/tl-override-sim`, 4.262 turni mono, venduto attribuito $2,52M):

- Eccedenza totale sopra soglia top: **$304.860/mese** (14% del volume in studio; 1.003 turni sopra soglia = 24%, coerente col design P77).
- Costo override: a **2%** → $2,4k / $3,7k / $6,1k al mese con copertura supervisione 40/60/100%; a **3%** → $3,7k / $5,5k / $9,1k (0,14-0,36% del venduto). I turni split esclusi (13% del volume) alzano il costo reale in proporzione.
- Ordine di grandezza per il CM: eccedenza media di un turno sopra soglia ≈ $304 → a 3% ≈ **$9 extra a turno sopra soglia**, di più sulle bande alte.
- **Raccomandazione: 3% è sostenibile** (a copertura realistica 40-60%: ~0,4-0,6% del pool fee; anche al massimo teorico ~1%).

**Blocker operativo scoperto in simulazione:** i turni di supervisione CM **non esistono nei dati CP** (zero membri con earnings da ore, zero profili orari: il €28/turno è pagato fuori piattaforma). L'override non è quindi attivabile né calcolabile retroattivamente finché la fase 2 non introduce il tracciamento "chi supervisiona quale turno" in HOC Pro. Il **bonus sviluppo** invece non dipende dal tracciamento e può partire col lancio del ladder.

Benchmark di settore (solo contesto): modello ibrido $10-13/h + 3-8% nelle agency strutturate; le cifre marketing ($3-8k/mese) sono gonfiate — l'unica fonte giornalistica indipendente (Vice) riporta medie molto più basse. Il modello HOC a scaglioni è già più sofisticato della norma di settore.

## 11. Stato decisioni

| # | Decisione | Stato |
|---|---|---|
| 1 | Naming | ✅ **"Sales Operator"** (Nicholas, 2026-07-13) |
| 2 | Soglie dei gate | 🔄 Analisi di distribuzione sui dati storici in corso (pre-adozione) |
| 3 | Comp per livello | 🔄 Proposta in §10.2 su dati reali — da validare: simulazione su take reali + verifica fiscale/contrattuale Roberta/Ilaria + struttura L4a TL |
| 4 | QA strutturata | ✅ Disegnata in §8.1 — da approvare |
| 5 | Piazzamento al lancio | ✅ Confermato (Nicholas, 2026-07-13): piazzamento automatico data-driven sugli ultimi 6 mesi, nessuna mappatura manuale |
| 6 | Estensione ad altri ruoli | ✅ Confermata: AM, social, editor avranno ladder propri sullo stesso modello Levels/Steps (dopo il lancio di questo) |
| 7 | Struttura comp L4a Team Lead | 🔄 Proposta in §10.3, simulata su maggio 2026: **3% sostenibile** (~0,4-0,6% del pool fee a copertura realistica). Prerequisito: tracciamento turni di supervisione in fase 2 (non esistono in CP). Da decidere: % definitiva e importi bonus sviluppo |

## 12. Fonti principali

Benson, Li & Shue, *Promotions and the Peter Principle* (QJE 2019) · ADP Research Institute, *The Business Impact of Promotions* (2023) · Bridge Group SDR metrics (via fonti secondarie) · LinkedIn Workplace Learning Report 2022 · Gallup su turnover prevenibile · Buffer *Career Framework* (Levels/Steps) · GitLab Handbook (interim reversibile) · Teleperformance JUMP/Foundations · Stanford GSB, caso Wells Fargo (Goodhart) · Ricerca competitiva agency OF e tool di settore, luglio 2026 (report interni sessione).
