# Sales manager AI — come funziona e come si corregge

Ottobre 2026. Richiesta di Nicholas: "agenti che fanno da sales manager sulla qualità delle chat, si consultano, danno feedback sul profilo e one-to-one all'operatore; l'operatore risponde («oggi provo questo») e il giorno dopo l'assistente gli dà già un riscontro. Deve funzionare davvero". Modello visivo indicato da lui: un "trading floor" di agenti AI (uffici con un compito ciascuno, un ufficio rischi indipendente che blocca, un'incubatrice: niente riceve capitale senza averlo dimostrato).

## Gli uffici (una notte)

| Ufficio | Cosa fa | Chi lo fa |
|---|---|---|
| Dati | Messaggi, turni e vendite del giorno prima (ws_chat dedup, attributed_transactions, cache_members) → un pacchetto per ogni operatore che ha lavorato da solo | codice (`sales-ai/sql.js`, `core.buildPacks`) |
| Smistamento | Chi analizzare (≥3 PPV a mano), entro il tetto di spesa giornaliero | codice (`pipeline.dati`) |
| Analisi | Due manager AI indipendenti: qualità chat (ex top chatter) e dati (diffidente dei campioni piccoli) | AI, batch (`agents.MANAGERS`) |
| Verifica | Ogni citazione dei due report controllata sul pacchetto: trovata / detta dal fan / non trovata | codice (`core.quoteSpeaker`) |
| Consegne | L'arbitro-coach legge tutto, arbitra i disaccordi e scrive il feedback in uno schema fisso; **i numeri li scrive il codice** | AI, batch, output strutturato (`agents.FEEDBACK_SCHEMA`) |
| Garante | Blocca: citazione inventata o del fan, leva non dimostrata, leva senza margine nei dati, consigli vietati (più domande, messaggi più lunghi), confronti coi colleghi, cattive notizie, nomi di altri operatori, percentuali non presenti nei dati | codice (`core.guard`) — indipendente, non si può convincere |
| Direzione | Approva, corregge, scarta. Niente arriva a un operatore senza passare da qui | persone (`/admin/sales-ai`) |
| Valutazione | Il giorno dopo: riscontro sull'impegno preso (metrica della leva, prima e dopo), voti utile/non utile, errori della notte nel registro | codice |

Catena: `/api/cron/dispatch` (03:00 UTC) → `/api/cron/sales-ai`, auto-concatenante (lib/cron-chain); i batch AI costano la metà e non hanno il limite dei 60 secondi. Stato in KV `smai:*` (vedi CLAUDE.md).

## Le leve: cosa si può consigliare

Si consiglia SOLO ciò che è dimostrato sui nostri dati **e non toglie proposte** (`core.LEVERS`). Studio 6 mesi, 257 operatori, confronto con i colleghi sulla stessa creator e fascia oraria: la % di PPV comprati NON predice i soldi del trimestre dopo, il numero di proposte sì.

- **Si consigliano**: lasciare le caption che non vendono per nessuno (resa ≤60% della media della creator, ≥30 invii in 30 giorni); proporre mentre il fan scrive; niente PPV a chi tace da più di un'ora; quando il fan chiede di vedere, proporre.
- **Incubatrice** (mai all'operatore): "aspetta l'8° scambio" (alza la conversione ma può tagliare proposte), "più proposte all'ora" (può stancare i fan). Passano a "si consiglia" solo dopo una prova sui dati.
- Anche i NUMERI mostrati all'operatore sono solo quelli delle leve dimostrate (`OPERATOR_METRICS`): niente "proposte all'ora" né "comprati" (finestra di 72h aperta, e la conversione non è l'abilità).

## Come si scoprono e si correggono gli errori

Ogni errore trovato diventa una regola dell'ufficio che l'ha fatto. Già successi:

1. Accusa falsa a una caption ("io ho iniziato a spogliarmi": 13,6%, nella media) nata da un solo turno → l'arbitro verifica sul mese; nel sistema le caption si giudicano solo con ≥30 invii.
2. Invii di massa attribuiti a chi era in turno (2.031 "heyy amo, che fai?" in 5 ore) → esclusi: stesso testo ≥20 volte in un'ora.
3. Un operatore "Senior" solo perché manda il doppio dei PPV → il ritmo non entra nei livelli finché non si misura l'effetto sui fan.
4. Citazione bloccata per l'etichetta "[PPV $79]" del sistema → `stripTags`; frasi dei fan date per "non trovate" → `quoteSpeaker` dice chi le ha dette.
5. Consiglio non dimostrato infilato nella regola ("prezzo secco, senza chiedere il budget") → l'arbitro può descrivere solo l'azione della leva; il resto va in incubatrice o "per la direzione". Il codice non può riconoscerlo: lo prende la revisione umana.

Strumenti: "ripassa dal Garante" (regole aggiornate su un feedback già scritto, senza spesa AI), test in `tests/sales-ai.mjs`, registro della notte in pagina.

## Come si misura se funziona

Non le visualizzazioni né il gradimento. Per operatore: la metrica della leva su cui si è impegnato, il giorno dopo e nelle settimane, contro chi non ha ancora il feedback (rollout a scaglioni). Poi: voti utile/non utile, e confronto alla cieca con il feedback scritto da Antonio sugli stessi turni (due settimane) prima di aprire agli operatori.

## Confini (non negoziabili)

- È coaching: non entra in score, compensi, livelli o decisioni HR.
- La visibilità agli operatori (`smai:config.operator_visible`) resta spenta finché l'avvocato non dà il via: un'AI che valuta ogni giorno il lavoro di una persona è un sistema ad alto rischio per l'AI Act (Annex III.4) e tocca l'art. 4 dello Statuto dei lavoratori.
- Le cattive notizie (cali, problemi di relazione con i fan) non le dice mai il messaggio automatico: vanno in "per la direzione" e le dice una persona.
- Tetto di spesa giornaliero in configurazione (5 $ concordati il 4/10/2026; misurato ~0,25 $ per operatore a notte con Claude Opus 5 in batch).

## Livelli Junior / Mid / Senior (studio, non ancora in app)

Dallo stesso studio: il livello si calcola su **3 mesi** (un mese da solo è rumore), su **le vendite dei PPV mandati dall'operatore, per ora, rispetto ai colleghi sulla stessa creator e fascia oraria** (correlazione 0,47 col trimestre dopo), con almeno 120 ore, isteresi (due verifiche consecutive per cambiare livello) e decisione di una persona. Proposta da portare nella prossima versione di `docs/CAREER_LADDER.md` insieme al parere dell'avvocato (lì c'è il legame con i compensi).
