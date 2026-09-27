# ADR — Assessment candidati pre-assunzione (Academy verso l'esterno)

- **Data**: 2026-07-25
- **Decision owner**: Nicholas (board)
- **Stato**: accepted (V1) — V2 gated
- **Autori**: Nicholas + Strategic PM Advisor (AI)

## Contesto

Il simulatore Academy (chat con fan AI + scoring versionato) è rifinito ma non ha
il suo caso d'uso ad alto volume: gli operatori onboardati sono pochi. HOC assume
150–300 persone/anno, in prevalenza chatter — il ruolo a leva diretta sul revenue.
Oggi la selezione (funnel 7 fasi, ClickUp/Greenhouse) non testa la skill vera:
saper condurre e vendere in chat. Idea: puntare il simulatore verso l'esterno,
come test pre-assunzione, e usare l'esito nella scorecard.

## Le due versioni

- **V1 — assessment come SEGNALE** (human-in-the-loop): il candidato fa una suite
  di scenari; HR riceve un report (score + compliance + signals) come *uno degli
  input* nella scorecard. La decisione è umana.
- **V2 — GATE automatico**: soglia di score sotto la quale il candidato è scartato
  dall'algoritmo, senza revisione umana del caso.

Legalmente sono pianeti diversi. La linea di frattura non è tecnica, è *chi decide*.

## Decisione

Costruire **V1**. **Non** costruire V2 come gate automatico ora.

Vincoli legali (UE/Italia, cfr ricerca 25 lug 2026):
- **GDPR art. 22**: un rifiuto deciso *unicamente* da un algoritmo (soglia → scarto
  senza revisione umana genuina) è l'esempio da manuale della decisione automatizzata
  vietata. V1 con revisione umana sostanziale non ricade nell'art. 22.
- **EU AI Act, Annex III.4**: la selezione/valutazione di candidati è alto rischio;
  obblighi pieni dal 2 dic 2027 (Digital Omnibus). Il criterio è "influenza materiale
  sulla decisione": vale anche per uno score usato come input, se orienta molto.
- **Italia, oggi**: Decreto Trasparenza (D.Lgs 104/2022, art. 1-bis) + Legge 132/2025
  impongono informativa su finalità/logica/dati dei sistemi AI usati in selezione —
  obbligo attivo adesso, indipendente dalle scadenze AI Act. Il Garante ha già aperto
  istruttorie su recruiting "black box".

Eccezione legittima a filtro automatico: le **righe rosse di compliance**
(pagamento fuori piattaforma, incontro col fan, ecc.). È una violazione di regola,
non un punteggio di bravura → può squalificare in automatico ed è difendibile.

Nota di merito: un simulatore di chat è un *work-sample test*, categoria a validità
predittiva reale ma "buona non miracolosa" (r≈0.33 nelle stime riviste, non lo 0.54
storico). Quindi V1 **affianca** il colloquio strutturato, non lo sostituisce.

## Architettura (V1)

- **Ingresso candidato**: route pubbliche `GET/POST /api/candidate/[token]`,
  `POST …/chat`, `POST …/score` + pagina `/assessment/[token]`. Il candidato non è
  un utente Clerk: il **token monouso** è l'auth. Ogni route si difende da sola
  (validità/scadenza/stato/sequenza) — i path sono in `isPublicRoute` ma con difesa
  propria, come i cron.
- **Isolamento dati**: namespace KV `candidate:*` separato da `session:*`,
  `score_hist:*`, `profile:*`, leghe/leaderboard. Un candidato non entra mai nelle
  classifiche né nei dati denaro.
- **Motore condiviso**: `src/lib/academy-engine.js` (`generateFanReply`,
  `evaluateScenarioTranscript`) estratto da `/api/chat` e `/api/score`. Candidato e
  operatore usano la STESSA logica di scoring — niente drift (governance formula).
- **Report a HR, non al candidato**: al candidato torna solo un ringraziamento; lo
  score vive nel pannello admin (`/admin/candidate-assessments`, SEED).
- **Consenso**: la pagina mostra l'informativa e registra `consentAt` (evidenza).

## Bridge V2 (deliberato)

Ogni assessment porta `outcome { decision, employeeId, … }`. Quando un candidato
viene assunto, l'admin aggancia l'`employeeId`. È l'unico pezzo "sovra-costruito"
di V1: permette un domani di correlare lo score del candidato con la sua resa reale
sul vivo (`operator-signals` / shift-quality dal warehouse). Senza questo aggancio,
la validazione — e quindi qualunque uso più forte del punteggio — resterebbe
impossibile.

## Trigger di re-evaluation (per considerare V2)

1. Esiste una correlazione **misurata** score-candidato ↔ performance reale, su un
   campione adeguato (SIOP: ~150–300 per stime stabili); **e**
2. DPIA (art. 35 GDPR) + informativa/logging conformi all'AI Act alto rischio; **e**
3. Supervisione umana genuina anche sui candidati scartati (non un rubber-stamp).

Finché i tre non sono soddisfatti, il punteggio resta un segnale. Le righe rosse di
compliance restano l'unico filtro automatico.

## Sunset

Se l'Academy viene dismessa, o se HOC adotta un ATS con assessment nativo che copre
questo bisogno.

## Stato validazione e prossimi passi (2026-07-26)

**Consegnato:**
- **V1 assessment-segnale** (PR #83, merged): motore condiviso `academy-engine.js`, superficie candidato pubblica tokenizzata (`/assessment/[token]` + `/api/candidate/*`), pannello admin `/admin/candidate-assessments` (SEED), bridge V2 (`outcome.employeeId`).
- **Compliance v2** (PR #90, merged): righe rosse estese ad ACQUIESCENZA (operatore che asseconda una proposta off-platform del fan), ELUSIONE di richieste esplicite di conferma, MECCANICHE di piattaforma inventate — principio "conta l'esito, non l'iniziativa". Additivo (solo floor compliance).
- **Meccanismo VALIDATO (T0-T1)** via harness sintetica sul motore reale (candidate-player Opus, giudice Sonnet): discrimina (elite 72 > buono 65 > medio 49 > robotico 9), profili incoerenti colti (dolce-non-vende, degrada), **test-retest del grader σ≤2** (riproducibile), **0 falsi positivi** compliance. Fix compliance validato con gold-set A/B deterministico (chiude G3 elusione + G4 meccanica, 0 falsi positivi).

**In sospeso — lavoro sul campo, non codice:**
- **T2 · accordo AI↔coach (κ)**: kit pronto (16 transcript + moduli CSV + script κ). Serve: **2 coach** votano in cieco (banda overall A/B/C + compliance pass/fail) → κ, soglia di fiducia 0,6. Il κ compliance è il numero chiave.
- **T3 · concurrent validity (voto ↔ resa reale)**: pipeline costruita e verificata su dati sintetici (rileva la *dilution*: overall a pesi uguali può predire peggio della singola skill migliore). **BLOCCATA sui dati** (0 assessment reali al 26 lug). Serve: **~30-60 operatori attuali** che fanno il test (link admin, `outcome.employeeId` = ponte) + wire del criterio warehouse (`operator-signals` revenue/ora o Sales CP v3). N≥64 per cogliere r=0,3 all'80% di potenza.
- **V2 · gate automatico**: resta gated sui 3 trigger già definiti (correlazione misurata + DPIA/AI Act + revisione umana sugli scartati). NON prima di T3.

**Merito:** un simulatore di chat è un *work-sample test* — validità predittiva reale ma modesta (r≈0,33) → l'assessment resta **segnale** nella scorecard, mai gate. Dettaglio metodologico + evidenze nella memory `assessment-validation-methodology`.
