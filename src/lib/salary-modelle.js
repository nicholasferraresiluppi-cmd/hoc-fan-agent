// Modelle salary — lettura server della lista ClickUp «Candidate» (26/11/2026). Sola lettura:
// la card ClickUp resta il registro, qui la si guarda. Cache KV 5 minuti (la lista cambia a mano,
// poche volte al giorno; «Aggiorna» la salta).
import { kv } from "@vercel/kv";
import { clickupGet } from "./clickup-hr-api.js";
import { CANDIDATE_LIST_ID } from "./salary-manuale.js";
import { toModel, sortModels, countByStep } from "./salary-modelle-core.js";

const CACHE_KEY = "salary:modelle:v1";
const TTL = 300;
const MAX_COMMENTS = 25; // un commento per modella attiva: oltre, la pagina resta veloce e si legge la card

async function lastComment(taskId) {
  try {
    const d = await clickupGet(`/task/${encodeURIComponent(taskId)}/comment`);
    const c = (d.comments || [])[0]; // ClickUp li dà dal più recente
    return c ? { text: c.comment_text, date: c.date, by: c.user?.username || null } : null;
  } catch {
    return null; // un commento che non arriva non deve far cadere la pagina
  }
}

async function fetchFromClickup() {
  const tasks = [];
  for (let page = 0; page < 10; page++) {
    const d = await clickupGet(`/list/${CANDIDATE_LIST_ID}/task?page=${page}&include_closed=true&subtasks=false&archived=false&include_markdown_description=true`);
    tasks.push(...(d.tasks || []));
    if (d.last_page || !(d.tasks || []).length) break;
  }
  const draft = tasks.map((t) => toModel(t));
  const withComments = new Set(draft.filter((m) => m.step !== -1).slice(0, MAX_COMMENTS).map((m) => m.id));
  const models = [];
  for (const t of tasks) {
    const c = withComments.has(String(t.id)) ? await lastComment(t.id) : null;
    models.push(toModel(t, c));
  }
  return models;
}

// Solo in sviluppo locale e senza chiave ClickUp (che `vercel env pull` restituisce vuota): dati finti
// dichiarati tali, per vedere la pagina. In produzione senza chiave si mostra l'errore, mai dati finti.
function demoModels() {
  const now = Date.now(), d = 86400000;
  const t = (id, name, status, days, md, comment) => toModel(
    { id, name, status: { status }, url: null, date_updated: String(now - days * d), date_created: String(now - (days + 3) * d), markdown_description: md, assignees: [{ username: "Nicholas" }] },
    comment ? { text: comment, date: now - days * d, by: "Nicholas" } : null,
  );
  return [
    t("demo1", "Prova A · Paese, 20 · Marketplace", "offerta inviata", 1, "| Età | 20 |\n| Paese | Paese di prova |\n| Tempo al giorno | 4 ore |", "Call fatta, deal presentato. Domande su pagamento: risposta pronta."),
    t("demo2", "Prova B · Paese, 23 · Marketplace", "trovata", 4, "| Età | 23 |\n| Tempo al giorno | 3 ore |", "Annuncio letto, in attesa della garanzia."),
    t("demo3", "Prova C · Paese, 21 · Marketplace", "scartata", 9, "", "Lavorava già con un'altra agenzia."),
  ];
}

export async function getSalaryModels({ force = false } = {}) {
  if (!process.env.CLICKUP_API_TOKEN) {
    if (process.env.NODE_ENV === "development") {
      const models = sortModels(demoModels());
      return { models, counts: countByStep(models), at: Date.now(), demo: true };
    }
    const e = new Error("Manca la chiave ClickUp (CLICKUP_API_TOKEN): non posso leggere la lista Candidate.");
    e.status = 503;
    throw e;
  }
  if (!force) {
    const hit = await kv.get(CACHE_KEY).catch(() => null);
    if (hit?.models) return { ...hit, cached: true };
  }
  const models = sortModels(await fetchFromClickup());
  const out = { models, counts: countByStep(models), at: Date.now() };
  await kv.set(CACHE_KEY, out, { ex: TTL }).catch(() => {});
  return out;
}
