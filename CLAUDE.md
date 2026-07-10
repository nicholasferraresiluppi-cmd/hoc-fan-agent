# CLAUDE.md — Istruzioni per future sessioni Claude in questo repo

## Cosa è questo progetto

**HOC Pro** (nome storico repo: `hoc-fan-agent`): console operativa interna di House of Creators.
Next.js 14 (App Router, JavaScript). Stack: Clerk (auth), Vercel KV (storage), Anthropic SDK (LLM), Tailwind, SWR.

Tre moduli reali, in ordine di importanza attuale:
1. **Performance & HR** — leaderboard Sales CP (score v3 da CreatorsPro), vista creator-first, Action Center (underperformers → export HR), Coaching Center. È il riferimento per le decisioni HR sui chatter (cfr `docs/BOARD_ANNOUNCEMENT_HOC_PRO.md`, che è di fatto l'ADR della formula di scoring).
2. **Comp & Ben** — P&L Live per creator, scaglioni a confronto, comp-review (hot list anomalie), comp-exam, comp-calendar, threshold-study, payment profiles.
3. **Training Academy** — simulatore chat con fan AI (`src/app/page.js`), playbook, leghe/ladder, certificazioni. Modulo rifinito ma senza operatori onboardati (a luglio 2026 gli utenti reali sono 5-10 persone del board).

Modulo **Content Pipeline**: scaffolding non implementato (API rispondono 501). Rimosso dalla navigazione a luglio 2026; le route esistono ancora sotto `/content-pipeline` (gate `publicMetadata.contentPipeline`). Non esporlo in nav finché non è costruito.

Tutto sotto auth Clerk tranne `/sign-in` e `/sign-up` (vedi `src/middleware.js`).

## Aree del codice

- `src/app/leaderboard/` — Sales CP, creator-first (+heatmap), training ladder/leghe/storico, operational (KPI Infloww da CSV, senza voce di nav ma il drill-down `[employee]` è la scheda operatore usata da tutta l'app)
- `src/app/admin/` — hub + ~35 pagine: comp toolkit, action/coaching center, sync CreatorsPro (`creatorspro-sync`, `wage-audit`), viste Infloww (`infloww-agency`, `infloww-revenue`, `infloww-reconcile`), anagrafiche, ruoli/accessi
- `src/lib/creatorspro-api.js` — client CP v2.1 (login email/password); `src/lib/infloww-api.js` — client Infloww
- `src/lib/creator-aggregates.js` — matrix operatore×creator + costanti decisionali (SCORE_BLEND 70/30, SCORE_WEIGHTS 85/15, MIN_SHIFTS_RELIABLE=3)
- `src/lib/creatorspro-score.js` — score CP v3 (rationale versionato nei commenti)
- `src/lib/leaderboard-calc.js` / `leaderboard-config.js` / `leaderboard-history.js` — leaderboard operativa Infloww
- `src/lib/rbac.js` — capability + ruoli (vedi sotto)

## ⚠️ PRIMA di chiudere ogni PR UI

**Leggi e applica [docs/PR_PREFLIGHT.md](docs/PR_PREFLIGHT.md)**. È una checklist aggiornata con tutti i bug emersi nelle iterazioni precedenti.

Riporta nella PR description una sezione `## Self-review` con i bullet del preflight pertinenti spuntati. Se non spunti niente è perché stai dimenticando di verificare qualcosa.

## Design system

**docs/DESIGN.md è vincolante** per tutta la UI (Dark SaaS: un solo accent viola, flat, gerarchia per luminosità, sentence case, niente emoji nel chrome). Token nell'oggetto `CP` di `src/lib/brand.js`; i nomi legacy `COLORS.*` (obsidian, charcoal, champagne…) sono rimappati sui valori nuovi — non usarli in codice nuovo, usa `CP`.
Debiti noti accettati: font-weight 600/700 ancora diffusi inline (normalizzazione a 400/500 = sweep separato); `CREATOR_DOT_PALETTE` multicolore mantenuta (funzionale: distingue i creator nei dot, non è decorazione).

## Convenzioni operative

- **Branch**: `feature/<descrizione-breve>` o `fix/<descrizione>`
- **Commit**: `feat(area): cosa` / `fix(area): cosa` / `chore(deps): cosa`
- **PR**: single squash commit, mai merge commits
- **Git Data API**: per PR multi-file usa lo script pattern in `/tmp/single-commit-*.py` (esempi nelle sessioni precedenti) per fare 1 deploy Vercel invece di N. Vedi `docs/PR_PREFLIGHT.md` sezione 8.
- **No `await auth()` lato client**: si usa `useUser()` o SWR su `/api/whoami`. Lato server `await auth()` + `authorize(CAPABILITIES.XXX)`.
- **lucide-react è pinnata (0.395)**: prima di usare un'icona nuova verifica che esista con `node -e "console.log(!!require('lucide-react').NomeIcona)"` — icone inesistenti = React #130 in produzione.

## Auth, ruoli e capability

- RBAC custom in `src/lib/rbac.js`: capability con scope own/team/all; ruoli predefiniti operator / team_lead / sales_manager / qa_reviewer / admin + ruoli custom (`/admin/ruoli-custom`). La capability più usata nelle pagine admin è `SEED` (admin only).
- Status admin (`src/lib/admin.js`), 3 sorgenti in OR: env `HOC_ADMIN_USER_IDS`, Clerk `publicMetadata.role === "admin"`, set KV `admins:set` (gestibile da `/admin/access`).
- ⚠️ Il gating è a livello API, non di UI: le pagine `/admin/*` si aprono a chiunque sia loggato (le fetch tornano 403). Le API leaderboard (`/api/leaderboard/*`) sono aperte a ogni utente loggato ed espongono venduto/score di tutti: **da sistemare prima di onboardare utenti fuori dal cerchio board**.

## Navigazione

- Sidebar globale: `src/components/Sidebar.js` (array `NAV_GROUPS` + `ESSENTIAL_HREFS` per la modalità Essential)
- Hub admin: `src/app/admin/page.js` (array `SHORTCUT_GROUPS`)
- Per aggiungere una pagina: aggiorna **entrambi** (la divergenza sidebar/hub è stata una fonte di confusione storica)

## Pattern KV principali

- `ops_kpi:{period_type}:{period_id}` — dati Infloww del periodo; `ops_kpi:imports` — ZSET indice import; `ops_kpi:group_categories`, `group_languages`
- `wages:{period_id}` e chiavi sync CP (job in KV, vedi `src/lib/` sync); mapping CP↔Infloww via `/api/admin/creatorspro-mapping`
- `leaderboard:exclusions`, `underperformers:ignored`
- `employee_profile:{name}` + `employee_profile:_index` (set)
- `session:{id}`, `score_hist:*` — sessioni training e storico score
- `roles:{userId}` (multi-ruolo), `role:{userId}` (legacy), `custom_role:{id}`, `admins:set`
- `content:*` — namespace content-pipeline (vedi `docs/CONTENT_PIPELINE.md`)
- Audit di azioni (non di uso): `audit:leaderboard-actions` (cap 200), `content:audit:log` (cap 5000). Non esiste tracking di utilizzo pagine.

## Decision log

Decisioni strutturali tracciate qui (1 riga + link); il rationale dello scoring vive in `docs/BOARD_ANNOUNCEMENT_HOC_PRO.md` e nei commenti versionati di `creatorspro-score.js` / `creator-aggregates.js`.

- **2026-07-10 — Potatura superficie**: rimosse 14 route/lib morte (probe CP/Infloww, `/api/sessions`, `/api/feedback`, `/api/challenge`, client CP duplicato), AdminNav stub, Content Pipeline fuori da nav/hub/welcome/cron, COLORS legacy rimappata sui token Dark SaaS, TIER flat. Motivo: 3 generazioni di tool sedimentate rendevano l'app illeggibile per un nuovo utente. Reversibile via git.

## Non fare

- ❌ Mai modificare l'auth Clerk senza un piano (bypass parziali rompono 20 route)
- ❌ Mai cambiare il calcolo dello Score senza prima salvare in `leaderboard-config.js` / `creatorspro-score.js` e versionare il commento (gli operatori vedono lo storico cambiare)
- ❌ Mai esporre il KV in route pubbliche senza `authorize()`
- ❌ Mai aggiungere npm packages pesanti (>500KB minified) senza dynamic import o segnalazione esplicita
- ❌ Mai rimettere in navigazione la Content Pipeline finché le API rispondono 501
- ❌ Mai reintrodurre route "probe" usa-e-getta committate: si esplorano le API esterne in locale/scratch, non in produzione
