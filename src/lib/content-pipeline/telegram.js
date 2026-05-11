// Client minimale per Telegram Bot API (fetch nativo, zero dipendenze).
// Il token è SEMPRE passato come argomento — MAI letto da env.
// Riferimento: https://core.telegram.org/bots/api

const TG_BASE = "https://api.telegram.org";

async function tgCall(token, method, payload) {
  if (!token) throw new Error("telegram: token required");
  if (!method) throw new Error("telegram: method required");
  const r = await fetch(`${TG_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.ok) {
    const desc = json.description || `HTTP ${r.status}`;
    throw new Error(`telegram ${method} failed: ${desc}`);
  }
  return json.result;
}

export async function sendMessage({
  token,
  chatId,
  text,
  parseMode = "HTML",
  disableWebPagePreview = false,
}) {
  return tgCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disableWebPagePreview,
  });
}

export async function sendPhoto({ token, chatId, photo, caption, parseMode = "HTML" }) {
  return tgCall(token, "sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: parseMode,
  });
}

export async function sendMediaGroup({ token, chatId, media }) {
  return tgCall(token, "sendMediaGroup", { chat_id: chatId, media });
}

// Verifica che un token sia valido (getMe). Usata quando un admin aggiunge/cambia un BOT_TOKEN.
export async function verifyToken(token) {
  try {
    const me = await tgCall(token, "getMe", {});
    return { ok: true, botUsername: me.username, botId: me.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
