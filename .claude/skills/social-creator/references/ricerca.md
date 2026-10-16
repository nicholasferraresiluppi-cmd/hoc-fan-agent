# Ricerca: cosa funziona adesso nella sua nicchia

Si fa al primo giro (per scegliere il format) e poi una volta al mese. Le formule durano
una stagione, non una settimana.

## L'idea che rende la ricerca utile: il multiplo

**Le view grezze non sono evidenza.** 400k view su un account da 2M follower sono un
martedì qualunque; 400k su un account da 4k vogliono dire che ha trovato qualcosa.

```
multiplo = view del reel ÷ mediana delle view degli ultimi 12 reel di quell'account
```

- ≥3 → segnale, da studiare.
- 1,5–3 → buono, guardare se si ripete.
- <1,5 → giornata normale di quell'account: non insegna niente, per quanto grande sia.

Confrontare account entro ~10× la taglia della nostra creator: quello che funziona a 2M
follower spesso funziona PERCHÉ è a 2M follower.

## Da dove prendere i reel (in ordine)

1. **Radar HOC Pro** (`/admin/scouting`): migliaia di creator italiane già classificate per
   nicchia, segnale di pagamento, format, con i reel guardabili. Partire dalle creator con
   segnale di pagamento forte e nicchia vicina. Gratis.
2. **Account interni** con tag di concept in CreatorsPro (`social_metrics_get_accounts`
   con `tag`), e i loro reel (`social_metrics_get_instagram_media_metrics`). Qui abbiamo
   anche click in bio e sub: sono i riferimenti più preziosi.
3. **Trend Finder di CreatorsPro** (app.creatorspro.com, dal Chrome di Nicholas già
   loggato): cosa è virale ora, soprattutto USA.
4. **Apify** per account esterni: `data-slayer/instagram-profile-reels` (reel con view,
   anche con limite d'età, ~2 $ per 50 account). Fino a 30 $ a giro si procede; sopra,
   stima e OK di Nicholas. Mai account Instagram personali.

Scelta degli account (6–12): 4 diretti (stessa nicchia, poco più avanti), 4 adiacenti
(altra nicchia, stesso pubblico maschile: da lì si prendono i format prima che arrivino
nella nicchia), 2–4 grandi solo per il formato, mai per cadenza o tono.

## Cosa annotare per ogni reel con multiplo ≥3

| account | follower | mediana | view | multiplo | gancio a schermo | famiglia di gancio (SKILL.md) | format/serie? | durata | audio orig.? | ponte? |

"Ponte?" = c'è qualcosa che fa venire voglia di vederla altrove (personaggio, intimità,
non detto) o è solo intrattenimento? Gaming e viaggi spesso fanno view senza ponte.

## Output: `ricerca.md` della creator

- La tabella sopra, ordinata per multiplo.
- 3–5 **formule** estratte (struttura, non testo): "POV rivolto a lui + oggetto di casa +
  battuta finale che ribalta", con gli account da cui vengono.
- Per ogni formula: come si traduce nel SUO personaggio (una riga), o perché non si
  traduce.
- Data della ricerca. Oltre 2 mesi: rifare.

## Limiti da dichiarare

Un outlier non ha gruppo di controllo: dice "questo può funzionare", non "questo
funziona". La prova arriva da `misura.md`, sulla nostra creator.
