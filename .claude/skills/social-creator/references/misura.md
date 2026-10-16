# Misura: si performa davvero?

Ogni settimana, stesso giorno. Senza misura il piano successivo è un'opinione.

## Le metriche, in ordine di importanza

1. **Sub per milione di view** — la metrica guida: il profilo esiste per questo.
2. **Click in bio per milione di view** — l'identità che crea curiosità.
   Riferimento org 15/9–15/10/2026: ~331 (tutti gli account IG). Si confronta la creator
   con se stessa nel tempo, il dato org serve solo da ordine di grandezza.
3. **View mediana dei reel** (mediana, non media: un reel esploso falsa la media) e
   **multiplo** di ogni reel sulla sua mediana delle 12 settimane precedenti.
4. **Quota uomini** del pubblico (Statistiche Instagram → Pubblico; a mano, una volta al
   mese).
5. Dalle statistiche del singolo reel (a mano, sui reel con multiplo ≥3 o ≤0,5): tempo
   medio di visione, condivisioni, salvataggi, nuovi follower.

## Da dove

CreatorsPro, connettore `social_metrics_*` (verificato 16/10/2026):
- `social_metrics_get_accounts` con `search: <handle>` → id account e talentId.
- `social_metrics_get_instagram_metrics` con `startDate/endDate` (ultimo giorno = ieri) e
  `talentId` → per account: views, clicksInBio, followers, reels, stories + periodo
  precedente. **Qui i sub NON ci sono.** (L'ordinamento `sortBy` non è affidabile: filtrare
  per talent invece di ordinare.)
- **Sub attribuiti al profilo** = `social_metrics_get_tracking_link_metrics` con `talentId`
  (o `search`): ogni tracking link ha clicks, subs, revenue, conversione (es. il link
  "IG principale" di una creator). Prendere il link che sta nella bio/evidenze di
  QUELL'account: è l'unica attribuzione pulita profilo → sub. Se il profilo non ha un
  tracking link suo, i sub per milione di view non si possono calcolare: dirlo e chiedere
  al team di metterne uno.
- `social_metrics_get_overview_by_talent` → totali della creator (sub OF da tutte le fonti,
  click in bio, view IG e TikTok): contesto, non attribuzione.
- `social_metrics_get_instagram_media_metrics` con `accountId`, `type: reel` → view per reel.
- Risposte grandi: salvarle su file e leggerle con jq.

## `diario.md` — una riga a settimana

```
| settimana | reel | view mediana | click bio /1M | sub /1M | % uomini | variabile provata | esito | decisione |
```

E sotto, per la settimana: i 2 reel migliori e i 2 peggiori **per multiplo**, con una riga
sul perché (gancio, famiglia, format, conformità).

## Come si decide (regole contro il rumore)

- Una variabile alla volta per settimana (dichiarata nel piano), altrimenti non si sa cosa ha
  funzionato.
- Nessuna conclusione sotto **12 reel** per lato del confronto, e mai su una settimana
  sola.
- Si confronta la creator con se stessa (prima/dopo, format A/format B), mai con un'altra
  creator: pubblici diversi.
- Un format si giudica dopo **4 settimane** di costanza. Prima di allora un calo non è un
  verdetto (la costanza, non le idee, è il problema osservato più spesso nei nostri account
  a tema).
- Se le view salgono ma click in bio e sub per milione scendono: il pubblico è sbagliato
  (vedi `identita.md` § Pubblico). Più view non sono una vittoria.
- Ogni decisione presa si scrive in `diario.md`; se smentisce o conferma una riga di
  `evidenze.md`, si aggiorna anche quella, con data.

## Report alla persona che gestisce il profilo

Tre righe: com'è andata (con i due numeri guida), cosa si tiene, cosa si prova la
settimana prossima. Il resto è nel diario.
