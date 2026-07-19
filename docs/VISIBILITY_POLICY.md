# Policy di visibilità dei numeri (separation policy)

> Chiude il gap #10 del benchmark ([BENCHMARK_DEEP_STUDY.md](BENCHMARK_DEEP_STUDY.md)): HOC Pro combina classifiche, conseguenze comp e pipeline HR sulla stessa superficie di score — nessuno dei 12 prodotti studiati lo fa, e la dottrina SalesScreen documenta perché il mix non governato distrugge la fiducia ("surveillance feel", winner-takes-all). Questa policy stabilisce **quale numero vive in quale regime**, PRIMA dell'apertura agli operatori.
> Decisa da Claude su mandato esplicito di Nicholas (carta bianca, 2026-07-18). Rivedibile dal board; vincolante per le build fino a revisione.

## I due assi

**Scope** (chi vede il dato): `own` — il mio · `team` — il mio team (TL/CM) · `all` — management (admin/SM/QA).
**Framing** (come è presentato): **competitivo/pubblico** (classifiche nominative, gare, celebrazioni) vs **amministrativo/privato** (numeri con conseguenze, visti solo da chi di dovere).

## La regola madre

> **Un numero con conseguenze HR o comp vive SOLO in framing amministrativo.** Il framing competitivo è riservato ai numeri senza conseguenze dirette (training, gamification). Se un numero "di gioco" acquisisce conseguenze, va prima rimosso dal framing pubblico.

## La matrice

| Dato | own (operatore) | team (TL/CM) | all (mgmt) | Framing pubblico tra pari |
|---|---|---|---|---|
| **Denaro** (venduto, payout, scaglioni) | ✅ breakdown completo del proprio: venduto per turno → scaglione → importo, stima mese in corso | aggregati team (cockpit) | ✅ invariato | ❌ **mai** — nessuna classifica sul denaro |
| **Score operativo** (mestiere) | ✅ spiegato: valore, tier, composizione per KPI, storico, formula del periodo (snapshot) | ✅ team | ✅ invariato | ⚠️ solo la **propria posizione relativa** (tier + percentile nel team), MAI la lista nominativa degli score altrui |
| **Score CP / venduto relativo** | proprio tier, senza importi altrui | team | ✅ | ❌ |
| **Ladder / gate** | ✅ il proprio progresso: livello, requisiti, finestra mesi, cosa manca | team | ✅ | solo le **promozioni** si annunciano (celebrazione); i progressi/respinti mai |
| **QA conversazionale** | ✅ esiti propri con rubrica ed evidenze | le review del proprio team | ✅ | ❌ mai tra pari |
| **Coaching** | ✅ le proprie sessioni + acknowledgement/replica | le sessioni erogate | ✅ | ❌ |
| **Dispute/contestazioni** | ✅ le proprie + stato + esito | — | ✅ coda completa | ❌ |
| **Training/leghe/badge** | ✅ | ✅ | ✅ | ✅ **è il posto della gara**: leghe, hall of fame, badge wall — nessuna conseguenza HR diretta |

Razionale della riga più delicata (score): l'operatore deve capire **il proprio** score al punto da poterlo contestare (spiegabilità, [CAREER_LADDER §8.2](CAREER_LADDER.md)) — ma la classifica nominativa completa è uno strumento di management, non un tabellone di gara: lo score alimenta i gate di promozione, e un numero che decide carriere esposto come gara produce esattamente i failure mode documentati (gaming, demotivazione del 60-70% centrale, sfiducia).

## Invariante tecnico dello scope own

> **L'identità la risolve sempre il server.** Le API `/api/me/*` derivano l'operatore dall'utente Clerk autenticato (mapping profilo), **mai** da un parametro del client. Un endpoint own non accetta `?employee=`: chi sei lo decide la sessione, non la query.

Corollari: (a) se l'utente non è mappato a un operatore, own risponde con stato "non collegato" (mai dati di altri); (b) le route own non richiedono capability speciali — solo auth — perché per costruzione non possono esporre dati altrui; (c) il mapping utente↔operatore è gestito solo da admin.

## Cosa cambia per le pagine esistenti

- Le classifiche denaro/score restano gated `authorizeAll(SCORES_VIEW)` (PR #24) — nessuna riapertura.
- Le pagine training restano auth-only (framing competitivo legittimo).
- La superficie operatore nuova (`/me/*`) è auth-only + risoluzione server-side dell'identità.
