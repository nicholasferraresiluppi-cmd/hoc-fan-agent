// Attestato di benvenuto (26/09/2026, richiesta Nicholas): il messaggio che
// accoglie un operatore invitato è scritto e modificabile in app (Membri) e ha la
// forma di un attestato, non di una mail di sistema. Lo stesso contenuto vive in
// due posti: l'EMAIL d'invito (quando il dominio di invio è verificato) e la
// SCHERMATA al primo accesso (sempre). Funzioni pure: usate da client e server.
//
// Colori FISSI (eccezione dichiarata al tema a variabili): l'attestato è un
// oggetto, deve essere identico nell'email — dove le CSS variables non esistono —
// e nell'app, in tema chiaro o scuro.

export const PAPER = {
  paper: "#fbf9f4", ink: "#1b1a17", soft: "#5d5a52", faint: "#8f8a7e",
  rule: "#d9d2c1", accent: "#6353e0", accentSoft: "#ebe8fd", backdrop: "#efece4",
};

export const DEFAULT_WELCOME = {
  subject: "Il tuo accesso a HOC Pro",
  kicker: "House of Creators · HOC Pro",
  heading: "Ti diamo il benvenuto",
  badge: "Gruppo pilota · {mese}",
  body:
    "{nome}, da oggi hai accesso a HOC Pro, lo strumento interno di House of Creators. Sei tra le prime persone a usarlo: prima di aprirlo a tutti ci serve il tuo parere.\n\n" +
    "In «I miei score» trovi due numeri da 0 a 100. Vendite: quanto rendi per turno rispetto ai colleghi sulle stesse creator e a tutta l'agenzia — è quello delle revisioni mensili. Mestiere: come lavori in chat rispetto a chi lavora sulla tua creator o nella tua lingua — è quello del percorso di carriera. Possono essere diversi, ed è normale. 50 vuol dire metà gruppo, non una bocciatura.\n\n" +
    "In «Il mio percorso» vedi quanto ti manca al livello successivo; in «Il mio compenso» turni e maturato. Nessuno di questi numeri è una classifica pubblica. Se qualcosa non ti torna, usa «Segnala o suggerisci»: leggiamo tutto.",
  cta: "Entra in HOC Pro",
  signName: "Nicholas Ferraresi Luppi",
  signRole: "Board, House of Creators",
};

export const WELCOME_FIELDS = [
  { key: "subject", label: "Oggetto dell'email", max: 120 },
  { key: "kicker", label: "Intestazione piccola", max: 60 },
  { key: "heading", label: "Titolo", max: 60 },
  { key: "badge", label: "Nastrino", max: 60 },
  { key: "body", label: "Messaggio", max: 2500, multiline: true },
  { key: "cta", label: "Testo del bottone", max: 40 },
  { key: "signName", label: "Firma", max: 60 },
  { key: "signRole", label: "Ruolo di chi firma", max: 60 },
];

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Tiene solo i campi noti, stringhe, entro i limiti; i vuoti tornano al default. */
export function sanitizeWelcome(t) {
  const out = {};
  for (const f of WELCOME_FIELDS) {
    const v = typeof t?.[f.key] === "string" ? t[f.key].replace(/\r\n/g, "\n").slice(0, f.max) : "";
    out[f.key] = v.trim() ? v : DEFAULT_WELCOME[f.key];
  }
  return out;
}

/** Variabili di un destinatario: {nome} = nome di battesimo, {nome_completo}, {creator}, {mese}. */
export function welcomeVars({ employee, creator, date = new Date(), number } = {}) {
  const full = String(employee || "").trim() || "Mario Rossi";
  return {
    nome: full.split(/\s+/)[0],
    nome_completo: full,
    creator: creator ? String(creator) : "",
    mese: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    numero: number ? String(number).padStart(3, "0") : null,
  };
}

export function fill(text, vars) {
  return String(text || "").replace(/\{(nome_completo|nome|creator|mese)\}/g, (_, k) => vars[k] || "");
}

/** Il contenuto pronto da mostrare (stesso per email e app). */
export function composeWelcome(template, vars) {
  const t = sanitizeWelcome(template);
  return {
    subject: fill(t.subject, vars),
    kicker: fill(t.kicker, vars),
    heading: fill(t.heading, vars),
    badge: fill(t.badge, vars),
    paragraphs: fill(t.body, vars).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    cta: fill(t.cta, vars),
    signName: fill(t.signName, vars),
    signRole: fill(t.signRole, vars),
    recipient: vars.nome_completo,
    creator: vars.creator,
    number: vars.numero,
  };
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML email (tabelle + stili inline: i client email non leggono CSS moderno). */
export function welcomeEmailHtml(card, url) {
  const P = PAPER;
  const serif = "Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const paras = card.paragraphs.map((p) => `<p style="margin:0 0 14px;font:15px/1.65 ${sans};color:${P.soft};">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(card.subject)}</title></head>
<body style="margin:0;padding:0;background:${P.backdrop};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.backdrop};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${P.paper};border:1px solid ${P.rule};border-radius:6px;">
<tr><td style="padding:10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${P.rule};border-radius:3px;">
<tr><td align="center" style="padding:36px 32px 8px;">
  <div style="font:600 11px/1 ${sans};letter-spacing:3px;text-transform:uppercase;color:${P.faint};">${esc(card.kicker)}</div>
  <div style="height:1px;width:64px;background:${P.accent};margin:18px auto 22px;"></div>
  <div style="font:400 32px/1.2 ${serif};color:${P.ink};">${esc(card.heading)}</div>
  <div style="font:italic 14px/1.4 ${serif};color:${P.faint};margin:18px 0 6px;">questo attestato è per</div>
  <div style="font:400 36px/1.2 ${serif};color:${P.ink};padding-bottom:10px;border-bottom:2px solid ${P.accent};display:inline-block;">${esc(card.recipient)}</div>
  ${card.creator ? `<div style="font:13px/1.4 ${sans};color:${P.faint};margin-top:10px;">${esc(card.creator)}</div>` : ""}
  <div style="margin:20px 0 4px;"><span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${P.accentSoft};color:${P.accent};font:500 12px/1 ${sans};letter-spacing:1px;text-transform:uppercase;">${esc(card.badge)}</span></div>
</td></tr>
<tr><td style="padding:22px 32px 6px;">${paras}</td></tr>
${url ? `<tr><td align="center" style="padding:6px 32px 26px;"><a href="${esc(url)}" style="display:inline-block;padding:13px 28px;border-radius:8px;background:${P.accent};color:#ffffff;text-decoration:none;font:500 15px/1 ${sans};">${esc(card.cta)}</a>
<div style="font:12px/1.5 ${sans};color:${P.faint};margin-top:10px;">Il link è personale: accedi con questa stessa email.</div></td></tr>` : ""}
<tr><td style="padding:10px 32px 34px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td valign="bottom" style="font:${sans};">
    <div style="font:italic 20px/1.2 ${serif};color:${P.ink};">${esc(card.signName)}</div>
    <div style="height:1px;background:${P.rule};margin:8px 0 6px;width:220px;"></div>
    <div style="font:12px/1.4 ${sans};color:${P.faint};">${esc(card.signRole)}</div>
  </td>
  <td align="right" valign="bottom" width="84" style="width:84px;"><div style="width:76px;min-width:76px;height:76px;border-radius:50%;border:2px solid ${P.accent};color:${P.accent};text-align:center;font:600 10px/1.25 ${sans};letter-spacing:1px;text-transform:uppercase;display:table-cell;vertical-align:middle;">HOC<br>Pro${card.number ? `<br>N. ${esc(card.number)}` : ""}</div></td>
</tr></table></td></tr>
</table></td></tr></table>
</td></tr></table></body></html>`;
}

/** Versione testo semplice (anti-spam, client senza HTML). */
export function welcomeEmailText(card, url) {
  return [card.heading, card.recipient, "", ...card.paragraphs.flatMap((p) => [p, ""]), url ? `${card.cta}: ${url}` : "", "", card.signName, card.signRole].join("\n");
}
