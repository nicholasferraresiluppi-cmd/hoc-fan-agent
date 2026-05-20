# CLAUDE.md — Istruzioni per future sessioni Claude in questo repo

## Cosa è questo progetto

HOC Fan Agent: Next.js 14 (App Router, JavaScript) per training operatori chat OnlyFans agency.
Stack: Clerk (auth), Vercel KV (storage), Anthropic SDK (LLM), Tailwind, SWR.

Tutto sotto auth Clerk tranne `/sign-in` e `/sign-up` (vedi `src/middleware.js`).

## Aree principali

- `src/app/leaderboard/` — leaderboard Training (gamification) e Operational (KPI Infloww importati via CSV/xlsx)
- `src/app/admin/` — pagine admin per gestire categorie Group, lingue, profili operatori, esclusioni, ecc.
- `src/lib/leaderboard-calc.js` — calcolo score 0-100 per operatore × Group
- `src/lib/leaderboard-history.js` — helpers cross-period per drill-down + health bar + underperformers
- `src/lib/leaderboard-config.js` — KPI weights, tier, regex Mass/lingua

## ⚠️ PRIMA di chiudere ogni PR UI

**Leggi e applica [docs/PR_PREFLIGHT.md](docs/PR_PREFLIGHT.md)**. È una checklist aggiornata con tutti i bug emersi nelle iterazioni precedenti.

Riporta nella PR description una sezione `## Self-review` con i bullet del preflight pertinenti spuntati. Se non spunti niente è perché stai dimenticando di verificare qualcosa.

## Convenzioni operative

- **Branch**: `feature/<descrizione-breve>` o `fix/<descrizione>`
- **Commit**: `feat(area): cosa` / `fix(area): cosa` / `chore(deps): cosa`
- **PR**: single squash commit, mai merge commits
- **Git Data API**: per PR multi-file usa lo script pattern in `/tmp/single-commit-*.py` (esempi nelle sessioni precedenti) per fare 1 deploy Vercel invece di N. Vedi `docs/PR_PREFLIGHT.md` sezione 8 per spiegazione.
- **No `await auth()` lato client**: si usa `useUser()` o SWR su `/api/whoami`. Lato server `await auth()` + `authorize(CAPABILITIES.XXX)`.

## Capability

Vedi `src/lib/rbac.js`. La più usata in queste sezioni è `SEED` (admin only) per gestione anagrafica, esclusioni, lingue, ecc.

## Vista admin

Tutte le pagine `/admin/*` includono `<AdminNav />` in alto. Per aggiungere una nuova pagina admin: aggiungere la voce in `src/components/AdminNav.js` array `SECTIONS`.

## Pattern KV usati

- `ops_kpi:{period_type}:{period_id}` — dati grezzi del periodo (array di record)
- `ops_kpi:imports` — ZSET indice degli import (member = `{type}:{id}`, score = timestamp)
- `ops_kpi:group_categories` — `{ groupName: "Big"|"Medium"|"Small" }`
- `group_languages` — `{ groupName: "ita"|"eng" }` (override regex)
- `leaderboard:exclusions` — `{ employee: { reason, note, added_by, added_at } }`
- `underperformers:ignored` — `{ employee: { ignored_by, ignored_at, note } }`
- `employee_profile:{name}` + `employee_profile:_index` (set)

## Non fare

- ❌ Mai modificare l'auth Clerk senza un piano (bypass parziali rompono 20 route)
- ❌ Mai cambiare il calcolo dello Score senza prima salvare in `leaderboard-config.js` e versionare il commento (gli operatori vedono lo storico cambiare)
- ❌ Mai esporre il KV in route pubbliche senza `authorize()`
- ❌ Mai aggiungere npm packages pesanti (>500KB minified) senza dynamic import o segnalazione esplicita
