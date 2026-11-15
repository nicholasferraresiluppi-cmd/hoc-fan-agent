// Piano Fishball social (15/11/2026, richiesta di Nicholas dopo l'analisi del calo dell'italiano).
// Numeri di partenza misurati dal magazzino (instagram.cache_accounts_talents, reels_diffs,
// tiktok.cache_accounts_creators) per maggio-novembre 2026. I ritmi sono quelli che ogni profilo
// teneva quando rendeva, non numeri inventati. Caricato con scripts/piani-seed.mjs fishball-social;
// da lì si modifica dall'editor in /admin/piani (questo file è la versione di partenza).
const ED = "/admin/editing";
const WU = "/admin/warmup";

// date di ogni settimana scritte nella voce: la fase delle domande (16-18/11) si sovrappone alla
// settimana 1, quindi le finestre non si possono ricavare dalle fasi
const WEEKS = { 1: ["2026-11-16", "2026-11-22"], 2: ["2026-11-23", "2026-11-29"], 3: ["2026-11-30", "2026-12-06"] };
const posts = (n, platform, account, min) => ({ type: "social_posts", platform, account, metric: "post", min, from: WEEKS[n][0], to: WEEKS[n][1] });

const week = (n) => [
  { id: `s${n}-fishballla`, link: ED, text: n === 1 ? "fishballla: 3 reel dal Banco (si riparte piano)" : "fishballla: 5 reel dal Banco",
    note: "Da maggio ad agosto pubblicava 16-21 reel al mese con 20-30k views a reel; da settembre quasi niente (ultimo 23/10). Nel Banco ci sono 30 video già approvati: a 5 a settimana bastano per 6 settimane. Le riprese ripetute vanno distanziate.",
    auto: posts(n, "ig", "fishballla", n === 1 ? 3 : 5) },
  { id: `s${n}-conlagang`, text: "fifi_conlagang: 5 reel",
    note: "A settembre 24 reel, a ottobre 8, a novembre 5 in due settimane. I reel di novembre fanno 145k views di mediana contro i 40-60k dell'estate: ogni reel in più adesso rende più di prima.",
    auto: posts(n, "ig", "fifi_conlagang", 5) },
  { id: `s${n}-fischbal`, who: "Michael", text: "fischbal: 5 reel",
    note: "L'unico profilo che cresce con costanza (da 2k a 18k follower, 5.500 click a ottobre). In estate 21-25 reel al mese, a novembre 5 in due settimane.",
    auto: posts(n, "ig", "fischbal", 5) },
  { id: `s${n}-nerd-tt`, text: n === 1 ? "fifi.nerd TikTok: 3 video (si riparte)" : "fifi.nerd TikTok: 5 video",
    note: "Luglio-settembre circa un video al giorno, views in crescita fino a 516k a settembre; da ottobre fermo.",
    auto: posts(n, "tt", "fifi.nerd", n === 1 ? 3 : 5) },
  { id: `s${n}-fishhzip`, who: "Greta", link: WU, text: "fishh.zip: 5 reel",
    note: "Tra i profili di clipping è quello che rende di più: 20-26k views a reel, circa 1.000 click al mese.",
    auto: posts(n, "ig", "fishh.zip", 5) },
  { id: `s${n}-milabrook`, who: "Greta", link: WU, text: "milabrook.jpg: 5 reel",
    note: "1,4 milioni di views e 2.000 click nelle prime due settimane di novembre.",
    auto: posts(n, "ig", "milabrook.jpg", 5) },
  { id: `s${n}-moments`, who: "Greta", link: WU, text: "fishmomentss: 5 reel",
    note: "In crescita: da 3k a 10k views di mediana a reel tra agosto e novembre.",
    auto: posts(n, "ig", "fishmomentss", 5) },
];

export const FISHBALL_SOCIAL_PLAN = {
  id: "fishball-social-ripartenza",
  title: "Fishball: ripartenza social",
  goal: "Da metà ottobre l'italiano di Fishball incassa circa un quarto in meno, soprattutto perché arrivano meno fan nuovi che spendono tanto. Nello stesso periodo i suoi profili principali hanno smesso di pubblicare, fishballla si è fermata con 30 video pronti nel Banco, e su altri profili che rendevano pubblichiamo meno. Il piano riporta ogni profilo al ritmo che teneva quando andava bene, e i reel pubblicati si contano da soli dal magazzino (i dati arrivano a ieri). Se un ritmo non è sostenibile o c'è un modo migliore, il parere di chi pubblica conta più del piano.",
  area: "social",
  cap: "social.manage",
  people: ["Nicholas", "Michael", "Greta"],
  start: "2026-11-16",
  end: "2026-12-07",
  phases: [
    {
      id: "risposte",
      title: "Prima di ripartire: capire cosa è successo",
      due: "2026-11-18",
      note: "Domande al team Fishball. Le risposte decidono se i ritmi delle settimane sono giusti.",
      items: [
        { id: "perche-fishballla", ask: true, text: "Perché fishballla si è fermata a settembre? Ci sono problemi a usare i 30 video del Banco?" },
        { id: "chi-pubblica", ask: true, text: "Chi pubblica su fishballla, fifi_conlagang e fifi.nerd TikTok?" },
        { id: "girato-conlagang", ask: true, text: "C'è abbastanza girato per tenere fifi_conlagang a 5 reel a settimana? Se no, cosa serve?" },
        { id: "profili-persi", ask: true, text: "fifi.nerd (Instagram), world_offifi, cutieinked, pillsoffifi e fifiinside sono spariti tra giugno e luglio: chiusi o bannati? Ha senso rifarne qualcuno?",
          note: "In primavera insieme portavano 8-10mila click in bio al mese." },
        { id: "profili-lei", who: "Nicholas", text: "Parlare con lei dei suoi profili (TikTok fishball__ e Instagram fishball_sg): quasi fermi da fine settembre, nessun post dal 19 ottobre",
          note: "Non li gestiamo noi, ma sono quelli che la tengono conosciuta: più dell'80% dei nuovi paganti dell'italiano arriva senza link tracciato. A marzo il team le aveva già mostrato quanto incassa quando pubblica con costanza." },
      ],
    },
    { id: "settimana-1", title: "Settimana 1 (16-22 novembre)", due: "2026-11-22", items: week(1) },
    { id: "settimana-2", title: "Settimana 2 (23-29 novembre)", due: "2026-11-29", items: week(2) },
    { id: "settimana-3", title: "Settimana 3 (30 novembre - 6 dicembre)", due: "2026-12-06", items: week(3) },
    {
      id: "decisione",
      title: "Teniamo questi ritmi?",
      kind: "decision",
      due: "2026-12-07",
      note: "Dopo tre settimane si guarda se pubblicare di più ha portato più persone. Le condizioni sui click e sulle views si controllano da sole sulle tre settimane.",
      items: [
        { id: "dec-fishballla", text: "fishballla torna sopra 400mila views nelle tre settimane (in estate 600-900mila al mese)",
          auto: { type: "social_posts", platform: "ig", account: "fishballla", metric: "views", min: 400000, from: "2026-11-16", to: "2026-12-06" } },
        { id: "dec-fischbal", text: "fischbal porta almeno 3.000 click in bio nelle tre settimane (a ottobre 5.500 in un mese)",
          auto: { type: "social_posts", platform: "ig", account: "fischbal", metric: "click", min: 3000, from: "2026-11-16", to: "2026-12-06" } },
        { id: "dec-conlagang", text: "fifi_conlagang porta almeno 1.500 click in bio nelle tre settimane",
          auto: { type: "social_posts", platform: "ig", account: "fifi_conlagang", metric: "click", min: 1500, from: "2026-11-16", to: "2026-12-06" } },
        { id: "dec-clipping", text: "Profili di clipping fermi sotto le 1.000 views a reel (milab.bites, bittenbymila, itsme.milab, fificlipss, fifinoir_, fifiimaybe, fishabol, fishhami): si fermano e il tempo va ai tre che rendono",
          note: "Sono nati a ottobre, quindi un mese di rodaggio è normale; a inizio dicembre si guarda se qualcuno si è sbloccato." },
        { id: "dec-of", text: "Sull'italiano tornano almeno 15 fan nuovi a settimana che spendono 200 $ nella prima settimana (oggi circa 11, in estate circa 16)",
          note: "Si misura dal magazzino a fine piano. È il numero che conta davvero: i reel servono a portare questi fan." },
      ],
    },
  ],
};
