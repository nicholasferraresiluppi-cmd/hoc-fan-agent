# Content Pipeline — Guida visiva

Modulo separato per automatizzare la pubblicazione di contenuti su canali Telegram di creator HOC, con dashboard di approvazione umana e generazione AI dei post.

Vive sotto `/content-pipeline/*` ed è completamente isolato dal training tool. Solo utenti con il flag `publicMetadata.contentPipeline === true` su Clerk possono accedervi.

---

## 1. Che cos'è (in una riga)

> Un **CMS leggero** dentro la tua webapp HOC dove tu (o altri "content admin") create draft di post, li approvate, li programmate, e Vercel li pubblica automaticamente sul canale Telegram del creator giusto.

---

## 2. Il flusso completo (visione finale)

```
                        ╔════════════════════════╗
                        ║   1. SETUP CREATOR     ║   (una sola volta per creator)
                        ║                        ║
                        ║  • slug "alice"        ║
                        ║  • channel @aliceVIP   ║
                        ║  • bot token (cifrato) ║
                        ║  • persona AI          ║
                        ╚═══════════╤════════════╝
                                    │
                  ┌─────────────────┴──────────────────┐
                  │                                    │
                  ▼                                    ▼
       ┌────────────────────┐              ┌────────────────────┐
       │ 2a. GENERA DRAFT   │              │ 2b. SCRIVI DRAFT   │
       │     CON AI         │              │     A MANO         │
       │                    │              │                    │
       │  Brief → Claude →  │              │  Tu scrivi testo + │
       │  testo con persona │              │  carichi media     │
       │  del creator       │              │                    │
       └─────────┬──────────┘              └─────────┬──────────┘
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   ▼
                       ┌───────────────────────┐
                       │   3. DRAFT IN QUEUE   │
                       │      status=pending   │
                       │                       │
                       │  Card visibile nella  │
                       │  pagina /queue        │
                       └───────────┬───────────┘
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  4. REVIEW UMANA      │
                       │                       │
                       │  • Preview Telegram   │
                       │  • Modifichi testo    │
                       │  • Scegli orario      │
                       └─────┬─────────┬───────┘
                             │         │
                  ┌──────────┘         └──────────┐
                  ▼                               ▼
        ┌──────────────────┐            ┌──────────────────┐
        │ 5a. APPROVE      │            │ 5b. REJECT       │
        │                  │            │                  │
        │ status=approved  │            │ status=rejected  │
        │ publishAt set    │            │ reason=…         │
        │ → ZSET schedule  │            │                  │
        └────────┬─────────┘            └──────────────────┘
                 │
                 ▼
        ┌──────────────────────────────┐
        │  6. CRON VERCEL              │
        │  (ogni giorno alle 09:00 UTC)│
        │                              │
        │  Legge ZSET → trova draft    │
        │  con publishAt ≤ now         │
        └────────────┬─────────────────┘
                     │
                     ▼
        ┌──────────────────────────────┐
        │  7. PUBLISH                  │
        │                              │
        │  • Decifra bot token         │
        │  • POST a Telegram Bot API   │
        │  • status=published          │
        │  • Append history            │
        └──────────────────────────────┘
```

---

## 3. Stato attuale — cosa funziona OGGI

| Funzione                          | Stato        | Note |
|-----------------------------------|--------------|------|
| Gate Clerk `content_admin`        | ✅ funziona  | Set `publicMetadata.contentPipeline=true` |
| Cifratura bot token (AES-256-GCM) | ✅ funziona  | Chiave da env `CONTENT_TOKEN_ENCRYPTION_KEY` |
| Layer KV (Creator/Draft/ZSET)     | ✅ funziona  | Tutti i CRUD presenti |
| Client Telegram (fetch nativo)    | ✅ funziona  | sendMessage/sendPhoto/verifyToken |
| **UI Creators** (lista + CRUD)    | ✅ **USABILE** | crea, modifica, elimina creator |
| API Creators (GET/POST/PATCH/DELETE) | ✅ **USABILE** | con strip token + audit log |
| Audit log                         | ✅ funziona  | LIST capped 5000 |
| Cron Vercel scheduling            | ⚙️ scaffolding | endpoint protetto, logica TODO |
| Generazione AI draft              | ⚙️ scaffolding | wrapper Anthropic vuoto |
| API Queue/Approve/Reject          | ⚙️ scaffolding | tutte ritornano 501 TODO |
| API Publish                       | ⚙️ scaffolding | logica TODO |
| UI Queue / Draft detail / History | ⚙️ scaffolding | placeholder "TODO" |
| Componenti Approval/Preview/Picker| ⚙️ scaffolding | render placeholder |

**Traduzione semplice**: oggi puoi solo gestire i creator (la "rubrica" delle persone HOC con i loro canali). Tutto il resto (creare draft, approvare, pubblicare) sarà costruito nello "step 3".

---

## 4. Cosa puoi fare ORA, passo per passo

### A. Aggiungere il primo creator

```
1. Vai su  https://hoc-fan-agent.vercel.app/content-pipeline/creators
2. Click "Nuovo creator"
3. Compila il form:
   - Slug:            es. "alice"  (a-z, 0-9, trattino)
   - Display name:    es. "Alice Rossi"
   - Channel ID:      es. "@aliceVIP" oppure "-100123456789"
   - Bot token:       BOT_TOKEN ottenuto da @BotFather su Telegram
   - Persona (opz.):  istruzioni AI per il tono del creator
4. Click "Crea creator"
```

**Cosa succede dietro le quinte**:
- Vercel chiama `verifyToken()` → fa una richiesta `getMe` a Telegram per verificare che il bot esista davvero
- Se il token è invalido → errore 400, niente viene salvato
- Se valido → `encryptToken()` cifra il token con AES-256-GCM e salva in KV
- Audit log scrive `creator.create` con username del bot

### B. Modificare un creator

```
1. Dalla lista → click sulla card del creator
2. Modifichi i campi che vuoi
3. Per il TOKEN c'è un trattamento speciale:
   - se lasci il campo vuoto  → il token corrente resta com'è
   - se incolli un token nuovo → viene verificato e ri-cifrato
```

### C. Cosa NON puoi fare ancora

- Creare draft di post (l'API torna 501)
- Approvare/programmare/pubblicare (l'API torna 501)
- Generare contenuti con AI (la funzione lancia "not implemented")

---

## 5. Architettura dati — cosa c'è in KV

Tutte le chiavi sotto namespace `content:*` (zero collisioni col training tool).

```
content:creators:set                    ← SET di slug attivi
content:creator:{slug}                  ← JSON {slug, channel, tokenEnc, persona, ...}

content:draft:{id}                      ← JSON del singolo draft
content:drafts:by_creator:{slug}        ← SET di draftId
content:drafts:by_status:{pending|approved|...}  ← SET di draftId

content:scheduled:zset                  ← ZSET score=publishAtTs, member=draftId
                                          (qui dorme la coda dei post programmati)

content:history:{slug}                  ← LIST capped dei post pubblicati

content:audit:log                       ← LIST capped append-only delle azioni
content:settings:global                 ← (riservato per impostazioni future)
```

---

## 6. Sicurezza — chi vede cosa

```
                          ┌─────────────────────────────┐
                          │   ADMIN (tu in Clerk)       │
                          │   pubMetadata.contentPipeline│
                          └──────────────┬──────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
    ┌───────────────┐          ┌──────────────────┐         ┌─────────────────┐
    │ Vede lista    │          │ Vede displayName │         │ NON vede MAI    │
    │ creator       │          │ + channelId      │         │ il BOT_TOKEN    │
    │               │          │ + persona        │         │ in chiaro       │
    │               │          │ + "hasToken: yes"│         │ (•••• mascherato)│
    └───────────────┘          └──────────────────┘         └─────────────────┘

   Layer KV          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                          ▲
                          │
                          │ AES-256-GCM
                          │ con CONTENT_TOKEN_ENCRYPTION_KEY
                          ▼
   Bot token cifrato (ciphertext base64 in content:creator:{slug}.telegramBotTokenEnc)
```

**Chiavi di sicurezza**:
- Le API `GET /api/content-pipeline/creators*` strippano sempre `telegramBotTokenEnc` prima di rispondere → il client non vede mai il dato cifrato (men che meno in chiaro).
- Il token in chiaro esiste **solo per pochi millisecondi** in memoria server quando un cron sta per pubblicare (decrypt → POST a Telegram → variabile uscita di scope).
- Se perdi `CONTENT_TOKEN_ENCRYPTION_KEY`, i token salvati diventano illeggibili (cifrati per sempre). Backup in password manager consigliato.

---

## 7. Limiti tecnici noti (piano Vercel Hobby)

⚠️ **Cron job: 1 esecuzione/giorno massimo**

Vercel Hobby non permette cron più frequenti di una volta al giorno. Adesso il cron del modulo è schedulato a `0 9 * * *` (ogni giorno alle 09:00 UTC = 11:00 ora italiana).

**Conseguenza pratica**: quando implementeremo la pubblicazione automatica, i post programmati per oggi alle 18:00 verranno pubblicati al prossimo tick del cron, cioè domani alle 11:00. Non c'è precisione fine-grained.

**Workaround possibili (per step futuri)**:
- **Upgrade a Vercel Pro** ($20/mese): permette cron ogni minuto → precisione totale.
- **Trigger esterno**: un servizio gratuito tipo cron-job.org chiama l'endpoint `/api/content-pipeline/cron` ogni 15 min. Non costa nulla.
- **Pubblicazione immediata "on demand"**: l'admin clicca "Pubblica adesso" su un draft → POST diretto a `/api/content-pipeline/publish/route.js` (già stub pronto), bypassando il cron. Funziona già col piano Hobby.

---

## 8. Prossimi step di sviluppo (step 3+)

In ordine di priorità suggerito:

```
┌─ STEP 3.1 ─ "Draft scrivibile a mano + Queue" ─────────────────┐
│  Obiettivo: prima end-to-end usabile senza AI                  │
│  • Implementare API queue (GET/POST), queue/[id], reject       │
│  • UI queue con DraftCard, draft detail con editor             │
│  • Per pubblicare basta il bottone "Pubblica adesso"           │
│  → Già utilizzabile per produrre i primi post                  │
└────────────────────────────────────────────────────────────────┘

┌─ STEP 3.2 ─ "Scheduler + Cron Daily" ──────────────────────────┐
│  Obiettivo: pianificazione programmata                          │
│  • API approve (con publishAt)                                  │
│  • Implementare /api/content-pipeline/cron handler              │
│  • UI SchedulePicker per scegliere data/ora                     │
│  → Programmi post anche di settimane, parte il cron giornaliero │
└────────────────────────────────────────────────────────────────┘

┌─ STEP 3.3 ─ "Generazione AI" ──────────────────────────────────┐
│  Obiettivo: ridurre il tempo di scrittura                       │
│  • Implementare anthropic.js con prompt persona-aware           │
│  • API /api/content-pipeline/generate                           │
│  • Form "Genera draft" nella UI con campo Brief                 │
│  → Bozze in pochi secondi, sempre con review umana finale       │
└────────────────────────────────────────────────────────────────┘

┌─ STEP 3.4 ─ "History + Analytics" ─────────────────────────────┐
│  Obiettivo: tracciare cosa è stato pubblicato                   │
│  • UI /content-pipeline/history (per creator)                   │
│  • Eventuale: link al messaggio Telegram (message_id)           │
└────────────────────────────────────────────────────────────────┘

┌─ STEP 3.5 ─ "Telegram comandi inbound" (opzionale) ────────────┐
│  Obiettivo: approvare/rifiutare dal telefono                    │
│  • Webhook /api/content-pipeline/telegram-webhook               │
│  • Comandi /approve {id}, /reject {id} nel bot                  │
│  → Workflow mobile-first per admin in movimento                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. FAQ rapide

**D: Quanti creator posso aggiungere?**
R: Tecnicamente illimitati. Costo zero in KV finché stai entro la free tier Upstash (~256 MB).

**D: Posso usare lo stesso bot Telegram per più creator?**
R: Sì in teoria (basta che il bot sia admin di entrambi i canali), ma per ora il modulo salva un token per creator. Volendo si può centralizzare.

**D: Il modulo influisce sul training tool?**
R: No. Vive in cartelle separate, env separate (`CONTENT_*`), namespace KV separato (`content:*`). Zero file del training tool modificati.

**D: Cosa succede se ruoto la chiave `CONTENT_TOKEN_ENCRYPTION_KEY`?**
R: I token salvati diventano illeggibili. Va fatta una migrazione (decrypt con chiave vecchia → encrypt con chiave nuova) prima della rotazione. Non c'è ancora script di migrazione: meglio non ruotare la chiave finché non lo implementiamo.

**D: I bot token sono al sicuro?**
R: Sì, sono cifrati AES-256-GCM (lo stesso standard usato da Signal e WhatsApp per i messaggi). La chiave maestra è solo su Vercel come env var Sensitive. Per attaccarli servirebbe sia compromettere KV sia rubare la chiave da Vercel.

**D: Quando si parte con i primi post veri?**
R: Quando vorrai implementare lo step 3.1 (Queue + draft a mano + Pubblica adesso). Da quel momento puoi pubblicare in production, manuale, senza scheduler.

---

## 10. URL e riferimenti pratici

| Risorsa | URL |
|---------|-----|
| Pagina Creators | https://hoc-fan-agent.vercel.app/content-pipeline/creators |
| Pagina Queue (TODO) | https://hoc-fan-agent.vercel.app/content-pipeline/queue |
| Pagina History (TODO) | https://hoc-fan-agent.vercel.app/content-pipeline/history |
| Settings | https://vercel.com/nicholasferraresiluppi-1915s-projects/hoc-fan-agent/settings/environment-variables |
| Clerk users | https://dashboard.clerk.com → Users |
| Cron docs Vercel | https://vercel.com/docs/cron-jobs/usage-and-pricing |

| Env var | Dove sta | A cosa serve |
|---------|----------|--------------|
| `CONTENT_TOKEN_ENCRYPTION_KEY` | Vercel + locale | Cifra/decifra bot token in KV |
| `CONTENT_CRON_SECRET` | Vercel + locale | Autentica chiamate cron Vercel |
| `CONTENT_ANTHROPIC_MODEL` | (opz.) Vercel | Override modello AI per generazione |

---

*Documento generato il 2026-05-12. Aggiornare quando si implementano gli step 3.x.*
