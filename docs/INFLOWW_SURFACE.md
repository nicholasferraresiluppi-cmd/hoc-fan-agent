# Infloww — mappa della superficie (studio hands-on, 18 lug 2026)

> Studio commissionato per chiudere il **gate 0a** del benchmark ([BENCHMARK_DEEP_STUDY.md](BENCHMARK_DEEP_STUDY.md)): l'API/UI di Infloww espone i transcript delle chat per singolo chatter? Da questo dipende la forma della "gamba qualità" dello Score (voce #1 del backlog).
> Metodo: navigazione diretta dell'app desktop Infloww (v5.7.14, account Nicholas, agency OID 763338095263807, **sola lettura**) + crawl completo dell'help center (help.infloww.com, 9 collezioni, ~114 articoli) + changelog (news.infloww.com) + ispezione del bundle app e probe degli host API. Nessuna modifica fatta in Infloww.

## TL;DR — risposta al gate 0a

**Sì, i transcript delle chat sono accessibili per singolo chatter.** Due superfici, entrambe verificate a mano:

1. **Message Dashboard** (Analytics → Message dashboard): ogni messaggio diretto inviato da ciascun *employee* ai fan, filtrabile per **sender (chatter)**, creator, fan, data, prezzo, stato acquisto, stato invio. Include i **messaggi ritirati/cancellati**. Esportabile (CSV via email, max 100 sender, range max 1 mese, link valido 30 giorni). Storico 1 anno, refresh ogni 10 min. **Limite: solo messaggi inviati tramite Infloww** (i messaggi scritti nativamente su OnlyFans non compaiono), e mostra i messaggi *dell'employee*, non il dialogo completo come export.
2. **Thread completo in-app** (click su un messaggio → si apre in Messages Pro): il dialogo intero fan↔chatter con PPV, prezzi, paid/unpaid, timestamp, nome del chatter mittente, e un pannello **Fan insights** laterale (spending behavior, PPV/tip totali, highest spend, **spending power** a 5 tier, **chargeback risk** High/Med/Low, subscription). Questo è il transcript vero, ma è una vista, non un export strutturato.

**C'è un'API ufficiale — e la risposta sui transcript è definitiva.** Pagina "API keys" (solo OnlyFans, max 3 chiavi, IP whitelist, scadenza, "API reference" esterna = doc Stoplight, già mappata dal nostro client `src/lib/infloww-api.js` beta v1.2). **Abbiamo già una chiave registrata**: `INFLOWW_API_KEY Nicholas` (creata 8 lug 2026, scade 4 gen 2027, IP unrestricted). Base API: `openapi.infloww.com`, auth = key grezza + `x-oid`. Il disclaimer in pagina: *"API keys should be for internal use only and not shared with third-party vendors"* → **HOC Pro che ingerisce con la nostra chiave = uso interno, conforme**.

Endpoint disponibili (mappa v1.2 + probe del 18 lug): `/v1/employees`, `/v1/creators`, `/v1/employees/assigned-creators`, `/v1/transactions` (revenue fan-level in centesimi — substrato pronto per la trasparenza comp), `/v1/refunds`, `/v1/automated-messages`, `/v1/priority-mass-messages`, `/v1/links`, `/v1/linkfans`. **Nessun endpoint messaggi/chat/transcript**: probe read-only su `/v1/messages`, `/v1/direct-messages`, `/v1/chats`, `/v1/conversations`, `/v1/employee-messages` → tutti **404 a livello di routing** (indipendente dall'auth). Nemmeno i KPI chat 1:1 per operatore sono esposti (restano dal CSV dashboard).

**Conseguenza per la gamba qualità (voce #1 del backlog):** i transcript per-chatter si prendono **dall'export del Message Dashboard** (CSV via email, per-chatter, include messaggi ritirati), non dall'API. L'API resta preziosa per anagrafica, assegnazioni e transazioni fan-level. Il gate 0a è **chiuso**: dati disponibili, canale definito (export), niente ignoti residui sui docs.

~~⚠️ **Azione per Nicholas (2 minuti):** la variabile `INFLOWW_API_KEY` in `.env.local` contiene un placeholder…~~ → **risolto il 19 lug**: chiave reale attiva in `.env.local` + env Vercel, API operativa (42 creator, probe 200). Vedi sezione "Aggiornamento 19 lug" in fondo.

## Correzione importante a una gap del benchmark

La critica di completezza (gap #1) assumeva che la career ladder gate-i le promozioni su **uno "score Infloww 0-100" fuori dal nostro controllo**. **Falso, verificato a mano:** Infloww **non ha alcuno score composito del singolo chatter**. La sua "Infloww Leaderboard" classifica le **agenzie**, non gli operatori (HOC è #19 globale, $1.82M a giugno 2026, per net earnings). La valutazione dei chatter in Infloww resta **KPI grezzi** (Employee Reports).

Quindi lo "score Infloww" della ladder è **uno score che calcoliamo NOI** (`leaderboard-calc.js`) dai KPI grezzi di Infloww — non una formula di terzi. Questo **riduce** il rischio della gap #1: il drift della *formula* è codice nostro, già versionato. Quello che resta fuori dal nostro controllo e va monitorato: **le definizioni dei KPI e le regole di attribuzione dentro Infloww** (che però Infloww stessa versiona — vedi sotto "Settings history").

## Superficie completa (per sbloccare altri pensieri)

### Regole di attribuzione vendite — configurabili e versionate (upstream del nostro score)
Settings → Sales Settings. Ogni tipo di ricavo ha una regola scelta dall'org:
- **Messaggi**: *shift schedule* (un chatter per turno) / *message sender* / *converters* (ultimo chatter che ha scritto prima del pagamento). Oggi HOC: "attribuito al message sender".
- **Tips da messaggi**: attribuito all'ultimo chatter che ha scritto al fan entro **4h 0min** dal tip (finestra configurabile).
- Post/tips: shift o converter. **Subscription, streams, referrals: solo shift-based.**
- Toggle "multiple employees per shift" (attivo). Esclusioni: welcome messages, OF service fee 20%, refunds.
- **C'è una "Settings history"** = Infloww versiona le regole di attribuzione (ultimo cambio 18 ott 2025). **Implicazione HOC:** le nostre assunzioni di attribuzione in `creator-aggregates.js` devono combaciare con questa config; un cambio qui muove i nostri numeri a monte. Vale la pena snapshottare la config di attribuzione a ogni import (estensione naturale del gate 0b).

### Employee Reports 2.0 + Sales Records — più ricchi del CSV KPI che ingeriamo oggi
- **Employee Reports** (~24 KPI): Sales, PPV Sales, Tips, Direct Message Sales/Sent, Direct PPVs Sent, **Golden Ratio** (PPV÷DM, ottimale 5-10%), PPVs Unlocked, **Unlock Rate**, Priority/OF MM Sales, Fans Chatted, Fans Who Spent, **Fan CVR**, Avg Earnings/Fan, Character Count, Response Time (scheduled + clocked), Scheduled/Clocked Hours, **Sales/Hour**, Messages/Hour, Fans Chatted/Hour. 4 viste (per employee / per giorno / per creator / creator×giorno). Stati vendita: Pending (hold 7gg OF) / Complete / Reverse (chargeback). Export per employee o employee×creator.
- **Sales Records** (gen 2026): ledger transazione-per-transazione con **riassegnazione manuale/bulk** delle vendite tra chatter, filtro unassigned, campi di audit (regola applicata, chi ha riassegnato). **Questo è oro per la trasparenza comp (voce #5 backlog): line-level + evidenza di dispute già pronta.**
- **Golden Ratio** e **Unlock Rate** hanno già bande di benchmark native (5-10% golden ratio ottimale) — allineano il nostro "cosa è buono".

### Time tracking — ground truth dei turni
Clock in/out dalla barra, **auto clock-out dopo 2 min di inattività**, dashboard "chi è clocked in", export Clocked Hours (XLSX: gruppo, employee, ore, in/out UTC+0). **È il dato reale "turno lavorato"** per: streak shift-aware (voce #9 backlog), `MIN_SHIFTS_RELIABLE`, response time su ore reali vs schedulate.

### Altre superfici rilevanti
- **Ruoli**: 38 ruoli custom con visibilità dati a 3 tier (self / self+subordinati per org chart / all) — rispecchia i nostri scope RBAC own/team/all.
- **Sensitive Words**: blocca (non avvisa) parole in post/messaggi/script/mass; lista base Infloww + custom, import Excel, **export lista per audit**. Validazione script contro sensitive words (mar 2026). Nessun dashboard di violazioni.
- **Message withdrawal alerts**: Owner/Admin avvisati quando un employee **cancella** un messaggio → segnale di compliance nativo consumabile.
- **AI Copilot [beta]** ($0.01/credito, 4 modi: Casual/Re-engage/Tip request/Sexting, AI Personas per creator) + **AI Chatbot reports** (engagement rate, VIP conversion). Infloww sta entrando nello spazio AI-chatter — conferma in-product del segnale "meno chatter" emerso dalla ricerca di mercato.
- **Fan Insights**: spending power (5 tier), chargeback risk — score lato-fan già pronti.
- **Nessun prodotto fintech/pagamenti** oltre al Wallet dei referral. **Nessun export schedulato/ricorrente e nessun webhook documentato** — tutti gli export sono manuali UI-triggered (l'API è l'unica via programmatica).

## Cosa resta non verificato
- ~~**Schema colonne esatto** dell'export Message Dashboard~~ → **CHIUSO il 24 lug 2026 col primo export reale** (vedi sezione dedicata sotto).
- **Schema colonne** Employee Reports (non ancora esportato).
- **Finestra di lookback** dell'attribuzione "converter" (non specificata nei docs).
- Esistenza di un'API partner privata dietro le integrazioni "ufficiali" MYM/Fanvue (nulla di pubblico).
- ~~Endpoint messaggi/transcript nell'API ufficiale~~ → **risolto il 18 lug** (vedi TL;DR): non esistono, 404 a livello routing; fonte transcript = export Message Dashboard.

## Aggiornamento 19 lug 2026 — chiave attiva, schema transazioni/refund verificato LIVE

Probe read-only con la chiave reale (42 creator connesse). Fatti nuovi rispetto al 18 lug:

- **Record `/v1/transactions`** (più ricco dei commenti storici del client): `id`, **`transactionId` (uuid 32-hex STABILE)**, `fanId`, `fanName`, `createdTime` (ms string), `type` (Messages/Subscription/Tips/…), `tipSource`, `status` (`loading` = pending, `complete`, `reverse`), `amount`/`fee`/`net` (centesimi string), `currency`. **Nessun campo employee/chatter** → l'attribuzione operatore↔transazione non vive nel payload (coerente con l'assenza del param `employeeId` sulla query): resta inferita dai turni CP.
- **Record `/v1/refunds`**: `id`, **`transactionId` = quello della vendita originale → join ESATTO refund↔transazione**, `fanId`, `paymentTime`, `refundTime`, `paymentStatus` (`undo`), `paymentAmount` (**CENTESIMI** — la doc mostrava decimali, i dati reali sono cent interi), `transactionType` (es. `subscribes`).
- **Storico interrogabile ≥ 12 mesi** sulle creator storiche (Ottorini, Fishball: dati presenti a −360gg); vuoto oltre solo per le creator connesse di recente → backfill annuale fattibile.
- **Conseguenza per la trasparenza comp (costruita in questa data):** il `transactionId` stabile rende persistibile e dedupabile un ledger fan-level per periodo (`src/lib/payout-ledger.js`, KV `infloww:txns:*`), con refund agganciati in modo autoritativo — mentre il lato take CP resta senza uuid, quindi il match take↔transazione è euristico (finestra turno + importo lordo, `src/lib/payout-match.js`).

## Aggiornamento 24 lug 2026 — export Message Dashboard: schema reale + match warehouse VALIDATO

Primo export reale del **Message Dashboard** ingerito (`.xlsx`, foglio "Message Dashboard", ~500k righe/mese org). Chiude l'ignoto storico sullo schema colonne.

**Schema (12 colonne, per-messaggio, lato operatore):**
`Sender` (operatore umano) · `Creator` (nome creator, formato Infloww es. "Gaja ITA" ≠ warehouse "Gaja Bertolin - IT") · `Fans Message` (spesso vuoto: è la vista dei messaggi inviati) · `Creator Message` (testo, HTML `<p>…</p>`) · `Sent time` (`HH:MM:SS`) · `Sent date` (`Jul 24, 2026`) · `Replay time` · `Price` (PPV) · `Purchased` (yes/no) · `Source` (`Employee`/mass/automated) · `Status` (`Sent`) · `Sent to` (`username (uNNNNN)` → **user_id del fan**).

**Perché è oro:** `Sender` porta **l'operatore umano** che il warehouse NON ha (là `sender_id` = account creator). Risolve l'attribuzione nei turni in DUO — il buco di copertura di `operator-signals.js` (solo turni singoli).

**Match export↔warehouse VALIDATO su dati reali (40 messaggi campione, 21 lug):**
- **36/40 abbinati** per `user_id` (da `Sent to`) + testo normalizzato; i 4 mancati ai bordi finestra/normalizzazione.
- **Prezzo PPV coincide 36/36.**
- **Fuso: offset COSTANTE +1h** (export UTC+1, warehouse UTC) — mediana esatta −3600s → si allinea con un offset, non è un problema.

**Cross-validazione segnali (Infloww vs warehouse, 119 operatori in entrambe le fonti):**
- **tasso domande: corr 0.78** (errore medio 7 punti%); **prezzo PPV: corr 0.63**.
- Il non-1.0 è ATTESO: misurano insiemi di messaggi diversi (Infloww = tutti i turni, warehouse = solo singoli). Chi diverge (es. 24% vs 44%) è chi si comporta diversamente in duo → è proprio il valore aggiunto della copertura Infloww.

**Engine:** `src/lib/infloww-signals.js` (`computeInflowwOperatorSignals`) calcola per-operatore i segnali COUNT-based affidabili da questo export: **tasso domande, prezzo medio PPV, quota PPV**. NB: la **cadenza-per-ora NON è derivabile** da questo export (mancano le ore lavorate → serve Clocked Hours o le finestre turno del warehouse). Unit-testato.

**Prossimo (non costruito):** superficie di upload self-serve (per export scoped per-operatore, upload-friendly) + ingest batch del file pieno; il match al warehouse per agganciare revenue/conversazione intera. Vincolo: 48MB/500k righe → parsing lato-batch o export scoped, non drag&drop di 48MB nel browser.
