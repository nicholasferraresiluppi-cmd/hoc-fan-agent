# HOC Creator Revenue OS — Blueprint board-ready

## North-star (rivisto, onesto)

Un **sistema a ciclo chiuso orchestrato verso l'operatore**: trasforma i segnali comportamentali già leggibili nel warehouse in **una azione prescritta al chatter giusto, consegnata dentro il suo flusso di lavoro**, e ne cattura l'esito **in automatico** per misurare il lift e comporre memoria istituzionale. Non è "l'ennesima dashboard": HOC Pro **ha già lo scheletro del loop** — lo chiudiamo, non lo reinventiamo.

Cambio di rotta rispetto alla bozza, dopo le due critiche (chatter + CTO/Data), entrambe convergenti: **non partiamo dall'identity spine** (un trimestre di plumbing invisibile che nessun operatore "sente"). Partiamo da **una fetta verticale sottile che prova l'adozione** — perché tutto il moat dichiarato è condizionale a un'adozione che nessuno ha ancora validato.

---

## Punto di partenza reale: cosa HOC Pro ha GIÀ (non ripartire da zero)

Verificato nel codice, non assunto:

- **CI Tier-1 in produzione** — `src/lib/conversation-intelligence-sql.js` legge `house-of-creators-358213.hoc.ws_chat` **metadata-only** (6 colonne scalari, zero testo) e calcola già i segnali leading che la bozza metteva in Fase 1: `response_rate`, `frt_p50/p90_sec`, `pct_within_5min`/`15min`, `unanswered_openers`, `chatter_to_fan_ratio`, `turn_switches`, broadcast detection. Grana creator×giorno, cache KV 6h. **Il signal layer esiste già.**
- **La Fan Priority Queue è a una query di distanza**: il file contiene già, documentato, il drill per-conversazione (`GROUP BY creator_id, user_id`, `HAVING COUNTIF(is_eval_opener) >= 3`, `ORDER BY unanswered_openers DESC, frt_p90_sec DESC`) — con il min-N già pensato contro il rumore.
- **`golden-examples.js`** — 65 chat reali play→outcome, già anonimizzate. È **il seme del vero moat** (libreria del "cosa mandare").
- **`closed-loop-metrics.js`** — già calcola `coachingEffectiveness` e `swapSuccessRate` (proto-loop, before/after).
- **`ops-alerts.js`** — motore issue-tracker stateful (fingerprint, open→ack→resolved, auto-resolve): la spina del futuro Intervention Ledger, non da costruire ex-novo.
- **`payout-match.js`** — attribuzione per finestra-turno con confidenza esplicita (exact/ambiguous/unmatched): il pattern per l'asse operatore.
- **`bigquery-api.js`** — connettore SA read-only con `maximumBytesBilled` (cap 2 GiB default), billing sul progetto di Nicholas.
- **Coaching Center, Action Center, QA rubrica versionata, RBAC, roster Infloww** — la superficie d'atterraggio dell'azione esiste.

**Implicazione**: il "Revenue OS" è per l'80% **wiring e adozione** di asset esistenti, non green-field. Questo è ciò che lo rende credibile a un board di 5-10 persone.

---

## Gli strati (architettura)

Rispetto alla bozza aggiungo **due strati che le critiche hanno giustamente segnalato come assenti** (semantic layer, data-platform) e **declasso** l'identity spine.

**L0 — Warehouse read-only (BigQuery, esistente).** Fonte grezza. Mai scrittura, mai query per-click. Il connettore c'è.

**L-sem — Semantic / Metrics Layer OWNED (NUOVO, critica CTO).** Il valore di Mattia/Luca **non è l'SQL, è la logica di business**: cos'è un whale, come si definisce ARPPU, quale txn è "attribuita". Andare sul grezzo senza questo layer **ri-deriva male** e crea una 4ª verità divergente. Costruiamo **un dizionario di metriche condiviso e versionato** (stessa disciplina degli snapshot formula-score già in KV) che i 4 tool dovrebbero citare. È il vero antidoto al single-point-of-failure, non il "possesso del grezzo".

**L-plat — Data-Platform / ELT warehouse-side (NUOVO, critica CTO).** 2,9 mld righe / 4,7 TB **non girano** come marts incrementali su Vercel Hobby + 1 cron + KV (il dispatcher-hack nel decision log esiste proprio per quel limite). Le aggregazioni pesanti vivono **warehouse-side** (scheduled query BigQuery / Dataform, merge incrementale, dedup — il pattern `QUALIFY ROW_NUMBER` è già nel CI SQL). HOC Pro **legge marts pre-aggregati piccoli** e li cachea in KV. Ogni metrica porta **sorgente + freschezza + costo-scan**.

**L1 — Fan Journey Spine + Identity Resolution (DECLASSATO a enabler, non Fase-1).** La cucitura cross-source contenuto→click→sub→chat→txn→retention resta l'obiettivo, ma è **gated su un GO/NO-GO a costo-zero sull'id-space** (vedi guardrail). Fase 1 usa **un solo join pulito su una sola sorgente** (`hoc.ws_chat`), zero risoluzione cross-source.

**L2 — Signal layer (leading, metadata-only) — GIÀ VIVO.** Estendiamo CI Tier-1 con: **silent-attrition** del fan (cadenza vs baseline del fan, non z-score cieco), **new-sub non contattato**, **speed-to-first-message**. Con **percorso hot** (refresh corto/near-real-time per i segnali "ora") distinto dai marts giornalieri — la critica chatter è corretta: un whale che scrive 20 min fa non aspetta un batch delle 3 di notte.

**L3 — Orchestration: Next-Best-Action + Intervention Ledger.** `ops:alerts` esteso in `ops:interv:*` (proposto→assegnato→**agito/misurato in automatico**→appreso). Ogni riga porta **CHI + PERCHÉ leggibile + COSA mandare** (play da `golden-examples`), consegnata **dentro il flusso** con deep-link 1-click alla conversazione Infloww esatta. Rate-limited (tetto duro, vedi guardrail).

**L4 — Measurement & Learning (RIDIMENSIONATO).** Lift misurato **a livello org, al massimo per-creator — MAI per cella operatore×creator** (con `MIN_SHIFTS_RELIABLE=3` la potenza è nulla: DiD segmentato è "la forma della scienza senza i dati"). Holdout **su coorti-fan dentro un creator**, brevi e a rotazione — **mai** su coaching/reddito delle persone (tossico e "gamed" in 5-10 persone). Il "Learning Loop" auto-promuovente **è tagliato**: a questa scala **un umano cura** la libreria play→esito; `golden-examples` è già quella libreria.

**Governance plane (cablato day-1, ma UNA lente sola).** Solo **Lente 1**: dati fan **fuori dallo score CP**, come **invariante testato** nella pipeline (già la policy). La **Lente 2** (fan-wellbeing/harm che blocca interventi) è **rimandata**: scope creep verso fan-safety-scoring che nessuno ha chiesto e nuova liability. **Shadow-gate**: ogni segnale logga senza CTA finché non prova precision + lift ≥ soglia.

---

## Le superfici (da 5 a 3 — le critiche hanno ragione: 5 dashboard per 5-10 utenti diluiscono lo scopo)

| Superficie | Utente | L'unica cosa |
|---|---|---|
| **Fan Priority Queue (in-flow)** | Chatter in turno | Quale fan ORA + **cosa mandargli** (play concreto), max ~5 righe/turno alta-precisione, **deep-link 1-click** alla conversazione Infloww, fan **identificabile** (non pseudonimo). Advisory, non un inbox. |
| **Account-health cockpit** | CM / team_lead | Salute del book per creator: whale che si raffredda + nuovi sub non contattati in cima, SLA primo-contatto, save-play. Estende il CM Cockpit esistente. |
| **Lift & Learning console (minimal)** | Board / ops lead | L'Intervention Ledger storico + il **primo numero di lift onesto** (org/creator-level) + stato degli shadow-gate. Una sola view, con **tab governance** (prova auditabile Lente-1). |

**Tagliate dalla bozza**: Growth board (Luca) e Governance plane come prodotti a sé → sono viste di **sola visione per il board**, esattamente il male da combattere. La crescita (ROAS/Content Alpha/pLTV) diventa **orizzonte Fase 3 etichettato come visione**, non roadmap.

---

## Entità canoniche (con gate)

- **`canonical_fan_id`** — spina cross-source. **Join #1 make-or-break: si valida PRIMA di costruire** (gate sotto). `attributed_transactions` ↔ `ws_messages.sender_id` (lato-fan) ↔ `links_subscriptions`/`organic_subscriptions` ↔ `public_users.id` ↔ `users_research`. OF user_id ≠ postgres id ≠ infloww id: provenance + versioning obbligatori.
- **`operator_id`** — **SOLO** da `infloww.employee_sales_reports` (rail accounting-grade, ~70K righe, **oggi non ancora wired in `src/`** — è il denominatore mancante del lift) **o** finestra-turno direzionale (`payout-match`). **MAI** da `ws_chat.sender_id` lato-creator: è l'ACCOUNT, non l'umano (il CI SQL lo documenta esplicitamente).
- **`creator_id`** — mapping CP↔Infloww **già esistente** (`creator-match.js`). Non reinventare.
- **`intervention_id`** — spina del ledger: ↔ target (operator | fan-cohort) ↔ assignment (treatment|holdout) ↔ finestra pre/post ↔ **esito catturato in automatico**.
- **`link_id` / `content_asset_id`** — stitch click→sub e contenuto→click. **Direzionali, confidence-tagged, Fase 2+.**

---

## Roadmap a fasi (ancorata alle tabelle reali)

### Fase 0 — DISCOVERY + ADOPTION SLICE (settimane, non trimestri) — *questo è il "now"*
1. **GO/NO-GO id-space** (costo ~zero): query su `INFORMATION_SCHEMA` + campione per misurare il match-rate fan cross-source (`attributed_transactions` ↔ `ws_messages` ↔ `public_users`). **Soglia decisionale esplicita: <70% → le Fasi 2-3 si RIPENSANO, non si colorano di "confidence".** Ogni metrica a valle eredita questo errore.
2. **Fetta verticale su UN creator** (la convergenza delle due critiche): la Priority Queue v0 = drill per-conversazione **già documentato nel CI SQL** su `hoc.ws_chat` (una sorgente, nessun identity join), segnale = *whale che si raffredda / nuovo sub non contattato*, **azione concreta** da `golden-examples`, **deep-link Infloww**, **cattura automatica** dell'esito dal `ws_chat` stream (è uscito il messaggio? convertito a 72h?), su **1-2 operatori pilota veri**.
   - Domanda make-or-break: *un chatter cambia comportamento in turno per una coda prescrittiva?* Se no → il resto è teatro costoso. Se sì → prima prova di ROI + primo dato azione→esito che alimenta il moat.

### Fase 1 — NOW (dopo il gate + pilota positivo)
- **Rail vendite per-operatore** da `infloww.employee_sales_reports(_with_benchmarks)` — il **denominatore senza cui "lift" non esiste**; cross-check contro `payout-match` e take CP.
- **Speed-to-first-message SLA → worklist QA/Coaching → lift org-level** (`hoc.ws_chat` + Coaching/Action Center esistenti). Basso costo/alto lift noto (analogo diretto alla *lead-response-time / "regola dei 5 minuti"* B2B). **Primo numero di lift onesto** che giustifica o UCCIDE il resto.
- **Intervention Ledger** (`ops:interv:*`, estende `ops:alerts`) + **cattura automatica** + Governance Lente-1 invariante testato.
- **Percorso hot** near-real-time per i segnali "ora" (distinto dai marts giornalieri).

### Fase 2 — NEXT (gated su match-rate ≥ soglia MISURATA in Fase 0)
- **Fan Journey Spine + Identity Resolution** confidence-tagged (`biolinks_events/union`, `links_subscriptions`, `organic_subscriptions`, `attributed_transactions`, `public_users`, `users_research`).
- **Uplift org/creator-level** (before/after + holdout su coorti-fan, metodi bayesiani per la bassa potenza — onesti sul fatto che sotto il creator-level **non si misura**).
- **LTV per canale + ROAS reale** (`meta_ads.datasource`, `links_stats`, `public_funnels_daily_stats`).

### Fase 3 — HORIZON (VISIONE, non roadmap finanziata)
- Content Alpha, pLTV-prior al primo contatto, whale-source detection, NBA per conversazione (LLM sul testo). **Dipendono dallo spine a piena fedeltà + orizzonti LTV lunghi.** Fan-data informa il **routing**, MAI lo score.

---

## Il moat (riscritto — le critiche demoliscono 4 dei 5 pilastri della bozza)

**NON è**: la dashboard (commodity), il **possesso del grezzo** (misframing: ri-derivi male la logica di Mattia/Luca), il **lift per-cella** (morto a n=3), la governance (costo, non prodotto che i clienti comprano), l'**identity graph** (chiunque con gli stessi dati lo ricostruisce).

**È l'unica cosa che la bozza trattava come dettaglio**: il **dataset proprietario azione→esito legato al CONTENUTO della conversazione, catturato in automatico** — quale play/PPV/prezzo è stato mandato a quale stato-fan, e cosa ha convertito a 72h — per gli operatori e creator **specifici** di HOC. `golden-examples.js` (65 chat reali) ne è già il seme; l'Intervention Ledger lo fa comporre nel tempo. Un concorrente da zero non può comprarlo. **Ma è moat SOLO SE gli operatori usano davvero la coda e l'esito si cattura da solo** — per questo la Fase 0 (adozione) precede tutto. Secondario ma reale: il **semantic layer owned** (definizioni condivise) e l'indipendenza dalla vista derivata di Mattia/Luca. Il fossato durevole di HOC resta comunque **fuori dal software** (roster creator + talento operatori + score CP in produzione): questo OS li **amplifica**, non li sostituisce.

---

## Guardrail (cablati, non retrofit)

1. **Consegna DENTRO il flusso** — deep-link 1-click alla conversazione Infloww esatta. Senza, adozione = 0 (uccide 4 superfici su 5).
2. **Budget di precisione** — tetto duro max ~5 righe/turno, solo alta precisione; shadow-gate prima di ogni CTA. Al 3° falso "urgente" l'operatore smette di guardare per sempre.
3. **Il COSA, non solo il CHI** — ogni riga porta un play concreto da `golden-examples`, altrimenti è mezzo tool.
4. **Cattura automatica** — azione ed esito rilevati dal message stream (`ws_chat`), mai logging manuale sotto pressione.
5. **Allineamento con la commissione** — la coda deve premiare chi la segue (non chiederle di "coccolare un whale lento" contro la busta paga); nessun holdout che tolga vendite a chi è pagato a performance.
6. **Fan identificabile all'operatore** — pseudonimizzazione solo per le viste board/aggregate, mai nella coda operativa.
7. **Ownership / claim del fan** — meccanismo di presa in carico per coselling/handoff/turni sovrapposti, o si creano doppioni.
8. **Onestà statistica** — lift dichiarabile solo a org/creator-level; per-cella operatore×creator è vietato promettere.
9. **Privacy Lente-1 come invariante testato** (dati fan fuori dallo score CP); Lente-2 rimandata.
10. **Budget BigQuery esplicito** — costo ricorrente di refresh stimato e attribuito (billing project = Nicholas); ELT warehouse-side, non marts su Hobby.

---

## Mappatura cross-settore (metodo frontier, dichiarata)

| Pattern maturo | Settore gemello | Traduzione HOC |
|---|---|---|
| Lead-response-time / "regola dei 5 minuti" | Vendite B2B (inbound SDR) | Speed-to-first-message sui nuovi sub → SLA + coaching |
| VIP-host portfolio + churn silenzioso + next-best-action | iGaming (Optimove, Fast Track) | Whale che si raffredda → nudge all'operatore, mai al fan |
| Talk-ratio, monologhi, coaching dai transcript | Conversation intelligence (Gong) | CI Tier-1 già vivo (metadata-only) → worklist QA |
| Issue-tracker stateful (fingerprint, auto-resolve) | Observability (Sentry/Datadog) | `ops:alerts` → Intervention Ledger |
| Uplift vs holdout, non before/after | CRM/martech, F2P LiveOps | Lift org-level su coorti-fan, mai su persone |
| Semantic/metrics layer condiviso | Analytics engineering (dbt) | L-sem: definizioni owned vs 4ª verità |