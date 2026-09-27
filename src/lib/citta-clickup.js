// La città ← ClickUp, ogni notte (27/09/2026). Legge le attività aperte degli spazi del
// palazzo (creator dello split + sede) con la chiave CLICKUP_API_TOKEN (solo server, mai
// esposta), assegna a ogni attività un'area dal TITOLO (etichette già fatte in KV
// `citta:labels`; i titoli nuovi li classifica un modello piccolo con le stesse regole) e
// ricostruisce la fotografia `citta:snapshot` con le stesse regole della prima (build_data).
// Composizione della città (quali palazzi, quali spazi) in KV `citta:comp`.
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { saveCitySnapshot, romeDay } from "@/lib/citta";

const API = "https://api.clickup.com/api/v2";
export const LABELS_KEY = "citta:labels";
export const COMP_KEY = "citta:comp";
// chi lavora a ogni palazzo secondo ClickUp (assegnatari delle attività aperte): base del "team progetto"
export const TEAMS_KEY = "citta:teams";
// Piani = aree ufficiali del playbook HOC (27/09/2026, Nicholas): HR & People (assorbe i Deal), Finance,
// Media Buying, Marketing (organic social: SMM, editor, publisher), OnlyFans = Sales + Chatting.
// Tech e Scrum Master non sono piani (Tech oggi non esiste; Scrum Master è trasversale).
export const AREAS = ["HR & People", "Finance", "Media Buying", "Marketing", "Sales", "Chatting"];
const HQA = [["Direzione", "Direzione"], ["HR & People", "HR & People"], ["Finance", "Finance"], ["Media Buying", "Media Buying"], ["Marketing", "Marketing"], ["Sales", "Sales"], ["Chatting", "Chatting"], ["Creator", "Creator"]];
const ALL_AREAS = ["Direzione", "HR & People", "Finance", "Media Buying", "Marketing", "Sales", "Chatting", "Creator", "Altro"];
const DONE = /^(done|complete|completed|closed|fatto|completat[oa]|deprecated|cancel+ed|annullat[oa]|archiviat[oa]|published|interrott[oa]|rimborsata|deleted|signed|consegnato all'utente|rimoss[oa]|conclus[oa])$/i;
const DAY = 864e5;

export const clickupConfigured = () => Boolean(process.env.CLICKUP_API_TOKEN);

async function cu(path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { Authorization: process.env.CLICKUP_API_TOKEN, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`ClickUp ${r.status} su ${path.split("?")[0]}`);
  return r.json();
}

async function spaceTasks(team, spaceId) {
  const out = [];
  for (let page = 0; page < 20; page++) {
    const d = await cu(`/team/${team}/task?space_ids[]=${spaceId}&include_closed=false&subtasks=true&page=${page}`);
    for (const t of d.tasks || []) {
      const status = t.status?.status || "";
      if (DONE.test(status.trim())) continue;
      out.push({
        id: t.id, space: spaceId, name: String(t.name || "").trim(), list: String(t.list?.name || "").trim(), status,
        due: t.due_date ? Number(t.due_date) : null, upd: t.date_updated ? Number(t.date_updated) : null,
        who: (t.assignees || []).map((a) => String(a.username || "").split("@")[0].split(" ")[0]).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)),
        people: (t.assignees || []).map((a) => ({ id: String(a.id || ""), name: String(a.username || "").replace(/\s*[([{][^)\]}]*[)\]}]/g, "").replace(/\s+/g, " ").trim(), email: String(a.email || "").trim().toLowerCase() })).filter((a) => a.email || a.id),
      });
    }
    if (d.last_page || !(d.tasks || []).length) break;
  }
  return out;
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const RULES = `Aree (una sola per titolo):
- Direzione: decisioni, strategia, riunioni di board, pianificazione generale, obiettivi
- HR & People: persone e accordi: colloqui, assunzioni, onboarding, formazione del personale, 1to1, feedback, turni del personale, offboarding, ruoli; accordi e contratti con creator o partner, proposte, percentuali, firme, rinnovi, trattative
- Finance: pagamenti, fatture, prelievi, ricevute, spese, acquisti, costi, conti, IVA, commercialista, payout, budget
- Media Buying: traffico a pagamento: ads (Meta, TikTok, Reddit…), campagne pubblicitarie, media buyer, budget ads, funnel e landing delle ads, farming, crescite/followers acquistati, tracking link delle campagne
- Marketing: contenuti organici sui social: shooting, foto, video, reel, storie, post, caroselli, piano editoriale, editing, publisher, social media manager, localizzazione, caricare contenuti, trend, alterego, vestiti/oggetti per shooting
- Sales: vendite su OnlyFans: promo OF, prezzi, bundle, abbonamenti e rinnovi, strategia PPV, analisi revenue OF, link OF, profilo OF
- Chatting: chat con i fan: chatter/operatori in chat, script di chat, PPV in chat, custom, mass message, messaggi ai fan, turni chat, Infloww
- Creator: relazione e gestione della creator come persona: call con la creator, sua agenda, benessere, viaggi
- Altro: non capibile o generico (un nome, una data, un link)`;

/** Classifica i titoli nuovi (max `limit` a notte) con un modello piccolo; ritorna {titolo: area}. */
async function classifyNew(titles, limit = 400) {
  const todo = titles.slice(0, limit);
  if (!todo.length || !process.env.ANTHROPIC_API_KEY) return {};
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const out = {};
  for (let k = 0; k < todo.length; k += 100) {
    const chunk = todo.slice(k, k + 100);
    const msg = await anthropic.messages.create({
      model: process.env.CITTA_LABEL_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: `Agenzia che gestisce creator OnlyFans (chat con i fan fatte da operatori, contenuti, vendite, accordi). Classifica ogni titolo di attività (o nome di lista) ClickUp.\n${RULES}\nRispondi SOLO con JSON {"<numero>": "<area>"}.\n\n${chunk.map((t, i) => `${i}: ${t.slice(0, 140)}`).join("\n")}` }],
    });
    const txt = msg.content?.map((c) => c.text || "").join("") || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) continue;
    try {
      const j = JSON.parse(m[0]);
      chunk.forEach((t, i) => { const a = j[String(i)]; if (ALL_AREAS.includes(a)) out[t.slice(0, 140)] = a; });
    } catch { /* un blocco malformato non ferma gli altri */ }
  }
  return out;
}

function summarize(ts, now) {
  if (!ts.length) return { s: "none", open: 0, late: 0, l: "Nessuna attività aperta in ClickUp.", short: "—" };
  const od = ts.filter((t) => t.due && t.due < now);
  const lu = Math.max(...ts.map((t) => t.upd || 0)) || null;
  const days = lu ? Math.round((now - lu) / DAY) : null;
  const s = !lu || lu < now - 90 * DAY ? "old" : lu < now - 14 * DAY ? "stop" : od.length ? "wait" : "ok";
  const ago = days == null ? "mai" : days <= 0 ? "oggi" : days === 1 ? "ieri" : `${days} giorni fa`;
  let l = (s === "old" && days ? `ClickUp non aggiornato da ${days} giorni: da riordinare, non per forza un ritardo. ` : "") +
    `${ts.length} ${ts.length === 1 ? "cosa aperta" : "cose aperte"}${od.length ? `, ${od.length} in ritardo` : ""}. Ultimo movimento ${ago}.`;
  let link = null;
  if (od.length) {
    const w = [...od].sort((a, b) => a.due - b.due)[0];
    l += ` Il ritardo più vecchio: «${w.name.slice(0, 60)}${w.name.length > 60 ? "…" : ""}».`;
    link = `https://app.clickup.com/t/${w.id}`;
  }
  const cnt = {};
  for (const t of ts) for (const p of t.who) cnt[p] = (cnt[p] || 0) + 1;
  const who = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p);
  return { s, open: ts.length, late: od.length, l, who, link, short: s === "old" ? "da riordinare" : od.length ? `${od.length} in ritardo` : `${ts.length} aperte` };
}

/** Rilegge ClickUp e riscrive la fotografia della città. */
export async function refreshCityFromClickup(now = Date.now()) {
  if (!clickupConfigured()) throw new Error("CLICKUP_API_TOKEN non configurata");
  const comp = await kv.get(COMP_KEY);
  if (!comp?.projects?.length) throw new Error("Composizione della città mancante (citta:comp)");
  const spaces = [...new Set([...comp.projects.map((p) => p.space).filter(Boolean), ...(comp.sede || [])])];
  const bySpace = await pool(spaces, 4, (sid) => spaceTasks(comp.team, sid));
  const all = bySpace.flat();

  const labels = (await kv.get(LABELS_KEY)) || {};
  const key = (t) => t.name.slice(0, 140);
  // il nome della LISTA aiuta quando il titolo da solo non dice nulla (sotto-attività che sono
  // solo un nome di persona dentro "Colloqui", ecc.): chiave "lista:<nome>" nella stessa mappa
  const lkey = (t) => (t.list ? `lista:${t.list.slice(0, 120)}` : null);
  const unknownLists = [...new Set(all.map(lkey).filter((k) => k && !labels[k]))];
  const unknown = [...new Set(all.map(key).filter((k) => !labels[k]))];
  const freshLists = await classifyNew(unknownLists.map((k) => k.slice(6)), 200);
  const fresh = await classifyNew(unknown);
  for (const [k, v] of Object.entries(freshLists)) fresh[`lista:${k}`] = v;
  if (Object.keys(fresh).length) { Object.assign(labels, fresh); await kv.set(LABELS_KEY, labels); }
  const area = (t) => {
    const a = labels[key(t)];
    if (a && a !== "Altro") return a;
    const l = lkey(t) && labels[lkey(t)];
    return l && l !== "Direzione" && l !== "Creator" ? l : a || "Altro";
  };

  const creatorSpaces = new Set(comp.projects.map((p) => p.space).filter(Boolean));
  const projects = comp.projects.map((p) => {
    const first = p.n.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`\\b${first}\\b`, "i");
    const ts = p.space ? all.filter((t) => t.space === p.space) : all.filter((t) => rx.test(t.name));
    const by = {};
    for (const t of ts) (by[area(t)] ||= []).push(t);
    return {
      n: p.n, nospace: !p.space, total: ts.length,
      other: (by.Altro || []).length + (by.Direzione || []).length + (by.Creator || []).length,
      areas: AREAS.map((a) => ({ n: a, ...summarize(by[a] || [], now) })),
    };
  });
  const sede = all.filter((t) => !creatorSpaces.has(t.space));
  const bys = {};
  for (const t of sede) (bys[area(t)] ||= []).push(t);
  const creatorRel = all.filter((t) => creatorSpaces.has(t.space) && area(t) === "Creator");
  const hq = {
    n: "Azienda", total: sede.length, other: (bys.Altro || []).length,
    areas: HQA.map(([n, src]) => ({ n, ...summarize([...(bys[src] || []), ...(n === "Creator" ? creatorRel : [])], now) })),
  };
  // team da ClickUp: assegnatari per palazzo, con quante cose aperte / in ritardo hanno lì
  const teamOf = (ts) => {
    const m = {};
    for (const t of ts) for (const a of t.people || []) {
      const k = a.email || `cu:${a.id}`;
      if (!m[k]) m[k] = { name: a.name, email: a.email, cuId: a.id, open: 0, late: 0, areas: {} };
      m[k].open += 1; if (t.due && t.due < now) m[k].late += 1;
      const ar = area(t); m[k].areas[ar] = (m[k].areas[ar] || 0) + 1;
    }
    return Object.values(m).sort((x, y) => y.open - x.open).slice(0, 40)
      .map((x) => ({ ...x, areas: Object.entries(x.areas).sort((a, b) => b[1] - a[1]).map(([a]) => a).filter((a) => a !== "Altro").slice(0, 3) }));
  };
  const teams = { at: now, towers: {} };
  for (const p of comp.projects) {
    const first = p.n.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`\\b${first}\\b`, "i");
    teams.towers[p.n] = teamOf(p.space ? all.filter((t) => t.space === p.space) : all.filter((t) => rx.test(t.name)));
  }
  teams.towers.Azienda = teamOf(sede);
  await kv.set(TEAMS_KEY, teams);

  const coverage = all.length ? all.filter((t) => area(t) !== "Altro").length / all.length : 0;
  const snap = await saveCitySnapshot({ generated: romeDay(new Date(now)), projects, hq, coverage });
  return { tasks: all.length, spaces: spaces.length, newLabels: Object.keys(fresh).length, unknownLeft: Math.max(0, unknown.length + unknownLists.length - Object.keys(fresh).length), projects: snap.projects.length };
}

/** Commento sull'attività ClickUp quando qualcuno prende in carico un piano (best-effort). */
export async function commentClaim(taskUrl, text) {
  if (!clickupConfigured()) return false;
  const m = /^https:\/\/app\.clickup\.com\/t\/([A-Za-z0-9]+)$/.exec(taskUrl || "");
  if (!m) return false;
  await cu(`/task/${m[1]}/comment`, { method: "POST", body: JSON.stringify({ comment_text: text, notify_all: false }) });
  return true;
}
