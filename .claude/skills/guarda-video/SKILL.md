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
Il lavoro è diviso così: **lo script prende il video e ne fa i fotogrammi, Claude li guarda**.
Gemini serve solo per l'AUDIO (parlato, musica) e per i testi a schermo letti su tutto il video:
Claude non sente l'audio.

## Giro

1. Lancia lo script col link (o il file) e, se c'è, la domanda della persona:
   ```bash
   node scripts/guarda-video.mjs "<link>" --domanda "<cosa vuole sapere>"
   ```
   Stampa un JSON: `cartella`, `meta` (autore, didascalia, visualizzazioni, like, audio…),
   `video` (durata, tagli), `fogli` (immagini 3×3 di fotogrammi), `gemini.file`, `problemi`.
2. Apri **tutti** i `fogli` con Read, in ordine: ogni riquadro porta il secondo in alto a sinistra.
   I primi 3 secondi sono a passo di 0,5 s (il gancio), poi a passo regolare, più un fotogramma dopo
   ogni taglio. Per un dettaglio, apri il singolo fotogramma in `cartella/fotogrammi/`.
3. Se c'è `gemini.file`, leggilo: parlato con i secondi, testi a schermo, audio.
4. Leggi `problemi` e dillo nella risposta se manca qualcosa (es. "il parlato non l'ho sentito").

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
