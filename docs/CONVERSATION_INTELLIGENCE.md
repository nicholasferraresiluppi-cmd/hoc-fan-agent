## HOC Pro · Conversation Intelligence · Spec Tier-1 (metadata-only) — versione corretta

### 0. Cosa produce
Una riga per `creator_id × giorno operativo (Europe/Rome)`, ultimi 7 giorni, con segnali strutturali di qualità conversazione ricavati **solo dai metadati** (id, timestamp, chi-invia-a-chi). Nessuna lettura di `body`/`user_data`. Grana massima raggiungibile da `ws_chat` da solo = **creator × conversazione(fan)**; l'attribuzione al **singolo operatore** è fuori scope e si fa a valle in HOC Pro col join sul turno (pattern `payout-match.js`).

### 1. Fix incorporati rispetto alla bozza (blocker + major + minor rilevanti)

**BLOCKER — contratto di costo su partizione non verificata.** Il guard `commit_timestamp >= now - 9 DAY` è ora **sempre attivo** (non più commentato) accanto al filtro `created_at`. È correttezza-safe perché `commit_timestamp >= created_at` sempre: una riga con `created_at` negli ultimi 8 giorni non può avere `commit_timestamp` sotto `now-9d`, quindi lo slack non esclude mai. Così la potatura funziona **qualunque** sia la colonna-partizione. In testa alla query resta la verifica gratuita `INFORMATION_SCHEMA` da eseguire una volta + la lettura di "This query will process X".

**MAJOR — broadcast guard fragile all'uguaglianza esatta di timestamp.** Rimosso `COUNT(*) OVER (… , created_at)`. Ora il broadcast si rileva su **finestra al secondo** (`TIMESTAMP_TRUNC(created_at, SECOND)`) e conta **destinatari DISTINTI** (`COUNT(DISTINCT user_id)` emulato via `SUM(IF(rn_user_in_bucket=1,1,0)) OVER (bucket)`, perché `COUNT(DISTINCT) OVER` è illegale in BigQuery). Soglia `broadcast_min_recip = 5` (knob). Conseguenze: il double-texting allo stesso fan resta `distinct=1` (personale, non broadcast); due risposte personali a due fan diversi nello stesso secondo non vengono più collassate a "unanswered". "È un broadcast" e "è una reply" sono ora due concetti separati.

**MAJOR — left-censoring che gonfiava `fan_openers` sul giorno più vecchio.** Lo scan è a **8 giorni** (1 di warm-up), l'output a **7**: le window (`LAG`/`next_reply`/turn) vedono contesto reale prima del primo giorno riportato, e il giorno di warm-up viene scartato con `WHERE day >= DATE(report_start_ts,'Europe/Rome')`. Residuo: conversazioni dormienti da >1 giorno al bordo restano marginalmente censurate (vedi open questions).

**MAJOR — definizione asimmetrica del "lato-creator".** Reply-detection e talk-ratio ora usano **la stessa** unità: `is_personal_reply = is_creatorside (sender_id <> user_id, la definizione del brief) AND NOT broadcast`. I co-seller/relay non-broadcast (`is_other_side`, che è un sottoinsieme di `is_creatorside`) sono **inclusi in entrambi** numeratore e denominatore. `is_account` (sender_id = creator_id) è retrocesso a puro segnale DQ. `other_side_msgs` è esposto come **gate DQ**: se non è ~0, i sender non-account vanno classificati (system vs co-seller umano) prima di fidarsi delle metriche — ed eventualmente sottratti con una allow-list di sender di sistema (future work).

**MAJOR — i broadcast gonfiavano volume e talk-ratio.** Volume e talk-ratio sono ora calcolati sulla variante **personale** (`creatorside_personal_msgs`), e `broadcast_msgs` è esposto a parte. Talk-ratio ha base conversazionale `fan + personal` (esclude broadcast e rumore), da leggere **in banda**.

**MINOR incorporati:** (a) `is_partial_day` segnala l'ultimo giorno con metriche opener provvisorie; `fan_openers` è sempre esposto accanto ai ratio. (b) `frt_zero_replies` espone le risposte "istantanee" (frt=0) da tie di timestamp / precisione al secondo. (c) Orizzonte SLA dichiarato **una volta** (`sla_cap_seconds`) e referenziato ovunque → l'invariante `answered+unanswered = fan_openers` non si rompe editando. (d) `AND creator_id IS NOT NULL` esplicito. (e) drill per-conversazione documentato come gated. La doppia `APPROX_QUANTILES` è lasciata (leggibilità; costo trascurabile su array di openers per gruppo).

### 2. Colonne di output (glossario)
- **Volume:** `messages`, `fan_msgs`, `creatorside_msgs`, `creatorside_personal_msgs`, `broadcast_msgs`, `account_side_msgs` (DQ), `other_side_msgs` (DQ gate), `active_conversations` (fan distinti).
- **Talk-ratio:** `chatter_msg_share` = personal / (fan+personal); `chatter_to_fan_ratio` = personal / fan.
- **Interactivity:** `turn_switches`, `alternation_ratio` (~1 ping-pong, ~0 monologo).
- **Response coverage:** `fan_openers` (opener valutabili), `answered_openers`, `unanswered_openers`, `response_rate`, `frt_zero_replies` (DQ).
- **Latency:** `frt_p50_sec`, `frt_p90_sec` (solo opener risposti entro cap).
- **SLA:** `pct_within_5min`, `pct_within_15min` (denominatore = tutti gli opener valutabili; non-risposti = breach).
- **Flag:** `is_partial_day`.

### 3. Definizioni semantiche
- `is_fan` = `sender_id = user_id`; `is_creatorside` = `sender_id <> user_id` (partizione esaustiva ⇒ `messages = fan_msgs + creatorside_msgs`).
- Reply/turno = `is_personal_reply` (creatorside non-broadcast). Un opener del fan è "risposto" quando esiste una `is_personal_reply` successiva nella stessa conversazione entro `sla_cap_seconds`.
- FRT = tempo dal **primo** messaggio del fan-turno alla **prima** reply personale successiva (right-censoring escluso via `sla_cap`).

### 4. Knobs (tutti in testa)
`sla_cap_seconds` (6h), `sla_fast_seconds` (5m), `sla_slow_seconds` (15m), `broadcast_min_recip` (5, **da calibrare**), finestra scan 8d / output 7d, TZ `'Europe/Rome'` (**deve** combaciare col roster-turni a valle).

### 5. Privacy (bright-line)
Referenzia solo 6 colonne scalari; `body`/`user_data` mai toccate in SELECT/WHERE/QUALIFY/window. Segnali strutturali, mai contenuto. Coerente con "dati fan fuori dallo score by design". Gate d'accesso previsto: Tier-1 → `authorizeAll(SCORES_VIEW)`; il drill per-conversazione resta interno/gated e non joina mai `user_id` a campi identificanti.

### 6. Costo
Una sola scansione della tabella (catena di CTE lineare, ogni CTE referenziata una volta). Solo 6 colonne fisiche lette, niente JSON. Doppio filtro `created_at` + `commit_timestamp` per potare a prescindere dalla colonna-partizione. Cap `maximumBytesBilled` ~2 GiB gestito da console/connector — progettato per stare largamente sotto.

### 7. Tier-2 (body) — separato, gated, NON in questa query
I 3 segnali che richiedono il testo (`msg_length`, `question_rate`, `monologue_words` in parole) vivono in una spec Tier-2 separata: `body` letto **solo dentro funzioni aggregate** (`CHAR_LENGTH`, `ARRAY_LENGTH(SPLIT())`, `REGEXP_CONTAINS`), output solo numerici, k-anon `HAVING >= 20` msg-testo, capability privilegiata + audit log. **Prerequisito bloccante**: verifica una-tantum dello schema di `body` (chiavi `{type,text,price,media}` PROBABILI, non confermate) da reviewer privilegiato, documentata in `docs/INFLOWW_SURFACE.md`, senza lasciare l'ispezione in query committata. Nota frontier: il "monologo" misurato in **numero di messaggi consecutivi** è gaps-and-islands puro sui timestamp → resta Tier-1 (segnale gratuito `longest_chatter_run_msgs`), solo la **massa in parole** scende al Tier-2.

### 8. Integrazione in HOC Pro (verificata sul repo)
- **Connettore già presente:** `src/lib/bigquery-api.js` (`bqQuery(sql, opts)`, JWT RS256, cap `maximumBytesBilled` default 2 GiB → oltre il cap FALLISCE; billing su `BIGQUERY_BILLING_PROJECT`, dati su `BIGQUERY_DATA_PROJECT`, runtime Node). Template route: `src/app/api/admin/bigquery/ping/route.js` (`authorizeAll(CAPABILITIES.SCORES_VIEW)` + cache KV TTL; il commento cita già "le viste vere es. hoc.laura_chat_monitor").
- **Due grane, stessa CTE:** (a) aggregato `creator × day` (questa query) → dashboard account-level, zero dipendenza dal roster, spedibile subito; (b) estratto fan-turn-level `(creator_id, user_id, turn_start_ts UTC grezzo, frt_seconds, answered)` → input al join sul turno.
- **Bridge identità (bloccante per il per-operatore):** confermare che `ws_chat.creator_id` = id creator interno o costruire la corrispondenza; riuso `creatorspro-mapping` + `buildAliasIndex` (`src/lib/creator-match.js`).
- **Join sul turno:** stesso pattern di `src/lib/payout-match.js` (`matchOperatorPeriod`, slackMs, clamp in-progress); confidenza esplicita **exact/ambiguous/unattributed**, DIREZIONALE mai contabile; la latenza si attribuisce agli operatori in shift durante la **finestra di attesa** (se attraversa un cambio turno → condiviso/ambiguo).
- **Cadenza:** snapshot persistito (non live), tick nel dispatcher cron esistente (`/api/cron/dispatch`, heartbeat `cron:heartbeat:*`), non 3° cron in `vercel.json`. Lettura gated `SCORES_VIEW`, refresh gated `SEED`.
- **Vista Performance:** fase 1 account-level (pannello "Qualità conversazione" + worklist coaching su Action/Coaching Center); fase 2 operator-level **gated** sul match-rate reale (analogo al gate ≥85% di payout-tree v2.1), **fuori dallo score**.