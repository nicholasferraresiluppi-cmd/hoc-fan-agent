// "Perché, nelle chat" (10/10/2026) — logica pura: pacchetto per l'AI, schema della risposta,
// verifica delle citazioni. Testata in tests/analisi-perche.mjs.
//
// Divisione del lavoro (regola di Analisi vendite): i NUMERI li calcola il codice (SQL verificato),
// l'AI legge le chat e spiega. Il codice poi controlla l'AI: ogni citazione deve esistere parola per
// parola nella chat del fan citato, altrimenti si scarta e si dice quante sono state scartate.
//
// Privacy: all'AI non arrivano id né username dei fan, solo un'etichetta (F01…) e la chat.

export const PERCHE_VERSION = "perche-2"; // v2: livello normale nel pacchetto, sforzo basso, chat più corte
export const PERCHE_MODEL = "claude-sonnet-5"; // scelta di Nicholas (10/10): ~1/3 del costo di Opus

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("it-IT", { useGrouping: "always" })}`;

/** Testo confrontabile: minuscolo, spazi compatti, niente virgolette tipografiche. */
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[“”«»"]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fan scelti + chat → fan etichettati con la loro conversazione.
 * fans: [{creator_id, user_id, prev, cur}] nell'ordine scelto dal codice; chats: righe di percheChatSql.
 */
export function labelFans(fans, chats, names = {}) {
  const byKey = new Map();
  for (const c of chats) {
    const k = `${Number(c.creator_id)}:${Number(c.user_id)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  return fans.map((f, i) => {
    const k = `${Number(f.creator_id)}:${Number(f.user_id)}`;
    const msgs = (byKey.get(k) || []).sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    return {
      label: `F${String(i + 1).padStart(2, "0")}`,
      key: k,
      // per la pagina (chi è il fan), MAI nel pacchetto per l'AI
      user_id: Number(f.user_id),
      username: f.username || null,
      page: names[Number(f.creator_id)] || null,
      prev: r2(f.prev),
      cur: r2(f.cur),
      messages: msgs.map((m) => ({
        at: m.sent_at,
        who: m.from_fan === true || m.from_fan === "true" ? "FAN" : "NOI",
        ppv: Number(m.price) > 0 ? Number(m.price) : null,
        text: String(m.text || ""),
      })),
    };
  });
}

const hhmm = (iso) => {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};

/** Il pacchetto testuale per l'AI. I numeri sono già calcolati: l'AI non deve ricalcolarli. */
export function buildPack({ person, range, previous, dir, stats, blasts, fans, reasons, normal }) {
  const lines = [];
  lines.push(`CREATOR: ${person}`);
  lines.push(`PERIODO: ${range.from} → ${range.to}, confrontato con ${previous.from} → ${previous.to} (giorni UTC).`);
  lines.push(`DIREZIONE: ${dir === "up" ? "la revenue è CRESCIUTA: cerca cosa ha funzionato" : "la revenue è CALATA: cerca cosa è andato storto"}.`);
  if (normal?.base) {
    const d = (normal.prev - normal.base) / normal.base;
    const verdict = d >= 0.2 ? "il periodo prima ERA un picco" : d <= -0.2 ? "il periodo prima era un BUCO" : "il periodo prima NON era un picco né un buco: era nella norma";
    lines.push(`LIVELLO NORMALE (mediana delle 8 settimane prima, riportata alla durata del periodo): ${money(normal.base)}. Periodo prima ${money(normal.prev)} (${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))}% sul normale): ${verdict}. Periodo ora ${money(normal.cur)}. Questo giudizio è del codice: NON contraddirlo.`);
  }
  if (reasons?.length) lines.push(`COSA DICONO GIÀ I NUMERI (calcolati dal codice, non ricalcolarli):\n${reasons.map((r) => `- ${r}`).join("\n")}`);
  if (stats) {
    lines.push(`IL GRUPPO DI FAN (conti del codice su tutti, non solo su quelli che leggi):
- fan che ${dir === "up" ? "ora spendono" : "spendevano"} almeno $50: ${stats.base_fans}
- di questi, ${dir === "up" ? "hanno più che raddoppiato la spesa" : "hanno più che dimezzato la spesa"}: ${stats.fans} (spesa ${money(stats.spent_prev)} prima → ${money(stats.spent_cur)} ora)
${dir === "up" ? "" : `- hanno smesso del tutto di comprare: ${stats.stopped}\n`}- non ci hanno più scritto nel periodo: ${stats.fan_silent}
- a cui NOI non abbiamo scritto niente nel periodo: ${stats.us_silent}`);
  }
  if (blasts?.length) {
    lines.push(`STESSO MESSAGGIO NOSTRO A TANTI FAN IN POCHI MINUTI (mandato uno per uno, i mass non sono in questa tabella):\n${blasts.slice(0, 8).map((b) => `- "${b.t}" → ${b.fans} fan in ${b.minutes} min (${hhmm(b.first_at)})`).join("\n")}`);
  }
  lines.push(`LE CHAT (ultimi 24 messaggi per fan, dai 10 giorni prima del periodo; NOI = chi scrive per la creator; [PPV $x] = contenuto a pagamento proposto):`);
  for (const f of fans) {
    lines.push(`\n=== ${f.label}${f.page ? ` (${f.page})` : ""} — speso ${money(f.prev)} nel periodo prima, ${money(f.cur)} ora`);
    if (!f.messages.length) lines.push("(nessun messaggio nella finestra)");
    for (const m of f.messages) lines.push(`${hhmm(m.at)} ${m.who}${m.ppv ? ` [PPV $${m.ppv}]` : ""}: ${m.text}`);
  }
  return lines.join("\n");
}

export const PERCHE_SYSTEM = `Contesto: agenzia italiana che gestisce account di creator su piattaforme per adulti. Gli operatori scrivono ai fan a nome della creator e vendono contenuti a pagamento (PPV). Il contenuto esplicito è il contesto normale del lavoro: giudichi il METODO e il rapporto con il fan, non il tema.

Sei un sales manager esperto che legge le chat per capire PERCHÉ i soldi di una creator si sono mossi. Il lettore è un sales manager che deve decidere cosa fare domani: scrivi in italiano semplice, frasi corte, niente gergo inglese.

EVIDENZA DAI NOSTRI DATI (set-ott 2026), usala e non contraddirla:
- Proporre mentre il fan sta scrivendo vende molto di più (18% contro 1,5% se il fan tace da più di un'ora).
- Quando il fan chiede di vedere qualcosa, il PPV si vende circa il doppio.
- Domande in più e messaggi più lunghi vanno insieme a MENO vendite.
- Le conclusioni tratte da pochi esempi spesso sono false: dichiara sempre su quanti fan si regge una causa.

REGOLE:
- I numeri del pacchetto sono già giusti: non ricalcolarli e non inventarne altri. Se citi un numero, deve essere nel pacchetto o un conteggio dei fan che hai letto.
- Ogni causa deve reggersi su più fan; indica quanti dei fan letti la mostrano.
- Le citazioni vanno copiate PAROLA PER PAROLA da una riga della chat del fan indicato (anche emoji e errori), senza l'ora né "NOI:"/"FAN:". Una citazione inventata o riassunta viene scartata dal controllo automatico.
- Distingui ciò che dipende dall'operatore (metodo), dal contenuto della creator, dal prezzo, o dal fan stesso (soldi finiti, perso interesse): non dare sempre la colpa all'operatore.
- Se il periodo prima sia stato un picco lo dice il LIVELLO NORMALE nel pacchetto: ripeti quel giudizio, non dedurlo dalle chat.
- Gli esempi devono MOSTRARE la causa a chi li legge (es. il messaggio identico mandato a tutti, il fan che dice no e l'insistenza dopo): mai una riga qualsiasi come "ok" o un saluto isolato che da sola non prova niente.
- I fan si chiamano con l'etichetta (F01…), mai per nome.
- Se le chat non spiegano il cambiamento, dillo chiaramente invece di forzare una causa.`;

export const PERCHE_TASK = `Leggi tutte le chat e rispondi con:
- sintesi: 2-3 frasi, la risposta alla domanda "perché" come la diresti a voce.
- cause: da 1 a 4, dalla più importante. Per ognuna: titolo breve, spiegazione (2-4 frasi), tipo, quanti dei fan letti la mostrano, 1-3 esempi con citazione esatta.
- azioni: da 2 a 5 cose concrete da fare questa settimana, ognuna con chi la fa.
- limiti: cosa NON si può concludere da queste chat (una frase).`;

export const PERCHE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sintesi", "cause", "azioni", "limiti"],
  properties: {
    sintesi: { type: "string" },
    cause: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titolo", "spiegazione", "tipo", "fan_letti", "esempi"],
        properties: {
          titolo: { type: "string" },
          spiegazione: { type: "string" },
          tipo: { type: "string", enum: ["metodo", "contenuto", "prezzo", "fan", "traffico", "altro"] },
          fan_letti: { type: "integer" },
          esempi: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["fan", "chi", "citazione"],
              properties: {
                fan: { type: "string" },
                chi: { type: "string", enum: ["noi", "fan"] },
                citazione: { type: "string" },
              },
            },
          },
        },
      },
    },
    azioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chi", "cosa"],
        properties: {
          chi: { type: "string", enum: ["sales manager", "operatore", "creator"] },
          cosa: { type: "string" },
        },
      },
    },
    limiti: { type: "string" },
  },
};

/**
 * Il controllo sull'AI: tiene solo le citazioni che esistono davvero nella chat del fan citato
 * (stesso lato: noi/fan). Restituisce l'analisi ripulita + quante citazioni sono state scartate.
 */
export function verifyQuotes(analysis, fans) {
  const byLabel = new Map(fans.map((f) => [f.label, f]));
  let dropped = 0;
  let kept = 0;
  const cause = (analysis?.cause || []).slice(0, 4).map((c) => {
    const esempi = (c.esempi || []).filter((e) => {
      const f = byLabel.get(String(e.fan || "").trim().toUpperCase());
      const q = norm(e.citazione);
      const ok = Boolean(f && q.length >= 3 && f.messages.some((m) => (m.who === "FAN") === (e.chi === "fan") && norm(m.text).includes(q)));
      if (ok) kept += 1; else dropped += 1;
      return ok;
    }).map((e) => {
      const f = byLabel.get(String(e.fan).trim().toUpperCase());
      const hit = f.messages.find((m) => (m.who === "FAN") === (e.chi === "fan") && norm(m.text).includes(norm(e.citazione)));
      return { fan: f.label, username: f.username || null, chi: e.chi, citazione: e.citazione, at: hit?.at || null, ppv: hit?.ppv || null, spent_prev: f.prev, spent_cur: f.cur };
    });
    return {
      titolo: String(c.titolo || ""),
      spiegazione: String(c.spiegazione || ""),
      tipo: c.tipo || "altro",
      fan_letti: Math.max(0, Math.min(fans.length, Number(c.fan_letti) || 0)),
      esempi,
    };
  });
  return {
    sintesi: String(analysis?.sintesi || ""),
    cause,
    azioni: (analysis?.azioni || []).slice(0, 5).map((a) => ({ chi: a.chi, cosa: String(a.cosa || "") })),
    limiti: String(analysis?.limiti || ""),
    citazioni: { verificate: kept, scartate: dropped },
  };
}

/** Testo libero → oggetto: accetta JSON puro o dentro un blocco ```json. */
export function parseAnalysis(text) {
  const s = String(text || "").trim();
  const body = s.startsWith("{") ? s : (s.match(/\{[\s\S]*\}/) || [])[0];
  if (!body) throw new Error("risposta AI non leggibile");
  return JSON.parse(body);
}

/** Direzione da leggere: chi perde → cosa è andato storto; chi cresce → cosa ha funzionato. */
export const dirOf = (person) => ((person?.metrics?.revenue_diff || 0) >= 0 ? "up" : "down");
