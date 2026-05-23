# HOC Pro — la webapp è operativa

**Per:** Board HOC (Riccardo, Riz, Davide, Jack, Gaia)
**Da:** Nicholas
**Data:** Maggio 2026
**TL;DR:** Abbiamo costruito una webapp interna che misura la performance reale dei chatter combinando dati CreatorsPro (sales) + Infloww (efficienza chat), assegna uno score 0-100 per operatore, e produce una lista mensile di operatori da rivedere/sostituire pronta per HR.

---

## Cosa è HOC Pro

Un'unica console (`hoc-fan-agent.vercel.app`) che fa 3 cose collegate:

1. **Misura la performance reale** del team chatter mese per mese, basandosi sui sales che generano davvero (non su KPI di efficienza chat che possono ingannare).
2. **Confronta i due score** (sales reali da CreatorsPro vs efficienza chat da Infloww) per scovare le discrepanze importanti.
3. **Genera la lista mensile** degli operatori da rivedere/sostituire, con suggerimenti di sostituzione automatici e export CSV pronto per HR.

I dati arrivano in automatico da **CreatorsPro** (sync via API, un click) e da **Infloww** (file CSV scaricato a mano, una volta al mese — Infloww non ha API).

---

## 1. Lo score Sales CP — come funziona

### La domanda di partenza
> "Marco è un bravo chatter?"

Sembra facile, ma non lo è: Marco lavora su due creator. Su Sara vende molto, su Giulia vende poco. Magari Giulia è una creator difficile dove l'intero team registra performance contenute. Confrontare Marco con un collega che lavora su una creator diversa è ingiusto.

### La soluzione: due classifiche combinate
Per ogni coppia **(operatore × creator)** calcoliamo due posizioni in classifica:

1. **vs Creator**: dove ti collochi tra gli operatori che lavorano sulla **stessa** creator
2. **vs Agency**: dove ti collochi tra **tutti** i chatter dell'agency nel mese

Combiniamo le due con peso **70/30**:
- Il 70% premia il merito locale ("sei bravo dove lavori")
- Il 30% ancora alla performance assoluta ("sei bravo in scala agency")

Effetto: un operatore non può finire **Elite** solo perché è il meno peggio in un team debole. E non viene penalizzato se lavora su creator strutturalmente meno performanti.

### Le metriche
- **85%** sales per shift (quanto generi a parità di turno)
- **15%** consistency (quanto sei regolare tra shift)

Le ore extra non entrano (lo shift è l'unità atomica del modello). Servono almeno **3 turni** sulla creator per essere classificato (sotto, score "—" perché statisticamente non affidabile).

### Lo score finale dell'operatore
Media pesata sui sales delle creator dove ha lavorato. Le creator dove genera più fatturato pesano di più.

### Le 6 categorie (tier)
| Tier | Range | Significato |
|---|---|---|
| 🟣 Elite | top 10% | eccellenza |
| 🔵 Strong | top 25% | solidi |
| 🟢 Good | top 50% | affidabili |
| ⚪ Average | top 75% | in linea con la media |
| 🟡 Weak | top 90% | sotto media |
| 🔴 Critical | bottom 10% | performance non sostenibili |

Sono percentile-based: gli Elite sono **sempre** il top 10% del periodo, anche se la performance assoluta dell'agency migliora o peggiora.

📚 Spiegazione completa con esempi e Q&A: `/welcome/score-friendly`

---

## 2. Il confronto Infloww (chatter review)

Nella stessa tabella mostriamo **due score affiancati**:
- **Score CP** (sales reali — il nostro riferimento)
- **Score Infloww** (KPI efficienza chat — il sistema che usavamo prima)

Quando i due score divergono di più di 10 punti, compare un'icona ↑ o ↓ che segnala la discrepanza.

> ⚠️ **Nota sulla qualità dei dati.** Su CreatorsPro alcuni team si dividono i *purch* (i takes), quindi a livello individuale il dato è parzialmente attribuito al collega di team. Su Infloww il dato è per-chatter, quindi più pulito sulla parte efficienza individuale. Le discrepanze nei team che si dividono i purch sono normali e non sempre sintomo di problema.

### Casi pratici che il confronto fa emergere

| Pattern | Possibili letture | Decisione |
|---|---|---|
| Sales CP alto + Infloww basso | **(a)** Iper-efficiente (vende molto con poco volume di chat) → da riconoscere come top reale. **(b)** Su creator che si vendono da sole → non promuoverlo come "top chatter". Drill-down operatore per distinguere. | Investigare |
| Sales CP basso + Infloww alto | Bravo a chattare ma converte poco in $ | Coaching su closing / PPV — Leva 1 |
| Sales CP ≈ Infloww | I due score concordano | Decisione HR lineare (riconoscere o sostituire) |

In sintesi: l'Infloww **non guida più le decisioni HR**, ma resta visibile come secondo segnale per validare lo score CP e identificare pattern interessanti.

---

## 3. L'Action Center — la lista mensile per HR

Pagina dedicata: `/admin/action-center`

Pannello che, per ogni mese, mostra:
- Gli operatori sotto soglia (default: score ≤ 25, almeno 5 turni nel periodo)
- **Soglia regolabile via slider** se vuoi includere anche Weak/Average per riorganizzazioni più ampie
- Filtri per **lingua** (ITA / ENG), **tier**, **Group** (creator)

### Per ogni candidato il sistema propone

**Top 3 sostituti suggeriti** — calcolati con un algoritmo che combina:
- Le creator dove l'underperformer lavora (peso 50%)
- L'importanza agency-wide di quelle creator (peso 50%)

E filtra solo candidati Good+ (score ≥ 50) che hanno già dimostrato di funzionare su quelle creator.

Esempio concreto:
> Livio è Critical su Eva Rizzoli (dove fa il 60% dei suoi sales). Il sistema propone come sostituto **Tinx** (fit score 86, ha lavorato bene proprio su Eva), non un Good generico che lavora altrove.

### Le 3 azioni per ogni operatore
- **🗑 Ignora** — toglie dal pannello permanentemente
- **HR** — segna come pronto per la lista finale (richiede sostituto scelto)
- **✕ Rimuovi** — toglie solo per questo mese, ricompare il prossimo

### Output: CSV per HR
Quando hai marcato N operatori come "pronti per HR", il bottone **Esporta CSV HR** produce un file con: nome, group, score, tier, sales, shifts, top creator, sostituto scelto, data, note. Pronto per essere passato all'HR / al processo di sostituzione.

---

## Cosa cambia nei flussi

### Per i Sales Manager e Team Lead
- **Mensile**: aprono Sales CP per vedere la classifica del proprio team. Confrontano con Infloww per scovare i casi interessanti (sopratutto chi è "bravo ma converte poco" → opportunità di coaching).
- Possono aprire il drill-down della singola creator per vedere chi è il team interno e dove lavorare sui matching.

### Per HR
- A fine mese, **dopo** che il sync CP è completato, aprono l'Action Center
- Scorrono i candidati, per ognuno: scelgono uno dei 3 sostituti suggeriti (o uno alternativo dal dropdown completo) → click HR
- Esportano CSV → comincia il processo di sostituzione/colloquio uscita

### Per il board
- Vista aggregata in **Hub** (`/admin`): KPI live agency mese corrente (sales totali, operatori attivi, creator coperte, ultimo sync)
- Quando si ragiona su decisioni HR/strategiche su un singolo operatore o creator, la pagina drill-down della creator (`/leaderboard/creators/{nome}`) mostra esattamente chi sta facendo cosa e con che rendimento

---

## Come accedere

URL: **hoc-fan-agent.vercel.app**

I vostri account sono già autorizzati come admin (single sign-on Clerk). Se non riuscite ad accedere, scrivetelo a Nicholas.

**Le 3 pagine da bookmarkare:**
1. `/admin` — Hub centrale
2. `/leaderboard/sales-cp` — classifica mensile per operatore
3. `/admin/action-center` — lista operatori da rivedere

**Tutorial interattivo** dello score (con esempi e Q&A AI): `/welcome/score-friendly`

---

## Cosa serve dal board

1. **Validazione metodologia** — la formula 70/30 + soglia 25 default sono calibrate sulla nostra esperienza ma non immutabili. Se dopo i primi due mesi di uso vediamo che vengono fuori troppi/pochi candidati, ricalibriamo insieme.
2. **Decisione su frequenza HR cycle** — proposto: mensile (Action Center → CSV → HR → sostituzioni entro 2 settimane). Conferma o alternativa?
3. **Handover con HR** sul processo CSV. Posso coordinarmi direttamente col team HR o serve discussione collegiale?

---

## Note tecniche per chi vuole il dettaglio

- I sales sono attribuiti esattamente per (operatore × creator) usando i **takes** individuali di CP (non più stima 50/50 dei vecchi mesi)
- Lo score viene ricalibrato ogni mese sui dati reali del periodo (no benchmark hardcoded che invecchiano)
- Tutti i flussi sono audit-loggati: chi ha marcato chi, quando, con che sostituto
- Sync automatico storico disponibile per popolare gli ultimi 24 mesi con un click (`/admin/creatorspro-sync-history`)
