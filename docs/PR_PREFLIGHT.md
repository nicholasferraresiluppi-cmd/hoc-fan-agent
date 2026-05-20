# PR Pre-flight Checklist — HOC Fan Agent

Lista da consultare prima di chiudere una PR che tocca UI o API della leaderboard.
Aggiornata in base ai bug emersi durante lo sviluppo: ogni nuovo bug → nuova
voce in questa checklist, così non si ripete.

## Come si usa

1. Mentre scrivi la PR description, copia i bullet rilevanti come sezione **"Self-review"** spuntando ciò che hai verificato
2. Se uno non si applica, marcalo `N/A — motivo`
3. Se non sai, **vai a verificarlo** prima del merge

Non è perfetto, ma è meglio di niente. Le voci nuove vanno aggiunte in fondo alle sezioni, datate.

---

## 1. Filtri e count

Bug ricorrenti, tutti riscontrati su `/leaderboard/operational`.

- [ ] **Ogni pill filtro ha un count** anche le pill "Tutte" / "Tutti" / catch-all. Il count vuoto è di solito sintomo di `value=""` saltato da un `&&`
- [ ] **La somma dei count delle pill = count "Tutte"** — se non torna, manca un bucket (es. "Senza categoria", "Senza lingua", "Unknown")
- [ ] **Count delle pill NON selezionate non cambia** quando applichi un filtro. Se cambiano, sono calcolati sui filtri attivi invece che globali → spostare il calcolo prima dei filtri di vista
- [ ] **Filtri combinati funzionano** (es. ITA + Big = solo Big ITA, non solo l'ultimo)
- [ ] **Empty state filtro** mostra messaggio sensato (es. "Nessun operatore con questi filtri") con CTA per allentare il filtro
- [ ] **Reset filtri**: c'è un modo per tornare a "Tutte"? È evidente?

## 2. Posizionamento e gerarchia visiva

- [ ] **Sezioni admin importanti non in fondo alla pagina** (es. "Top 10 da cambiare" deve essere in alto). Regola: se l'admin la userebbe in un compito ricorrente, va in alto-zona-azione
- [ ] **Differenza visiva tra ambito pubblico e admin-only** (badge "admin only", colore diverso, sezione separata)
- [ ] **Health bar e summary card non sono sotto un fold da scrollare**
- [ ] **Drill-down sempre raggiungibile**: ogni nome operatore in tabella è cliccabile e va al drill-down

## 3. Stati: loading, empty, error

- [ ] **Loading state** esplicito (skeleton o "Caricamento…") quando SWR è `!data && !error`
- [ ] **Empty state** specifico per ogni vista: "nessun dato per questo periodo / filtro / Group" con CTA (es. "Importa CSV →", "Vai a categorie →")
- [ ] **Error state** mostra `data.error` se l'API ritorna errore, non solo network error
- [ ] **First-render senza dati storici**: la pagina non crasha se è il primo periodo importato (no health bar, no underperformers, ma il resto funziona)

## 4. Aggregati e dati derivati

- [ ] **Numeri grezzi vs derivati**: chiaro quale è quale? (es. `Score = somma pesata`, `% impatto = stima` con marker)
- [ ] **Stima vs esatto**: marker visivo distinto (es. tag `~STIMA`, non solo `~` davanti che si confonde col `-` negativo)
- [ ] **Distribuzione equa**: dove l'aggregato è una stima ("operatore N creator → /N a ciascuno"), nota nel tooltip + indicatore visivo
- [ ] **Sommario in alto coerente con tabella sotto**: se la summary dice "5 Elite", contali nella tabella

## 5. Esclusioni e visibilità

- [ ] **Esclusioni hanno una vista audit** per vedere chi è escluso e perché
- [ ] **Score = 0 nascosti by default** ma raggiungibili via flag (`include_zero=1`)
- [ ] **Differenza chiara tra esclusione totale e ignora-da-questa-lista**: il pannello "da cambiare" ha esclusione vs ignora? Sì → kebab con entrambe le opzioni etichettate
- [ ] **Cron exclusions/categorizzazione non vanno persi al re-import** (storage indipendente in KV)

## 6. Capability e RBAC

- [ ] **Capability check sia BE che FE**: il backend rifiuta con 403, il frontend non mostra il pulsante in primo luogo
- [ ] **Niente leak di feature admin**: per un utente non-admin la pagina è identica a prima del cambio. Test con account secondario
- [ ] **Pagina admin in `/admin/*` ha sempre `<AdminNav />`** in alto per navigazione
- [ ] **Link admin (es. "⚙️ Gestisci…") visibili solo se canExclude/admin**

## 7. Anagrafica e profili

- [ ] **start_date manuale ha priorità** sul fallback "primo periodo visto"
- [ ] **Fallback è marcato come "(stima)"** così l'utente sa che non è una data reale
- [ ] **Profilo senza KPI**: la pagina drill-down funziona anche se non c'è storico (solo player card vuota)
- [ ] **Nome operatore con caratteri speciali**: testato URL con `encodeURIComponent` (apostrofi, accenti, ecc.)

## 8. Performance e cache

- [ ] **Helper cross-period (loadHistoryForEmployee, loadGlobalHealthHistory) usano cache** TTL 5min in-memory
- [ ] **SWR `revalidateOnFocus: false`** sulle pagine pesanti
- [ ] **N+1 chiamate KV**: per vista che richiede multi-periodo, pre-load i ranking una volta (`Promise.all`) invece che per ogni candidato

## 9. Linguistico e copy

- [ ] **Italiano coerente** in copy UI (no "submit" / "save" / "loading...")
- [ ] **Numeri formattati it-IT** (separatori italiani: `1.234,5`, non `1,234.5`)
- [ ] **Date in formato breve italiano** (`19/05/2026`)

---

## Heuristics Nielsen filtrate per HOC

Domande da farsi prima del merge UI:

1. **Visibility of system status**: dopo aver fatto un'azione l'utente vede subito il risultato? (es. esclusione operatore → SWR mutate → riga sparisce)
2. **Match real world**: i termini sono in italiano e nel gergo HOC? "Operatori", "Group", "Creator", "Chatter" — non "user", "team"
3. **User control**: c'è sempre un modo per tornare indietro / annullare? (es. "Rimuovi esclusione" funziona?)
4. **Consistency**: pill, badge, dropdown hanno lo stesso stile in tutte le pagine?
5. **Error prevention**: confirm() prima di azioni distruttive (escludere, rimuovere profilo, reset)?
6. **Recognition over recall**: nomi visibili invece di codici (es. "Camilla ITA" non "group_id_42")
7. **Flessibilità**: shortcut per power user (es. selettore size custom 1-50, non solo preset)
8. **Aesthetic**: niente colonne cariche di numeri senza header chiari
9. **Recovery from errors**: se un'API ritorna 404, c'è CTA per risolvere?
10. **Help & documentation**: tooltip al primo uso di feature non ovvie (es. "~STIMA", cronicità "2/3")

---

## Smoke test automatici

Esegui da terminale prima del merge per le invarianti chiave:

```bash
# Setup una tantum: ottieni il cookie Clerk dal browser (Devtools > Application > Cookies > __session)
export HOC_PREVIEW_URL="https://hoc-fan-agent-git-XXXX-...vercel.app"
export HOC_CLERK_SESSION="..."

# Lancia smoke test
node tests/smoke-leaderboard.mjs
```

Cosa verifica:
- Ogni pill filtro ha un count
- `Tutte = somma di tutte le pill esplicite + bucket "Senza"`
- Cambiando filtro lingua, i count delle altre pill non variano
- Endpoint `/api/leaderboard/operational` ritorna 200 con `ranking[]` non vuoto
- Drill-down operatore (`/api/leaderboard/employee-history`) ritorna `history[]` per un nome valido

Vedi `tests/smoke-leaderboard.mjs` per dettagli.

---

## Changelog di questa checklist

| Data | Cosa | Da quale bug |
|------|------|--------------|
| 2026-05-20 | Sezione 1 (filtri/count) | "Tutte" senza count + counts pill sbagliati al filtro ITA |
| 2026-05-20 | Sezione 2 (posizionamento) | Top 10 da cambiare in fondo alla pagina |
| 2026-05-20 | Sezione 4 (stima ~ vs trattino) | `~12.7%` confuso con `-12.7%` |
| 2026-05-20 | Sezione 5 (ignora vs escludi) | Necessità di "ignora dalla lista" separata da esclusione |
| 2026-05-20 | Sezione 7 (start_date fallback) | Profili senza data, tenure stimato |
