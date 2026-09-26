// Ads · Acquisizione — Studio bio-funnel OnlyFans.
//
// Primo contenuto dell'area Ads: uno studio comparativo su 112 bio-funnel/smartlink
// page reali di creator OF (la landing-ponte che porta il traffico all'iscrizione OF),
// catturate e valutate da una giuria AI multimodale su una rubrica di conversione.
//
// I DATI (src/data/funnel-study.json) sono il risultato dello studio: nessuna immagine
// adult nel repo, solo l'analisi (url, voti, verdetto, fix). Onestà: è una classifica-
// EURISTICA esperta sulla prima schermata mobile, NON un tasso di conversione misurato.
// Il modo per renderla verità è l'A/B sulle nostre creator (warehouse). Non entra in
// score/comp: è materiale di acquisizione, non di valutazione operatore.

import funnelScores from "@/data/funnel-study.json";

export const FUNNEL_STUDY_META = {
  version: "funnel-study-1",
  capturedAt: "2026-07-30",
  count: funnelScores.length,
  title: "Studio bio-funnel OnlyFans",
  summary:
    "112 bio-funnel reali di creator OF, cross-piattaforma, catturate e classificate per efficacia di conversione (click freddo → iscrizione OF).",
  caveat:
    "Classifica euristica esperta sulla prima schermata mobile, non un tasso di conversione misurato. Da validare A/B sulle nostre creator col warehouse.",
};

// La rubrica di giudizio (7 criteri pesati). Il peso della CTA è il più alto: è il
// fattore che più separa vetta e fondo classifica.
export const RUBRIC = [
  { key: "cta", label: "CTA (forza + unicità)", weight: 0.22 },
  { key: "identity", label: "Credibilità / identità", weight: 0.18 },
  { key: "hook", label: "Hook / desiderio", weight: 0.18 },
  { key: "friction", label: "Attrito / velocità", weight: 0.12 },
  { key: "trust", label: "Trust / compliance", weight: 0.12 },
  { key: "social", label: "Riprova sociale", weight: 0.1 },
  { key: "hierarchy", label: "Gerarchia visiva", weight: 0.08 },
];

// Come viene fatta la ricerca (pipeline riutilizzabile). "come viene fatta" richiesto.
export const METHODOLOGY = [
  {
    title: "1 · Sourcing (2 hop)",
    body:
      "Scoperta di creator OF reali per nicchia (OnlyFans Discovery), da cui si estraggono gli handle X; poi dai profili X si legge il campo 'website' = lo smartlink funnel. Resa ~70% (il resto sono link OF diretti o vuoti).",
  },
  {
    title: "2 · Cattura",
    body:
      "Screenshot di ogni landing a viewport mobile (quel che vede il visitatore freddo), con dismissione automatica di banner cookie e age-gate. Le immagini restano fuori dal repo.",
  },
  {
    title: "3 · Giudizio AI multimodale",
    body:
      "Una giuria di agenti legge ogni screenshot e lo valuta sulla rubrica a 7 criteri (voto 1-5 per criterio) restituendo verdetto e fix principale. Il punteggio pesato 0-100 è calcolato in modo deterministico.",
  },
  {
    title: "4 · Sintesi",
    body:
      "Classifica di tutte le landing, revisione umana del vertice, estrazione dei pattern ricorrenti e del template. Pipeline riutilizzabile: si può riscalare (200/300) o mirare (es. solo IT).",
  },
];

export const WINNING = [
  "Foto hero a tutto schermo (non avatar mini): volto + implied-sexy come sfondo dominante.",
  "UNA CTA dominante a colore contrastante con copy di desiderio (mai «OnlyFans» nudo, mai lista di link equipeso). È il fattore #1.",
  "Riprova sociale in alto: badge verificato + follower, o menzioni stampa.",
  "Hook di curiosità/personalità che anticipa il contenuto, non nomina la piattaforma.",
  "Presenza + urgenza: «online ora · risponde in 2 min · finisce tra…» per simulare interazione umana imminente.",
  "Card preview del contenuto tra hook e CTA (ponte al click).",
  "Sottrazione feroce: 1 hero + 1 CTA above the fold.",
];

export const LOSING = [
  "Link-dump (es. allmylinks): decine di link equipeso, niente hero, niente gerarchia. È una directory, non un funnel.",
  "Linktree «parcheggio link» default: bottoni tutti uguali, label «OnlyFans» nuda, zero riprova sociale.",
  "Pagine template senza identità: foto stock + bio generica → fiducia bassa.",
  "Urgenza dark-pattern (countdown che si resetta): erode fiducia e alza i chargeback. L'urgenza va tenuta onesta.",
  "Falsa prossimità geo: la landing inietta la città del visitatore («sono a [tua città]») per simulare vicinanza. Efficace ma borderline — stessa famiglia del countdown finto: da valutare col legale prima di adottarla.",
];

export const TEMPLATE = [
  "Hero a tutto schermo: la miglior foto implied-sexy della creator, volto visibile.",
  "Nome + badge verificato + follower aggregati (somma cross-piattaforma se il conteggio OF è basso).",
  "Hook di una riga nella sua voce, localizzato — tease del contenuto, non «OnlyFans».",
  "Segnale di presenza («Online ora» / «Rispondo in X min») — solo se vero.",
  "Card preview: un'immagine teaser con copy di desiderio.",
  "UNA CTA dominante, colore contrastante → tracking-link OF dedicato.",
  "Tutto il resto (altri social) piccolo, sotto la piega, visivamente declassato.",
  "Urgenza opzionale ma onesta: un vero trial a tempo, mai un countdown finto.",
];

export function funnelDomain(url) {
  try {
    return String(url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0].toLowerCase();
  } catch {
    return "";
  }
}

export function getFunnelScores() {
  return funnelScores;
}

// Classifica media per piattaforma (solo quelle con >= min pagine): fa emergere che
// alcune piattaforme ostacolano il funnel (link-dump) mentre altre lo abilitano.
export function platformLeaderboard(min = 3) {
  const byDom = new Map();
  for (const r of funnelScores) {
    const d = funnelDomain(r.url);
    if (!byDom.has(d)) byDom.set(d, []);
    byDom.get(d).push(r.weighted);
  }
  return [...byDom.entries()]
    .filter(([, v]) => v.length >= min)
    .map(([platform, v]) => ({
      platform,
      avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10,
      n: v.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

export function buildFunnelStudy() {
  return {
    meta: FUNNEL_STUDY_META,
    rubric: RUBRIC,
    methodology: METHODOLOGY,
    winning: WINNING,
    losing: LOSING,
    template: TEMPLATE,
    platforms: platformLeaderboard(),
    scored: funnelScores,
  };
}
