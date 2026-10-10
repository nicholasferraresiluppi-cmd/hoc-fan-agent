#!/usr/bin/env node
/**
 * Robot del giro per persona + prova del compito (10/10/2026, lib/qualita).
 *
 * Entra in HOC Pro con l'account QA (admin), chiede il piano (/api/admin/qualita/plan), e per ogni persona:
 *   1. attiva «Vedi come» (stessi permessi e stesse creator della persona; sola lettura)
 *   2. legge le voci del SUO menu e le apre una per una: API negate o in errore, errori della pagina,
 *      testi d'errore, lentezza, pagine quasi vuote
 *   3. esegue i suoi compiti (lib/qualita-tasks) dall'inizio alla fine
 * Poi spegne «Vedi come» e consegna il rapporto (/api/admin/qualita/report) → alert «Giro per persona».
 * Le visite del robot non entrano nelle statistiche d'uso (/api/track bloccato).
 *
 * Uso:  CLERK_PROD_SECRET=… node scripts/qualita/giro.mjs [--dry] [--only=<chiave persona>] [--max-pages=N]
 * Env:  QA_EMAIL (default account QA) · HOC_BASE (default produzione) · CHROME_PATH
 * Gira ogni lunedì da .github/workflows/giro-qualita.yml.
 */
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const BASE = process.env.HOC_BASE || "https://houseofcreators.app";
const QA_EMAIL = process.env.QA_EMAIL || "nferraresiluppi@gmail.com";
const SECRET = process.env.CLERK_PROD_SECRET;
const MAX_PAGES = Number(args["max-pages"]) || 200;
const SLOW_MS = 8000;
const CHROME = process.env.CHROME_PATH || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser",
].find((p) => fs.existsSync(p));
if (!SECRET) { console.error("Manca CLERK_PROD_SECRET"); process.exit(2); }

const puppeteer = (await import("puppeteer-core")).default;
const clerk = (p, o = {}) => fetch("https://api.clerk.com/v1" + p, { ...o, headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" } }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// --- login con token monouso Clerk (come ux-snap) ---
const [user] = await clerk(`/users?email_address=${encodeURIComponent(QA_EMAIL)}`);
if (!user?.id) { console.error("Account QA non trovato su Clerk"); process.exit(2); }
const tok = await clerk("/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: user.id, expires_in_seconds: 300 }) });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--window-size=1440,1000"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.setRequestInterception(true);
page.on("request", (req) => (req.url().includes("/api/track") ? req.abort() : req.continue()));

// raccolta segnali della pagina corrente
let sink = null;
const reset = () => { sink = { api: [], pageErrors: [], console: [] }; };
reset();
page.on("response", (res) => {
  const u = res.url();
  if (!u.startsWith(BASE) || !u.includes("/api/") || u.includes("/api/track")) return;
  if (res.status() >= 400 && res.status() !== 429) sink.api.push({ path: new URL(u).pathname, status: res.status() }); // 429 = limite toccato dal robot stesso
});
page.on("pageerror", (e) => sink.pageErrors.push(String(e?.message || e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/favicon|DevTools|clerk|Failed to load resource|ERR_FAILED|net::/i.test(t)) return; // rumore o già contato dalle risposte
  sink.console.push(t.slice(0, 200));
});

await page.goto(`${BASE}/sign-in?__clerk_ticket=${tok.token}`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(4000);
await page.goto(`${BASE}/guida`, { waitUntil: "networkidle2", timeout: 60000 });
const api = (path, opts = {}) => page.evaluate(async (path, opts) => {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  let j = null; try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, body: j };
}, path, opts);

const plan = await api("/api/admin/qualita/plan");
if (!plan.ok) { console.error("Piano non disponibile:", plan.status, plan.body?.error); await browser.close(); process.exit(1); }
const ERROR_TEXTS = plan.body.errorTexts || [];
let personas = plan.body.personas;
if (args.only) personas = personas.filter((p) => p.key.startsWith(String(args.only)));
log(`piano: ${personas.length} persone`);

const textOf = () => page.evaluate(() => (document.querySelector("main") || document.body).innerText || "");
// Pronta = il contenuto smette di cambiare (alcune pagine tengono connessioni aperte: aspettare la rete
// ferma dava 21 s a tutte). Il tempo misurato è quello fino al primo istante stabile.
async function settle(navPromise) {
  const t0 = Date.now();
  let navError = null;
  try { await navPromise; } catch (e) { navError = String(e?.message || e).slice(0, 160); }
  let prev = -1, stableSince = Date.now(), readyAt = null;
  while (Date.now() - t0 < 25000) {
    await sleep(300);
    const { len, loading } = await page.evaluate(() => {
      const t = (document.querySelector("main") || document.body).innerText || "";
      return { len: t.length, loading: /caricamento|loading…|sto calcolando/i.test(t.slice(0, 2000)) };
    }).catch(() => ({ len: -1, loading: true }));
    if (len !== prev || loading) { prev = len; stableSince = Date.now(); continue; }
    if (Date.now() - stableSince >= 1500) { readyAt = stableSince; break; }
  }
  return { ms: (readyAt || Date.now()) - t0, navError, timedOut: !readyAt };
}

async function readMenu() {
  return page.evaluate(() => {
    const seen = new Set();
    return [...document.querySelectorAll("aside nav a[href^='/']")].map((a) => ({ href: a.getAttribute("href").split("#")[0], label: (a.innerText || a.getAttribute("title") || "").trim().split("\n")[0] }))
      .filter((l) => l.href && !l.href.startsWith("/sign") && !seen.has(l.href) && seen.add(l.href));
  });
}

async function visit(link) {
  reset();
  const { ms, navError, timedOut } = await settle(page.goto(BASE + link.href, { waitUntil: "domcontentloaded", timeout: 45000 }));
  const raw = await textOf();
  const text = raw.toLowerCase();
  const url = page.url();
  return { link, ms, navError, timedOut, text, excerpt: raw.replace(/\s+/g, " ").slice(0, 1500), url, api: sink.api, pageErrors: sink.pageErrors, console: sink.console };
}

function judge(v, ignoreApi) {
  const fail = [], warn = [];
  const apiBad = v.api.filter((a) => !ignoreApi.has(`${a.status} ${a.path}`));
  if (v.navError) fail.push(`la pagina non si apre: ${v.navError}`);
  if (v.url.includes("/sign-in")) fail.push("rimanda al login");
  for (const a of apiBad.filter((a) => a.status >= 500)) fail.push(`errore del server (${a.status}) su ${a.path}`);
  for (const a of apiBad.filter((a) => a.status === 403)) fail.push(`accesso negato (403) su ${a.path}`);
  for (const a of apiBad.filter((a) => a.status !== 403 && a.status < 500)) warn.push(`${a.status} su ${a.path}`);
  for (const e of v.pageErrors) fail.push(`errore nella pagina: ${e}`);
  const shown = ERROR_TEXTS.filter((t) => v.text.includes(t));
  if (shown.length) fail.push(`a schermo: «${shown.join("», «")}»`);
  if (v.timedOut) warn.push("non smette di caricare (25 s)");
  else if (v.ms > SLOW_MS) warn.push(`lenta: ${(v.ms / 1000).toFixed(1)} s`);
  if (v.text.replace(/\s+/g, " ").trim().length < 80) warn.push("quasi vuota");
  for (const c of v.console.slice(0, 2)) warn.push(`errore in console: ${c}`);
  return { status: fail.length ? "fail" : warn.length ? "warn" : "ok", problems: [...fail, ...warn] };
}

async function runTask(task, ignoreApi) {
  reset();
  for (let i = 0; i < task.steps.length; i++) {
    const s = task.steps[i];
    const failAt = (problem) => ({ id: task.id, title: task.title, ok: false, failedStep: i, problem, url: page.url().replace(BASE, "") });
    try {
      if (s.goto) {
        const { navError } = await settle(page.goto(BASE + s.goto, { waitUntil: "domcontentloaded", timeout: 45000 }));
        if (navError) return failAt(`${s.goto} non si apre`);
      } else if (s.click) {
        const el = await page.$(s.click);
        if (!el) return failAt("non trovo l'elemento da cliccare");
        const before = page.url();
        await el.click();
        // navigazione client-side di Next: niente evento di navigazione, si aspetta il cambio di indirizzo
        for (let w = 0; w < 30 && page.url() === before; w++) await sleep(200);
        await settle(Promise.resolve());
      } else {
        // le verifiche riprovano fino a 10 s: i dati arrivano dopo il primo disegno della pagina
        const check = async () => {
          const text = (await textOf()).toLowerCase();
          if (s.expectText) {
            const miss = [].concat(s.expectText).filter((t) => !text.includes(String(t).toLowerCase()));
            if (miss.length) return `non compare: ${miss.join(", ")}`;
          }
          if (s.expectAnyText && !s.expectAnyText.some((t) => text.includes(t.toLowerCase()))) return `non compare nessuno tra: ${s.expectAnyText.join(", ")}`;
          if (s.expectNotText) {
            const hit = s.expectNotText.filter((t) => text.includes(t.toLowerCase()));
            if (hit.length) return `a schermo: «${hit.join("», «")}»`;
          }
          if (s.expectCount) {
            const n = await page.$$eval(s.expectCount, (els) => els.length);
            if (n < (s.min || 1)) return `servono almeno ${s.min || 1} elementi «${s.expectCount}», ce ne sono ${n}`;
          }
          if (s.expectMoney && !/\$\s?\d|\d[\d.,]*\s?\$/.test(text)) return "nessun importo in dollari a schermo";
          return null;
        };
        let problem = await check();
        // «non deve comparire» si giudica subito (aspettare lo farebbe passare prima che il testo arrivi)
        for (let w = 0; problem && !s.expectNotText && w < 20; w++) { await sleep(500); problem = await check(); }
        if (problem) return failAt(problem);
      }
    } catch (e) {
      return failAt(String(e?.message || e).slice(0, 200));
    }
    // errori durante il passo: rendono il compito non riuscito
    const bad = sink.api.filter((a) => (a.status >= 500 || a.status === 403) && !ignoreApi.has(`${a.status} ${a.path}`));
    if (bad.length) return failAt(`${bad[0].status} su ${bad[0].path}`);
    if (sink.pageErrors.length) return failAt(`errore nella pagina: ${sink.pageErrors[0]}`);
    const now = (await textOf().catch(() => "")).toLowerCase();
    const shown = ERROR_TEXTS.filter((t) => now.includes(t));
    if (shown.length) return failAt(`a schermo: «${shown.join("», «")}»`);
  }
  return { id: task.id, title: task.title, ok: true, failedStep: null, problem: "" };
}

const out = [];
for (const p of personas) {
  log(`— ${p.label}`);
  const rec = { key: p.key, label: p.label, pages: [], tasks: [], error: null };
  try {
    if (p.viewAs) {
      const r = await api("/api/admin/view-as", { method: "POST", body: JSON.stringify(p.viewAs) });
      if (!r.ok) throw new Error(`«Vedi come» non attivato (${r.status} ${r.body?.error || ""})`);
    }
    // l'admin si prova sul menu completo; per tutti si apre anche «Tutti gli strumenti» del menu (stile Casa):
    // la persona può aprirlo da sé, quindi ogni voce lì dentro deve funzionare
    if (!p.viewAs) await api("/api/me/workspace", { method: "POST", body: JSON.stringify({ workspace: "all" }) });
    await page.evaluate(() => { try {
      localStorage.setItem("hoc:casa:tools", "1");          // stile Casa: «Tutti gli strumenti» aperto
      localStorage.setItem("hoc:sidebar:viewMode", "advanced"); // menu classico: tutte le voci, non solo Essential
      localStorage.setItem("hoc:sidebar:allTools", "1");
    } catch {} });
    await settle(page.goto(`${BASE}/guida`, { waitUntil: "domcontentloaded", timeout: 45000 }));
    // gruppi del menu classico chiusi → si aprono tutti (openGroups in localStorage, chiave = titolo del gruppo)
    const opened = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("aside nav button")].map((b) => (b.innerText || "").split("\n")[0].trim()).filter(Boolean);
      try { localStorage.setItem("hoc:sidebar:openGroups", JSON.stringify(Object.fromEntries(labels.map((l) => [l, true])))); } catch {}
      return labels.length;
    });
    if (opened) await settle(page.goto(`${BASE}/guida`, { waitUntil: "domcontentloaded", timeout: 45000 }));
    const fullMenu = await readMenu();
    log(`  menu: ${fullMenu.length} voci`);
    const menu = fullMenu.slice(0, MAX_PAGES);
    if (!menu.length) throw new Error("menu vuoto: nessuna voce da aprire");
    const visits = [];
    for (const link of menu) { visits.push(await visit(link)); process.stdout.write("."); }
    process.stdout.write("\n");
    // chiamate negate su (quasi) ogni pagina = sfondo del menu (badge, contatori): si segnalano una volta sola
    const counts = new Map();
    for (const v of visits) for (const k of new Set(v.api.map((a) => `${a.status} ${a.path}`))) counts.set(k, (counts.get(k) || 0) + 1);
    const ignore = new Set([...counts].filter(([, n]) => visits.length >= 4 && n >= visits.length * 0.8).map(([k]) => k));
    if (ignore.size) rec.pages.push({ href: "/guida", label: "Sfondo di ogni pagina (menu, contatori)", status: "warn", ms: 0, problems: [...ignore].map((k) => `chiamata negata su ogni pagina: ${k}`) });
    for (const v of visits) rec.pages.push({ href: v.link.href, label: v.link.label, ms: v.ms, excerpt: v.excerpt, ...judge(v, ignore) });
    for (const t of p.tasks || []) rec.tasks.push(await runTask(t, ignore));
    log(`  ${rec.pages.filter((g) => g.status === "fail").length} pagine in errore, ${rec.tasks.filter((t) => !t.ok).length}/${rec.tasks.length} compiti non riusciti`);
  } catch (e) {
    rec.error = String(e?.message || e).slice(0, 300);
    log(`  ERRORE: ${rec.error}`);
  } finally {
    if (p.viewAs) await api("/api/admin/view-as", { method: "DELETE" }).catch(() => null);
  }
  out.push(rec);
}

const report = { source: process.env.GITHUB_ACTIONS ? "github-actions" : "manuale", base: BASE, personas: out };
fs.writeFileSync(args.out || "giro-qualita.json", JSON.stringify(report, null, 2));
if (!args.dry) {
  const r = await api("/api/admin/qualita/report", { method: "POST", body: JSON.stringify(report) });
  log("rapporto consegnato:", r.status, JSON.stringify(r.body?.summary || r.body?.error));
  if (!r.ok) process.exitCode = 1;
}
await browser.close();
