# Traffic automation — studio OnlyFlow (lug 2026)

> Dossier di studio, NON un piano di build. Voce corrispondente nella
> [Roadmap](/admin/roadmap) con stato "parcheggiata". Nessuna decisione presa:
> i gate in fondo vanno chiusi dal board prima di qualsiasi passo operativo.

## Contesto

Il traffico organico mass-account (eserciti di account IG/TikTok/YT che pompano
clip per portare fan verso le pagine delle creator) è la leva di acquisition
standard delle agency OF. Storicamente si fa con phone farm interne + VA.
Nicholas ha segnalato il profilo IG di OnlyFlow (2026-07-19) come esempio di
industrializzazione di questa leva: vale come intel di mercato e come
riferimento se HOC vorrà mai automatizzare meglio la parte traffico.

## Cos'è OnlyFlow

**Phone farm as a service** — onlyflow.io. Affittano iPhone fisici hostati in
un loro datacenter in Nord America, ognuno con SIM e IP dedicati, pilotati da
workflow automatici gestiti da dashboard web.

- **Canali**: IG @useonlyflow (~8k follower, attivo da mag 2026) + handle di
  riserva @onlyflow.io (~1.7k) + Telegram @getonlyflow (~2.1k iscritti).
  Il fatto che tengano un handle IG di backup è eloquente sul rischio ban.
- **Cosa automatizza**: posting Reels / TikTok / Stories e (da lug 2026)
  YouTube Shorts; "AI scroll" che simula consumo di contenuti in linea con la
  nicchia dell'account; warm-up; account update; supporto Trial Reels IG con
  attivazione automatica al publish.
- **Anti-detection come value prop centrale**: gesture reali su hardware
  reale, timing randomizzato, pause di lettura naturali, SIM+IP unici per
  device — "indistinguishable from a human, reduces ban risk".
- **Monitoring**: vista live di ogni iPhone, alert di flotta, tracking
  view/follower/engagement per account.
- **Claim di scala**: 3,4B view organiche/mese sugli account gestiti (numero
  loro, non verificabile).
- **Pricing** (per iPhone/mese): $500 (1–9 device) · $400 (10–99) · $300
  (100+). Flotta da 10 = $4.000/mese.

## Valutazione (opinione, 2026-07-19)

1. **Come intel vale molto**: il traffico mass-account si sta
   professionalizzando (SaaS a listino, feature-tracking IG velocissimo). Chi
   lo compra abbassa il costo per fan acquisito; il vantaggio competitivo si
   sposta sulla macchina di contenuti, non sul numero di VA.
2. **Come fornitore, cautela alta**: l'intero prodotto è comportamento
   inautentico coordinato = violazione ToS Meta/Google. Il rischio non è del
   tool: è degli account e dei brand delle creator che ci metti sopra.
   Operatore anonimo (nessuna società identificabile, solo Telegram), claim
   non verificabili.
3. **Se mai si testasse**: pilot ring-fenced — 1-2 device, account nuovi non
   collegati alle pagine principali delle creator, KPI espliciti
   (view → click → fan trial), decisione board prima di scalare.

## Gate decisionali (aperti)

| # | Gate | Owner |
|---|------|-------|
| 1 | Risk appetite: HOC vuole fare traffico mass-account automatizzato? (rischio piattaforma + brand creator) | Board |
| 2 | Se sì: build vs buy — confronto unit economics OnlyFlow vs cloud phone + VA interni (GeeLark e simili) vs traffic provider | Nicholas + Ops |
| 3 | Se sì: perimetro HOC Pro — il modulo traffico entra nella console o vive altrove? (regola anti-polverone, cfr north star) | Nicholas |

## Fonti

- instagram.com/useonlyflow (8 post, letti 2026-07-19)
- onlyflow.io (landing completa, letta 2026-07-19)
- t.me/getonlyflow (preview pubblica canale)
