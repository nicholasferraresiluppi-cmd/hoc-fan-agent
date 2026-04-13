/**
 * Golden Examples — curated real chats from HOC top performers.
 *
 * Structure:
 * - category: matches scenario categoryId
 * - outcome: "success" | "failure"
 * - tags: free-form labels (e.g., "ppv-sold", "churn-saved", "custom-closed")
 * - operatorId: anonymized (TOP-1, TOP-2...)
 * - fanProfile: brief description of fan type
 * - conversation: array of { role, content } messages
 * - commentary: what made this good/bad (optional, for context injection)
 *
 * TO ADD REAL EXAMPLES:
 * 1. Export anonymized chats from Infloww/ClickUp (rimuovere nomi, dettagli personali)
 * 2. Label success/failure based on outcome
 * 3. Append to GOLDEN_EXAMPLES array below
 * 4. Test: pick-examples API will retrieve them for prompts
 */

export const GOLDEN_EXAMPLES = [
  // ==== EXAMPLE TEMPLATE (placeholder - replace with real HOC data) ====
  {
    id: "golden-placeholder-001",
    category: "le-basi-della-chat",
    outcome: "success",
    tags: ["opening", "warm-welcome"],
    operatorId: "TOP-PLACEHOLDER",
    fanProfile: "new-subscriber-curious",
    conversation: [
      { role: "fan", content: "hey" },
      {
        role: "operator",
        content:
          "Ciaooo 🥰 benvenuto! Come ti chiami? Ti va di dirmi come mi hai trovata?",
      },
      { role: "fan", content: "sono Marco, ti ho vista su insta, sei bellissima" },
      {
        role: "operator",
        content:
          "Grazie Marco 💙 mi fa super piacere che mi scrivi, odio quando mi arriva solo 'ciao' e basta. Dimmi, cosa ti piace vedere di solito?",
      },
    ],
    commentary:
      "Apertura perfetta: usa il nome, lo fa sentire speciale (odio quando...), fa domanda aperta che porta a sapere i suoi gusti. Nessun push commerciale.",
  },
  // ==== ADD REAL EXAMPLES BELOW ====
  // Formato:
  // {
  //   id: "golden-001",
  //   category: "le-basi-della-chat" | "mass-e-conversione" | "custom-e-upsell" | "recuperi-e-retention" | "script-avanzati",
  //   outcome: "success" | "failure",
  //   tags: ["ppv-sold", "custom-closed", "churn-saved", "flirt-only", ...],
  //   operatorId: "TOP-1",
  //   fanProfile: "brief description",
  //   conversation: [{ role: "fan" | "operator", content: "..." }, ...],
  //   commentary: "why this is good/bad"
  // },
];

/**
 * Pick N examples matching a category, preferring success examples.
 * Used to inject few-shot into Claude prompts.
 */
export function pickExamples(category, count = 3, outcome = "success") {
  const matching = GOLDEN_EXAMPLES.filter(
    (ex) => ex.category === category && ex.outcome === outcome
  );
  // Shuffle and take first N
  const shuffled = [...matching].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Format examples as a string block for system prompt injection.
 */
export function formatExamplesForPrompt(examples) {
  if (!examples || examples.length === 0) return "";
  return examples
    .map((ex, i) => {
      const convText = ex.conversation
        .map((m) => `  [${m.role.toUpperCase()}]: ${m.content}`)
        .join("\n");
      return `ESEMPIO ${i + 1} (${ex.outcome.toUpperCase()}) - ${ex.tags.join(", ")}:\n${convText}\n${ex.commentary ? `NOTA: ${ex.commentary}` : ""}`;
    })
    .join("\n\n---\n\n");
}
