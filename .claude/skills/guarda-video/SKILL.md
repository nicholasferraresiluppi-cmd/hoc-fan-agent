---
name: guarda-video
description: >-
  Dà gli occhi a Claude sui video: da un link di un reel Instagram, di un video YouTube,
  di un mp4 o da un file locale ricava fotogrammi (con il secondo scritto sopra) e, se c'è
  la chiave Gemini, parlato e testi a schermo; poi Claude guarda e racconta. Usala quando
  qualcuno manda un link di un reel/video e chiede "guarda questo", "cosa c'è in questo
  reel", "di cosa parla", "trascrivi", "vale la pena guardarlo", "cosa fanno nei primi
  secondi", o quando serve guardare un reel di una creator (Radar, Studio social, analisi
  dei concorrenti) invece di leggerne solo la didascalia.
---

# Guarda video

Lo strumento è `scripts/guarda-video.mjs` (Node, nessuna dipendenza; servono `ffmpeg` e `ffprobe`).
Il lavoro è diviso così: **Gemini guarda il video intero e racconta, Claude controlla sui fotogrammi**.
Gemini vede movimento, montaggio, audio e tempi (Claude il video non lo guarda e non sente l'audio);
i fotogrammi sono gli occhi di Claude per verificare quello che Gemini dice (anche Gemini sbaglia).

## La regola di qualità (fissa, decisa da Nicholas)

La densità è **al secondo, uguale per ogni durata**: un reel da 3 secondi e uno da 3 minuti si guardano
allo stesso modo. Un video più lungo costa più tempo, non perde qualità.
- **Gemini: 5 immagini al secondo** + audio continuo, a pezzi da 30 secondi (ognuno alla stessa frequenza).
- **Claude: 2 fotogrammi al secondo** + uno subito dopo ogni taglio.
- Sopra i 3 minuti lo script chiede `--lungo`: si usa solo se la persona vuole davvero tutto il video.
Non abbassare queste cifre per fare prima. I valori stanno in cima allo script (`GEMINI_FPS`, `CLAUDE_FPS`).

## Giro

1. Lancia lo script col link (o il file) e, se c'è, la domanda della persona:
   ```bash
   node scripts/guarda-video.mjs "<link>" --domanda "<cosa vuole sapere>"
   ```
   Stampa un JSON: `cartella`, `meta` (autore, didascalia, visualizzazioni, like, audio…),
   `video` (durata, tagli), `fogli` (immagini 3×3 di fotogrammi), `gemini.file`, `problemi`.
2. Se c'è `gemini.file`, leggilo per primo: scene, tagli, gancio, parlato, testi a schermo, audio,
   tutto con i secondi.
3. Apri **tutti** i `fogli` con Read, in ordine (9 fotogrammi a foglio, ognuno col secondo in alto a
   sinistra; un fotogramma ogni 0,5 s). Per un dettaglio, apri il singolo file in `cartella/fotogrammi/`.
4. **Incrocia**: per ogni affermazione di Gemini che conta (una scritta, un gesto, chi c'è, un taglio)
   guarda il fotogramma di quel secondo. Se non torna, vale quello che vedi tu e nella risposta lo dici
   («Gemini dice X al secondo 4, ma nel fotogramma non c'è»). Quello che si sente (parlato, musica) lo
   sa solo Gemini: riportalo come suo.
5. Leggi `problemi` e dillo nella risposta se manca qualcosa (es. "il parlato non l'ho sentito").

## Risposta (in italiano)

- **Cosa si vede** — la sequenza, con i secondi dei momenti importanti.
- **Cosa si dice** — dal parlato di Gemini; se non c'è, dillo, non immaginarlo dalle immagini.
- **Didascalia** — da `meta.didascalia`, se è un post.
- **Numeri** — visualizzazioni, like, commenti, se ci sono (sono quelli pubblici del momento).
- Chiudi con **"Vale la pena guardarlo?"**: sì/no e il perché in una frase.

Se la persona chiede altro (trascrizione, ricetta, confronto tra più reel, gancio dei primi 3 secondi),
rispondi a quello. Con più link: lancia lo script per ognuno, poi confronta.

## Regole

- **Mai inventare**: quello che non si vede nei fotogrammi o non è nel parlato di Gemini non si scrive.
  Tra due fotogrammi non sai cosa succede: dillo se conta.
- **Privacy**: con la chiave gratuita Google può usare i video. Lo script manda a Gemini da solo SOLO
  i link pubblici; un file locale ci va solo con `--gemini`. Non usare `--gemini` su video non ancora
  pubblicati delle creator (Studio social, materiale del team): per quelli bastano i fotogrammi.
- Solo lettura: niente like, commenti, follow o messaggi. Profili privati e storie non si aprono.
- Niente video nel repo: lo script scrive nella cartella temporanea del sistema (`--out` per cambiarla).

## Chiavi e rete

- `APIFY_TOKEN` (link Instagram, ~0,3 cent a reel con `apify/instagram-scraper`) e `GEMINI_API_KEY`
  (facoltativa; chiave gratuita da https://aistudio.google.com/apikey). Lo script le legge dalle
  variabili d'ambiente, da `.env.local`/`.env` del repo o da `~/.config/hoc/*.env`.
  `GEMINI_MODEL` facoltativa: se il modello non esiste lo script ne sceglie uno "flash" dall'elenco.
- **Senza `APIFY_TOKEN` ma con il connettore Apify** (MCP): chiama `apify/instagram-scraper` con
  `{"directUrls": ["<link>"], "resultsType": "posts", "resultsLimit": 1}`, prendi `videoUrl` e
  didascalia dal dataset e passa SUBITO `videoUrl` allo script (il link firmato scade dopo poco);
  la didascalia la riporti tu.
- **YouTube**: con `yt-dlp` installato si scarica e si hanno i fotogrammi; senza, Gemini legge il
  link da solo (solo video pubblici) e non ci sono fotogrammi.
- **Ambiente cloud**: la rete può bloccare i domini. Servono `api.apify.com`, `*.fbcdn.net` e
  `*.cdninstagram.com` (video Instagram), `generativelanguage.googleapis.com` (Gemini), e per YouTube
  `*.youtube.com`/`*.googlevideo.com`. Se lo script dice "rete: … non raggiungibile", nomina l'host
  alla persona: si aggiunge nelle impostazioni dell'ambiente (Network access → Allowed domains).
