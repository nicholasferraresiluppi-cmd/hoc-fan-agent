# HOC Analytics 3.0 (Looker Studio): com'è fatto e cosa succede se lo staccano

Fotografia del 9 ottobre 2026. Report: `datastudio.google.com/reporting/0aa0b857-b441-4969-bc85-8cdc32acb6f5` (15 pagine, autore Luca).
Accesso di Nicholas al report: **solo visualizzazione** (niente "Modifica"; "Crea una copia" chiede di creare un account Looker Studio).

## La catena, dall'origine al grafico

```
Piattaforma interna (Postgres: creator, transazioni, turni, chargeback…)
   │  Google Datastream (copia in tempo quasi reale, ~1-2 min)
   ▼
BigQuery  house-of-creators-358213.postgres.public_*        ← dati GREZZI
   │  Dataform, ogni notte alle 05:00 UTC, ricrea tutto da zero
   │  codice su GitHub privato: houseofcreators/df-onlyfans (+ hoc-postgres-dataform, df-instagram, df-tiktok, df-trendfinder)
   ▼
BigQuery  onlyfans.*  (attributed_transactions, subscriptions, revenue, kpi, reach, welcome_unlocks, users_research…)
   │  + viste nel dataset hoc.* (65 viste, molte nate per Looker)
   │  + fogli Google collegati come tabelle esterne (hoc.creators_looker = nomi visualizzati "Kaia Kitsune - EN")
   ▼
Looker Studio "HOC Analytics 3.0"  →  ~18 fonti dati, una per gruppo di grafici
```

## Verifica sui numeri (Recap Dashboard, 25 set – 8 ott 2026)

| Numero nel report | Ricalcolato da BigQuery | Fonte |
|---|---|---|
| Kaia Kitsune - EN, net $114.706,36 | $114.706,36 | `SUM(net)` di `onlyfans.attributed_transactions` per `calendar_date` |
| Elisa Esposito - IT, $61.265,03 | $61.265,03 | idem |
| Totale $1.399.080,31, 77 creator | $1.399.080,31, 77 | idem |
| Variazione −4,6% | −4,61% (vs $1.466.711,94 nei 14 giorni prima) | confronto con il periodo precedente di pari durata |
| Kaia, 5.785 nuovi abbonati | 5.785 | `SUM(new_subs)` di `onlyfans.subscriptions` |
| Totale 81.674 abbonati, 79 creator | 81.656, 79 | idem; scarto di 18 perché la tabella si aggiorna dopo le 07:23 |

Dal grezzo, senza la pipeline: `SUM(net)` di `postgres.public_transactions` con data UTC dà $1.399.043,51, cioè uno scarto dello 0,003%.

## Pagine del report e tabelle corrispondenti (verificate il 9 ott 2026)

Per ogni pagina ho letto i numeri dal report e li ho ricalcolati da BigQuery.

| Pagina | Fonte | Formula | Esito |
|---|---|---|---|
| Recap Dashboard | `onlyfans.attributed_transactions` + `onlyfans.subscriptions` | `SUM(net)`, `SUM(new_subs)` per `calendar_date`; % Δ = periodo precedente di pari durata | ✔ al centesimo |
| Clicks Overall | `onlyfans.links_stats` | `SUM(clicks_diff)`, `SUM(subs_diff)` per mese, filtro 2–8 ott (Iri EN 24.784 / 1.225) | ✔ |
| Creators Reach | `onlyfans.reach` | `SUM(total)`, filtro 2–8 ott (Cynthia 142.920) | ✔ |
| Welcome mass unlocks | `onlyfans.welcome_unlocks` | `SUM(subs_count)`, `SUM(unlocks_count)` per creator e prezzo | ✔ |
| Performance KPI per creators | `onlyfans.transactions_analytics` | `SUM(new_subs)`, `SUM(num_transactions)`, `SUM(tot_revenue)` | ✔ al centesimo |
| Detailed Performance KPI | `onlyfans.kpi` | colonne `mid_month_*` / `end_month_*` (prima e seconda metà del mese) | ✔ al centesimo |
| Transactions Details | `onlyfans.attributed_transactions` | righe singole | ✔ |
| Subs Notifications Report | `hoc.subs_notifications` | `COUNT(*)` per creator e `sub_type` | ≈ 4.413 contro 4.400 (tabella aggiornata dopo lo snapshot) |
| User research | `onlyfans.users_research` | ricerca per username, nessun numero da confrontare | fonte dedotta dalle colonne |
| Chargeback Stats | `postgres.public_chargebacks` | "chargeback_at" = `created_at_transaction` | ✔ |
| Creator Overall | `onlyfans.reach` | `SUM(total)` su 14 giorni = 3.672.367 | ✔ |
| Dashboard | `hoc.newsubs_spending_daily` | `COUNT(DISTINCT user_key)` = 21.346, `SUM(revenue)` = $126.047,83 | ✔ al centesimo |
| New Subs Revenue | `hoc.newsubs_spending_daily` | come sopra, più `spend_d0` | ✔ |
| New Subs CR | `hoc.newsubs_spending_daily` | `COUNT(DISTINCT user_key)`, utenti distinti con revenue > 0 | ✔ (903 / 97) |
| [TEST] ARPPU Welcome Unlockers | `hoc.welcome_unlocks_arppu` | la vista legge il foglio Google `hoc.price_tags` | ✖ non verificabile: il service account non può aprire il foglio |
| Tracking Links Stats | probabilmente `hoc.tracking_links_stats` | anche questa vista legge fogli Google | ✖ la pagina non si apre con il nostro accesso (rimanda alla Recap) |

**Dipendenza nascosta:** alcune viste leggono fogli Google (`price_tags`, `funnels_sheets`, `trials_sheets`, `link_mapping`, `creators_looker`). Se quei fogli spariscono, quelle viste smettono di funzionare anche con BigQuery intatto.

## Cosa contiene questa cartella

- `views/` — il codice SQL di tutte le 108 viste del warehouse (`dataset.nome.sql`)
- `tables.json` — catalogo di 347 tabelle e viste: colonne, righe, ultima modifica, partizione, fogli Google collegati

Mancano invece il codice che costruisce le **tabelle** `onlyfans.*` (sta su GitHub privato) e la configurazione del report Looker (campi calcolati e filtri), perché con l'accesso in sola visualizzazione non si legge.

## Rischio, scenario per scenario

1. **Staccano solo Looker Studio.** Nessun dato perso: tutte le tabelle restano leggibili da HOC Pro con il service account. Si ricostruiscono le pagine che servono.
2. **Si ferma la pipeline Dataform.** Le tabelle `onlyfans.*` restano ferme all'ultima notte. I grezzi `postgres.public_*` continuano ad arrivare, ma la logica di attribuzione (funnel, trial, link, spending_id) va riscritta, perché il codice non lo abbiamo.
3. **Revocano l'accesso a BigQuery.** Si perde tutto. È l'unico scenario davvero grave.

Accessi da chiedere: lettura su GitHub `houseofcreators/df-onlyfans` e `hoc-postgres-dataform`, accesso Editor al report (o una copia), e conferma di chi è proprietario del progetto GCP e della piattaforma Postgres.

## Copia di sicurezza (attiva dal 9 ottobre 2026)

Ogni notte il cron di HOC Pro (dispatcher, 03:00 UTC → `/api/cron/warehouse-backup`) copia il warehouse in **`hoc-pro.warehouse_backup`**, il progetto Google Cloud di Nicholas pagato sul suo conto. Le tabelle si chiamano `<dataset>__<tabella>`.

- **Cosa copia:** tutte le tabelle di `onlyfans` (20), tutte quelle di `postgres` (69) e `hoc.ws_chat`, cioè 91 tabelle, ~580 milioni di righe, ~800 GB. Le tabelle nuove che compaiono a monte vengono incluse da sole.
- **Come:** `onlyfans` e `ws_chat` con copy job (gratis nella stessa regione); `postgres` con `CREATE OR REPLACE TABLE AS SELECT`, perché sono tabelle CDC e la copy job salterebbe le righe ancora nel buffer di streaming (~15 GB letti a notte, circa 10 centesimi).
- **Guardia:** se una tabella di origine scende sotto metà delle righe dell'ultima copia riuscita, quella tabella non viene sovrascritta e il heartbeat va in errore.
- **Esito:** heartbeat `cron:heartbeat:warehouse-backup`; stato e tabelle saltate in KV `warehouse:backup:state`.
- **Costo:** conservazione ~20 $/mese, più ~3 $/mese di letture.
- **Copia completa, credenziali incluse** (decisione di Nicholas, 9/10/2026): token di sessione OnlyFans, password dei proxy, device token e graph token Meta sono nel backup. Chi ha accesso a `hoc-pro.warehouse_backup` può usarli finché sono validi, quindi l'accesso al progetto va tenuto ristretto.
- **Restano fuori:** le viste (il loro SQL è in `views/`) e i fogli Google collegati (il service account non può leggerli).

Primo giro verificato il 9/10/2026: 91 job su 91 riusciti, e la Recap ricalcolata sulla copia dà $1.399.080,31.
