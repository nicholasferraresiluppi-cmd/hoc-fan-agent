// Email d'invito in italiano (26/11/2026).
//
// Perché esiste: l'email standard di Clerk è in inglese («Invitation to join HOC Pro»)
// e sul piano gratuito il suo modello non si può modificare. Su Gmail personali finiva
// ignorata o in Spam (caso Claudia, 25/11: invito spedito ma mai visto). Quando il
// mittente su dominio verificato è configurato (HOC_MAIL_FROM, vedi welcome-store) la
// mandiamo noi via Resend, col link d'invito di Clerk dentro; altrimenti resta quella
// di Clerk. Qui solo il contenuto (funzioni pure); l'invio sta in lib/invitations.

import { PAPER } from "@/lib/welcome-card";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Testi dell'invito. inviterName e roleLabel sono facoltativi. */
export function inviteEmailContent({ email, inviterName, roleLabel } = {}) {
  const who = String(inviterName || "").trim();
  const role = String(roleLabel || "").trim();
  const opening = who
    ? `${who} ti ha invitato a entrare in HOC Pro, l'app di House of Creators${role ? `, con l'accesso «${role}»` : ""}.`
    : `Hai un invito per entrare in HOC Pro, l'app di House of Creators${role ? `, con l'accesso «${role}»` : ""}.`;
  return {
    subject: "Il tuo invito a HOC Pro",
    heading: "Il tuo invito a HOC Pro",
    paragraphs: [
      opening,
      `Premi il pulsante qui sotto e accedi con questo stesso indirizzo email${email ? ` (${email})` : ""}. Se è una Gmail puoi usare «Continua con Google».`,
      "L'invito vale 30 giorni.",
    ],
    cta: "Accetta l'invito",
    fallback: "Se il pulsante non funziona, copia questo link nel browser:",
  };
}

/** HTML (tabelle + stili inline: i client email non leggono CSS moderno). */
export function inviteEmailHtml(content, url) {
  const P = PAPER;
  const sans = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const paras = content.paragraphs.map((p) => `<p style="margin:0 0 14px;font:15px/1.6 ${sans};color:${P.soft};">${esc(p)}</p>`).join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${P.backdrop};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.backdrop};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${P.rule};border-radius:8px;">
<tr><td style="padding:32px 32px 4px;">
  <div style="font:600 11px/1 ${sans};letter-spacing:2px;text-transform:uppercase;color:${P.faint};">House of Creators · HOC Pro</div>
  <div style="font:500 24px/1.3 ${sans};color:${P.ink};margin:16px 0 18px;">${esc(content.heading)}</div>
  ${paras}
</td></tr>
<tr><td style="padding:8px 32px 8px;"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;border-radius:8px;background:${P.accent};color:#ffffff;text-decoration:none;font:500 15px/1 ${sans};">${esc(content.cta)}</a></td></tr>
<tr><td style="padding:18px 32px 30px;font:12px/1.5 ${sans};color:${P.faint};">${esc(content.fallback)}<br><a href="${esc(url)}" style="color:${P.accent};word-break:break-all;">${esc(url)}</a></td></tr>
</table>
<div style="font:12px/1.5 ${sans};color:${P.faint};margin-top:14px;">Hai ricevuto questa email perché qualcuno di House of Creators ti ha invitato su HOC Pro.</div>
</td></tr></table></body></html>`;
}

/** Versione testo semplice (anti-spam, client senza HTML). */
export function inviteEmailText(content, url) {
  return [content.heading, "", ...content.paragraphs.flatMap((p) => [p, ""]), `${content.cta}: ${url}`].join("\n");
}
