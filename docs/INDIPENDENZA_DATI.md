# Indipendenza dei dati: prendere i dati da OnlyFans senza la piattaforma attuale

Studio del 9 ottobre 2026. Contesto: i dati di HOC arrivano da una piattaforma che non controlliamo (Postgres → Datastream → BigQuery `house-of-creators-358213`, pipeline Dataform su GitHub privato). La mappa di cosa c'è e come si legge è in `docs/warehouse-snapshot-2026-10-09/`; dal 9/10 una copia notturna completa sta in `hoc-pro.warehouse_backup`.

## Come prende i dati oggi la piattaforma (dedotto dallo schema)
- Ogni creator ha una **sessione OnlyFans** salvata (`public_creators.token`), un **proxy dedicato** (394 proxy) e un **profilo browser anti-rilevamento** (Dolphin). Con questi legge le API interne di OnlyFans.
- Le chat arrivano in **tempo reale** via websocket (`hoc.ws_chat`, 1-2 s di ritardo).
- Le tabelle di turni, wage, take, payment profile e members coincidono con i concetti di **CreatorsPro**: è probabile che la piattaforma sia il backend di CreatorsPro. Da confermare.
- Codice e numero di chiamate non sono visibili.

## Quanti dati servono (misurati, ultimi 30 giorni)
| Cosa | Volume |
|---|---|
| Creator attive | 82 |
| Transazioni | ~3.900 al giorno |
| Notifiche (abbonamenti, tip, acquisti…) | ~15.000 al giorno |
| Messaggi in chat | ~360.000 al giorno |
| Tracking link attivi | ~8.300 |
| Storico | transazioni dal 2019, chat dal 2021 (già nel backup) |

## OnlyFans non ha un'API ufficiale
Tutti i fornitori terzi lavorano come la piattaforma attuale: login con le credenziali della creator, proxy e sessioni. **Nessuno si dichiara conforme ai Termini di OnlyFans** e tutti lasciano all'agenzia il rischio di ban. Non è un rischio nuovo rispetto a oggi, ma va detto.

## Chi copre cosa
| Dato (tabelle grezze di oggi) | Infloww API (già nostra) | OnlyFansAPI.com | CreatorsPro API (già nostra) |
|---|---|---|---|
| Transazioni singole con fan e tipo (`public_transactions`) | ✅ `/v1/transactions`, id stabile, importi in centesimi | ✅ (granularità singola da verificare in pilota) | — |
| Rimborsi e chargeback (`public_chargebacks`) | ✅ `/v1/refunds` | parziale (negli export) | — |
| Abbonati nuovi, rinnovi, trial, scaduti (`subscriptions_history`, `notifications`, `trials`) | ⚠️ solo come transazioni di tipo abbonamento | ✅ webhook `subscriptions.new/renewed/expired` | — |
| Tracking link: click, abbonati, revenue (`funnels_daily_stats`, `links_stats`) | ✅ `/v1/links`, `/v1/linkfans` | ✅ smart link + trial link | — |
| Chat in tempo reale + storico (`ws_chat`, `chat`) | ❌ (solo export manuale Message Dashboard) | ✅ webhook messaggi + liste chat | — |
| Mass message e statistiche (`mass_stats`) | ⚠️ solo performance | ✅ | — |
| Statistiche profilo / reach (`statistics_*`, `reach`) | ❌ | ⚠️ parziale | — |
| Lista fan con spesa (`public_users`) | ❌ | ✅ `fans/list-active-fans` | — |
| Turni, wage, take, operatori (`shifts`, `wages`, `takes`, `members`) | — | — | ✅ (è la fonte autoritativa) |

Limiti noti dell'API Infloww (dal repo, provati a luglio): 1.000 richieste al minuto per agenzia, 20 al secondo per chiave, niente webhook, niente chat. La chiave scade il 4 gennaio 2027.

Altri fornitori valutati: **OFAuth** (copertura totale ma grezza, via proxy delle API interne), **OnlyMonster** (API inclusa nel loro CRM, $30-250 per account al mese in base al fatturato), **FansMetric** ($39 per account al mese, documentazione meno dettagliata), **OFMAPI** (gratis in beta, troppo giovane). CreatorHero e Supercreator non hanno un'API pubblica.

**Nota:** OnlyFansAPI è già in casa. Dal 4 agosto 2026 Mattia lo usa per tracciare le Meta Ads di Laura (workspace `hoc-main`, 3 smart link, ~4.300 abbonati, dati nel dataset `ofapi`).

## Raccomandazione
Fonte ibrida, non un solo fornitore:
1. **Soldi e tracking link → Infloww API.** È già collegata, ha id di transazione stabili e rimborsi, e la usiamo per l'albero payout.
2. **Abbonati, chat in tempo reale, fan, mass message → OnlyFansAPI.com.** È il fornitore più documentato e ha webhook su tutti gli eventi.
3. **Turni e compensi → CreatorsPro API**, come oggi.
4. **Reach e statistiche profilo:** nessuno le copre bene. Restano un buco da accettare o da coprire più avanti.

Costo stimato di OnlyFansAPI per 80 account: **~1.800-2.200 $/mese** (Pro 299 $ + account extra a scalare + crediti). I crediti sono il costo variabile da misurare: 360.000 messaggi al giorno via webhook sono ~3.600 crediti al giorno (1 credito ogni 100 eventi).

## Come procedere senza rischi
1. **Pilota su 2-3 creator non critiche**, in parallelo alla piattaforma attuale ("in ombra").
2. Ogni giorno si confrontano i numeri del pilota con quelli del warehouse, che abbiamo nel backup come metro di paragone: transazioni, abbonati e messaggi devono coincidere.
3. Si misurano disconnessioni e crediti reali, poi si decide l'estensione a 80 account.
4. Prima di estendere: parere legale sulla responsabilità verso le creator in caso di ban (i fornitori si esonerano del tutto).

Cosa serve da Nicholas: l'ok al budget del pilota (piano Basic 69 $/mese per 1 account, o Pro 299 $/mese per 5) e la creazione dell'account sul fornitore, che non posso fare io. Poi ingestion, confronto e dashboard li costruisco io.

Fonti: docs.onlyfansapi.com (connect account, webhooks, data exports, pricing, ToS), ofm-tools.com (review indipendente), docs.ofauth.com e ofauth.com/pricing, docs.onlymonster.ai e onlymonster.ai/pricing, fansmetric.com/onlyfans-api, ofmapi.com; per Infloww `docs/INFLOWW_SURFACE.md` e `src/lib/infloww-api.js`.
