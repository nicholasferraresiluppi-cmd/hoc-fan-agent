# HOC Fan Agent — Guida Deploy

## Cosa ti serve
1. Un account GitHub (gratis) — github.com
2. Un account Vercel (gratis) — vercel.com
3. Una API key Anthropic — platform.claude.com

## Step 1: Carica su GitHub
1. Vai su github.com → il tuo repository `hoc-fan-agent`
2. Carica i file aggiornati (trascina e rilascia, poi "Commit changes")
3. Vercel fa il deploy automatico in 1-2 minuti

## Step 2: Configura Vercel KV (per storico e analytics)
Questo step è NECESSARIO per salvare le sessioni e vedere la dashboard analytics.

1. Vai su vercel.com → il tuo progetto `hoc-fan-agent`
2. Clicca "Storage" nel menu a sinistra
3. Clicca "Create" → seleziona "KV" (Vercel KV)
4. Nome: `hoc-sessions` (o quello che vuoi)
5. Regione: seleziona la più vicina a te
6. Clicca "Create & Connect"
7. Vercel aggiunge automaticamente le variabili d'ambiente necessarie
8. Vai su "Deployments" e clicca "Redeploy" sull'ultimo deploy

Fatto! Da questo momento tutte le sessioni vengono salvate automaticamente.

## Step 3: Usa l'app
1. Apri hoc-fan-agent.vercel.app
2. Inserisci il tuo nome e la API key Anthropic
3. Scegli un fan e inizia la sessione
4. In modalità Training: vedrai feedback in tempo reale sotto ogni messaggio
5. Clicca "Dashboard Analytics" per vedere ranking e storico

## Come ottenere la API key Anthropic
1. Vai su platform.claude.com
2. Registrati o accedi
3. Clicca "Get API Key"
4. Copia la chiave (inizia con `sk-ant-`)
5. Carica credito: anche $20 bastano per centinaia di sessioni

## Costi
- Vercel: gratis (piano hobby, include 30K richieste KV/mese)
- GitHub: gratis
- Anthropic API: ~$0.10-0.15 per sessione (20-30 messaggi)
- Il feedback in tempo reale usa Haiku (molto economico): ~$0.01 per messaggio
- 100 sessioni/mese ≈ $10-15

## Come funzionano le modalità

### Screening (🎯)
- Nessun feedback durante la chat — il candidato è da solo
- Alla fine riceve la valutazione completa con punteggi C/B/S
- Usalo per testare nuovi candidati

### Training (💪)
- Feedback in tempo reale sotto ogni messaggio (🟢 ottimo, 🟡 ok, 🔴 errore)
- Banner con suggerimenti specifici dopo ogni risposta
- Alla fine, report completo + riepilogo feedback
- Usalo per allenare operatori esistenti

### Dashboard Analytics (📊)
- Ranking operatori per punteggio medio
- Storico di tutte le sessioni con dettagli
- Metriche: vendite ottenute, fan mantenuti, best score
- Serve Vercel KV configurato (Step 2)

## Come modificare i profili fan
Apri il file `src/lib/fan-profiles.js` su GitHub e modifica:
- I system prompt dei fan (il loro comportamento)
- I pattern di Andrea Spagnuolo (i criteri di valutazione)
- Puoi aggiungere nuovi profili fan copiando la struttura esistente

Dopo ogni modifica su GitHub, Vercel fa il deploy automatico in 1-2 minuti.

## Problemi comuni
- "API key non valida" → controlla di aver copiato tutta la chiave, deve iniziare con `sk-ant-`
- "Errore nella risposta" → hai finito il credito Anthropic, ricarica su platform.claude.com
- Dashboard analytics vuota → devi configurare Vercel KV (Step 2)
- La pagina non si carica → aspetta 2 minuti, Vercel sta facendo il deploy
