/**
 * Lettura dello screen «dopo 24 ore» di una storia Instagram (08/11/2026, Porta un amico).
 *
 * L'AI propone i numeri, l'Area Partner li conferma o li corregge: la lettura non entra
 * da sola nei premi (le visualizzazioni non condizionano i 50 €, regole ref-4).
 * Un'immagine ridotta dal browser (lato lungo 1600 px) costa intorno a un centesimo.
 * Se l'AI non legge o non risponde, si scrive il numero a mano: mai un errore bloccante.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = () => process.env.REFERRAL_SHOT_MODEL || "claude-opus-5-5";

const num = (description) => ({ type: ["integer", "null"], description });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    isStoryInsights: { type: "boolean", description: "true se l'immagine mostra le visualizzazioni o le statistiche di una storia Instagram" },
    views: num("visualizzazioni della storia (Visualizzazioni / Views / l'occhio con il numero); null se non si vede"),
    accountsReached: num("account raggiunti (Account raggiunti / Accounts reached); null se non c'è"),
    replies: num("risposte; null se non c'è"),
    linkClicks: num("clic sul link / sullo sticker link; null se non c'è"),
    profileVisits: num("visite al profilo; null se non c'è"),
    note: { type: "string", description: "una riga in italiano se qualcosa non torna (es. screen tagliato, non è una storia); stringa vuota altrimenti" },
  },
  required: ["isStoryInsights", "views", "accountsReached", "replies", "linkClicks", "profileVisits", "note"],
};

const intOk = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000000 ? v : null);

export async function readStoryInsights(bytes, contentType) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Lettura automatica non attiva: scrivi il numero a mano." };
  const client = new Anthropic();
  let res;
  try {
    res = await client.messages.create({
      model: MODEL(),
      max_tokens: 1000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: contentType, data: Buffer.from(bytes).toString("base64") } },
          { type: "text", text: "È lo screenshot, fatto dal telefono, delle visualizzazioni o delle statistiche di una storia Instagram, circa 24 ore dopo la pubblicazione. Trascrivi i numeri nello schema. Scrivi solo ciò che leggi: se un numero non si vede lascialo null, non stimarlo. I numeri tipo «1,2 mila» o «1.2K» vanno scritti per intero (1200)." },
        ],
      }],
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (/credit balance/i.test(msg)) return { ok: false, error: "Il credito dell'AI è esaurito: scrivi il numero a mano." };
    if (e?.status === 429 || e?.status >= 500) return { ok: false, error: "L'AI non risponde ora: scrivi il numero a mano." };
    return { ok: false, error: "Lettura non riuscita: scrivi il numero a mano." };
  }
  if (res.stop_reason === "refusal") return { ok: false, error: "L'AI non ha letto lo screen: scrivi il numero a mano." };
  const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let d;
  try { d = JSON.parse(text); } catch { return { ok: false, error: "Lettura non chiara: scrivi il numero a mano." }; }
  if (!d.isStoryInsights) return { ok: false, notStory: true, error: d.note || "Lo screen non sembra le visualizzazioni di una storia." };
  return {
    ok: true,
    views: intOk(d.views),
    accountsReached: intOk(d.accountsReached),
    replies: intOk(d.replies),
    linkClicks: intOk(d.linkClicks),
    profileVisits: intOk(d.profileVisits),
    note: String(d.note || "").slice(0, 200) || null,
    model: MODEL(),
  };
}
