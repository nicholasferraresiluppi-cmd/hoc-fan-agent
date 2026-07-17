# ADR — Alert operativi (findings store + motore check)

- **Data**: 2026-07-17
- **Decision owner**: Nicholas
- **Stato**: accepted
- **Tipo**: one-way semi (nuovo schema dati KV + superficie di navigazione)

## Contesto

HOC Pro segnala problemi operativi (wage mancanti, fee non configurate, operatori sotto
soglia) con banner hardcoded sparsi per l'app, senza stato né storico: l'alert wage è
rimasto nell'hub per settimane, le fee del P&L sono scoperte da un mese e le metriche
closed-loop sono vuote. I segnali in-app muoiono se nessuno apre la pagina giusta al
momento giusto. Serve un punto unico, con ciclo di vita, che resti vero nel tempo.

## Opzioni considerate

1. Estendere i banner hardcoded pagina per pagina (status quo migliorato)
2. **Findings store in KV + motore check su cron + tre superfici di lettura** ← scelta
3. Agente LLM completo da subito (sintesi narrativa via Anthropic SDK)

La 1 non scala e non ha storico; la 3 costruisce il tetto senza fondamenta (e la maggior
parte dei check è deterministica: un LLM lì aggiunge costo e non-determinismo). La 2 è
infrastrutturale: quando servirà il layer LLM sarà un altro "scrittore" sullo stesso store.

## Decisione

Un motore di check deterministici scrive alert stateful in KV; pagina `/admin/alerts`
come fonte di verità, pannello top-3 nell'hub (sostituisce il banner wage hardcoded),
badge critici in sidebar. Pattern "issue tracker" (Sentry/Datadog), non "notification
feed": dedup per fingerprint, stato globale di team (non per-utente), auto-resolve.

## Schema dati (KV)

- `ops:alerts:{fingerprint}` — oggetto alert (JSON):
  `{ fingerprint, checkId, severity: "critical"|"warning", title, detail, value,
     cta: {href, label}, status: "open"|"ack"|"resolved",
     firstSeen, lastSeen, runCount, ackBy, ackAt, resolvedAt }`
- `ops:alerts:index` — SET dei fingerprint esistenti
- `ops:alerts:last_run` — `{ at, checksRun, opened, resolved }` dell'ultimo run
- `ops:alerts:log` — LIST append-only degli eventi (created/updated/acked/resolved),
  cap 500 (stesso pattern di `audit:leaderboard-actions`)

**Fingerprint** = identità dell'alert (es. `wage-gap:2026-06`, `fee-config`,
`infloww-import-stale`). Un run che ritrova la stessa condizione aggiorna la riga
esistente (`lastSeen`, `runCount`, `value`) — mai un duplicato.

**Stati**: `open` → `ack` (presa in carico manuale, visibile a tutto il team) →
`resolved` (SOLO automatico: quando il check ripassa, l'alert si chiude da solo con
timestamp — nessuna chiusura manuale, così la lista non può mentire).

**Retention**: i resolved restano visibili nel filtro "Tutti"; prune al run dei
resolved più vecchi di 90 giorni.

## Check v1 (registry in `src/lib/ops-alerts.js`)

| id | Severità | Condizione |
|---|---|---|
| `wage-gap:{mese}` | critical | wage KV < wage CP live per un mese sincato (riusa logica Wage Audit) |
| `fee-config` | critical | creator con fee% non impostata nel P&L > 50% del totale |
| `infloww-import-stale` | warning | ultimo import in `ops_kpi:imports` più vecchio di 8 giorni |
| `underperformers` | warning | operatori con score CP v3 ≤ 25 e ≥ MIN_SHIFTS_RELIABLE shift (riusa costanti `creator-aggregates.js`) |
| `cp-sync-stale` | warning | ultimo sync CP più vecchio di 8 giorni |

Due sole severità by design: con 3+ livelli si discute di tassonomie invece di agire.

## API e permessi

- `GET /api/admin/ops-alerts` — lista: `authorizeAll(SCORES_VIEW)` (espone dati denaro)
- `POST /api/admin/ops-alerts/ack` — presa in carico: `authorizeAll(SCORES_VIEW)`
- `POST /api/admin/ops-alerts/run` — esegue i check: cron Vercel con
  `Authorization: Bearer CRON_SECRET`, oppure sessione admin (bottone "Aggiorna ora")
- Cron: lunedì 06:00 UTC (~8:00 Europe/Rome) in `vercel.json`
- Badge sidebar: conta SOLO i critici open/ack (un segnale sempre acceso è spento)

## Trade-off accettati

- Freschezza settimanale (+ bottone "Aggiorna ora" per il refresh manuale)
- La mail del lunedì (nudge push) è FUORI da questa v1: non esiste un provider email
  nello stack. Va deciso (es. Resend) e aggiunto come step separato — il digest è già
  calcolabile dallo store
- Niente layer LLM in v1: previsto come secondo "scrittore" sullo stesso store

## Trigger di re-evaluation

- 90 giorni (2026-10-17): quanti alert hanno generato un'azione (ack o CTA)?
  Se ~zero, il problema è il processo, non il tool — fermarsi prima di aggiungere check
- Arrivo del layer LLM: rivalutare il campo `detail` (oggi stringa, potrebbe diventare
  markdown)

## Sunset condition

Se HOC Pro adotta un sistema di observability esterno (es. Datadog per dati business),
questo modulo migra lì e la pagina diventa un redirect.
