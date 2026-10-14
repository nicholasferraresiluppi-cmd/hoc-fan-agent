// Canali Telegram delle creator (14/10/2026) — mappa compilata dai sales + entrate per fonte dal bot HOC.
// GATE: authorizeScoped(SCORES_VIEW), come S4S. Chi vede tutte le creator vede e gestisce tutti i canali;
// un sales manager con creator assegnate vede e aggiunge solo i canali delle SUE creator. Operatori → 403.
// Registrazione del webhook: solo chi vede tutto.
//
// GET                                   canali visibili + statistiche + chat in attesa di abbinamento + creator scegliibili
// POST {action:"add", rows:[{creators[], url, kind}], manager?, note?}   più canali in un colpo
// POST {action:"save", id, creators[], url, kind, manager, note}            modifica di un canale
// POST {action:"delete", id}
// POST {action:"refresh", id}           rilegge dal bot titolo / stato bot / iscritti
// POST {action:"connect", id, chat_id}  collega un canale privato alla chat dove è stato aggiunto il bot
// POST {action:"link", id, source, label}   crea un link d'invito per fonte
// POST {action:"revoke", id, key}
// POST {action:"setup"}                 registra il webhook del bot (solo vista "tutte")

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorizeScoped, allowsCreator, personOf } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { getNames } from "@/lib/s4s";
import { cleanChannel, cleanBatch, creatorsOf, mergeCreators, sameChannel, summarizeStats, memberDelta, romeDay, SOURCES } from "@/lib/telegram-channels-core";
import {
  listChannels, getChannel, saveChannel, deleteChannel, refreshChannel, connectChat, createInviteLink,
  revokeInviteLink, getStats, getPending, setupWebhook, botInfo, botConfigured, getOfTelegramStats,
} from "@/lib/telegram-channels";

async function creatorOptions(scope) {
  const names = await getNames().catch(() => ({}));
  const people = [...new Set(Object.values(names).map(personOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return scope.all ? people : people.filter((p) => allowsCreator(scope, p));
}

export async function GET() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const scope = az.creatorScope;
  const all = Boolean(scope.all);
  const sees = (c) => all || creatorsOf(c).some((n) => allowsCreator(scope, n));
  const channels = (await listChannels()).filter(sees);
  const today = romeDay(Date.now() / 1000);
  const [stats, pending, creators, bot, of] = await Promise.all([
    Promise.all(channels.map((c) => getStats(c.id))),
    getPending(),
    creatorOptions(scope),
    botInfo(),
    getOfTelegramStats().catch((e) => ({ creators: {}, error: e.message })),
  ]);
  const rows = channels.map((c, i) => ({
    ...c,
    creators: creatorsOf(c),
    stats: summarizeStats(stats[i], c.links || [], { today, dayCount: 30 }),
    members_7d: memberDelta(c.members_hist, 7),
    members_30d: memberDelta(c.members_hist, 30),
    members_hist: undefined,
  }));
  // link OF "telegram"/"TG" per creator, solo delle creator visibili
  const ofByCreator = Object.fromEntries(Object.entries(of.creators || {}).filter(([n]) => all || allowsCreator(scope, n)));
  return Response.json({
    all,
    bot_configured: botConfigured(),
    // chi non vede tutto riceve solo il nome del bot (serve per le istruzioni), non lo stato del webhook
    bot: all ? bot : bot?.username ? { username: bot.username } : null,
    channels: rows,
    pending: Object.entries(pending).map(([chat_id, p]) => ({ chat_id, ...p })),
    creators,
    sources: SOURCES,
    of: ofByCreator,
    of_at: of.at || null,
    of_error: of.error || null,
  });
}

export async function POST(request) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const scope = az.creatorScope;
  const all = Boolean(scope.all);
  const body = await request.json().catch(() => ({}));
  const by = az.userId;
  const fail = (error, status = 400) => Response.json({ error }, { status });

  // il canale deve essere di una creator che chi chiama segue
  const own = async (id) => {
    const ch = await getChannel(String(id || ""));
    if (!ch) return { error: fail("Canale non trovato", 404) };
    if (!all && !creatorsOf(ch).some((n) => allowsCreator(scope, n))) return { error: fail("Questo canale non è di una creator che segui", 403) };
    return { ch };
  };

  try {
    if (body.action === "add") {
      const b = cleanBatch(body.rows, { manager: body.manager, note: body.note });
      if (!b.ok) return Response.json({ error: b.error, row: b.row }, { status: 400 });
      for (const [i, v] of b.values.entries()) {
        const notMine = all ? [] : v.creators.filter((n) => !allowsCreator(scope, n));
        if (notMine.length) return Response.json({ error: `Riga ${i + 1}: ${notMine.join(", ")} non è tra le creator che segui`, row: i }, { status: 403 });
      }
      const existing = await listChannels();
      for (const [i, v] of b.values.entries()) {
        const dup = existing.find((x) => sameChannel(x, v));
        if (dup) return Response.json({ error: `Riga ${i + 1}: questo canale è già in mappa (${creatorsOf(dup).join(", ")})`, row: i }, { status: 409 });
      }
      const saved = [];
      for (const v of b.values) saved.push(await saveChannel(v, { by }));
      return Response.json({ ok: true, channels: saved });
    }
    if (body.action === "save") {
      const c = cleanChannel(body);
      if (!c.ok) return fail(c.error);
      const { ch, error } = await own(body.id);
      if (error) return error;
      const value = { ...c.value };
      if (!all) {
        // chi segue solo alcune creator tocca solo quelle: le altre del canale restano
        value.creators = mergeCreators(creatorsOf(ch), c.value.creators, (n) => allowsCreator(scope, n));
        if (!value.creators.some((n) => allowsCreator(scope, n))) return fail("Lascia almeno una creator che segui", 403);
      }
      const dup = (await listChannels()).find((x) => x.id !== body.id && sameChannel(x, value));
      if (dup) return fail(`Questo canale è già in mappa (${creatorsOf(dup).join(", ")})`, 409);
      const saved = await saveChannel(value, { id: body.id, by });
      return Response.json({ ok: true, channel: saved });
    }
    if (body.action === "delete") {
      const { error } = await own(body.id);
      if (error) return error;
      await deleteChannel(body.id);
      return Response.json({ ok: true });
    }
    if (body.action === "refresh") {
      const { error } = await own(body.id);
      if (error) return error;
      if (!botConfigured()) return fail("Il bot Telegram non è ancora configurato", 503);
      return Response.json({ ok: true, channel: await refreshChannel(body.id) });
    }
    if (body.action === "connect") {
      const { error } = await own(body.id);
      if (error) return error;
      const pending = await getPending();
      if (!pending[body.chat_id]) return fail("Chat non trovata tra quelle in attesa", 404);
      return Response.json({ ok: true, channel: await connectChat(body.id, body.chat_id) });
    }
    if (body.action === "link") {
      const { error } = await own(body.id);
      if (error) return error;
      return Response.json({ ok: true, link: await createInviteLink(body.id, { source: body.source, label: body.label }, by) });
    }
    if (body.action === "revoke") {
      const { error } = await own(body.id);
      if (error) return error;
      await revokeInviteLink(body.id, body.key);
      return Response.json({ ok: true });
    }
    if (body.action === "setup") {
      if (!all) return fail("Serve la vista su tutte le creator", 403);
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      return Response.json({ ok: true, webhook: await setupWebhook(origin) });
    }
    return fail("Azione sconosciuta");
  } catch (e) {
    return fail(e.message || "Errore", 500);
  }
}
