// Studio social — pubblicazione su Instagram tramite Postiz (logica pura, 16/10/2026).
//
// Regola: su Instagram esce ESATTAMENTE il file controllato. Il video che passa dall'agente qualità
// viene salvato nell'app (Blob privato) e con «Approva e programma» parte quel file, non un altro.
// Postiz (cloud, app Meta già approvata) pubblica col collegamento «Instagram Standalone»: niente
// libreria audio (va bene: usiamo l'audio originale, ×1,18 nei nostri dati).

export const POSTIZ_VERSION = "postiz-1";
export const DEFAULT_PUBLISH_TIME = "18:30";
export const AI_CAPTION_NOTE = "Video realizzato con l'aiuto dell'AI.";

/** Didascalia per Instagram: quella del contenuto, più la dichiarazione AI se serve (AI Act art. 50). */
export function igCaption(item) {
  const base = String(item?.caption || "").trim();
  if (!item?.ai) return base;
  return base ? `${base}\n\n${AI_CAPTION_NOTE}` : AI_CAPTION_NOTE;
}

/** Corpo della richiesta Postiz per programmare un reel (video singolo, post_type "post" = reel). */
export function buildPostizBody({ integrationId, item, whenMs, media }) {
  if (!integrationId) throw new Error("Canale Instagram non trovato su Postiz");
  if (!Number.isFinite(whenMs)) throw new Error("Manca l'ora di uscita");
  if (!media?.id || !media?.path) throw new Error("Video non caricato su Postiz");
  return {
    type: "schedule",
    date: new Date(whenMs).toISOString(),
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: integrationId },
      value: [{ content: igCaption(item), image: [{ id: media.id, path: media.path }] }],
      settings: { __type: "instagram-standalone", post_type: item?.kind === "storia" ? "story" : "post", collaborators: [] },
    }],
  };
}

/** Stato Postiz → passo della coda. */
export function stateToStatus(state) {
  if (state === "PUBLISHED") return "pubblicato";
  if (state === "ERROR") return "errore";
  return "programmato";
}

/** Canale Postiz del profilo: per nome utente Instagram, solo se attivo. */
export function pickIntegration(integrations, handle) {
  const h = String(handle || "").replace(/^@/, "").toLowerCase();
  return (integrations || []).find((i) => !i.disabled && String(i.profile || "").toLowerCase() === h && /instagram/.test(String(i.identifier || i.providerIdentifier || ""))) || null;
}

/** Si può mandare a Postiz? Serve il video salvato, l'ora, e il contenuto approvato. */
export function canPublishIg(item, whenMs, now = Date.now()) {
  if (!item) return { ok: false, reason: "Contenuto non trovato" };
  if (item.status !== "programmato") return { ok: false, reason: "Prima va approvato (Approva e programma)" };
  if (!item.video?.path) return { ok: false, reason: "Manca il video controllato: fai il controllo AI scegliendo il video montato" };
  if (!Number.isFinite(whenMs)) return { ok: false, reason: "Manca l'ora di uscita" };
  if (whenMs < now + 5 * 60e3) return { ok: false, reason: "L'ora di uscita deve essere almeno tra 5 minuti" };
  if (item.postiz?.postId && item.postiz?.state !== "ERROR") return { ok: false, reason: "È già programmato su Instagram" };
  return { ok: true, reason: null };
}
