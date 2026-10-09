# Radar creator — scheda per il parere legale

Versione 10/10/2026. Una pagina per l'avvocato: cosa raccogliamo, perché, come, per quanto, e le domande aperte.

## Cosa fa lo strumento

House of Creators gestisce creator che promuovono un profilo a pagamento (OnlyFans, Fanvue) tramite Instagram. Il Radar serve a **trovare creator italiane da contattare** per proporre una collaborazione (scouting) e a capire quali formati di contenuto funzionano sul mercato.

- **Fonte**: profili Instagram **pubblici**, letti tramite un fornitore esterno di raccolta dati (Apify, attori di terze parti). Nessun account Instagram nostro viene usato per la raccolta.
- **Quante persone**: ~1.150 profili al 10/10/2026, raccolti con due metodi: la catena dei "profili simili" suggerita da Instagram a partire dalle nostre creator, e ricerche per parole chiave/hashtag italiani.
- **Chi lo vede**: solo gli admin di HOC Pro (5-10 persone), dietro autenticazione.

## Quali dati teniamo (minimo indispensabile)

| Dato | Perché |
|---|---|
| Nome utente Instagram, link al profilo | identificare il profilo |
| Follower, visualizzazioni mediane dei reel, rapporto view/follower, aggiornati ogni settimana con lo storico | capire chi sta crescendo |
| Link nella bio e link nelle storie in evidenza | capire se ha già un profilo a pagamento; collegare più account della stessa persona |
| Bio (primi 300 caratteri) | proposte di collegamento tra account (non mostrata in pagina) |
| Giudizi nostri: nicchia, formato ricorrente, "unicità" 1-5, presenza di un profilo a pagamento (evidente / indizi / nessuno), nota breve | valutare l'interesse per lo scouting |
| Note del team, fase (da valutare → interessante → contattata → in trattativa → firmata / scartata), chi la segue | lavoro di scouting |

**Non teniamo**: email, telefoni, foto, didascalie integrali (lette solo per la classificazione iniziale, non archiviate), follower o commenti di terzi, dati di salute, orientamento, identità di genere, religione (esclusi in modo esplicito dalle note e dai giudizi automatici; le note dei giudizi automatici che li toccavano sono state cancellate). **Profili che potrebbero essere di minorenni: esclusi del tutto** (7 esclusi alla prima raccolta).

## Misure già in atto

- Accesso solo admin (autenticazione + controllo permessi su ogni richiesta).
- Archivio separato dal resto dell'applicazione, compresso; nessun'altra parte dell'app legge questi dati.
- **Cancellazione su richiesta**: dalla scheda, un clic toglie tutti i dati dell'account e lo mette in una lista di esclusione, così il giro settimanale non lo riaggiunge.
- Nessun contatto con le creator prima del parere legale (scritto nella pagina).
- Collegamenti tra account della stessa persona: proposti dal sistema, confermati da una persona.
- I dati grezzi della raccolta (didascalie comprese) restano sul fornitore per la conservazione standard del piano e poi si cancellano; possiamo cancellarli prima a mano.

## Domande per l'avvocato

1. **Base giuridica**: legittimo interesse (art. 6.1.f GDPR) per lo scouting commerciale è sostenibile? Serve un bilanciamento scritto (LIA)?
2. **Categoria particolare (art. 9)**: annotare che una persona ha (o probabilmente ha) un profilo a pagamento per adulti è un dato relativo alla vita sessuale? Se sì: basta che sia stato reso manifestamente pubblico dall'interessata (art. 9.2.e, link pubblico in bio/storie)? Dobbiamo togliere il campo "indizi" (dedotto) e tenere solo i casi dichiarati?
3. **Informativa (art. 14)**: i dati non sono raccolti presso l'interessata. È sufficiente informarla al primo contatto (art. 14.3.b), con un testo che diremo noi? Va pubblicata un'informativa generale sul sito?
4. **Conservazione**: proposta 12 mesi dall'ultimo aggiornamento per chi resta "da valutare" o "scartata"; durata del rapporto per chi firma. Va bene?
5. **Profilazione**: il punteggio di "unicità" e la classificazione automatica sono profilazione ai sensi dell'art. 4.4? Nessuna decisione automatica: la scelta di contattare la fa sempre una persona.
6. **Termini d'uso di Instagram**: la raccolta automatica è vietata dai termini di Meta; la fa un fornitore terzo su dati pubblici. Quale rischio contrattuale/legale resta in capo a HOC?
7. **DPIA**: con ~1.000-5.000 persone e un possibile dato art. 9, serve una valutazione d'impatto?
8. **Fornitore (Apify, Repubblica Ceca)**: serve un accordo di trattamento (art. 28)? Apify offre un DPA standard.
