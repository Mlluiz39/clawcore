// src/skills/router.ts
import { ProviderFactory } from "../providers/factory";
import { ChatMessage } from "../providers/types";
import { getSkillSummaries } from "./loader";
import { logger } from "../utils/logger";

let _factory: ProviderFactory | null = null;

function getFactory(): ProviderFactory {
  if (!_factory) _factory = new ProviderFactory();
  return _factory;
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
    const { response } = await getFactory().chat(messages);

    // Parse the JSON response
    const cleaned = response.trim().replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const skillName = parsed.skillName ?? null;

    logger.info("SkillRouter decision", { userMessage: userMessage.slice(0, 80), skillName });
    return skillName;
  } catch (err) {
    logger.warn("SkillRouter failed to parse, defaulting to null", { error: String(err) });
    return null;
  }
}
