// JSDoc typedef condivisi del modulo content-pipeline.
// In JS puro non hanno effetto a runtime, ma servono per autocomplete/IDE e per
// fissare lo schema dei dati salvati su KV.

/**
 * @typedef {Object} Creator
 * @property {string} slug                       Identifier univoco (es. "alice")
 * @property {string} displayName
 * @property {string} telegramChannelId          Es. "@channelusername" o "-100..."
 * @property {string} telegramBotTokenEnc        Ciphertext base64 (AES-256-GCM) del BOT_TOKEN
 * @property {string} [persona]                  Prompt persona per generazione AI
 * @property {string} [anthropicModel]           Override del modello
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {("pending"|"approved"|"rejected"|"published"|"failed")} DraftStatus
 */

/**
 * @typedef {Object} Draft
 * @property {string} id                         UUID
 * @property {string} creatorSlug
 * @property {DraftStatus} status
 * @property {string} body                       Testo del post (HTML Telegram-safe)
 * @property {string[]} mediaUrls
 * @property {number} [publishAt]                Timestamp ms — set quando lo stato è "approved"
 * @property {string} authorId                   Clerk userId dell'admin che ha creato/approvato
 * @property {string} [rejectReason]
 * @property {string} [publishError]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} draftId
 * @property {number} publishedAt
 * @property {number} telegramMessageId
 */

/**
 * @typedef {Object} AuditEntry
 * @property {number} ts
 * @property {string} actorUserId
 * @property {string} action                     Es. "creator.create", "draft.approve"
 * @property {string} [target]                   Es. slug o draftId
 * @property {Object} [meta]
 */

export {};
