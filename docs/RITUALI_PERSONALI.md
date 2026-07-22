# Rituali personali — ADR (CRAWL v1)

Modulo **personale** dentro HOC Pro: centro controllo delle proprie abitudini (allenamento, alimentazione, mente) con un **avatar umano che evolve a tratti** in base a ciò che fai. Mono-utente, gated admin, **isolato dai dati HOC** (nessun contatto con score/comp/creator).

È il **CRAWL** dello staging deciso il 21/07/2026 (vedi ricerca "sistema operativo della persona"): loop identità→abitudini→feedback che *suggerisce*, tutto in casa, zero rischio legale. Il WALK (integrazioni API con conferma) e il RUN (automazione condizionata) vengono dopo e NON sono in questa v1.

## Decisioni (dalla ricerca)

- **Non punitivo**: nessuna "morte"/castigo. La metrica è l'**adherence %** su finestra mobile 30 giorni, non lo streak secco. I giorni prima del primo utilizzo non contano (niente 3% punitivo all'avvio). Lo streak è un contatore *secondario*.
- **Trait accretion per pilastro** (idea di Nicholas, precedente Fable/Sims 4): ogni pilastro ha una traccia visiva indipendente sull'avatar. Livello 0..4 calcolato sui completamenti *trailing 30 giorni* → **decade piano se molli, mai punizione istantanea** (modello muscolo Sims 4).
- **Guardrail estetici duri**: la crescita è resa da **postura, energia/luce, forza, oggetti** (occhiali dalla lettura), **MAI da peso o tono della pelle** (critica razziale a Fable II; stigma body-image nelle weight app). L'avatar v1 esprime la vitalità come *luce/luminosità*, non come colore epidermico.
- **Avatar v1 = SVG parametrico** (paper-doll a layer, costo lineare). L'arte pittorica curata è un passo successivo; questa v1 è il placeholder funzionale onesto.
- **Mobile**: pagina responsive (usabile da telefono via login browser). PWA installabile + reminder cron/email = v1.2/v1.3, non ora.

## Modello dati (KV)

- `rituali:{userId}:config` — `{ pillars:[{id,label,trait}], habits:[{id,pillar,label}], createdAt }`. Seed di default al primo accesso.
- `rituali:{userId}:log:{YYYY-MM}` — bucket mensile `{ "YYYY-MM-DD": { done:[habitId], ts } }`.

Identità risolta **sempre server-side** da `auth()` (userId), mai dal client. Gate: `isUserIdAdmin` (feature board/personale). Dati chiavati per `userId`: ogni admin ha i propri, nessuno vede quelli altrui.

## Superficie

- `GET /api/me/rituali?date=YYYY-MM-DD` → `{ config, today:{date,done,journal}, adherence, streak, traits }`.
- `POST /api/me/rituali` `{ date, habitId, done? }` → toggle abitudine (preserva il diario del giorno).
- `POST /api/me/rituali` `{ date, journal:{mood,effort,note} }` → salva/aggiorna il **diario** del giorno (merge). WALK step 1: il check-in qualitativo consigliato dalla ricerca (umore + "quanto ti è costato" + nota).
- Pagina `src/app/me/rituali/page.js` (client, SWR, optimistic toggle + diario con salvataggio automatico).
- Componente `src/components/RitualiAvatar.js` (SVG parametrico: forza→corporatura, vitalità→luce, lettura→libro/occhiali, adherence→postura+aura+anello).
- Nav: voce "I miei rituali" in "Il mio quadro" (`Sidebar.js`), visibile solo agli admin.

## Non fa (per scelta, v1)

- Nessuna azione autonoma, nessuna integrazione esterna, nessun food-photo→calorie (sbaglia 100%+ → romperebbe i tratti).
- Nessun editor di abitudini in UI (config di default fissa; editing = passo successivo).
- Nessuna dipendenza npm nuova.
