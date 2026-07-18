# Infloww — mappa della superficie (studio hands-on, 18 lug 2026)

> Studio commissionato per chiudere il **gate 0a** del benchmark ([BENCHMARK_DEEP_STUDY.md](BENCHMARK_DEEP_STUDY.md)): l'API/UI di Infloww espone i transcript delle chat per singolo chatter? Da questo dipende la forma della "gamba qualità" dello Score (voce #1 del backlog).
> Metodo: navigazione diretta dell'app desktop Infloww (v5.7.14, account Nicholas, agency OID 763338095263807, **sola lettura**) + crawl completo dell'help center (help.infloww.com, 9 collezioni, ~114 articoli) + changelog (news.infloww.com) + ispezione del bundle app e probe degli host API. Nessuna modifica fatta in Infloww.

## TL;DR — risposta al gate 0a

**Sì, i transcript delle chat sono accessibili per singolo chatter.** Due superfici, entrambe verificate a mano:

1. **Message Dashboard** (Analytics → Message dashboard): ogni messaggio diretto inviato da ciascun *employee* ai fan, filtrabile per **sender (chatter)**, creator, fan, data, prezzo, stato acquisto, stato invio. Include i **messaggi ritirati/cancellati**. Esportabile (CSV via email, max 100 sender, range max 1 mese, link valido 30 giorni). Storico 1 anno, refresh ogni 10 min. **Limite: solo messaggi inviati tramite Infloww** (i messaggi scritti nativamente su OnlyFans non compaiono), e mostra i messaggi *dell'employee*, non il dialogo completo come export.
2. **Thread completo in-app** (click su un messaggio → si apre in Messages Pro): il dialogo intero fan↔chatter con PPV, prezzi, paid/unpaid, timestamp, nome del chatter mittente, e un pannello **Fan insights** laterale (spending behavior, PPV/tip totali, highest spend, **spending power** a 5 tier, **chargeback risk** High/Med/Low, subscription). Questo è il transcript vero, ma è una vista, non un export strutturato.

**C'è un'API ufficiale.** Pagina "API keys" (solo OnlyFans, max 3 chiavi, IP whitelist, scadenza, "API reference" esterna). **Abbiamo già una chiave**: `INFLOWW_API_KEY Nicholas` (creata 8 lug 2026, scade 4 gen 2027, IP unrestricted). Host: `api2.inflowwapi.com` (live, dietro Cloudflare, auth-gated — 403 a tutto senza chiave). Il disclaimer in pagina: *"API keys should be for internal use only and not shared with third-party vendors"* → **HOC Pro che ingerisce con la nostra chiave = uso interno, conforme**.

**Conseguenza per la gamba qualità (voce #1 del backlog):** non cambia forma per mancanza di dati. I transcript per-chatter esistono e sono raggiungibili **già oggi via export** (CSV Message Dashboard) e — quasi certamente — via API ufficiale. L'unico sotto-item aperto: confermare sulla **API reference** (docs esterne, aperte dal pulsante in app) se esistono endpoint messaggi/transcript, così da preferire l'ingest API al parsing CSV. Il gate 0a passa da "bloccante/ignoto" a **"sbloccato: dati disponibili, canale API da confermare sui docs"**.

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
- **Endpoint messaggi/transcript nell'API ufficiale**: la "API reference" si apre in browser esterno (fuori dal browser controllabile in sessione); host `api2.inflowwapi.com` auth-gated. Non ho fatto probe autenticati (fuori scope). Da confermare aprendo i docs con la chiave che già abbiamo.
- **Schema colonne esatto** degli export Message Dashboard / Employee Reports (non enumerato nei docs, tranne Clocked Hours XLSX).
- **Finestra di lookback** dell'attribuzione "converter" (non specificata nei docs).
- Esistenza di un'API partner privata dietro le integrazioni "ufficiali" MYM/Fanvue (nulla di pubblico).
