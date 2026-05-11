// Wrapper Anthropic per generare draft di contenuti partendo dalla persona del creator.
// Modello di default: process.env.CONTENT_ANTHROPIC_MODEL || "claude-opus-4-7".
// Override per-creator: creator.anthropicModel.

// import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = process.env.CONTENT_ANTHROPIC_MODEL || "claude-opus-4-7";

export async function generateDraft(/* { persona, brief, examples, model } */) {
  // TODO: anthropic.messages.create con system prompt costruito da persona.
  //       Ritornare { body, mediaSuggestions? } da salvare in un Draft pending.
  throw new Error("generateDraft not implemented");
}

export { DEFAULT_MODEL };
