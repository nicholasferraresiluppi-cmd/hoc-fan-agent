---
name: social-creator
description: >-
  Strato HOC sopra le skill social esterne, per i profili (Instagram prima, poi TikTok)
  delle creator di House of Creators: dice quale skill di mestiere usare e applica le
  regole che solo HOC conosce — identità e pubblico maschile, conformità adult, italiano
  vero, evidenze dai nostri dati, misura con click in bio e sub dai tracking link. Usala
  PER PRIMA quando si parla di "profilo social di una creator", "far performare il
  profilo", "identità", "format", "idee per reel", "script", "ganci", "piano della
  settimana", "perché questo reel è andato", anche se non si dice "skill". Non serve per
  chat OF, comp o HR.
---

# Social creator — strato HOC

Il **mestiere** (strategia, voce, ganci, script, ricerca dei virali, calendario) lo fanno
skill esterne più profonde di quanto scriveremmo noi. Questa skill fa due cose sole:
**instrada** verso quelle giuste e **impone le regole HOC**, che prevalgono sempre su
quelle esterne in caso di conflitto.

## Lo scopo (decisione di Nicholas, 16/10/2026)

Far performare i profili: identità forte, un pubblico maschile che si interessa al
personaggio e la vuole vedere altrove. Il "dove" (link in bio, evidenze) lo gestisce il
team. Quindi: **i contenuti social non nominano mai OF, non spingono al link, non vendono.**
**Nessuna automazione su commenti, DM, follow o like** (si fanno a mano, lista del giorno).
Si cresce con i contenuti.

**Percorso** (16/10): bio e storie in evidenza → link di tracciamento → landing → canale
Telegram della creator → link di tracciamento OnlyFans. OnlyFans si nomina SOLO su Telegram,
mai sul profilo social. Ogni tappa ha il suo link misurato.

**Pubblicazione** (16/10): può essere automatica (Postiz per i social, bot HOC per
Telegram), ma solo DOPO l'approvazione di una persona in HOC Pro (`/admin/studio-social`).
Niente parte senza approvazione.

## La qualità è la differenza (decisione di Nicholas, 16/10/2026)

Quello che esce deve essere mozzafiato. L'etichetta AI va bene; gli errori no. In Studio
social un contenuto si programma solo con il **video montato** e quattro revisori:
conformità, voce e brand, **qualità** (solo «ok», con TUTTE le voci spuntate guardando il
video intero) e controllo tecnico (`scripts/controllo_video.py`). Voci della qualità:

- è lei, identica alle foto di riferimento, in ogni inquadratura (volto, corpo, capelli, nei);
- mani, dita, denti, occhi giusti; niente pelle di plastica né lineamenti che cambiano;
- vestiti, oggetti, luce, ambiente coerenti tra un taglio e l'altro;
- montaggio pulito: tagli a tempo, niente scatti, fermi, salti di colore;
- testi e sottotitoli senza refusi, a tempo, fuori dalle zone coperte da Instagram;
- audio pulito, voce sua o dichiarata;
- i primi 2 secondi fermano il pollice;
- se ci sono parti AI: etichetta AI prevista.

Con «attenzione» si rifà, non si pubblica. Il giudizio sulla somiglianza NON lo dà il
modello da solo (sbaglia): confronto affiancato con le foto e, nel dubbio, si chiede.

## Chi fa cosa

Skill di mestiere esterne (pacchetto "Social Media Skills" del catalogo Anthropic, se
installato; skill di Serge Bulaev già nel progetto):

| Lavoro | Skill esterna | Poi applica (regola HOC) |
|---|---|---|
| Identità del profilo | `brand-profile`, `voice-builder`, `content-pillars` | `references/identita.md` |
| Cosa funziona in nicchia | `viral-reverse-engineering`, `competitor-analysis`, `ig-hook-extractor`, `ig-audience-insights`, `tt-trend-mapper` | `references/ricerca.md` (multiplo, fonti HOC) |
| Ganci | `hook-writer`, `ig-hook-extractor`, `tt-hook-scripter` | famiglie HOC qui sotto |
| Script reel/TikTok | `reels-script`, `short-form-video-script`, `tiktok-script` | regole reel qui sotto |
| Bio e profilo | `profile-optimization`, `instagram-growth`, `tiktok-growth` | niente link/OF nel testo: la bio la decide il team |
| Piano settimanale | `content-calendar`, `batch-content-plan` | una variabile alla volta (`misura.md`) |
| Ogni testo, prima che esca | — | `references/italiano-umano.md` + `references/conformita.md` |
| Com'è andata | `analytics-and-reporting`, `content-audit` (solo metodo) | `references/misura.md` (dati CreatorsPro) |
| Strategia e obiettivi | `social-strategy`, `goals-and-kpis` | metrica guida = sub e click in bio per 1M view |
| Idee e format | `idea-generation-and-ideation`, `storytelling-and-narrative`, `meme-and-culture`, `contrarian-and-opinion`, `trend-jacking` | solo format da sola in casa; identità prima |
| Didascalie, storie, caroselli | `caption-writer`, `story-writer`, `carousel-writer`, `interactive-content`, `tiktok-photo-mode` | didascalia mai vuota, senza domande, 0-2 hashtag |
| Ricerca su Instagram/TikTok | `instagram-seo`, `social-seo`, `hashtag-strategy` | gli hashtag non danno reach [UFFICIALE] |
| Riprese e montaggio | `scripting-and-storyboarding`, `talking-head-and-piece-to-camera`, `capcut`, `captions-and-clipping`, `descript` | audio originale; sottotitoli corretti a mano in italiano |
| Test | `experimentation-and-ab-testing` | una variabile alla volta, ≥12 reel per lato |
| Riuso | `content-recycling`, `cross-platform-repurposing` | mai ripubblicare identico; TikTok più severo |
| Collaborazioni tra creator (S4S) | `collabs-and-cross-promotion` | vale il calendario S4S di HOC Pro (`/admin/s4s`) |
| Risposte, community, crisi | `reply-and-comment-writer`, `community-management`, `engagement-routine`, `crisis-and-moderation` | solo bozze, scrive una persona; mai automatico |
| X/Twitter | `x-growth` | conformità come Instagram |

**Da NON usare** (fuori dallo scopo): pubblicazione via WoopSocial, Publora o simili
(si usa Postiz, dopo approvazione); `social-selling-and-dm`, `lead-magnets-and-funnels`,
`creator-monetization` per spingere verso OF; qualunque automazione commento→DM; gli
"umanizzatori" inglesi sui testi italiani (sono ciechi: danno 100/100 a un testo da AI
tradotto). Se il pacchetto esterno non è installato, lavora con i riferimenti qui e
dichiaralo.

## Regole HOC

**Identità prima di tutto.** Si legge `~/.config/hoc/social/<handle>/identita.md` prima di
scrivere qualunque cosa; se manca, si costruisce (`references/identita.md`). Un reel che
potrebbe pubblicare qualunque ragazza carina è sbagliato anche se fa view.

**Il destinatario è lui.** Seconda persona, POV relazionali, gioco e complicità con chi
guarda. Contenuti "per ragazze" (tutorial trucco, GRWM generico) spostano il pubblico verso
le donne.

**Format, non post.** Idea ripetibile per un anno: premessa infinita · riconoscibile al
primo secondo · legata a lei · motivo per tornare · voglia di vederla altrove. Per ora solo
format che fa **da sola in casa**.

**Famiglie di gancio che reggono per noi** (studio creator italiane a pagamento, ott 2026):
personaggio in serie · indovinello "senza" · domanda che apre la chat (alta varianza:
max 1 su 5) · doppio senso di casa propria · confessione (pochi dati) · gioco con chi
guarda · battuta secca su di sé. Le formule esterne vanno bene se ricadono qui o se il
test le premia.

**Regole reel dai nostri dati** (stessa creator, `references/evidenze.md`): audio
originale di default (×1,18) · didascalia mai vuota (×0,76) ma senza domande (×0,85) ·
0-2 hashtag (≥3: ×0,81) · orario/durata non contano. Nessun invito al link. Ogni script
chiude con `PERCHÉ DOVREBBE FUNZIONARE` (col grado di certezza) e `CONFORMITÀ`.

**Gradi di certezza sempre dichiarati**: [UFFICIALE] · [NOSTRI DATI] · [OSSERVATO] ·
[IPOTESI]. Mai inventare numeri; se un dato manca, dire come si ottiene.

**Copiare la formula, mai il video.** Una creator = una cartella; mai mescolare voce o
riferimenti tra creator. Niente dati delle creator fuori da HOC.

## File di ogni creator

`~/.config/hoc/social/<handle>/`: `identita.md` · `ricerca.md` ·
`piano-AAAA-MM-GG.md` · `diario.md` (misure e decisioni).

## Soldi

CreatorsPro gratis. Radar HOC Pro prima di Apify; Apify fino a 30 $ a giro si procede,
sopra stima e OK di Nicholas; mai account Instagram personali. Giri ripetuti su API a
pagamento: stima e OK prima.
