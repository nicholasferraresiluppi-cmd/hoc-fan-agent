/**
 * Documenti della persona (18/10/2026) — parte pura, senza I/O: la usano il server e i test.
 *
 * I file stanno su ClickUp, allegati al task della persona. Finora l'app ne teneva solo i
 * riferimenti (documento d'identità, CV, contratto) e un file caricato a mano su ClickUp in
 * app non si vedeva: Nicholas, "se aggiungo un documento su ClickUp deve arrivare anche su
 * HOC Pro, altrimenti non ha senso tenere uno dei due". Ora la scheda legge l'elenco DAL TASK
 * a ogni apertura (niente copia da tenere allineata) e apre i file passando dal server.
 */

export const DOC_KINDS = {
  id: "Documento d'identità",
  contract: "Contratto",
  cv: "CV",
  other: "Altro",
};

/** Tipo del documento dal titolo (indicativo: serve a ordinare e a etichettare, non decide niente). */
export function attachmentKind(title) {
  const t = String(title || "").toLowerCase();
  if (/document[oi]? ?d.?identit|carta d.?identit|passaport|patente|\bc\.?i\.?\b|permesso di soggiorno/.test(t)) return "id";
  if (/contratt|contract|accordo|\bnda\b/.test(t)) return "contract";
  if (/\bcv\b|curriculum|resume/.test(t)) return "cv";
  return "other";
}

/** Allegato ClickUp → riga per l'interfaccia. L'URL del file NON esce mai: si apre solo dal server. */
export function publicAttachment(a, { field = null } = {}) {
  const title = String(a?.title || a?.name || "documento").trim();
  return {
    id: String(a?.id || ""),
    title,
    extension: String(a?.extension || title.split(".").pop() || "").toLowerCase().slice(0, 8),
    size: Number(a?.size) || null,
    date: Number(a?.date) || null,
    kind: attachmentKind(title),
    field, // campo ClickUp in cui sta il file (es. «CV», «Contract PDF»), null = allegato del task
  };
}

const KIND_ORDER = { id: 0, contract: 1, cv: 2, other: 3 };

/** Allegati del task + file nei campi «allegato», senza doppioni, i più utili in cima. */
export function collectAttachments(task) {
  const out = new Map();
  for (const a of task?.attachments || []) if (a?.id && !a.deleted) out.set(String(a.id), { raw: a, row: publicAttachment(a) });
  for (const cf of task?.custom_fields || []) {
    if (cf?.type !== "attachment" || !Array.isArray(cf.value)) continue;
    for (const a of cf.value) if (a?.id && !out.has(String(a.id))) out.set(String(a.id), { raw: a, row: publicAttachment(a, { field: cf.name || null }) });
  }
  return [...out.values()].sort((x, y) => (KIND_ORDER[x.row.kind] - KIND_ORDER[y.row.kind]) || ((y.row.date || 0) - (x.row.date || 0)));
}

/** Nome sicuro per l'header Content-Disposition (il titolo vero resta su ClickUp). */
export function safeFilename(title) {
  return String(title || "documento").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ._()-]+/g, "").trim().slice(0, 120) || "documento";
}
