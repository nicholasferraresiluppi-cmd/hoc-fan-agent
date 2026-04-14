import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";

const DAY = 24 * 60 * 60 * 1000;
const SKILLS = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];

// 10 operatori fake con profilo skill differenziato (0 = baseline 65, + = bias verso l'alto)
const SEED_OPERATORS = [
  { id: "seed_op_001", name: "Giorgia R.",   bias: { esclusivita: 15, dipendenza: 12, tono: 8 },  base: 72 },
  { id: "seed_op_002", name: "Martina V.",   bias: { conversione: 18, gestione_obiezioni: 10 },    base: 70 },
  { id: "seed_op_003", name: "Alessia C.",   bias: { naturalezza: 14, tono: 12 },                  base: 68 },
  { id: "seed_op_004", name: "Sara M.",      bias: { dipendenza: 16, esclusivita: 10 },            base: 71 },
  { id: "seed_op_005", name: "Elena F.",     bias: { conversione: 12, naturalezza: 8 },            base: 66 },
  { id: "seed_op_006", name: "Chiara B.",    bias: { tono: 14, gestione_obiezioni: 8 },            base: 65 },
  { id: "seed_op_007", name: "Federica L.",  bias: { esclusivita: 8, conversione: 8 },             base: 63 },
  { id: "seed_op_008", name: "Valentina P.", bias: { gestione_obiezioni: 14, naturalezza: 6 },     base: 60 },
  { id: "seed_op_009", name: "Ilaria T.",    bias: {},                                              base: 58 },
  { id: "seed_op_010", name: "Roberta S.",   bias: { dipendenza: 6 },                              base: 55 },
];

const CREATORS = ["elisa", "giulia", "gaja"];
const SCENARIOS = ["opener_1", "objection_price", "retention_silence", "upsell_ppv", "flirt_tease", "relationship_deep"];

function rand(min, max) { return Math.random() * (max - min) + min; }
function gauss(mean, sd) {
  // Box-Muller
  const u = 1 - Math.random(); const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function scoreForOp(op) {
  const skills = {};
  for (const s of SKILLS) {
    const bias = op.bias[s] || 0;
    const val = gauss(op.base + bias, 8); // sd=8
    skills[s] = clamp(Math.round(val), 20, 98);
  }
  // weighted overall — stesso formula di /api/score
  const w = { naturalezza: 0.15, esclusivita: 0.20, dipendenza: 0.20, conversione: 0.20, tono: 0.15, gestione_obiezioni: 0.10 };
  const overall = Math.round(SKILLS.reduce((acc, s) => acc + skills[s] * w[s], 0));
  return { skills, overall };
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d - firstThursday) / DAY;
  const week = 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7) + 3) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function clearSeed() {
  // Remove seed score_hist records
  const allKeys = (await kv.zrange("score_hist:index", 0, 9999, { rev: true })) || [];
  const seedKeys = [];
  const batchSize = 50;
  for (let i = 0; i < allKeys.length; i += batchSize) {
    const batch = allKeys.slice(i, i + batchSize);
    const records = await Promise.all(batch.map((k) => kv.get(k)));
    records.forEach((r, idx) => {
      if (r && r.userId && r.userId.startsWith("seed_op_")) seedKeys.push(batch[idx]);
    });
  }
  for (const k of seedKeys) {
    await kv.del(k);
    await kv.zrem("score_hist:index", k);
  }
  // Per-user indices for seed users
  for (const op of SEED_OPERATORS) {
    await kv.del(`score_hist:user:${op.id}`);
  }
  // Seed snapshots
  const snapIdx = (await kv.zrange("lb_snapshot:index", 0, 999, { rev: true })) || [];
  for (const wk of snapIdx) {
    if (typeof wk === "string" && wk.startsWith("SEED-")) {
      await kv.del(`lb_snapshot:${wk}`);
      await kv.zrem("lb_snapshot:index", wk);
    }
  }
  return { removed: seedKeys.length };
}

async function seed() {
  const now = Date.now();
  let created = 0;

  // 60 giorni di sessioni per operatore, poisson-like distribution
  const DAYS_BACK = 60;
  for (const op of SEED_OPERATORS) {
    // diverso livello di attività: op0 molto attivo, op9 quasi inattivo
    const activityLambda = 1.8 - SEED_OPERATORS.indexOf(op) * 0.15; // ~1.8 → 0.4 sessioni/giorno
    for (let d = 0; d < DAYS_BACK; d++) {
      const dayStart = now - (d + 1) * DAY;
      // numero sessioni quel giorno (Poisson approx con uniform)
      const nSessions = Math.max(0, Math.round(gauss(activityLambda, 0.8)));
      for (let k = 0; k < nSessions; k++) {
        const ts = dayStart + rand(8 * 3600 * 1000, 23 * 3600 * 1000);
        const { skills, overall } = scoreForOp(op);
        // trend learning: leggero miglioramento nel tempo (~+0.1 al giorno recente)
        const learningBonus = Math.max(0, (DAYS_BACK - d) * 0.08);
        const overallAdj = clamp(Math.round(overall + learningBonus + rand(-3, 3)), 20, 98);
        const key = `score_hist:${op.id}:${Math.floor(ts)}`;
        const record = {
          userId: op.id,
          displayName: op.name,
          timestamp: Math.floor(ts),
          overall: overallAdj,
          skills,
          scenario: SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)],
          creatorId: CREATORS[Math.floor(Math.random() * CREATORS.length)],
          seed: true,
        };
        await kv.set(key, record);
        await kv.zadd("score_hist:index", { score: record.timestamp, member: key });
        await kv.zadd(`score_hist:user:${op.id}`, { score: record.timestamp, member: key });
        created += 1;
      }
    }
  }

  // 3 snapshot storici settimanali (settimane SEED-W1, SEED-W2, SEED-W3)
  const WEEKS = [
    { key: "SEED-W-3", daysAgo: 21 },
    { key: "SEED-W-2", daysAgo: 14 },
    { key: "SEED-W-1", daysAgo: 7 },
  ];
  for (const w of WEEKS) {
    const periodEnd = now - (w.daysAgo - 7) * DAY;
    const periodStart = periodEnd - 7 * DAY;
    // Raggruppa per op le sessioni nel range
    const entries = [];
    for (const op of SEED_OPERATORS) {
      const skillsAgg = Object.fromEntries(SKILLS.map((s) => [s, []]));
      const overallAgg = [];
      // Sampling più leggero: ricreo punteggio con 4-8 sessioni
      const n = Math.floor(rand(3, 9));
      for (let i = 0; i < n; i++) {
        const { skills, overall } = scoreForOp(op);
        overallAgg.push(overall);
        for (const s of SKILLS) skillsAgg[s].push(skills[s]);
      }
      const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
      if (overallAgg.length >= 2) {
        entries.push({
          userId: op.id,
          name: op.name,
          sessions: overallAgg.length,
          overall: avg(overallAgg),
          skills: Object.fromEntries(SKILLS.map((s) => [s, avg(skillsAgg[s])])),
        });
      }
    }
    entries.sort((a, b) => b.overall - a.overall);
    const top10 = entries.slice(0, 10).map((e, i) => ({ rank: i + 1, ...e }));
    const skillChampions = {};
    for (const s of SKILLS) {
      const winner = [...entries].sort((a, b) => b.skills[s] - a.skills[s])[0];
      if (winner) skillChampions[s] = { userId: winner.userId, name: winner.name, value: winner.skills[s] };
    }
    const payload = {
      weekKey: w.key,
      createdAt: periodEnd,
      periodStart,
      periodEnd,
      top10,
      skillChampions,
      totalQualifying: entries.length,
      totalSessions: entries.reduce((a, e) => a + e.sessions, 0),
    };
    await kv.set(`lb_snapshot:${w.key}`, payload);
    await kv.zadd("lb_snapshot:index", { score: periodEnd, member: w.key });
  }

  return { created, operators: SEED_OPERATORS.length, snapshots: WEEKS.length };
}

export async function POST(request) {
  const a = await authorize(CAPABILITIES.SEED);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action || "seed";
    if (action === "clear") {
      const out = await clearSeed();
      return Response.json({ ok: true, action, ...out });
    }
    if (action === "reseed") {
      const c = await clearSeed();
      const s = await seed();
      return Response.json({ ok: true, action, cleared: c.removed, ...s });
    }
    const out = await seed();
    return Response.json({ ok: true, action: "seed", ...out });
  } catch (error) {
    console.error("Seed error:", error);
    return Response.json({ error: error?.message || "Errore" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    info: "Endpoint admin per popolare/pulire dati demo. Usa POST con {action: 'seed' | 'clear' | 'reseed'}",
    seedOperators: SEED_OPERATORS.map((o) => ({ id: o.id, name: o.name })),
  });
}
