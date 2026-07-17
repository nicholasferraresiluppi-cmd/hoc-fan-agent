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
- ⚠️ Il gating è a livello API, non di UI: le pagine `/admin/*` si aprono a chiunque sia loggato (le fetch tornano 403).
- Le API con dati denaro (`operational`, `sales-cp`, `creators[/alias]`, `employee-history`, `operator-cp-history`, `operator-drilldown`) richiedono `authorizeAll(SCORES_VIEW)` = scope "all" (admin/SM/QA; team_lead e operator → 403). Le API training/gamification (ladder, hall of fame, health, leghe, dati own) restano auth-only by design. Helper `authorizeAll` in `rbac.js` (PR #24, lug 2026).

## Navigazione

- Sidebar globale: `src/components/Sidebar.js` (array `NAV_GROUPS` + `ESSENTIAL_HREFS` per la modalità Essential)
- Hub admin: `src/app/admin/page.js` (array `SHORTCUT_GROUPS`)
- Per aggiungere una pagina: aggiorna **entrambi** (la divergenza sidebar/hub è stata una fonte di confusione storica)

## Pattern KV principali

- `ops_kpi:{period_type}:{period_id}` — dati Infloww del periodo; `ops_kpi:imports` — ZSET indice import; `ops_kpi:group_categories`, `group_languages`
- `ops_kpi:score_snapshot:{pt}:{pid}` + ZSET `ops_kpi:score_snapshots` — formula score congelata a ogni import (drift detection); `ops_kpi:score_draft:{id}` + set `ops_kpi:score_drafts:all` — bozze formula con backtest/publish
- `wages:{period_id}` e chiavi sync CP (job in KV, vedi `src/lib/` sync); mapping CP↔Infloww via `/api/admin/creatorspro-mapping`
- `leaderboard:exclusions`, `underperformers:ignored`
- `employee_profile:{name}` + `employee_profile:_index` (set)
- `session:{id}`, `score_hist:*` — sessioni training e storico score
- `roles:{userId}` (multi-ruolo), `role:{userId}` (legacy), `custom_role:{id}`, `admins:set`
- `roadmap:items` — roadmap di prodotto (`/admin/roadmap`, admin-only)
- `content:*` — namespace content-pipeline (vedi `docs/CONTENT_PIPELINE.md`)
- Audit di azioni (non di uso): `audit:leaderboard-actions` (cap 200), `content:audit:log` (cap 5000). Non esiste tracking di utilizzo pagine.

## Decision log

Decisioni strutturali tracciate qui (1 riga + link); il rationale dello scoring vive in `docs/BOARD_ANNOUNCEMENT_HOC_PRO.md` e nei commenti versionati di `creatorspro-score.js` / `creator-aggregates.js`.

- **2026-07-19 — Roadmap di prodotto in-app**: le idee/feature future vivono in `/admin/roadmap` (KV `roadmap:items`, admin-only, colonne in corso/prossime/più avanti/parcheggiate con gate esplicito) invece che come pagine placeholder in nav — lezione Content Pipeline. Le nuove idee di sessione vanno aggiunte lì, non costruite come scaffolding. Studio traffic automation (OnlyFlow) in `docs/TRAFFIC_AUTOMATION_STUDY.md`, parcheggiato dietro gate board su risk appetite.
- **2026-07-18 — Governance formula score + gate benchmark chiusi**: snapshot della formula a ogni import (`/admin/score-config-history`) e bozze con backtest sui mesi reali + publish confermato (`/admin/score-config-drafts`); dossier benchmark in `docs/BENCHMARK_DEEP_STUDY.md`, superficie Infloww in `docs/INFLOWW_SURFACE.md` (API ufficiale senza endpoint transcript → fonte chat = export Message Dashboard; chiave API in env è placeholder, da sostituire), policy dispute in `docs/CAREER_LADDER.md` §8.2, requisiti legali in `docs/LEGAL_SCORING_REQUIREMENTS.md`. PR #27-#30.
- **2026-07-17 — Alert operativi (findings store)**: motore di check deterministici su cron → KV `ops:alerts:*` (fingerprint dedup, stati open/ack/resolved, auto-resolve), pagina `/admin/alerts` + pannello hub top-3 + badge critici in sidebar. Pattern issue-tracker (Sentry/Datadog), non notification feed. ADR completo in `docs/ALERT_OPERATIVI.md`. Nudge email e layer LLM esclusi dalla v1 by design.
- **2026-07-13 — Gating dati denaro pre-CM**: helper `authorizeAll` (scope "all" obbligatorio) su 7 route leaderboard denaro + `closed-loop-metrics` → ANALYTICS_VIEW, prima dell'onboarding CM pilota (ruolo team_lead, cockpit `/cm-cockpit`). Motivo: le route esponevano venduto/score di tutti a qualsiasi utente loggato. PR #24.
- **2026-07-13 — Career ladder + Cockpit CM**: `docs/CAREER_LADDER.md` (Fase 0 people lifecycle) è l'artefatto sorgente di livelli/gate/comp; cockpit CM live (PR #22/#23) con tracciamento supervisioni (KV `cm:sup:*`), override 3% in shadow mode, capability `cm.cockpit`.
- **2026-07-10 — Potatura superficie**: rimosse 14 route/lib morte (probe CP/Infloww, `/api/sessions`, `/api/feedback`, `/api/challenge`, client CP duplicato), AdminNav stub, Content Pipeline fuori da nav/hub/welcome/cron, COLORS legacy rimappata sui token Dark SaaS, TIER flat. Motivo: 3 generazioni di tool sedimentate rendevano l'app illeggibile per un nuovo utente. Reversibile via git.

## Non fare

- ❌ Mai modificare l'auth Clerk senza un piano (bypass parziali rompono 20 route)
- ❌ Mai cambiare il calcolo dello Score senza prima salvare in `leaderboard-config.js` / `creatorspro-score.js` e versionare il commento (gli operatori vedono lo storico cambiare)
- ❌ Mai esporre il KV in route pubbliche senza `authorize()`
- ❌ Mai aggiungere npm packages pesanti (>500KB minified) senza dynamic import o segnalazione esplicita
- ❌ Mai rimettere in navigazione la Content Pipeline finché le API rispondono 501
- ❌ Mai reintrodurre route "probe" usa-e-getta committate: si esplorano le API esterne in locale/scratch, non in produzione
