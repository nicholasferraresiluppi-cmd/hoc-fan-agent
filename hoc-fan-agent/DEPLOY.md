# HOC Fan Agent — Guida Deploy

## Cosa ti serve
1. Un account GitHub (gratis) — github.com
2. Un account Vercel (gratis) — vercel.com
3. Una API key Anthropic — console.anthropic.com

## Step 1: Carica su GitHub
1. Vai su github.com → "New repository"
2. Nome: `hoc-fan-agent`
3. Privato: sì
4. Clicca "Create repository"
5. Carica tutti i file di questa cartella nel repository (trascina e rilascia)

## Step 2: Deploya su Vercel
1. Vai su vercel.com e accedi con il tuo account GitHub
2. Clicca "Add New..." → "Project"
3. Seleziona il repository `hoc-fan-agent`
4. Clicca "Deploy" — non serve toccare nessuna impostazione
5. Aspetta 1-2 minuti. Quando è pronto, Vercel ti dà un URL tipo: `hoc-fan-agent.vercel.app`

## Step 3: Usa l'app
1. Apri l'URL che ti ha dato Vercel
2. Inserisci il tuo nome e la API key Anthropic
3. Scegli un fan e inizia la sessione

## Come ottenere la API key Anthropic
1. Vai su console.anthropic.com
2. Registrati o accedi
3. Vai su "API Keys" nel menu
4. Clicca "Create Key"
5. Copia la chiave (inizia con `sk-ant-`)
6. Carica credito: anche $10 bastano per centinaia di sessioni

## Costi
- Vercel: gratis (piano hobby)
- GitHub: gratis
- Anthropic API: ~$0.10-0.15 per sessione (20-30 messaggi)
- 100 sessioni/mese ≈ $10-15

## Come modificare i profili fan
Apri il file `src/lib/fan-profiles.js` su GitHub e modifica:
- I system prompt dei fan (il loro comportamento)
- I pattern di Andrea Spagnuolo (i criteri di valutazione)
- Puoi aggiungere nuovi profili fan copiando la struttura esistente

Dopo ogni modifica su GitHub, Vercel fa il deploy automatico in 1-2 minuti.

## Problemi comuni
- "API key non valida" → controlla di aver copiato tutta la chiave, deve iniziare con `sk-ant-`
- "Errore nella risposta" → hai finito il credito Anthropic, ricarica su console.anthropic.com
- La pagina non si carica → aspetta 2 minuti, Vercel sta facendo il deploy
