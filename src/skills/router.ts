// src/skills/router.ts
import { ProviderFactory } from "../providers/factory";
import { ChatMessage } from "../providers/types";
import { getSkillSummaries, getSkill } from "./loader";
import { logger } from "../utils/logger";

/**
 * Mensagens que claramente não precisam de skill especializada.
 *
 * Sem este filtro, TODO turno — inclusive "oi", "obrigado", "ok" — pagava uma
 * inferência extra de LLM só para classificar. Além do custo, o classificador
 * às vezes devolvia uma skill para uma saudação.
 */
const TRIVIAL_MESSAGE_MAX_LENGTH = 40;

const TRIVIAL_MESSAGES = new Set([
  "oi", "ola", "olá", "opa", "eai", "e ai", "e aí", "hey", "hi", "hello",
  "bom dia", "boa tarde", "boa noite",
  "tudo bem", "tudo bom", "como vai", "beleza", "blz",
  "ok", "okay", "certo", "entendi", "entendido",
  "valeu", "vlw", "obrigado", "obrigada", "thanks", "thank you",
  "sim", "nao", "não", "talvez", "tchau", "ate mais", "até mais", "flw",
]);

function isTrivial(message: string): boolean {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:]+$/g, "")
    .replace(/\s+/g, " ");

  if (!normalized) return true;
  if (TRIVIAL_MESSAGES.has(normalized)) return true;

  // Saudações curtas com nome próprio ("oi maria", "bom dia pessoal").
  if (normalized.length <= TRIVIAL_MESSAGE_MAX_LENGTH) {
    const words = normalized.split(" ");
    if (words.length <= 4 && TRIVIAL_MESSAGES.has(words[0])) return true;
  }

  return false;
}

/**
 * SkillRouter — "Step Zero" in the pipeline.
 * Uses a cheap LLM call with the skill summaries to decide
 * which skill (if any) should handle the user's request.
 * Returns the skill name or null if no skill matches.
 */
export async function routeSkill(userMessage: string): Promise<string | null> {
  const summaries = getSkillSummaries();

  if (summaries.length === 0) {
    return null;
  }

  if (isTrivial(userMessage)) {
    logger.debug("SkillRouter skipped (trivial message)", {
      userMessage: userMessage.slice(0, 80),
    });
    return null;
  }

  const skillList = summaries
    .map((s) => `- "${s.name}": ${s.description}`)
    .join("\n");

  const systemPrompt = `You are a routing classifier. Your ONLY job is to determine which skill (if any) should handle a user's request.

Available skills:
${skillList}

RULES:
1. Respond ONLY with valid JSON: {"skillName": "skill-name"} or {"skillName": null}
2. Return null if the user's message is casual conversation, greeting, or doesn't match any skill.
3. Do NOT explain your reasoning. Output ONLY the JSON object.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const { response } = await ProviderFactory.getInstance().chat(messages);

    // Parse the JSON response
    const cleaned = response.trim().replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const skillName = parsed.skillName ?? null;

    // O classificador pode alucinar um nome que não existe. Sem esta checagem,
    // `getSkillContent` devolvia null em silêncio e o roteamento parecia ter
    // funcionado — escondendo o erro.
    if (skillName && !getSkill(skillName)) {
      logger.warn("SkillRouter returned an unknown skill — ignoring", {
        userMessage: userMessage.slice(0, 80),
        skillName,
        available: summaries.map((s) => s.name),
      });
      return null;
    }

    logger.info("SkillRouter decision", { userMessage: userMessage.slice(0, 80), skillName });
    return skillName;
  } catch (err) {
    logger.warn("SkillRouter failed to parse, defaulting to null", { error: String(err) });
    return null;
  }
}
