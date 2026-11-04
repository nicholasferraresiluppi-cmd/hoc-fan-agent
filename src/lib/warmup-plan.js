// Warm-up dei profili social (IG e X) — logica pura, niente I/O.
// Portata il 22/10/2026 dalla «Warm-Up Console» (sito Netlify+Supabase di una collega, poi spento):
// testi, numeri e scelte sono gli STESSI di quella console, che li prendeva da
// «House Of Creators – Instagram Strategy» (1/5/2026, Josh Stein) e dal documento «Account X".
// Un profilo `a` qui è l'unione dell'account in Account social (username, creator, device, email)
// e del suo stato di warm-up (lib/warmup-store.js): progress {giorno: {taskId: true}},
// timers {giorno: {taskId: secondi}}, state/flag/milestones/weekly.
// Le date sono giorni locali (Europe/Rome sul telefono di chi lavora): si calcola nel browser.

export const DAY = 86400000;

/* Due piattaforme: Instagram e X. Ogni profilo ne ha una sola. */
export const PLATS = {
  ig: {label:"Instagram", short:"IG"},
  x:  {label:"X",         short:"X"},
};
export function platOf(a){ return (a && a.platform === "x") ? "x" : "ig"; }
export const isX = a => platOf(a) === "x";
export const norm = s => String(s||"").trim();
export const keyOf = s => norm(s).toLowerCase();

export const todayKey = d => { const x = d ? new Date(d) : new Date();
  return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); };
export const startOfDay = v => { const d = typeof v === "string" ? new Date(v+"T00:00:00") : new Date(v); d.setHours(0,0,0,0); return d.getTime(); };
export function fmtDur(ms){
  if(ms < 0) ms = 0;
  const d = Math.floor(ms/DAY), h = Math.floor(ms%DAY/3600000), m = Math.floor(ms%3600000/60000);
  if(d > 0) return d+"g "+h+"h";
  if(h > 0) return h+"h "+String(m).padStart(2,"0")+"m";
  return m+"m";
}
export function mmss(sec){ sec = Math.max(0, Math.round(sec));
  return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }

/* ---- settimane (lunedì → domenica) ---- */
export function weekStart(d){
  const x = new Date(d ? d : Date.now()); x.setHours(0,0,0,0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function weekKey(d){
  const s = weekStart(d), t = new Date(s); t.setDate(t.getDate() + 3);
  const first = new Date(t.getFullYear(), 0, 4);
  const n = 1 + Math.round(((t - first) / DAY - 3 + ((first.getDay() + 6) % 7)) / 7);
  return t.getFullYear() + "-W" + String(n).padStart(2, "0");
}
export function weekLabel(d){
  const s = weekStart(d), e = new Date(s); e.setDate(e.getDate() + 6);
  const f = x => x.toLocaleDateString("it-IT", {day:"numeric", month:"short"});
  return f(s) + " – " + f(e);
}
export function lastWeeks(n){
  const out = [], base = weekStart();
  for(let i = 0; i < n; i++){
    const d = new Date(base); d.setDate(d.getDate() - i*7);
    out.push({key:weekKey(d), label:weekLabel(d), start:d.getTime()});
  }
  return out;
}
export const numFmt = v => (v === "" || v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toLocaleString("it-IT");
export function delta(now, prev){
  if(now === "" || now == null || prev === "" || prev == null) return null;
  const d = Number(now) - Number(prev);
  return isFinite(d) ? d : null;
}
/* ============================ SOP: PIANO DEL GIORNO ============================ */
/* Fonte: "House Of Creators – Instagram Strategy" (1 maggio 2026, Josh Stein),
   che raccoglie Account Creation & Warm-Up, Engagement SOP, Link in Bio & CTA,
   Flag Response, Account Cooldown, Quality Manual e Position Handbook.
   Scelte prese con Luis dove il documento si contraddice:
   - volume dopo il warm-up: Sezione 4 CONTENT SCALING (sett. 1-2 → 1 reel/g,
     sett. 3 → 2/g, sett. 4+ → 3/g), non la tabella iniziale;
   - link in bio: solo dopo un reel oltre 10K views + link consegnato dal PM
     (Rule 2 del SOP Link in Bio: performance-based, non calendar-based);
   - le tre finestre USA diventano task separate, con orario EST e ora italiana. */

export const T  = (id, t, why, timer) => ({id, t, why: why||"", timer: timer||null});
export const TO = (id, t, why, timer) => ({id, t, why: why||"", timer: timer||null, opt:true});

/* ---- finestre di pubblicazione USA (EST) convertite in ora italiana ---- */
export function tzMin(tz, d){
  try{
    const s = new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"longOffset"})
      .formatToParts(d).find(p=>p.type==="timeZoneName").value;
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s);
    if(!m) return null;
    return (m[1]==="-"?-1:1) * (+m[2]*60 + (+m[3]||0));
  }catch(e){ return null; }
}
export function estToIt(hh){
  const d = new Date();
  const a = tzMin("Europe/Rome", d), b = tzMin("America/New_York", d);
  const diff = (a==null||b==null) ? 360 : a - b;          /* di norma +6 ore */
  const t = hh*60 + diff;
  const h = ((Math.floor(t/60)) % 24 + 24) % 24;
  const m = ((t % 60) + 60) % 60;
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+
    (t >= 1440 ? " di domani" : t < 0 ? " di ieri" : "");
}
export const WINDOWS = [
  {n:1, est:"9:00",  h:9},
  {n:2, est:"13:00", h:13},
  {n:3, est:"19:00", h:19},
];
export const WINWHY = "Le tre finestre di pubblicazione USA sono fisse: trovi gli orari nella Guida. Se una finestra cade fuori dalle tue ore di veglia devi programmare il post in anticipo con Meta Business Suite: saltare una finestra non è accettabile.";

/* ---- blocchi di engagement riutilizzati ---- */
/* rotazione IP: va fatta prima di aprire ogni account, tutti i giorni */
export const IPSW = T("ip-switch","Ruota l'IP prima di aprire questo account",
  "Link di rigenerazione del proxy, poi 10–15 minuti di attesa e verifica su whatismyipaddress.com che l'IP sia cambiato e risulti USA. Si cambia utente tenendo premuta l'icona di Instagram, senza aprire l'app. Vale a ogni passaggio da un account all'altro, anche nelle giornate piene.");

export const ENG = {
  mix:   T("eng-mix","Mescola almeno 4 attività diverse nella sessione","Reels guardati per intero, feed principale, storie, caroselli aperti e sfogliati, visite ai profili, like naturali, salvataggi, commenti unici, risposte ai commenti di altri. Scrollare solo i Reels non basta più ed è uno dei segnali più forti di attività non naturale."),
  thread:T("eng-thread","Rispondi ai commenti sotto i tuoi post creando thread","Ogni risposta deve stimolare un'altra risposta: fai una domanda, lancia una battuta, dai un motivo per tornare. Mai rispondere con una sola emoji o un \"grazie\". I thread lunghi sono uno dei segnali più forti che Instagram usa per decidere cosa spingere."),
  others:T("eng-others","Commenta sotto i post di altri creator","Tre tipi di commento: legato al creator (\"OMG we literally have the exact same…\"), risposta a un commento già esistente, commento divertente o GIF. Mai copia e incolla: ogni commento è diverso."),
  usa:   T("eng-usa","Prima di commentare controlla che il profilo sia USA o Tier 1","Apri il profilo di chi ha commentato: se i segnali dicono chiaramente paese non target, salta e passa al prossimo. Il tuo tempo di engagement è limitato, spendilo su chi porta il pubblico giusto."),
  rand:  T("eng-rand","Rendi la sessione diversa da quella di ieri","Mai le stesse attività nello stesso ordine. Sessioni tra 5 e 10 minuti, mai tutte della stessa durata, 30–90 secondi tra un'azione e l'altra. Il comportamento ripetitivo è facile da identificare."),
  pre:   T("eng-pre","Engagement prima di pubblicare","5–10 minuti di engagement mescolato prima di ogni pubblicazione: riscalda l'account.", {min:5, mode:"count"}),
  post:  T("eng-post","Engagement dopo aver pubblicato","5–10 minuti subito dopo la pubblicazione: rafforza i segnali di engagement iniziale.", {min:5, mode:"count"}),
  status:T("chk-status","Controlla lo Stato dell'account e manda il report in Discord","Impostazioni → Stato dell'account, screenshot, poi report in #account-status-log. Se c'è un flag arancione: fermi le pubblicazioni su quell'account e apri subito una segnalazione qui nella console.", {min:5, mode:"count"}),
  sounds:TO("chk-sounds","Gira in Discord i sound USA che vedi in trend","Attività continua della giornata: ogni sound utile va segnalato."),
};
export const engDaily = min => T("eng-daily","Engagement della giornata: almeno "+min+" minuti",
  "Distribuiscilo in 2–3 sessioni brevi nell'arco della giornata, mai tutto in un blocco unico. L'attività costante crea segnali più forti dei picchi.", {min, mode:"accum"});

export const SEMPRE = [
  "Aspetta 30–90 secondi tra un like, un follow o un commento e il successivo, variando i tempi",
  "Mai mass-like, mass-follow o mass-comment (più di 10 azioni di fila)",
  "Ogni commento è unico: mai copiare e incollare, né sullo stesso account né su account diversi",
  "Non restare su una sola schermata: alterna reels, storie, profili, feed e caroselli",
  "Tu sei l'ultimo controllo prima della pubblicazione: se un contenuto è brutto o a rischio non si pubblica e si avvisa subito",
];

/* ---- testi lunghi riusati dalle task, dal documento ---- */
export const REELWHY = "Solo SFW durante il warm-up e tutti dal Content Manager: non procurarti contenuti da solo. Guardalo per intero prima di pubblicarlo — se audio, montaggio o qualità non vanno, non si pubblica e si scrive al Content Manager. Mai ripubblicare lo stesso reel. Gli orari delle tre finestre USA sono nella Guida.";
export const CARWHY = "Minimo 2 immagini, sempre un sound adatto al mood, ogni immagine deve essere forte — niente foto sfocate o deboli per riempire. Tag della città USA assegnata, formato \"City Name - United States\".";
export const STORYWHY = "Solo lifestyle: palestra, caffè, cibo, animali, mare, viaggi, qualcosa che c'entri con la personalità del creator. Pulite e varie, non la stessa foto ogni giorno. Durante il warm-up niente link e niente sticker che rimandano all'esterno.";
export const FOLLOWWHY = "Account USA, non super espliciti, con un buon numero di follower: un mix di brand, influencer e creator. Esempi dal documento — brand: aritzia, lululemon, sephora, crunchyroll, skims; influencer: imane, valkyrae, kimkardashian, kyliejenner, haileybieber; creator: sophieraiin, summerxiris, aishahsofey, piperrockelle, bhadbhabie. Aspetta 2–5 minuti tra un follow e l'altro.";
export const PFPWHY = "Due opzioni. A) foto reale dal Google Drive del creator: solo SFW, niente bikini o pelle in eccesso, alta risoluzione, una sola persona, nessun watermark o testo. B) immagine cartoon o animata che somigli davvero al creator — stesso colore di capelli, tono della pelle, stile e vibe: è l'opzione migliore. Il test è sempre lo stesso: questa foto fa sembrare l'account affidabile, attraente e reale? Mai lasciare la foto predefinita di Instagram.";
export const BIOWHY = "Prendi i dati dalla Creator Information Card, non inventarli. Una bio forte ha età, luogo o origine, interessi o personalità, e resta coerente con la nicchia. Massimo 150 caratteri, poche emoji, niente bio generiche tipo \"Living my best life ✨\".";
export const LINKWHY = "Modifica profilo → Link → Aggiungi link esterno, incolla l'URL completo assegnato dal Project Manager, titolo breve tipo \"my page\". Ogni account ha il suo link unico: mai copiarlo da un altro account. Verifica che sia cliccabile. Il SOP Link in Bio chiede comunque un reel oltre le 10.000 visualizzazioni e il via libera del PM: se non ci sono ancora, segna il traguardo nella scheda Profilo e aspetta il suo ok prima di pubblicare la CTA.";

/* ---- blocco task settimanali, mostrato la domenica ---- */
export function weeklyGroup(){
  return {t:"Fine settimana · report e consegne", items:[
    T("wk-car","Verifica di aver pubblicato 3–4 caroselli questa settimana","Minimo 2 immagini, sempre un sound adatto, ogni immagine forte, tag della città USA assegnata nel formato \"City Name - United States\"."),
    T("wk-review","Rivedi le consegne dell'editor e segnala i problemi","Se un reel ha audio sbagliato, montaggio brutto o qualità bassa non si pubblica: si scrive al Content Manager."),
    T("wk-cover","Controlla le copertine dei reel e l'aspetto della griglia","La griglia deve risultare pulita nell'insieme: segnala e correggi quello che stona."),
    T("wk-ideas","Manda 10 idee di reel virali USA in Discord"),
    T("wk-sounds","Manda 10 sound virali USA in Discord"),
    T("wk-report","Compila il report settimanale del creator","Un report per creator ogni domenica. I numeri si inseriscono anche qui, nella scheda Dati."),
  ]};
}

export function dayPlan(day, opt){
  const dow = (opt && opt.dow != null) ? opt.dow : new Date().getDay();
  const noCta = !!(opt && opt.noCta);
  const g = [], forbid = [], gates = [];
  let phase = "", title = "", note = "";

  /* un reel per riga, numerato: cosi' si spunta uno alla volta */
  const reels = (pre, n) => {
    if(n === 1) return [T(pre+"-r1","Pubblica il reel della giornata (solo SFW)", REELWHY)];
    const out = [];
    for(let k = 1; k <= n; k++) out.push(T(pre+"-r"+k,"Pubblica il "+k+"° reel della giornata (solo SFW)", REELWHY));
    return out;
  };

  /* ---------------------------- GIORNO 1 ---------------------------- */
  if(day <= 1){
    phase = "Warm-up · Giorno 1"; title = "Solo setup del profilo e osservazione";
    note = "Oggi l'account deve sembrare una persona reale e mostrare a Instagram che sei uno spettatore passivo. Nient'altro.";
    g.push({t:"Apertura", items:[IPSW]});
    g.push({t:"Profilo", items:[
      T("d1-pfp","Imposta la foto profilo", PFPWHY),
      T("d1-bio","Scrivi la bio", BIOWHY),
    ]});
    g.push({t:"Osservazione", items:[
      T("d1-reels","Guarda Reels per almeno 20 minuti","Nessun like e nessun commento oggi: lascia che i video finiscano invece di passare subito al successivo.", {min:20, mode:"count"}),
    ]});
    g.push({t:"Coordinamento", items:[
      T("d1-login-send","Manda i dati di accesso al management","Template completo, nessun campo vuoto: Phone, Phone Type, iCloud Email, iCloud Password, IG Link, Birthday, Username, Name, IG Password, Email, Email Password, 2FA String. Se un campo non si applica si scrive \"/\"."),
      T("d1-pm","Manda al Project Manager handle e link dell'account","Il PM fa partire la richiesta urgente di contenuti SFW agli editor e prepara il back-end. I contenuti si chiedono il Giorno 1, non il Giorno 4."),
    ]});
    forbid.push("NON mettere like a nulla","NON commentare nulla","NON seguire nessuno","NON pubblicare nulla","Nessun link da nessuna parte");
    return {phase, title, note, groups:g, forbid, gates};
  }

  /* ---------------------------- GIORNO 2 ---------------------------- */
  if(day === 2){
    phase = "Warm-up · Giorno 2"; title = "Primo carosello ed engagement leggero";
    note = "Si pubblicano i primi contenuti e si inizia a mostrare a Instagram un utente attivo, ma con leggerezza. Solo SFW.";
    g.push({t:"Apertura", items:[IPSW]});
    g.push({t:"Pubblicazione", items:[
      ENG.pre,
      T("d2-car","Pubblica 1 post carosello (SFW)", CARWHY),
      T("d2-story","Pubblica 1 storia lifestyle", STORYWHY),
      ENG.post,
    ]});
    g.push({t:"Follow", items:[
      T("d2-follow","Segui 5–10 account di nicchia, tutti USA", FOLLOWWHY),
    ]});
    g.push({t:"Engagement", items:[
      engDaily(20),
      T("d2-reels","Guarda i reels per intero, senza saltarli a metà"),
      T("d2-like","Metti like in modo naturale: circa 1 post su 3 o 4"),
      T("d2-comm","Lascia 1–3 commenti leggeri, brevi e naturali"),
      T("d2-save","Salva 2–3 reels nelle raccolte"),
      ENG.rand, ENG.status,
    ]});
    forbid.push("Nessun link in bio, nelle storie o nelle didascalie","Mai più di 10 follow di fila","Niente contenuti NSFW o allusivi");
    return {phase, title, note, groups:g, forbid, gates};
  }

  /* --------------------------- GIORNI 3-7 --------------------------- */
  if(day >= 3 && day <= 7){
    const nr = day <= 4 ? 2 : 3;          /* reels del giorno, dalla tabella */
    const ns = day <= 4 ? 2 : 3;          /* storie del giorno */
    phase = "Warm-up · Giorno "+day;
    title = day <= 4 ? "Primi reels ed engagement continuo" : "Ritmo pieno di pubblicazione";
    note = "Dalla tabella del warm-up: 1 carosello + "+nr+" reels + "+ns+" storie, engagement di almeno 30 minuti. Tutti i reels arrivano dal Content Manager e sono solo SFW.";
    g.push({t:"Apertura", items:[IPSW]});
    const pub = [ENG.pre, T("d"+day+"-car","Pubblica 1 post carosello", CARWHY)]
      .concat(reels("d"+day, nr))
      .concat([T("d"+day+"-stories","Pubblica "+ns+" storie lifestyle", STORYWHY), ENG.post]);
    g.push({t:"Pubblicazione", items:pub});
    if(day === 3) g.push({t:"Follow", items:[
      T("d3-follow","Segui 5 account di nicchia USA", FOLLOWWHY),
    ]});
    g.push({t:"Engagement", items:[engDaily(30), ENG.mix, ENG.rand, ENG.status]});
    if(day === 7) g.push({t:"Chiusura del warm-up", items:[
      T("d7-pro","Converti in account professionale","Scarica Meta Business Suite. Categoria: Digital Creator. Non mostrare la categoria sul profilo."),
      T("d7-high","Crea le storie in evidenza","Usa le storie della settimana appena trascorsa."),
    ]});
    forbid.push("Nessun link in bio, nelle storie o nelle didascalie","Mai contenuti NSFW: nel dubbio non pubblicare e avvisa il Content Manager","Massimo 5–10 hashtag pertinenti per post");
    return {phase, title, note, groups:g, forbid, gates};
  }

  /* ------------------------ DOPO IL WARM-UP ------------------------ */
  const week = Math.ceil((day - 7) / 7);
  const engBlock = [engDaily(30), ENG.mix, ENG.thread, ENG.others, ENG.usa, ENG.rand, ENG.status, ENG.sounds];

  if(week === 1){
    phase = "Settimana 1 dopo il warm-up"; title = "Da 1 a 3 reels al giorno, 13 nella settimana";
    note = "Obiettivo della settimana: 13 reels, solo SFW. Distribuiscili senza concentrarli tutti in un giorno.";
    g.push({t:"Apertura", items:[IPSW]});
    g.push({t:"Pubblicazione", items:[
      ENG.pre,
      T("w1-reels","Pubblica da 1 a 3 reels (solo SFW)","L'obiettivo settimanale è 13 reels. Guarda ogni reel per intero prima di pubblicarlo e non ripubblicare mai lo stesso reel. Gli orari delle tre finestre USA sono nella Guida."),
      T("w1-stories","Pubblica 2–3 storie lifestyle", STORYWHY),
      ENG.post,
    ]});
    g.push({t:"Engagement", items:engBlock});
    if(dow === 0) g.push(weeklyGroup());
    forbid.push("Link in bio vietato in settimana 1","Nessuna menzione di link nelle storie o nelle didascalie","Non invitare gli utenti a cliccare link esterni");
    return {phase, title, note, groups:g, forbid, gates};
  }

  /* settimana 2 e successive: 3 reels al giorno, 21 nella settimana */
  phase = "Settimana "+week+" dopo il warm-up";
  title = week === 2 ? "3 reels al giorno e introduzione soft del link" : "Operatività piena, funnel attivo";
  note = week === 2
    ? "21 reels nella settimana. Il link in bio si introduce in modo soft: 3–4 storie CTA nell'arco della settimana, non tutti i giorni, e una salvata come storia in evidenza."
    : "21 reels nella settimana, 3–5 storie al giorno, link in bio pienamente attivo con una storia CTA al giorno.";
  g.push({t:"Apertura", items:[IPSW]});
  g.push({t:"Pubblicazione", items:[ENG.pre]
    .concat(reels("w"+week, 3))
    .concat([T("w"+week+"-stories","Pubblica 3–5 storie, compreso il repost di un reel", STORYWHY), ENG.post])});
  g.push({t:"Engagement", items:engBlock});
  gates.push({need:["trail"], label:"Trail reels", items:[
    T("w-trail","Pubblica 5 trail reels","Distribuiti nell'arco della giornata, 35 nella settimana."),
  ]});
  if(noCta){
    /* shadowban o dominio bruciato: niente CTA finché il PM non assegna un dominio nuovo */
    forbid.push("Nessuna CTA e nessun link finché il PM non assegna un dominio nuovo");
  }else if(week === 2){
    g.push({t:"Link in bio · introduzione soft", items:[
      T("cta-link","Aggiungi il link in bio", LINKWHY),
      T("cta-bio","Aggiungi alla bio la riga che rimanda alla storia in evidenza","Esempi: \"check my highlight 👀\", \"what ur looking for is in my highlight\", \"it's in my highlight 💗\". Il resto della bio non si tocca."),
      TO("cta-story","Pubblica una storia CTA (3–4 volte nella settimana)","Non tutti i giorni in questa settimana. Contenuto dalla cartella Stories → CTA, link come sticker, testo naturale da creator: \"come find me, check my highlight 👀\". Foto o video dove il creator è al meglio, layout pulito."),
      T("cta-high","Salva una storia CTA come storia in evidenza","Titolo che cattura (\"It's here 👀\", \"my link 💗\") e copertina personalizzata SFW del creator. Deve restare l'unica storia in evidenza visibile: archivia le altre."),
    ]});
  }else{
    g.push({t:"Funnel", items:[
      T("cta-daily","Pubblica 1 storia CTA","Una al giorno, nella fascia serale indicata nella Guida. Il testo rimanda alla storia in evidenza, non al \"link in bio\". Deve sembrare naturale e nello stile del creator, non disperato."),
    ]});
    if(dow === 0) g.push({t:"Controllo del funnel", items:[
      T("cta-one","Verifica che sia attiva una sola storia in evidenza, quella con la CTA","Più storie in evidenza dividono l'attenzione e abbassano le conversioni."),
      TO("cta-swap","Se una storia CTA più recente rende meglio, sostituisci quella in evidenza"),
    ]});
  }
  if(dow === 0) g.push(weeklyGroup());
  forbid.push("Mai più di una storia in evidenza attiva: solo quella con la CTA","Mai copiare il link di un altro account, nemmeno dello stesso creator","Mai riutilizzare un dominio bruciato","Mai ripubblicare un reel già uscito");
  return {phase, title, note, groups:g, forbid, gates};
}

/* ============================ STATO DELL'ACCOUNT ============================ */
/* Semaforo (verde/arancione/rosso) = gravità delle segnalazioni aperte.
   Stato = situazione dell'account sulla piattaforma. Sono due cose diverse. */
export const STATES = {
  online: {
    label:"Online", tone:"ok", short:"Operativo",
    desc:"L'account è attivo e segue il piano del giorno.",
  },
  shadowban: {
    label:"Shadowban", tone:"warn", short:"Funnel fermo",
    desc:"Stato dell'account verde ma funzionalità limitate: la copertura crolla senza nessun flag visibile. Se il dominio del link è bruciato, su questo account è morto per sempre.",
    noCta:true,
    steps:[
      {id:"sb-ip", t:"Rotazione IP/proxy prima di accedere all'account"},
      {id:"sb-high", t:"Rimuovi la storia in evidenza con la CTA"},
      {id:"sb-link", t:"Togli il link dalla bio"},
      {id:"sb-dom", t:"Segna il dominio come bruciato nelle note del profilo", w:"Su questo account quel dominio non va mai più riutilizzato, nemmeno dopo il recupero."},
      {id:"sb-pm", t:"Avvisa il Project Manager", w:"Assegnerà un nuovo dominio quando l'account sarà ripreso e autorizzato a reintrodurre la CTA."},
      {id:"sb-mon", t:"Controlla lo Stato dell'account due volte al giorno finché la copertura non si riprende"},
    ],
    forbid:["Nessuna CTA e nessun link finché il PM non assegna un dominio nuovo","Mai rimettere il dominio bruciato"],
  },
  sospeso: {
    label:"Sospeso", tone:"bad", short:"Attività ferma",
    desc:"L'account è sospeso: ogni attività si ferma e si aspettano istruzioni. Far sbannare un account costa oltre 1.000 $, quindi non si improvvisa nulla.",
    stopTasks:true,
    steps:[
      {id:"sp-stop", t:"Interrompi subito ogni attività", w:"Non provare a pubblicare, mettere like, seguire o fare ricorso."},
      {id:"sp-shot", t:"Avvisa il management con lo screenshot del messaggio di sospensione"},
      {id:"sp-wait", t:"Aspetta istruzioni: il recupero lo coordina il Project Manager"},
      {id:"sp-dev", t:"Non usare quel device per altri account finché il PM non dà l'ok"},
      {id:"sp-back", t:"Quando l'account torna accessibile, rimettilo Online: la console aprirà il cooldown di 3–4 settimane"},
    ],
    forbid:["Nessuna pubblicazione","Nessun ricorso","Nessun account sostitutivo senza una nuova task card"],
  },
  bannato: {
    label:"Bannato", tone:"bad", short:"Account perso",
    desc:"L'account non è più accessibile. Il device va resettato prima di aprirne un altro.",
    stopTasks:true,
    steps:[
      {id:"bn-pm", t:"Avvisa subito il management con tutti i dettagli e gli screenshot"},
      {id:"bn-dev", t:"Il device va resettato prima di essere riusato", w:"Un telefono che ha accumulato restrizioni, flag ripetuti o avvisi di attività sospetta va riportato alle impostazioni di fabbrica e riconfigurato da zero, proxy compreso."},
      {id:"bn-card", t:"Non creare l'account sostitutivo senza una nuova task card"},
      {id:"bn-new", t:"A device riconfigurato, apri il sostitutivo seguendo la procedura di creazione dall'inizio"},
      {id:"bn-back", t:"Se l'account viene recuperato, rimettilo Online: parte il cooldown post-unban"},
    ],
    forbid:["Nessun tentativo di accesso dallo stesso IP o device associati al ban","Nessun account sostitutivo senza task card"],
  },
};
/* Riporta il profilo allo stato precedente e restituisce le ore messe in pausa:
   serve quando una segnalazione viene tolta o quando lo stato è stato cambiato per sbaglio. */
/* si può annullare finché il profilo è ancora nello stato appena impostato */
export function undoableState(a){
  const h = a.stateHistory || [], last = h[h.length-1];
  return !!(last && ST(a)[last.from] && stateOf(a) === last.to && last.to !== "online");
}
export function restoreState(a, always){
  const h = a.stateHistory || [];
  const last = h[h.length-1];
  if(!last) return false;
  if(!always && !ST(a)[last.to]) return false;
  if(!always && stateOf(a) !== last.to) return false;
  if(!always && last.to === "online") return false;
  /* le ore passate nello stato non contano come pausa del calendario */
  if(a.stateSince && (last.to === "sospeso" || last.to === "bannato")){
    a.pausedMs = Math.max(0, (a.pausedMs||0) - (Date.now() - a.stateSince));
  }
  a.state = last.from; a.stateSince = last.from === "online" ? null : last.at;
  a.stateSteps = {};
  a.stateHistory = h.slice(0, -1);
  if(a.cooldownFrom && last.to !== "online") a.cooldownFrom = null;
  /* il testo per il registro: lo scrive chi chiama */
  return "Stato riportato a "+ST(a)[last.from].label+" (annullato il cambio in "+ST(a)[last.to].label+")";
}

export const stateOf = a => (a && a.platform === "x" ? XSTATES : STATES)[a && a.state] ? a.state : "online";
export const stateInfo = a => ST(a)[stateOf(a)];

export function statePlan(a){
  const s = stateInfo(a), key = stateOf(a);
  return {
    phase:"Stato: "+s.label, title:s.short, note:s.desc,
    groups:[{t:"Cosa fare adesso", items:(s.steps||[]).map(x=>T(key+"-"+x.id, x.t, x.w||""))}],
    forbid:(s.forbid||[]).slice(), gates:[],
  };
}

/* ============================ COOLDOWN POST-UNBAN ============================ */
export function cooldownPlan(cdDay){
  const g = [], forbid = [];
  if(cdDay <= 1) g.push({t:"Prima del primo accesso", items:[
    T("cd-ip","Cambia indirizzo IP","IP pulito mai associato all'account: dati mobili o un hotspot nuovo. Nessuna rete Wi-Fi già usata."),
    T("cd-dev","Usa un device pulito","Resetta il device o usane uno nuovo: cache, cookie e sessioni salvate azzerate. Nessun device collegato ad altri account segnalati."),
    T("cd-mail","Aggiorna i dati di contatto: nuova email e nuovo numero","Non riutilizzare credenziali precedenti."),
    T("cd-user","Modifica leggermente lo username","Aggiungi o togli un carattere."),
    T("cd-priv","Imposta l'account privato","Solo per i primi 2–3 giorni."),
    T("cd-link","Togli il link dalla bio e lasciala vuota per tutto il cooldown"),
    T("cd-clean","Passa in rassegna l'account e cancella i contenuti a rischio","Tutto ciò che è sensibile o borderline e può aver innescato il ban."),
  ]});
  g.push({t:"Apertura", items:[IPSW]});
  g.push({t:"Contenuti del cooldown", items:[
    T("cd-post","Pubblica solo contenuti sicuri e neutri","Post nel feed e caroselli. L'account deve restare sotto traccia."),
    T("cd-eng","Mantieni un engagement normale e a basso rischio","Nessuna tattica di crescita aggressiva."),
    T("cd-chk","Controlla lo Stato dell'account","Se arriva un flag durante il cooldown: fermi tutto e avvisi il management."),
  ]});
  if(cdDay >= 3 && cdDay <= 5) g.push({t:"Transizione", items:[
    T("cd-pub","Rimetti l'account pubblico","Sono passati 2–3 giorni dal recupero."),
  ]});
  g.push({t:"Traffico (facoltativo)", items:[
    TO("cd-redir","Se serve reindirizzare il pubblico, scegli UNA sola opzione","O una singola storia in evidenza per un reindirizzamento soft, o lo spostamento su un account secondario. Mai entrambe, e in modo minimale."),
  ]});
  if(cdDay >= 21) g.push({t:"Uscita dal cooldown", items:[
    T("cd-ok","Chiedi al management il via libera per uscire dal cooldown","Tre settimane sono il minimo, quattro sono meglio. Poi chiudi il cooldown dalla scheda del profilo."),
    T("cd-newlink","Reintroduci i link con cautela, con un provider o un dominio diverso"),
    T("cd-ramp","Torna lentamente al ritmo di pubblicazione abituale","Non tornare subito all'operatività piena."),
  ]});
  forbid.push("MAI reels durante il cooldown: attirano il massimo controllo algoritmico",
              "MAI un link in bio durante il cooldown",
              "MAI accedere dallo stesso IP o dallo stesso device associati al ban",
              "MAI accorciare il cooldown: tre settimane sono il minimo");
  return {phase:"Cooldown post-unban · Giorno "+cdDay+" di 21–28", title:"L'account deve restare sotto traccia",
          note:"Il cooldown resetta i segnali di fiducia di Instagram. Accorciarlo significa un nuovo ban e altri 1.000 $.",
          groups:g, forbid, gates:[]};
}

/* ============================ SEGNALAZIONI ============================ */
export const IPROT = [
  "Chiudi tutte le attività sull'account su cui stavi lavorando: niente azioni a metà durante il cambio",
  "Apri una volta il link di rigenerazione del proxy assegnato dal Project Manager",
  "Aspetta che il provider assegni il nuovo IP: in questa fase non accedere a nessun altro account",
  "Aspetta il buffer obbligatorio di 10–15 minuti dal link di rigenerazione",
  "Verifica su whatismyipaddress.com che l'IP sia davvero cambiato e che risulti Stati Uniti: non dare mai per scontato che la rotazione sia riuscita",
  "Cambia utente senza aprire l'app: tieni premuta l'icona di Instagram nella Home Screen e scegli l'account dal menu",
  "Solo adesso apri Instagram e lavora sull'account",
];
export const IPWARN = [
  "Se cambi device, l'altro telefono va spento del tutto con le app chiuse: altrimenti il proxy rallenta e mette a rischio gli account",
  "Mai passare da un account all'altro senza rigenerare prima l'IP: crea segnali di collegamento tra gli account",
  "Se dopo la rigenerazione l'IP è ancora lo stesso, ripeti la procedura e verifica di nuovo prima di accedere",
  "Se il provider del proxy ha problemi e l'IP non cambia, avvisa il Team Lead prima di continuare a lavorare",
  "Il proxy non si spegne mai: se si disconnette, smetti subito di usare Instagram",
];
export const FLAGS = {
  reach: {
    label:"Limits to Your Reach", level:"arancione", urgency:"Agire subito",
    desc:"Il flag più critico: Instagram sta attivamente limitando quante persone vedono i contenuti.",
    stopPublishing:true, ipRotation:true, waitHours:4,
    steps:[
      {id:"f-ip", t:"Esegui la rotazione IP/proxy prima di accedere", w:"Obbligatoria su ogni account segnalato."},
      {id:"f-find", t:"Impostazioni → Stato dell'account → Limiti alla tua copertura", w:"Instagram ti mostra i contenuti specifici che hanno generato il flag."},
      {id:"f-del", t:"Cancella ogni post segnalato. Non fare ricorso.", w:"La regola d'oro: non fare ricorso, cancella e basta. Questo da solo risolve il 90% dei flag arancioni. Il ricorso tiene la cosa in vita e attira più controlli."},
      {id:"f-re1", t:"Ricontrolla lo Stato dell'account", w:"Se il flag arancione è sparito, l'account si sta riprendendo: avvisa Publisher e Project Manager."},
      {id:"f-msg", t:"Ancora arancione? Leggi il messaggio con attenzione", w:"Se compare \"This decision is based on our community guidelines\", il problema è la bio, la foto profilo o entrambe."},
      {id:"f-bio", t:"Rimuovi completamente la bio e riscrivila pulita", w:"Nessuna parola a rischio, nessuna emoji per adulti. Mai reinserire il testo che era stato rimosso."},
      {id:"f-pfp", t:"Sostituisci la foto profilo con una nuova immagine SFW mai usata prima"},
      {id:"f-clean", t:"Cancella gli eventuali 2–3 post rimasti con contenuti allusivi"},
      {id:"f-wait", t:"Ancora arancione? Fermati e aspetta 2–4 ore", w:"Gli aggiornamenti lato Meta non sono immediati. Non ricaricare la pagina e non fare altre modifiche mentre aspetti."},
      {id:"f-esc", t:"Dopo 4 ore ancora arancione: avvisa il Project Manager", w:"Riporta cosa hai cancellato, le modifiche a bio e foto profilo, le ore di attesa, e allega lo screenshot dello Stato dell'account."},
    ],
  },
  removed: {
    label:"Removed Content & Messaging Issues", level:"arancione", urgency:"Priorità bassa",
    desc:"Instagram ha rimosso contenuti specifici o limitato la messaggistica.",
    stopPublishing:false, ipRotation:true,
    steps:[
      {id:"r-first", t:"Verifica prima che \"Limiti alla tua copertura\" sia tornato verde", w:"Occupati di questa voce solo dopo aver risolto la reach."},
      {id:"r-del", t:"Cancella i contenuti rimossi o segnalati. Nessun ricorso."},
      {id:"r-check", t:"Ricontrolla lo Stato dell'account"},
    ],
  },
  monetization: {
    label:"Monetization / Features You Can't Use", level:"arancione", urgency:"Monitorare",
    desc:"Non ha un legame diretto con la reach.",
    stopPublishing:false, ipRotation:false,
    steps:[
      {id:"m-link", t:"Verifica se è collegato a una limitazione della reach"},
      {id:"m-mon", t:"Controlla lo Stato dell'account due volte al giorno"},
    ],
  },
  warmup: {
    label:"Restrizione durante il warm-up", level:"arancione", urgency:"Fermare tutto",
    desc:"L'account è stato limitato mentre era ancora in warm-up.",
    stopPublishing:true, ipRotation:false,
    steps:[
      {id:"wu-stop", t:"Interrompi subito ogni attività", w:"Non provare a pubblicare, mettere like o seguire."},
      {id:"wu-shot", t:"Avvisa il management con lo screenshot del messaggio di restrizione"},
      {id:"wu-wait", t:"Aspetta istruzioni prima di riprendere"},
    ],
  },
  shadowban: {
    label:"Shadowban nascosto / dominio bruciato", level:"rosso", urgency:"Dominio morto",
    desc:"Stato verde ma funzionalità limitate, oppure dominio del link bruciato.",
    stopPublishing:true, ipRotation:true, setState:"shadowban",
    steps:[
      {id:"sb-high", t:"Rimuovi la storia in evidenza con la CTA"},
      {id:"sb-link", t:"Togli il link dalla bio"},
      {id:"sb-dom", t:"Marca il dominio come bruciato", w:"Su quell'account quel dominio è morto per sempre: non va mai più riutilizzato."},
      {id:"sb-pm", t:"Avvisa il management", w:"Assegnerà un nuovo dominio quando l'account si sarà ripreso e sarà autorizzato a reintrodurre la CTA."},
    ],
  },
  banned: {
    label:"Account bannato o sospeso", level:"rosso", urgency:"Avvisa il management",
    desc:"L'account non è più accessibile. Il device va resettato prima di riaprirne uno.",
    stopPublishing:true, ipRotation:false, setState:"bannato",
    steps:[
      {id:"b-pm", t:"Avvisa subito il management con dettagli e screenshot"},
      {id:"b-reset", t:"Riporta il device alle impostazioni di fabbrica prima di riusarlo", w:"Vale per ogni telefono con restrizioni ripetute, flag multipli o avvisi di attività sospetta."},
      {id:"b-new", t:"Apri l'account sostitutivo solo con una nuova task card"},
      {id:"b-unban", t:"Se l'account viene recuperato, rimettilo Online dalla scheda del profilo", w:"Far sbannare un account costa oltre 1.000 $: da lì parte il cooldown."},
    ],
  },
  unban: {
    label:"Recuperato post-unban → cooldown", level:"rosso", urgency:"Cooldown 3–4 settimane",
    desc:"L'account è stato recuperato ed entra in una finestra di controllo elevato. Il piano giornaliero passa in modalità cooldown.",
    stopPublishing:false, ipRotation:true, cooldown:true,
    steps:[
      {id:"u-ip", t:"Cambia indirizzo IP prima del primo login", w:"IP pulito mai associato all'account: dati mobili o un hotspot nuovo. Nessuna rete Wi-Fi già usata."},
      {id:"u-dev", t:"Usa un device pulito", w:"Resetta il device o usane uno nuovo. Cancella cache, cookie e sessioni salvate."},
      {id:"u-contact", t:"Aggiorna i dati di contatto: nuova email e nuovo numero"},
      {id:"u-user", t:"Modifica leggermente lo username", w:"Aggiungi o togli un carattere."},
      {id:"u-priv", t:"Imposta l'account privato per i primi 2–3 giorni, poi rimettilo pubblico"},
      {id:"u-link", t:"Rimuovi il link dalla bio e tienila vuota per tutto il cooldown"},
      {id:"u-clean", t:"Passa in rassegna l'account e rimuovi i contenuti a rischio"},
      {id:"u-redir", t:"Se serve, reindirizza il pubblico con UNA sola opzione"},
    ],
  },
};
export const MILESTONES = [
  {id:"pro", t:"Account professionale"},
  {id:"highlight", t:"Storie in evidenza create"},
  {id:"reel10k", t:"Un reel ha superato 10K views"},
  {id:"ctaApproved", t:"Link consegnato dal PM"},
  {id:"linkInBio", t:"Link in bio attivo"},
  {id:"trail", t:"Trail reels sbloccati"},
];

/* ============================ CALCOLI ============================ */
export function pausedDays(a){
  let ms = a.pausedMs || 0;
  if(a.flag && FL(a)[a.flag.type] && FL(a)[a.flag.type].stopPublishing) ms += Date.now() - a.flag.startedAt;
  if(a.stateSince && (stateOf(a) === "sospeso" || stateOf(a) === "bannato")) ms += Date.now() - a.stateSince;
  return Math.floor(ms / DAY);
}
export const realDay = a => Math.floor((startOfDay(Date.now()) - startOfDay(a.createdAt)) / DAY) + 1;
export const opDay = a => Math.max(1, realDay(a) - pausedDays(a));
export const isCooldown = a => !!(a.cooldownFrom) || !!(a.flag && FL(a)[a.flag.type] && FL(a)[a.flag.type].cooldown);
export const cooldownStart = a => a.cooldownFrom || (a.flag ? a.flag.startedAt : Date.now());
export const cooldownDay = a => Math.floor((startOfDay(Date.now()) - startOfDay(cooldownStart(a))) / DAY) + 1;
export const stateStops = a => !!(stateInfo(a).stopTasks);

export const planFor = a => stateStops(a) ? statePlan(a)
  : isCooldown(a) ? cooldownPlan(cooldownDay(a))
  : (isX(a) ? xDayPlan : dayPlan)(opDay(a), {noCta: !!stateInfo(a).noCta});

export function visibleItems(a, plan){
  const out = [];
  plan.groups.forEach(g => g.items.forEach(i => out.push(i)));
  plan.gates.forEach(gt => { if(gt.need.every(n => a.milestones && a.milestones[n])) gt.items.forEach(i => out.push(i)); });
  return out;
}
export const reqItems = items => items.filter(i => !i.opt);
export function dayProgress(a, key){
  const items = reqItems(visibleItems(a, planFor(a)));
  const done = (a.progress && a.progress[key]) || {};
  return {n: items.filter(i => done[i.id]).length, total: items.length};
}

/* ---- calcoli su un giorno qualsiasi, non solo oggi ---- */
export function dayNumberFor(a, dateKey){
  const n = Math.floor((startOfDay(dateKey) - startOfDay(a.createdAt)) / DAY) + 1 - pausedDays(a);
  return n;
}
export function planForDate(a, dateKey){
  if(stateStops(a)) return statePlan(a);
  if(isCooldown(a)) return cooldownPlan(Math.max(1, Math.floor((startOfDay(dateKey) - startOfDay(cooldownStart(a)))/DAY) + 1));
  return (isX(a) ? xDayPlan : dayPlan)(Math.max(1, dayNumberFor(a, dateKey)),
    {dow: new Date(startOfDay(dateKey)).getDay(), noCta: !!stateInfo(a).noCta});
}
export function tasksOn(a, dateKey){
  const plan = planForDate(a, dateKey);
  const items = visibleItems(a, plan);
  const req = reqItems(items);
  const done = (a.progress && a.progress[dateKey]) || {};
  return {plan, items, req, done, open: items.filter(i => !done[i.id]),
          n: req.filter(i => done[i.id]).length};
}
/* aderenza: task obbligatorie completate sugli ultimi N giorni di attività */
/* "done" e "total" sono i giorni gia' conclusi; "oggi" e' la giornata in corso,
   tenuta separata perche' a meta' giornata non e' ancora giudicabile. */
export function adherence(a, days){
  let done = 0, total = 0;
  for(let i = 1; i <= days; i++){
    const k = todayKey(new Date(Date.now() - i*DAY));
    if(dayNumberFor(a, k) < 1) continue;
    const t = tasksOn(a, k);
    total += t.req.length; done += t.n;
  }
  const tk = todayKey();
  const to = dayNumberFor(a, tk) >= 1 ? tasksOn(a, tk) : null;
  const td = to ? to.n : 0, tt = to ? to.req.length : 0;
  return {done, total, pct: total ? Math.round(done/total*100) : null,
          todayDone: td, todayTotal: tt,
          todayPct: tt ? Math.round(td/tt*100) : null,
          allDone: done + td, allTotal: total + tt,
          allPct: (total + tt) ? Math.round((done + td)/(total + tt)*100) : null};
}
/* responsabile = utente HOC Pro: {id, name}; me = userId di chi guarda */
export const ownerName = a => (a && a.owner && a.owner.name) || "";
export const mine = (a, me) => !!(me && a && a.owner && a.owner.id === me);

/* primo giorno in cui questo profilo è stato davvero usato nella console */
export function firstUseKey(a){
  const keys = Object.keys(a.progress || {}).filter(k => Object.keys(a.progress[k]||{}).length);
  if(keys.length) return keys.sort()[0];
  return null;
}
export function hasArrears(a, dateKey){
  if(a.flag && FL(a)[a.flag.type] && FL(a)[a.flag.type].stopPublishing) return false;
  if(stateStops(a)) return false;
  if(dayNumberFor(a, dateKey) < 1) return false;
  const first = firstUseKey(a);
  return !!first && dateKey >= first;
}
/* ============================ SOP: ACCOUNT X ============================ */
/* Fonte: documento "Account X". Non c'è un calendario giorno per giorno:
   il Giorno 1 è la checklist "Prima di iniziare", dal Giorno 2 parte la
   routine quotidiana, con le consegne settimanali nei giorni indicati. */

export const XSEMPRE = [
  "Il link non va mai dentro il post: solo in bio o nel primo commento",
  "Mix dei contenuti: circa 40% teaser, 40% post personali, 20% post non espliciti",
  "I video si caricano sempre su X, non si linkano da fuori",
  "Ogni teaser ha un invito chiaro (\"il video completo è su OF\") e deve corrispondere a quello che c'è davvero su OnlyFans",
  "Watermark su tutto",
  "Niente post fuori nicchia, niente spam di menzioni o DM",
];

export const XSETUP = [
  T("xs-handle","Nome e handle uguali a OnlyFans","Senza parole esplicite: l'handle deve essere riconoscibile e identico a quello su OnlyFans."),
  T("xs-birth","Metti la data di nascita nel profilo"),
  T("xs-sens","Segna i media come sensibili","Va fatto prima del primo post esplicito, altrimenti l'account rischia la limitazione."),
  T("xs-premium","Attiva Premium","Con Premium un post fa in media più di 600 visualizzazioni, senza Premium meno di 100. È la singola cosa che pesa di più."),
  T("xs-pfp","Foto profilo e copertina senza contenuti espliciti","Sono la prima cosa che X controlla: un'immagine esplicita qui mette a rischio tutto l'account."),
  T("xs-bio","Scrivi una bio corta con l'invito a passare su OnlyFans"),
  T("xs-link","Metti in bio il tracking link di OnlyFans","Uno solo per X, così i numeri che leggi nel report sono davvero quelli di questo canale."),
  T("xs-pin","Fissa in alto il teaser migliore, con il link nel primo commento"),
  T("xs-wm","Controlla che il watermark sia su tutti i contenuti"),
  T("xs-2fa","Salva le password e attiva l'autenticazione a due fattori"),
  T("xs-lang","Decidi lingua e orari in base al pubblico","Per una creator italiana conviene il profilo in inglese puntando all'estero. Se punti agli USA gli orari buoni sono la notte italiana: programma i post."),
];

export function xWeeklyGroup(dow){
  if(dow === 1) return {t:"Lunedì · report e calendario", items:[
    T("xw-rep","Compila il report della settimana","Nuovi follower, visualizzazioni medie per post, interazioni, click sul link e nuove sub dal tracking link, i 3 post migliori e il peggiore, cosa cambi la settimana dopo. I campi sono nella scheda Dati."),
    T("xw-cal","Prepara il calendario dei post della settimana"),
  ]};
  if(dow === 3) return {t:"Mercoledì · collaborazioni", items:[
    T("xw-collab","Organizza una o due collaborazioni","X spinge i post tra mutual, cioè due account che si seguono a vicenda: le collab con altre creator sono il modo più efficace per uscire dalla propria bolla."),
  ]};
  if(dow === 5) return {t:"Venerdì · promo del weekend", items:[
    TO("xw-promo","Metti la promo del weekend nel post fissato","Facoltativa: falla se c'è una promo attiva su OnlyFans."),
  ]};
  if(dow === 0) return {t:"Domenica · manutenzione", items:[
    T("xw-pin","Aggiorna il post fissato"),
    T("xw-check","Controlla lo stato generale dell'account","Etichette dei media, bio, link in bio, watermark, segnalazioni ricevute."),
  ]};
  return null;
}

export function xDayPlan(day, opt){
  const dow = (opt && opt.dow != null) ? opt.dow : new Date().getDay();
  const noLink = !!(opt && opt.noCta);
  const g = [], forbid = [], gates = [];

  if(day <= 1){
    g.push({t:"Prima di iniziare", items:XSETUP});
    forbid.push("Nessun post esplicito prima di aver segnato i media come sensibili",
                "Niente contenuti espliciti nella foto profilo o nella copertina",
                "Mai il link dentro il post");
    return {phase:"Account X · Giorno 1", title:"Setup del profilo",
      note:"Prima di pubblicare qualsiasi cosa, l'account va messo in regola: senza Premium e senza etichette sui media il resto del lavoro non rende.",
      groups:g, forbid, gates};
  }

  g.push({t:"Controlli", items:[
    T("x-notif","Controlla le notifiche e che l'account non abbia problemi","Segnalazioni e blocchi pesano tantissimo sulla visibilità: prima si vedono, prima si rimedia."),
  ]});

  const pub = [
    T("x-personal","Pubblica 1 post personale","Una domanda, un sondaggio, cosa sta facendo la creator. Serve a far sembrare l'account una persona e tiene su le interazioni."),
  ];
  if(noLink){
    pub.push(T("x-teaser-nolink","Pubblica 1 teaser etichettato, senza link","In questa fase niente link e niente menzioni: il teaser va pubblicato senza nessun rimando, nemmeno nel primo commento."));
  }else{
    pub.push(T("x-teaser","Pubblica 1 teaser etichettato, con il link nel primo commento","Meglio un video breve, caricato direttamente su X. Il link non va mai dentro il post: i post con un link dentro non li vede quasi nessuno. Il teaser deve corrispondere a quello che c'è davvero su OnlyFans e avere un invito chiaro."));
  }
  pub.push(TO("x-sfw","Se c'è tempo, pubblica un post non esplicito","Il mix della settimana punta a circa 40% teaser, 40% post personali, 20% non espliciti."));
  g.push({t:"Pubblicazione · 2-3 post al giorno", items:pub});

  g.push({t:"Community", items:[
    T("x-comm","Lascia 10-15 commenti sotto i post di account grandi della stessa nicchia","È il modo più economico per farsi vedere: commenta dove c'è già il pubblico giusto, restando nella nicchia."),
    T("x-reply","Rispondi ai commenti entro un'ora da ogni post","È una delle poche cose che dipendono solo da noi e si vede direttamente sulle conversioni.", {min:60, mode:"accum"}),
  ]});

  const wk = xWeeklyGroup(dow);
  if(wk) g.push(wk);

  g.push({t:"Chiusura", items:[
    T("x-num","Segna i numeri della giornata","Visualizzazioni dei post, interazioni, click sul link: a fine settimana servono per il report del lunedì."),
  ]});

  forbid.push("Mai il link dentro il post: solo in bio o nel primo commento",
              "Niente post fuori nicchia",
              "Niente bot, automazioni o gruppi di like",
              "Nessun post esplicito senza etichetta",
              "Niente spam di menzioni o di DM");
  if(noLink) forbid.push("Niente link e niente menzioni finché le visualizzazioni non si riprendono");

  return {phase:"Account X · Giorno "+day, title:"Routine quotidiana",
    note:"2-3 post al giorno, commenti nella nicchia e risposte entro l'ora. Le cose che dipendono da noi sono poche: Premium, nessun link nei post, stessa nicchia, risposte veloci, collaborazioni.",
    groups:g, forbid, gates};
}

/* ---- stati dell'account X: stesse chiavi di Instagram, testi diversi ---- */
export const XSTATES = {
  online: {
    label:"Online", tone:"ok", short:"Operativo",
    desc:"L'account è attivo e segue la routine quotidiana.",
  },
  shadowban: {
    label:"Visualizzazioni crollate", tone:"warn", short:"Niente link",
    desc:"Le visualizzazioni sono crollate: di solito dipende dalle etichette dei media o da troppi link e menzioni.",
    noCta:true,
    steps:[
      {id:"xc-lab", t:"Controlla le etichette dei media", w:"Un post esplicito senza etichetta è la causa più frequente del crollo."},
      {id:"xc-link", t:"Niente link e niente menzioni per qualche giorno"},
      {id:"xc-pers", t:"Pubblica solo post personali finché non si riprende"},
      {id:"xc-mon", t:"Controlla ogni giorno le visualizzazioni medie per post", w:"L'obiettivo è tornare sopra le 600 visualizzazioni di media."},
    ],
    forbid:["Nessun link, nemmeno nel primo commento","Nessuna menzione di altri account"],
  },
  sospeso: {
    label:"Bloccato", tone:"bad", short:"Attività ferma",
    desc:"L'account è stato bloccato da X. Si ferma tutto e si fa ricorso.",
    stopTasks:true,
    steps:[
      {id:"xb-stop", t:"Ferma ogni attività sull'account"},
      {id:"xb-app", t:"Fai ricorso a X"},
      {id:"xb-pm", t:"Avvisa il management con lo screenshot del blocco"},
      {id:"xb-wait", t:"Aspetta l'esito del ricorso prima di toccare qualsiasi cosa"},
    ],
    forbid:["Nessuna pubblicazione","Nessun tentativo di aggirare il blocco con un altro account"],
  },
  bannato: {
    label:"Chiuso", tone:"bad", short:"Account perso",
    desc:"L'account è stato chiuso definitivamente.",
    stopTasks:true,
    steps:[
      {id:"xk-pm", t:"Avvisa il management con tutti i dettagli e gli screenshot"},
      {id:"xk-leak", t:"Se sono usciti dei leak, segnalali e chiedi la rimozione per copyright"},
      {id:"xk-new", t:"Non aprire un account sostitutivo senza il via libera del management"},
    ],
    forbid:["Nessun account sostitutivo senza approvazione"],
  },
};

/* ---- segnalazioni X ---- */
export const XFLAGS = {
  calo: {
    label:"Visualizzazioni crollate", level:"arancione", urgency:"Controllare le etichette",
    desc:"I post non girano più: di solito sono le etichette dei media, oppure troppi link e menzioni.",
    stopPublishing:false, ipRotation:false, setState:"shadowban",
    steps:[
      {id:"c-lab", t:"Controlla le etichette dei media", w:"Un post esplicito senza etichetta è la causa più frequente."},
      {id:"c-link", t:"Togli link e menzioni per qualche giorno"},
      {id:"c-pers", t:"Pubblica solo post personali"},
      {id:"c-wait", t:"Controlla le visualizzazioni medie per qualche giorno prima di riprendere i teaser"},
    ],
  },
  bloccato: {
    label:"Account bloccato", level:"rosso", urgency:"Ricorso a X",
    desc:"X ha bloccato l'account.", stopPublishing:true, ipRotation:false, setState:"sospeso",
    steps:[
      {id:"b-stop", t:"Ferma ogni attività sull'account"},
      {id:"b-app", t:"Fai ricorso a X"},
      {id:"b-pm", t:"Avvisa il management con lo screenshot"},
    ],
  },
  leak: {
    label:"Leak dei contenuti", level:"arancione", urgency:"Copyright",
    desc:"Contenuti della creator sono finiti in giro senza autorizzazione.",
    stopPublishing:false, ipRotation:false,
    steps:[
      {id:"l-find", t:"Raccogli i link dei contenuti usciti"},
      {id:"l-report", t:"Segnala e chiedi la rimozione per copyright"},
      {id:"l-pm", t:"Avvisa il management"},
    ],
  },
  hate: {
    label:"Commenti offensivi", level:"arancione", urgency:"Nascondi e blocca",
    desc:"Commenti cattivi sotto i post.",
    stopPublishing:false, ipRotation:false,
    steps:[
      {id:"h-hide", t:"Nascondi il commento"},
      {id:"h-block", t:"Blocca l'account"},
      {id:"h-none", t:"Non rispondere", w:"Rispondere dà visibilità al commento e porta altri like a chi l'ha scritto."},
    ],
  },
};

export const XMILESTONES = [
  {id:"xpremium", t:"Premium attivo"},
  {id:"xsens", t:"Media segnati come sensibili"},
  {id:"xlink", t:"Tracking link in bio"},
  {id:"xpin", t:"Post fissato con teaser"},
  {id:"x2fa", t:"2FA attiva"},
];

/* ---- dati settimanali di X: i campi del report del lunedì ---- */
export const WFIELDS_X = [
  {k:"followers", lab:"Nuovi follower",            num:true, chart:true},
  {k:"views",     lab:"Visualizzazioni medie",     num:true, chart:true, goal:600,  goalTxt:"obiettivo > 600"},
  {k:"eng",       lab:"Interazioni %",             num:true, dec:true, goal:0.7, goalTxt:"obiettivo ≥ 0,7%"},
  {k:"clicks",    lab:"Click sul link",            num:true},
  {k:"subs",      lab:"Nuove sub dal tracking link", num:true, chart:true, goalPct:3, goalTxt:"obiettivo 3% dei nuovi follower"},
  {k:"spent",     lab:"Speso dagli abbonati da X", num:true},
  {k:"best",      lab:"I 3 post migliori",         num:false, ph:"link o descrizione"},
  {k:"worst",     lab:"Il post peggiore",          num:false, ph:"link o descrizione"},
  {k:"notes",     lab:"Cosa cambio la settimana prossima", num:false, big:true, ph:"una o due righe"},
];

/* verde se l'obiettivo è raggiunto, rosso se no, niente colore se manca il dato */
export function xGoal(f, rec){
  if(!f || rec == null) return null;
  const v = rec[f.k];
  if(v === "" || v == null || isNaN(Number(v))) return null;
  if(f.goal != null) return Number(v) >= f.goal;
  if(f.goalPct != null){
    const fo = Number(rec.followers);
    if(!fo || isNaN(fo)) return null;
    return (Number(v) / fo * 100) >= f.goalPct;
  }
  return null;
}

/* ============ accessori: scelgono IG o X in base al profilo ============ */
export const FL = a => isX(a) ? XFLAGS : FLAGS;
export const ST = a => isX(a) ? XSTATES : STATES;
export const MS = a => isX(a) ? XMILESTONES : MILESTONES;
export const SE = a => isX(a) ? XSEMPRE : SEMPRE;
/* campi dei dati settimanali: del profilo, o della piattaforma aperta */
export const wfields = (a, plat) => ((a ? isX(a) : plat === "x") ? WFIELDS_X : WFIELDS_IG);
export const WFIELDS_IG = [
  {k:"views",    lab:"Visualizzazioni",      num:true, chart:true},
  {k:"followers",lab:"Follower",             num:true, chart:true},
  {k:"visits",   lab:"Visite al profilo",    num:true},
  {k:"taps",     lab:"Tocchi link in bio",   num:true, chart:true},
  {k:"trend",    lab:"Reels in Trend della settimana", num:false, ph:"quanti, o quali"},
  {k:"activity", lab:"Attività follower",    num:false, ph:"es. picco 21–23"},
  {k:"notes",    lab:"Considerazioni personali", num:false, big:true, ph:"se ce ne sono"},
];
/* scadenze di "Oggi" sui profili della piattaforma aperta (list) */
export function urgenze(list){
  const out = [], now = Date.now();
  list.forEach(a=>{
    const nm = a.username;
    if(a.monitorUntil && a.monitorUntil > now){
      out.push({lev:"warn", acc:a, t:"Monitoraggio 48 ore su "+nm,
        d:"Controlla lo Stato dell'account almeno due volte al giorno. Restano "+fmtDur(a.monitorUntil-now)+"."});
    }
    /* stato dell'account diverso da Online */
    if(stateOf(a) !== "online"){
      const st = stateInfo(a), fatti = Object.keys(a.stateSteps||{}).length, tot = (st.steps||[]).length;
      out.push({lev: st.tone === "bad" ? "bad" : "warn", acc:a,
        t:st.label+" su "+nm,
        d:(a.stateSince ? "In questo stato da "+fmtDur(now-a.stateSince)+". " : "")+
          (fatti < tot ? "Restano "+(tot-fatti)+" step del protocollo da eseguire." : "Protocollo completato: aspetta istruzioni dal management.")});
    }
    if(isCooldown(a)){
      const cd = cooldownDay(a);
      if(cd >= 3 && cd <= 5) out.push({lev:"warn", acc:a, t:"Rimetti pubblico "+nm, d:"Sono passati "+cd+" giorni dal recupero: l'account va rimesso pubblico."});
      if(cd >= 21) out.push({lev:"warn", acc:a, t:"Cooldown completato su "+nm, d:"Giorno "+cd+": chiedi al management il via libera, poi chiudi il cooldown dalla scheda del profilo."});
    }
    if(a.flag){
      const f = FL(a)[a.flag.type], since = now - a.flag.startedAt;
      if(f.waitHours && since > f.waitHours*3600000){
        out.push({lev:"bad", acc:a, t:"Escalation dovuta su "+nm,
          d:"Il flag \""+f.label+"\" è aperto da "+fmtDur(since)+": avvisa il management con lo screenshot dello Stato dell'account."});
      }
    }
    if(!a.flag && stateOf(a) === "online" && !isCooldown(a)){
      const d = opDay(a);
      if(d === 7 && (!a.milestones.pro || !a.milestones.highlight))
        out.push({lev:"warn", acc:a, t:"Giorno 7 su "+nm, d:"Oggi: crea le storie in evidenza e converti in account professionale (Creator digitale)."});
      if(a.milestones.reel10k && !a.milestones.ctaApproved)
        out.push({lev:"ok", acc:a, t:"10K superate su "+nm, d:"Chiedi al management il link assegnato: appena arriva si sblocca l'introduzione della CTA."});
      if(a.milestones.ctaApproved && !a.milestones.linkInBio && d > 14)
        out.push({lev:"warn", acc:a, t:"Link non ancora attivo su "+nm, d:"Il link è stato consegnato ma non risulta in bio: completa l'introduzione soft."});
    }
    /* dati della settimana scorsa mancanti */
    const prev = new Date(Date.now() - 7*DAY);
    if(opDay(a) > 7 && stateOf(a) === "online" && !(a.weekly || {})[weekKey(prev)])
      out.push({lev:"flat", acc:a, t:"Dati mancanti su "+nm, d:"Non sono stati inseriti i dati della settimana "+weekLabel(prev)+"."});
    /* limiti per device */
    if(a.device){
      const same = list.filter(x => keyOf(x.device) === keyOf(a.device));
      if(same.length > 1 && same.some(x => x !== a && x.createdAt === a.createdAt))
        out.push({lev:"bad", acc:a, t:"Due account creati lo stesso giorno su "+a.device,
          d:"Il limite è 1 creazione per device al giorno, con almeno 24 ore di distanza."});
    }
  });
  const rank = {bad:0, warn:1, ok:2, flat:3};
  return out.sort((x,y)=>rank[x.lev]-rank[y.lev]).filter((x,i,arr)=>
    arr.findIndex(y=>y.t===x.t && y.d===x.d) === i);
}

/* ============================ TRANSIZIONI ============================ */
/* Le stesse regole dei pulsanti della console di prima, come funzioni pure:
   modificano la copia `a` e restituiscono il testo per il registro. `by` = nome di chi agisce. */

/* campi del profilo che appartengono al warm-up (salvati in warmup-store) */
export const META_KEYS = ["state","stateSince","stateSteps","stateHistory","flag","flagHistory","status",
  "pausedMs","cooldownFrom","monitorUntil","milestones","weekly","owner"];
export const pickMeta = a => Object.fromEntries(META_KEYS.filter(k => a[k] !== undefined).map(k => [k, a[k]]));

/* completa i campi mancanti, come refresh() della console di prima */
export function fillDefaults(a){
  a.progress = a.progress || {}; a.timers = a.timers || {};
  a.milestones = a.milestones || {}; a.weekly = a.weekly || {};
  if(a.owner === undefined) a.owner = null;
  a.flagHistory = a.flagHistory || []; a.pausedMs = a.pausedMs || 0; a.status = a.status || "verde";
  if(!a.state) a.state = "online";
  if(a.platform !== "x") a.platform = "ig";
  if(a.cooldownFrom === undefined) a.cooldownFrom = null;
  a.stateHistory = a.stateHistory || []; a.stateSteps = a.stateSteps || {};
  a.flag = a.flag || null;
  return a;
}

/* cambio di stato; cool = "recuperato da sospensione/ban" → parte il cooldown */
export function applyState(a, to, cool, by, now = Date.now()){
  const from = stateOf(a);
  if((from === "sospeso" || from === "bannato") && a.stateSince)
    a.pausedMs = (a.pausedMs||0) + (now - a.stateSince);
  a.stateHistory = (a.stateHistory||[]).concat([{from, to, at:now, by:by||""}]);
  a.state = to; a.stateSince = now; a.stateSteps = {};
  if(cool){ a.cooldownFrom = now; a.milestones = Object.assign({}, a.milestones); delete a.milestones.linkInBio; }
  return "Stato cambiato: "+ST(a)[from].label+" → "+ST(a)[to].label+(cool ? " · parte il cooldown post-unban" : "");
}

/* apre (o cambia tipo di) una segnalazione */
export function openFlag(a, type, note, by, now = Date.now()){
  const f = FL(a)[type];
  if(!f) throw new Error("tipo di segnalazione sconosciuto");
  if(a.flag && f.stopPublishing && FL(a)[a.flag.type] && FL(a)[a.flag.type].stopPublishing){ /* il conteggio continua */ }
  else if(a.flag && FL(a)[a.flag.type] && FL(a)[a.flag.type].stopPublishing){ a.pausedMs = (a.pausedMs||0) + (now - a.flag.startedAt); }
  if(a.flag && a.flag.type !== type){
    a.flagHistory = (a.flagHistory||[]).concat([{type:a.flag.type, startedAt:a.flag.startedAt, resolvedAt:now, changed:true}]);
  }
  a.flag = {type, note:note||"", startedAt:(a.flag && a.flag.type === type) ? a.flag.startedAt : now,
            steps:(a.flag && a.flag.type === type) ? a.flag.steps : {}};
  a.status = f.level;
  if(f.setState && stateOf(a) !== f.setState){
    a.stateHistory = (a.stateHistory||[]).concat([{from:stateOf(a), to:f.setState, at:now, by:by||""}]);
    a.state = f.setState; a.stateSince = now; a.stateSteps = {};
  }
  return "Segnalazione aperta: "+f.label+(note ? " — "+note : "");
}

/* "Rimetti in verde": chiude la segnalazione, monitoraggio 48 ore, riporta lo stato se l'aveva cambiato */
export function clearFlag(a, now = Date.now()){
  const logs = [];
  if(a.flag){
    const f = FL(a)[a.flag.type];
    if(f && f.stopPublishing) a.pausedMs = (a.pausedMs||0) + (now - a.flag.startedAt);
    a.flagHistory = (a.flagHistory||[]).concat([{type:a.flag.type, startedAt:a.flag.startedAt, resolvedAt:now}]);
    logs.push("Flag risolto dopo "+fmtDur(now - a.flag.startedAt)+" — "+(f ? f.label : a.flag.type));
  }
  a.flag = null; a.status = "verde"; a.monitorUntil = now + 48*3600000;
  const rip = restoreState(a);
  if(rip) logs.push(rip);
  return {logs, restored: !!rip};
}

/* chiude (dal giorno 21) o annulla (prima) il cooldown post-unban */
export function endCooldown(a){
  const cd = cooldownDay(a), presto = cd < 21;
  a.cooldownFrom = null;
  if(a.flag && FL(a)[a.flag.type] && FL(a)[a.flag.type].cooldown){ a.flag = null; a.status = "verde"; }
  return presto ? "Cooldown annullato al giorno "+cd+": era partito per errore"
                : "Cooldown chiuso al giorno "+cd+": l'account torna al piano normale";
}

/* stati di Account social corrispondenti allo stato del warm-up */
export const SUP_PLATFORM_STATUS = { online:"ok", shadowban:"not_recommended", sospeso:"suspended", bannato:"suspended" };
