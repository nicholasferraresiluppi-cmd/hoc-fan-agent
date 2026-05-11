// Costanti delle chiavi Vercel KV per il modulo content-pipeline.
// Tutte le chiavi hanno prefisso "content:" come da regola di isolamento.

export const KEYS = {
  // Creator (multi-tenant)
  creatorsSet: "content:creators:set",                       // SET di slug attivi
  creator: (slug) => `content:creator:${slug}`,              // JSON singolo creator

  // Draft
  draft: (id) => `content:draft:${id}`,                      // JSON singolo draft
  draftsByCreator: (slug) => `content:drafts:by_creator:${slug}`,   // SET di draftId
  draftsByStatus: (status) => `content:drafts:by_status:${status}`, // SET di draftId

  // Scheduling
  scheduledZset: "content:scheduled:zset",                   // ZSET score=publishAtTs, member=draftId

  // History per creator
  history: (slug) => `content:history:${slug}`,              // LIST di HistoryEntry JSON

  // Settings + audit
  settingsGlobal: "content:settings:global",                 // JSON impostazioni globali
  auditLog: "content:audit:log",                             // LIST append-only di azioni
};

export const DRAFT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  PUBLISHED: "published",
  FAILED: "failed",
};
