// Canali Telegram delle creator (14/10/2026) — mappa compilata dai sales + entrate per fonte dal bot HOC.
// GATE: authorizeScoped(SCORES_VIEW), come S4S. Chi vede tutte le creator vede e gestisce tutti i canali;
// un sales manager con creator assegnate vede e aggiunge solo i canali delle SUE creator. Operatori → 403.
// Registrazione del webhook: solo chi vede tutto.
//
// GET                                   canali visibili + statistiche + chat in attesa di abbinamento + creator scegliibili
// POST {action:"save", id?, creator, url, kind, manager, note, of_link}
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
import { cleanChannel, sameChannel, summarizeStats, memberDelta, romeDay, SOURCES } from "@/lib/telegram-channels-core";
import {
  listChannels, getChannel, saveChannel, deleteChannel, refreshChannel, connectChat, createInviteLink,
  revokeInviteLink, getStats, getPending, setupWebhook, botInfo, botConfigured, getOfLinkStats,
} from "@/lib/telegram-channels";
import { normalizeLinkUrl } from "@/lib/s4s-core";

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
  const channels = (await listChannels()).filter((c) => all || allowsCreator(scope, c.creator));
  const today = romeDay(Date.now() / 1000);
  const [stats, pending, creators, bot, of] = await Promise.all([
    Promise.all(channels.map((c) => getStats(c.id))),
    getPending(),
    creatorOptions(scope),
    botInfo(),
    getOfLinkStats(channels.map((c) => c.of_link).filter(Boolean)).catch((e) => ({ links: {}, error: e.message })),
  ]);
  const rows = channels.map((c, i) => {
    const ofKey = normalizeLinkUrl(c.of_link);
    return {
      ...c,
      stats: summarizeStats(stats[i], c.links || [], { today, dayCount: 30 }),
      members_7d: memberDelta(c.members_hist, 7),
      members_30d: memberDelta(c.members_hist, 30),
      of_stats: ofKey ? of.links?.[ofKey] || null : null,
      of_link_valid: c.of_link ? Boolean(ofKey) : null,
      members_hist: undefined,
    };
  });
  return Response.json({
    all,
    bot_configured: botConfigured(),
    // chi non vede tutto riceve solo il nome del bot (serve per le istruzioni), non lo stato del webhook
    bot: all ? bot : bot?.username ? { username: bot.username } : null,
    channels: rows,
    pending: Object.entries(pending).map(([chat_id, p]) => ({ chat_id, ...p })),
    creators,
    sources: SOURCES,
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
    if (!all && !allowsCreator(scope, ch.creator)) return { error: fail("Questo canale non è di una creator che segui", 403) };
    return { ch };
  };

  try {
    if (body.action === "save") {
      const c = cleanChannel(body);
      if (!c.ok) return fail(c.error);
      if (!all && !allowsCreator(scope, c.value.creator)) return fail("Puoi aggiungere canali solo delle creator che segui", 403);
      if (body.id) {
        const { error } = await own(body.id);
        if (error) return error;
      }
      const dup = (await listChannels()).find((x) => x.id !== body.id && sameChannel(x, c.value));
      if (dup) return fail(`Questo canale è già in mappa (${dup.creator})`, 409);
      const saved = await saveChannel(c.value, { id: body.id, by });
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
