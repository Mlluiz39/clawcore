// src/skills/loader.ts
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";

export interface Skill {
  name: string;
  description: string;
  content: string; // full SKILL.md body (without frontmatter)
}

const SKILLS_DIR = path.resolve(process.cwd(), ".agents", "skills");
let _skills: Map<string, Skill> = new Map();

/**
 * Parse YAML-like frontmatter from a SKILL.md file.
 * Expects:
 *   ---
 *   name: skill-name
 *   description: some description
 *   ---
 *   # Markdown body...
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;

  const meta: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

function loadSkillDir(dirPath: string): void {
  const skillFile = path.join(dirPath, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    logger.debug("Skipping skill dir (no SKILL.md)", { dir: path.basename(dirPath) });
    return;
  }

  try {
    const raw = fs.readFileSync(skillFile, "utf-8");
    const parsed = parseFrontmatter(raw);

    if (!parsed || !parsed.meta.name || !parsed.meta.description) {
      logger.warn("Invalid SKILL.md frontmatter", { dir: path.basename(dirPath) });
      return;
    }

    const skill: Skill = {
      name: parsed.meta.name,
      description: parsed.meta.description,
      content: parsed.body,
    };

    _skills.set(skill.name, skill);
    logger.info("Skill loaded", { name: skill.name, dir: path.basename(dirPath) });
  } catch (err) {
    logger.warn("Failed to load skill", { dir: path.basename(dirPath), error: String(err) });
  }
}

export function loadAllSkills(): void {
  _skills.clear();
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    logger.info("Created skills directory", { path: SKILLS_DIR });
    return;
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      loadSkillDir(path.join(SKILLS_DIR, entry.name));
    }
  }
  logger.info("Skills loaded", { count: _skills.size });
}

export function watchSkills(): void {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

  fs.watch(SKILLS_DIR, { recursive: true }, (event, filename) => {
    if (!filename) return;
    logger.info("Skill file changed, reloading", { event, filename });
    loadAllSkills();
  });

  logger.info("Watching skills directory for changes", { dir: SKILLS_DIR });
}

export function getSkill(name: string): Skill | undefined {
  return _skills.get(name);
}

export function getAllSkills(): Skill[] {
  return Array.from(_skills.values());
}

export function getSkillSummaries(): { name: string; description: string }[] {
  return Array.from(_skills.values()).map((s) => ({
    name: s.name,
    description: s.description,
  }));
}
