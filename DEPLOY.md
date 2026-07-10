# HOC Pro — Deploy

App interna: il deploy è gestito da Vercel sul push a `main` (progetto `hoc-fan-agent`, team `nicholasferraresiluppi-1915s-projects`). Ogni PR genera un preview deploy con URL stabile.

## Requisiti

- **Vercel**: piano Hobby (limite 60s per serverless function — i sync CP/Infloww girano a chunk per questo)
- **Vercel KV** (Upstash): storage principale (`KV_REST_API_URL` + `KV_REST_API_TOKEN`)
- **Clerk**: auth — tutte le route sono protette tranne `/sign-in` e `/sign-up`
- **Anthropic API**: `ANTHROPIC_API_KEY` server-side (simulatore training, scoring, coach)

## Env vars (Vercel → Settings → Environment Variables)

| Var | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | LLM (chat fan, scoring, coach, Q&A score) |
| `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV |
| `CREATORSPRO_API_BASE_URL` + `CREATORSPRO_BOT_EMAIL` + `CREATORSPRO_BOT_PASSWORD` | Sync CreatorsPro (token TTL ~1h, cache 50min) |
| Credenziali Infloww (vedi `src/lib/infloww-api.js`) | Viste revenue/reconcile |
| `HOC_ADMIN_USER_IDS` | Admin bootstrap (poi gestibili da `/admin/access`) |
| `CRON_SECRET` | Auth dei cron Vercel |

## Cron (vercel.json)

- `/api/leaderboard/snapshot` — lunedì 00:05 (snapshot Hall of Fame)
- `/api/leagues/snapshot` — 1° del mese 00:10 (stagione leghe)

## Problemi comuni

- Numeri fermi/vecchi → il sync CP è manuale: `/admin/wage-audit` (storico) o `/admin/creatorspro-sync` (mese)
- Operatore "no CP data" → `/admin/debug-mapping`
- 403 su pagine admin → l'utente non ha capability: `/admin/access` o `/admin/ruoli`
