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

## 4. Identità della persona (decisione aperta)

`personId` deve essere stabile e joinabile con il resto di HOC Pro. Oggi coesistono tre identificatori: **nome operatore** (chiave di `employee_profile:{name}`, score history, wage CP), **Clerk userId** (`roles:{userId}`), **Infloww employeeId** (`/admin/user-mapping`).

**Proposta:** `personId = employeeId Infloww` (id macchina stabile, non cambia con rinomine) come chiave primaria, con il nome canonico come display e ponte di join finché la consolidazione identità non è completa. Lo schema non impone la scelta: `person-events.js` riceve un `personId` già risolto dal chiamante. **Da confermare** con Nicholas prima di scrivere il primo evento — è la scelta più costosa da invertire dell'intero disegno.

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

## 6. Cosa è costruito ora / cosa no

**Ora (questo PR):** lo schema — enum livelli, tassonomia eventi, key builder, validazione, proiezione dello stato (`deriveState`). Puro, testato, **inerte**: nessuna scrittura KV.

**Prossimo (dopo conferma ADR + identità §4):**
1. Percorso di scrittura: `appendPersonEvent()` + reindex proiezione (una modifica al modello dati KV → è il punto in cui questo diventa one-way semi).
2. Backfill one-shot dalle fonti §5.
3. Scheda persona 360 (`/admin/persone/[id]` nel gruppo People) che legge eventi + stato + performance (score/comp già esistenti) e rende la timeline.
4. Progression engine (fase 3): calcola i gate del ladder e appende `level_change`/`step_change`. **Le soglie dei gate restano decisione HR/board** (ladder §11 #2/#3/#7) — lo schema le implementa, non le fissa.

## 7. Reversibilità, trigger, sunset

- **One-way semi:** finché è solo schema (ora) è banale da rimuovere. Dal primo evento scritto in `person:*` diventa semi-invertibile (dati reali di persone → vanno migrati/archiviati, non cancellati alla leggera).
- **Trigger di re-evaluation:** dopo il backfill + prime 4 settimane della scheda 360, verificare che la timeline sia effettivamente usata in una decisione di livello reale. Se no, è debito.
- **Sunset:** se il progression engine non parte entro il lancio del ladder, lo store resta come sola timeline anagrafica (comunque utile) — non si costruiscono gli eventi di gate a vuoto.

## 8. Domande aperte per Nicholas / board

1. **Identità (§4):** confermi `employeeId` Infloww come `personId`, o preferisci nome canonico / userId Clerk?
2. **Perimetro backfill:** al primo popolamento importiamo tutte le fonti §5, o partiamo da un sottoinsieme (es. solo hire + certificazioni) per validare la scheda?
3. **Chi scrive gli eventi manuali** (onboarding, mentoring, offboarding): HR execution (Aila) o il Team Lead? — determina i permessi di scrittura.
4. Le **soglie dei gate** restano come da ladder §11 (aperte, da calibrare su finestra 6 mesi post-import giu/lug): confermato che lo schema non le anticipa.

## 9. Fonti

`docs/CAREER_LADDER.md` (livelli, gate, ciclo di vita, policy dispute §8.2, requisiti legali §8.3) · `src/lib/certifications.js` (tier certificazioni esistenti) · pattern append-only + audit già in uso in HOC Pro (score snapshot, `audit:leaderboard-actions`).
