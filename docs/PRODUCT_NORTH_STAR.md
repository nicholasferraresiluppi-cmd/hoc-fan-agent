# HOC Pro — Stella polare di prodotto

> **Vincolante come DESIGN.md lo è per la UI.** Ogni PR che aggiunge una pagina, una route o un concetto nuovo deve passare il filtro di questo documento. Nato dalla conversazione con Nicholas del 18 lug 2026 ("che non diventi un polverone") e dal benchmark ([BENCHMARK_DEEP_STUDY.md](BENCHMARK_DEEP_STUDY.md)): i prodotti studiati restano ordinati non perché fanno meno cose, ma perché sono organizzati per persone e oggetti, non per feature.
> Versione narrativa (pitch in 10 passi): artifact "HOC Pro — Il pitch".

## Cos'è (una frase)

**HOC Pro è il sistema operativo del ciclo di vita dell'operatore** — e della sua economia con le creator: entra → impara (Academy) → opera → è misurato (score) → è coachato → è pagato (comp) → cresce o esce (ladder, Action Center). Ogni modulo è una stazione di questo ciclo; ogni stazione produce e consuma gli stessi dati.

## Cosa NON è (confini espliciti)

- **Non è un ATS** — il recruiting resta su Teamtailor.
- **Non è project management** — resta su ClickUp.
- **Non è contabilità/payroll esecutivo** — Roberta/Ilaria hanno i loro strumenti; HOC Pro calcola e spiega, non emette.
- **Non è un tool di chatting** — Infloww resta la superficie operativa; HOC Pro la legge, non la replica.
- **Non è un CRM dei fan** — i fan sono dati di contesto, mai oggetto gestito.

Se una proposta ricade in uno di questi cinque, la risposta di default è: si integra, non si costruisce.

## Gli oggetti canonici

Ogni pagina è una **vista su un oggetto**, mai una feature a sé. Gli oggetti riconosciuti oggi:

| Oggetto | Chiavi/luogo | Note |
|---|---|---|
| **Operatore** | `employee_profile:*`, scheda `[employee]` | il centro di gravità dell'app |
| **Creator** | anagrafica + mapping CP↔Infloww | l'altra metà dell'economia |
| **Periodo** | `ops_kpi:{pt}:{pid}`, `wages:{pid}` | l'unità temporale di ogni misura |
| **Score + formula** | `leaderboard-config`, `ops_kpi:score_snapshot:*`, `ops_kpi:score_draft:*` | la formula è versionata e ha un lifecycle |
| **Payout** | costanti comp + (futuro) statement per operatore | deriva da periodo × creator × scaglioni |
| **Azione di coaching** | Coaching/Action Center (object model in evoluzione) | cfr backlog benchmark #3 |
| **Contestazione** | policy in [CAREER_LADDER.md §8.2](CAREER_LADDER.md) (build futuro) | correzioni tracciate, mai silenziose |
| **Livello/gate** | [CAREER_LADDER.md](CAREER_LADDER.md) | la carriera come dato, non come opinione |

**Regola:** una feature nuova si aggancia a un oggetto esistente. Se serve un oggetto nuovo, la PR lo dichiara qui.

## Le tre superfici (per persona, non per feature)

Allineate agli scope RBAC già esistenti (own/team/all):

1. **Operatore** (scope own) — il *mio* score spiegato, il *mio* payout, la *mia* ladder, il *mio* training. Oggi quasi assente: è la fase di apertura agli operatori.
2. **Cockpit** (scope team) — TL/CM: team live, coaching, segnali, supervisioni. Seme già esistente: `/cm-cockpit`.
3. **Console** (scope all) — board/admin: config, calibrazione, import, audit. È il 95% dell'app attuale, ed è corretto così finché gli utenti sono il board.

Il riordino della navigazione per superficie si fa **quando si onboardano i primi operatori**, non prima.

## La regola anti-polverone

> **Nessuna pagina nuova senza: (a) una persona che la usa, (b) un oggetto canonico a cui si aggancia, (c) un processo (settimanale/mensile) in cui vive.**

È l'operativizzazione dei trigger anti-feature già in uso (no user, no processo, no metric → non si costruisce). In PR: la sezione Self-review dichiara persona/oggetto/processo in una riga.

## Precedenti che questa stella polare codifica

- **Potatura lug 2026** (decision log): 14 route morte rimosse — potare fa parte del metodo.
- **Governance formula** (PR #29/#30): snapshot e bozze si agganciano all'oggetto "formula score" ed entrano nel processo di governance dei cambi — l'esempio di come si aggiunge senza sprawl.
- **Separation policy** (gap #10 benchmark): prima dell'onboarding operatori va scritto quali numeri vivono in framing competitivo/pubblico (leghe) e quali in framing privato/amministrativo (gate, comp, HR).
