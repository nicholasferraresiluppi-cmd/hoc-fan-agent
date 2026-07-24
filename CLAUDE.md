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
- `infloww:txns:{period}:{creatorId}[:cN]` + `infloww:refunds:{period}:{creatorId}` + `infloww:txns:meta:{period}` — ledger transazioni fan-level per l'albero payout (`payout-ledger.js`, TTL 400gg, job `infloww:txns:job`); matching alias↔creator condiviso in `creator-match.js` (overrides in `infloww:reconcile:overrides`)
- `leaderboard:exclusions`, `underperformers:ignored`
- `employee_profile:{name}` + `employee_profile:_index` (set)
- `session:{id}`, `score_hist:*` — sessioni training e storico score
- `roles:{userId}` (multi-ruolo), `role:{userId}` (legacy), `custom_role:{id}`, `admins:set`
- `roadmap:items` — roadmap di prodotto (`/admin/roadmap`, admin-only)
- `content:*` — namespace content-pipeline (vedi `docs/CONTENT_PIPELINE.md`)
- Audit di azioni (non di uso): `audit:leaderboard-actions` (cap 200), `content:audit:log` (cap 5000). Non esiste tracking di utilizzo pagine.

## Decision log

Decisioni strutturali tracciate qui (1 riga + link); il rationale dello scoring vive in `docs/BOARD_ANNOUNCEMENT_HOC_PRO.md` e nei commenti versionati di `creatorspro-score.js` / `creator-aggregates.js`.

- **2026-07-24 — Academy ancorata ai dati reali, Tier 1: game tape**: superficie didattica che estrae dal warehouse (`onlyfans.chat` + `attributed_transactions` + finestre turno da `cache_members`/`loadShiftsForDay`) le migliori SEQUENZE di vendita reali per creator, le cura (admin SEED) e le pubblica agli operatori (`/academy/tapes`, auth-only). Lib `src/lib/academy-tapes.js` (extract/curate/list/stripTape), curatela `/admin/academy-tapes` (SEED). Pattern "call library" (Gong) + Evidence-Based Training (aviazione). Decisioni di design: (1) id tape ancorato a `seq.first` (stabile alla ri-estrazione → upsert idempotente, la curatela non si orfana); (2) **pseudonimizzazione via HMAC keyed** (segreto server `ACADEMY_TAPE_SECRET`, fallback `KV_REST_API_TOKEN`) — NON hash nudo di input enumerabili, che sarebbe reversibile; `user_id` esce solo dalla superficie SEED, `stripTape` lo toglie all'operatore; (3) attribuzione operatore onesta singolo/duo/nessuno come `shift-quality.js`; (4) la revisione pre-publish è anche gate PII sul testo libero; (5) i tape sono materiale didattico, FUORI da score/comp (policy dati-fan). Validato E2E su Elisa Esposito (12 tape da 531 sequenze). Tier 2 (smart trackers calibrati su outcome) VALIDATO empiricamente ma non ancora costruito: su ~4.950 turni singoli, prezzo PPV/cadenza correlano col revenue/ora (within-creator, 31/32 creator), question rate NEGATIVO (opposto di Gong → le regole si ricalibrano, non si importano). Vedi memory `academy-real-data-grounding` / `academy-tier2-signals-evidence`.
- **2026-07-24 — Academy Tier 2: Signals (smart trackers calibrati su outcome)**: superficie READ-ONLY admin (`/admin/academy-signals`, SEED) che ricalcola dal warehouse quali comportamenti operatore correlano col revenue/ora, sui turni a OPERATORE SINGOLO e DENTRO ogni creator (within-creator, media delle CORR per-creator). Lib `src/lib/academy-signals.js` (versione `SIGNALS_VERSION`, cache KV `academy:signals:{version}` riscaldata dal cron dispatch, TTL 25h). Risultato su ~4.3k turni singoli/30 creator (lug 2026): prezzo PPV +0.41 e cadenza PPV +0.30 (forti, 29/30 creator concordano), cadenza msg +0.24, **tasso domande −0.10** (opposto del B2B di Gong → i signal si calibrano sui nostri dati, non si importano); talk-ratio e lunghezza msg = nessun segnale. È il "Gong Labs interno": informa il coaching, NON entra in score/comp. Lezioni dalla review (bug corretti prima del merge): (1) grana per-SHIFT, mai `GROUP BY (creator,ore,revenue)` — fonde turni distinti e gonfia la cadenza; (2) il test "turno singolo" (NOT EXISTS di sovrapposizioni) va fatto contro TUTTI i turni sul creator (CTE `all_shifts` senza filtro ore/ruolo), non contro i soli chatter filtrati, altrimenti un turno duo passa per singolo; (3) floor `MIN_PAIRS` sulle coppie non-null per creare la CORR di un creator (i comportamenti sparsi come il prezzo PPV saturano a ±1 su pochi punti). Vedi memory `academy-tier2-signals-evidence`. Prossimo (non costruito): scoring del simulatore calibrato su questi signal, con la governance versionata dello score CP.
- **2026-07-20 — Fix cron mai scattati + sync ledger automatico**: i 4 cron di vercel.json prendevano 401 dal middleware Clerk (path non pubblici — stessa classe del bug ingest lug 2026): MAI eseguiti in produzione, verificato con curl. Fix: path cron pubblici nel middleware + auth centralizzata in `src/lib/cron-auth.js` (con `CRON_SECRET` configurato accetta SOLO il Bearer — `x-vercel-cron` da solo è spoofabile su route pubblica; senza secret, transizione su header). Nuovo `/api/cron/payout-ledger`: tick auto-concatenante (vincolo Hobby: cron max giornalieri) che avanza il job ledger o avvia il refresh del primo periodo stantio tra mese corrente e precedente (>20h); stessa meccanica per `/api/cron/cp-wages` (wage CP). **Su Hobby i cron scattano "entro l'ora" (±59 min, doc Vercel) → l'ordine tra cron separati NON è garantito** (il digest 06:05 può precedere il run 06:00 slittato) e una finestra può andare persa senza traccia (osservato 20/07: snapshot 00:05 scattato alle 00:10 — primo cron reale della storia del progetto — run alert 06:00 mai, probabile interferenza del deploy in mezzo alla finestra). Il limite di conteggio NON c'entra (100 cron/progetto su tutti i piani dal 20 gen 2026). → vercel.json dichiara SOLO 2 cron: snapshot leaderboard (00:05 lun) + `/api/cron/dispatch` (03:00 UTC giornaliero) che esegue il resto in sequenza deterministica (lun: alert run POI digest; giorno 1: snapshot leghe; sempre: tick cp-wages e payout-ledger). Heartbeat `cron:heartbeat:*` a ogni tick per la prova di esecuzione. Regole: mai aggiungere un path a isPublicRoute senza difesa propria nella route; i cron nuovi vanno nel dispatcher, non come 3º cron in vercel.json.
- **2026-07-19 — Trasparenza comp v2: albero payout fan-level (ledger persistito)**: le transazioni Infloww (`/v1/transactions`, con `transactionId` stabile + refund joinabili — schema verificato live, vedi `docs/INFLOWW_SURFACE.md` §19 lug) vengono sincronizzate in KV per creator×mese (`payout-ledger.js`) e abbinate ai take CP per finestra turno + importo lordo pieno O quota coseller (`payout-match.js` — nei turni a k coseller CP splitta la vendita: take = gross/k, calibrato su dati reali; confidenza esplicita esatto/quota/ambiguo/non-abbinato — il payload API non ha l'employee, l'attribuzione è inferita e dichiarata DIREZIONALE, mai contabile). Misurato su lug 2026: copertura 90%+ sul top operatore; refund report → ~$1.3k di comp stimata su vendite rimborsate in 19 giorni (≈11% del rimborsato attribuito, coerente con gli scaglioni). Scelto ledger persistito (non live) perché la dispute policy richiede evidenza congelata e il rate limit è condiviso. Superficie: `/admin/payout-tree` (albero + refund impact report, `authorizeAll(SCORES_VIEW)`; sync SEED). Fase v2.1 (albero in `/me/compenso`, fan pseudonimizzati) è GATED sul match-rate reale misurato in v2.0 (proposta ≥85%) — non costruirla prima. Dati fan restano fuori dagli input dello score by design.
- **2026-07-19 — Roadmap di prodotto in-app**: le idee/feature future vivono in `/admin/roadmap` (KV `roadmap:items`, admin-only, colonne in corso/prossime/più avanti/parcheggiate con gate esplicito) invece che come pagine placeholder in nav — lezione Content Pipeline. Le nuove idee di sessione vanno aggiunte lì, non costruite come scaffolding. Studio traffic automation (OnlyFlow) in `docs/TRAFFIC_AUTOMATION_STUDY.md`, parcheggiato dietro gate board su risk appetite.
- **2026-07-18 — Governance formula score + gate benchmark chiusi**: snapshot della formula a ogni import (`/admin/score-config-history`) e bozze con backtest sui mesi reali + publish confermato (`/admin/score-config-drafts`); dossier benchmark in `docs/BENCHMARK_DEEP_STUDY.md`, superficie Infloww in `docs/INFLOWW_SURFACE.md` (API ufficiale senza endpoint transcript → fonte chat = export Message Dashboard; chiave API in env è placeholder, da sostituire), policy dispute in `docs/CAREER_LADDER.md` §8.2, requisiti legali in `docs/LEGAL_SCORING_REQUIREMENTS.md`. PR #27-#30.
- **2026-07-17 — Alert operativi (findings store)**: motore di check deterministici su cron → KV `ops:alerts:*` (fingerprint dedup, stati open/ack/resolved, auto-resolve), pagina `/admin/alerts` + pannello hub top-3 + badge critici in sidebar. Pattern issue-tracker (Sentry/Datadog), non notification feed. ADR completo in `docs/ALERT_OPERATIVI.md`. Digest email del lunedì via Resend (`/api/admin/ops-alerts/digest`, solo se critici aperti). Layer LLM escluso dalla v1 by design.
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
