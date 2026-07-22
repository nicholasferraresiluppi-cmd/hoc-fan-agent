# Connettore BigQuery — HOC Pro

Aggancia HOC Pro al data warehouse di HOC in BigQuery (progetto **`house-of-creators-358213`**,
lo stesso da cui leggono `revenue.hoc.tools` e `chat.hoc.tools`). Client in
[`src/lib/bigquery-api.js`](../src/lib/bigquery-api.js), prima route di prova in
[`src/app/api/admin/bigquery/ping/route.js`](../src/app/api/admin/bigquery/ping/route.js).

## Principio: leggere e pagare sono cose separate

- **Dove stanno i dati** → `house-of-creators-358213` (magazzino HOC). Lo storage lo paga il proprietario.
- **Chi paga le query** → il progetto in cui la query viene *lanciata* (`BIGQUERY_BILLING_PROJECT`),
  **non** dove stanno i dati. Fissandolo sul progetto di Nicholas, ogni query di HOC Pro è
  addebitata sul suo conto — per scelta esplicita, per controllo/prevedibilità.
- Il service account ha quindi bisogno di **due** permessi distinti:
  1. `roles/bigquery.jobUser` sul **billing project** di Nicholas → può lanciare (e far pagare) query lì;
  2. `roles/bigquery.dataViewer` sui **dataset di HOC** → può leggere i dati. **Questo grant lo dà il proprietario (Mattia).**

## Sicurezza (conto di Nicholas → blindato)

- `maximumBytesBilled` su ogni query (default **2 GiB**, ~$0.012): oltre il cap la query **fallisce**, non addebita.
- Cache in KV (`bq:*`, TTL): HOC Pro non interroga BigQuery a ogni click — poche query/giorno, riusate.
- Query mirate (colonne scelte + filtro data/partizione), mai `SELECT *` su tabelle grandi.

## Variabili d'ambiente

| Variabile | Cosa | Esempio |
|---|---|---|
| `BIGQUERY_SA_KEY` | JSON del service account, in una riga | `{"type":"service_account",...}` |
| `BIGQUERY_BILLING_PROJECT` | Progetto che PAGA (di Nicholas) | `hoc-pro-bq` |
| `BIGQUERY_DATA_PROJECT` | Progetto dei DATI (magazzino HOC) | `house-of-creators-358213` |
| `BIGQUERY_LOCATION` | Location dei dataset (deve combaciare) | `EU` / `europe-west3` / `US` |
| `BIGQUERY_MAX_BYTES_BILLED` | Cap byte/query (opz., default 2 GiB) | `2147483648` |

## Setup (una volta)

1. **Progetto con la tua fatturazione** — nel tuo progetto Google Cloud (o uno nuovo, es. `hoc-pro-bq`)
   collega un billing account (la tua carta). *(Questo passo va fatto da Nicholas: comporta dati di pagamento.)*
2. **Service account** — nello stesso progetto: crea un service account e genera una **chiave JSON**.
   Incolla il JSON (una riga) in `BIGQUERY_SA_KEY`. La chiave è un segreto: solo in env, mai committata.
3. **Permesso di lanciare query (billing)** — dai al service account `roles/bigquery.jobUser`
   sul billing project (`BIGQUERY_BILLING_PROJECT`).
4. **Permesso di leggere i dati (dal proprietario)** — Mattia dà al service account
   `roles/bigquery.dataViewer` sui dataset che ci servono in `house-of-creators-358213`
   (almeno `hoc`; `onlyfans` per lo smoke test). Vedi l'ask sotto.
5. **Verifica** — chiama `GET /api/admin/bigquery/ping` (loggato con scope "all"):
   - `503` = env mancanti; `502` = permesso di lettura non ancora dato o location errata;
   - `200` con righe = tutto cablato. ✅

### Ask pronto per Mattia (grant di lettura)

> Ciao, per far leggere i dati a HOC Pro senza usare la mia utenza: aggiungi questo service account
> `SA_EMAIL@PROGETTO.iam.gserviceaccount.com` come **BigQuery Data Viewer** sul progetto
> `house-of-creators-358213` (o solo sui dataset `hoc` e `onlyfans`). Paghiamo noi le query dal nostro
> progetto, ci serve solo la lettura. Grazie!

## Note tecniche

- Il client firma un JWT RS256 col `crypto` nativo di Node → **nessuna dipendenza npm aggiunta**
  (regola repo sui pacchetti pesanti rispettata). Le route che lo usano girano su runtime **Node**, non Edge.
- **Location**: il job deve girare nella stessa region del dataset. `onlyfans.reach` è risultato in
  `europe-west3`; se i dataset stanno in region diverse, passa `location` per-query o valuta viste allineate.
- La schedulazione (refresh periodico in KV) va agganciata al **dispatcher cron**
  (`src/app/api/cron/dispatch/route.js`), non come nuovo cron in `vercel.json` (vincolo Hobby).

## Stato

Scaffold: client + route di smoke test + env + doc. **Da fare**: chiave SA in env, grant di lettura
da Mattia, poi si sostituisce/affianca lo smoke test con le viste vere (`hoc.laura_chat_monitor`, revenue)
dentro il modulo Performance, con refresh cachato.
