# Event-store persona — schema del "CRM persone"

**Stato:** PROPOSED (schema stabile pronto; percorso di scrittura da approvare)
**Data:** 2026-07-20 · **Owner decisione:** Nicholas · **DRI stesura:** Claude
**Reversibilità:** one-way *semi* (nuovo namespace KV `person:*`) → questo documento è il decision record; l'implementazione della scrittura parte solo dopo conferma.
**Schema in codice:** [`src/lib/person-events.js`](../src/lib/person-events.js) (definizioni pure, già in repo, inerti finché non si cabla la scrittura).

---

## 1. Contesto

Lo studio "abbiamo un CRM?" (lug 2026) ha separato due domande. Sul **fan** la risposta è stata: il CRM operativo esiste già (Infloww), noi costruiamo solo la lente di retention aggregata (`/admin/retention`). Sulle **persone** invece c'è un vero pezzo mancante: HOC Pro sa tutto della *performance* di un operatore (score, comp, tier) ma non tiene una **timeline del suo ciclo di vita** — assunzione, onboarding, certificazioni, promozioni, coaching, uscita. La "scheda persona 360" che servirebbe per una decisione di livello/rinnovo poggia proprio su questa timeline, che oggi non è un dato.

Il career ladder (`CAREER_LADDER.md`) è l'artefatto sorgente: definisce livelli, gate e ciclo di vita. **Questo event-store è la sua implementazione software.** Ogni gate superato, ogni certificazione, ogni sessione di coaching è un evento della timeline.

Decisione di sequenza (Nicholas, 2026-07-20): *chiudere prima lo schema in forma stabile* — cioè fissare la tassonomia eventi e l'enum livelli — così il modello dati nasce solido, prima di scriverci sopra. Questo documento è quella chiusura.

## 2. Decisione

Un **event-store append-only per persona**: la timeline è una sequenza immutabile di eventi; lo **stato corrente** (livello, step, status) è una **proiezione** derivata dagli eventi, non un campo scritto a mano. Stessa invariante della policy dispute del ladder (§8.2): *nessun cambiamento silenzioso* — lo storico non si riscrive in-place, si appende.

Perché append-only e non una tabella di stato mutabile:
- Il ladder **richiede** storia ricostruibile (ri-valutazione gate on-correction, appello operatore, difendibilità legale §8.3): servono gli eventi, non solo l'ultimo stato.
- Una promozione è un fatto sociale e contrattuale (ladder §8.2): va registrata come evento datato, non dedotta da una soglia che oggi torna e domani no.
- Il backfill dai dati esistenti (sotto) è naturale come stream di eventi.

## 3. Schema

### 3.1 Livelli (enum)
`L0` Trainee · `L1`/`L2`/`L3` Sales Operator I/II/III · `L4a` Team Lead · `L4b` Senior Sales Specialist · `L5` Sales Manager · `L6` Head of Sales. Doppio binario a L4 (a=gestione, b=esperto): stesso `order`, track diverso. L1-L3 hanno 3 Steps interni. Fonte: ladder §3/§5.

### 3.2 Tassonomia eventi (16 tipi, 5 categorie)
| Categoria | Eventi |
|---|---|
| lifecycle | `hire`, `onboarding_phase`, `graduation`, `checkin`, `offboarding` |
| development | `level_change`, `step_change`, `certification`, `mentoring`, `band_assignment` |
| quality | `qa_review`, `coaching_session`, `dispute_opened`, `dispute_resolved` |
| hr | `hr_action`, `note` |

Forma canonica evento: `{ id, type, at (ms), by (userId|system), source, payload }`. Payload atteso per tipo + valori chiusi (fasi onboarding A-D, tier cert base/expert/master, direction promotion/correction/demotion, milestone 2w/30d/60d/90d) sono definiti e validati in `person-events.js`.

### 3.3 Chiavi KV (namespace nuovo `person:*`)
- `person:events:{personId}` — lista append-only degli eventi
- `person:state:{personId}` — proiezione dello stato corrente (cache; ricostruibile dagli eventi)
- `person:index` — set dei personId

Nessuna di queste esiste oggi: namespace pulito, nessuna migrazione di dati esistenti richiesta.

## 4. Identità della persona — DECISO

`personId = employeeId Infloww` (Nicholas, 2026-07-20). Id macchina stabile, non cambia con rinomine, già chiave dell'attribuzione KPI. Il nome canonico resta come display e ponte di join con le fonti keyed-by-name (`employee_profile`, score history) via il mapping `/admin/user-mapping`. `person-events.js` riceve un `personId` già risolto: il resolver name→employeeId vive nel write-path/backfill, non nello schema.

## 5. Backfill — dati esistenti → eventi

Buona parte della timeline è già in HOC Pro e diventa eventi al primo popolamento (nessun dato inventato):

| Evento | Fonte esistente |
|---|---|
| `hire`, `note` | `employee_profile:{name}` (start_date, note) |
| `certification` | `certifications.js` (badge per creator) |
| `qa_review` | `/admin/qa-reviews` |
| `coaching_session` | `cm:sup:*`, `/admin/coaching-sessions` |
| `dispute_opened/resolved` | `/admin/disputes` |
| `hr_action` | `action_center:*` |

Mancano a oggi (richiedono cattura nuova, fase 2/3): `onboarding_phase`, `graduation`, `level_change`, `step_change`, `mentoring`, `checkin`, `offboarding`. Sono gli eventi del **progression engine**, che nasce con questo store.

### 5.1 Stato dati a oggi (2026-07-20) — le fonti sono vuote

Verifica diretta sul KV di produzione (dry-run del backfill): il roster conta **410 operatori** (il resolver identità funziona), ma **tutte e 6 le fonti timeline sono vuote** — nessun `employee_profile`, `cert`, `qa:review`, `coaching:session`, `dispute`, `action_center`. Coerente con lo stato del prodotto (people-feature costruite ma non ancora in uso: nessun operatore onboardato, 5-10 utenti reali del board).

**Conseguenza operativa:** il backfill oggi è un **no-op** (scrive 0 eventi) e la scheda 360 sarebbe vuota per tutti. L'infrastruttura (schema + write-path + backfill + route) è costruita e verificata a vuoto; **si popola da sola** man mano che le people-feature vengono usate (si crea un profilo, si registra una QA, si logga un coaching → l'evento entra). Il "CRM persone" non è un problema di build, è un problema di **adozione a monte**: la timeline esiste nel momento in cui il team comincia a usare gli strumenti HR già presenti. La **scheda 360** si costruisce quando c'è dato da mostrare (ri-lanciando il backfill dopo i primi profili/QA reali).

## 6. Cosa è costruito ora / cosa no

**Costruito e verificato (PR schema + PR store):**
1. Schema — enum livelli, tassonomia eventi, validazione, proiezione stato (`deriveState`). Puro, testato.
2. Write-path — `src/lib/person-store.js`: resolver identità (nome→employeeId via roster, verificato su 410 operatori), `writePersonEvents`/`appendPersonEvent` idempotenti (id evento deterministico → backfill ri-eseguibile), letture + proiezione cachata.
3. Backfill — `src/lib/person-backfill.js` + route `POST/GET /api/admin/person-backfill` (SEED): legge tutte le 6 fonti, mappa a eventi, dry-run + reale. **Oggi no-op** (fonti vuote, §5.1).
4. Scheda 360 — `/admin/persone` (indice: roster + persone con timeline + trigger backfill + ricerca) e `/admin/persone/[id]` (timeline lifecycle + stato + link alla scheda performance esistente). SEED. **Stati vuoti espliciti**: con le fonti vuote la timeline è vuota e la pagina lo dichiara — nessun dato finto. Si accende sull'adozione.

**Prossimo (quando c'è dato / dopo calibrazione gate):**
5. Write online dalla UI con capability `people.events.write` (HR = lifecycle, TL = development/quality del proprio team, decisione §8).
6. Progression engine: calcola i gate e appende `level_change`/`step_change`. Parte **dopo la calibrazione delle soglie** (ladder §11) — lo schema le implementa, non le fissa.

## 7. Reversibilità, trigger, sunset

- **One-way semi:** finché è solo schema (ora) è banale da rimuovere. Dal primo evento scritto in `person:*` diventa semi-invertibile (dati reali di persone → vanno migrati/archiviati, non cancellati alla leggera).
- **Trigger di re-evaluation:** dopo il backfill + prime 4 settimane della scheda 360, verificare che la timeline sia effettivamente usata in una decisione di livello reale. Se no, è debito.
- **Sunset:** se il progression engine non parte entro il lancio del ladder, lo store resta come sola timeline anagrafica (comunque utile) — non si costruiscono gli eventi di gate a vuoto.

## 8. Decisioni (Nicholas, 2026-07-20)

1. **Identità (§4):** ✅ `personId` = **employeeId Infloww**.
2. **Perimetro backfill:** ✅ **tutte le fonti §5 subito** (ogni mapping va verificato in dry-run su dati reali prima della scrittura effettiva).
3. **Chi scrive gli eventi manuali:** ✅ **HR + TL con permessi distinti** — HR execution per lifecycle (hire/onboarding/offboarding), Team Lead per development/quality del proprio team (mentoring/coaching). Serve capability RBAC dedicata (`people.events.write`) con scope by-team per il TL.
4. **Soglie dei gate:** restano come da ladder §11 (aperte, da calibrare su finestra 6 mesi post-import giu/lug) — lo schema non le anticipa. Il progression engine (che appende `level_change`/`step_change`) parte dopo la calibrazione.

## 9. Fonti

`docs/CAREER_LADDER.md` (livelli, gate, ciclo di vita, policy dispute §8.2, requisiti legali §8.3) · `src/lib/certifications.js` (tier certificazioni esistenti) · pattern append-only + audit già in uso in HOC Pro (score snapshot, `audit:leaderboard-actions`).
