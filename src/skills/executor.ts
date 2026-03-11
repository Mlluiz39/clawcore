// src/skills/executor.ts
import { getSkill } from "./loader";
import { logger } from "../utils/logger";

/**
 * SkillExecutor — loads the full SKILL.md content for injection
 * into the system prompt during the AgentLoop cycle.
 * Returns the skill content or null if not found.
 */
export function getSkillContent(skillName: string): string | null {
  const skill = getSkill(skillName);
  if (!skill) {
    logger.warn("Skill not found for execution", { skillName });
    return null;
  }

  logger.info("Skill content loaded for execution", {
    skillName,
    contentLength: skill.content.length,
  });

  return skill.content;
}
