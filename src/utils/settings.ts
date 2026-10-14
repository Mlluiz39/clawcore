// src/utils/settings.ts
//
// Configuração do LLM editável pelo painel web.
// Prioridade: data/settings.json (definido no dashboard) > variáveis de ambiente.
// O arquivo vive em ./data (volume persistente, fora do git) e é regravado a cada
// alteração — sem reiniciar o servidor.
import fs from "fs";
import path from "path";
import { config, validateOpenAIKey, validateBaseURL } from "./config";
import { logger } from "./logger";

export interface LLMSettings {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface SettingsPatch {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const SETTINGS_FILE = path.resolve(DATA_DIR, "settings.json");

let cache: LLMSettings | null = null;

/** Never log or return the full key. */
export function maskKey(key: string): string {
  if (!key || key.length <= 12) return "****";
  return `${key.slice(0, 11)}...${key.slice(-4)}`;
}

function envDefaults(): LLMSettings {
  return {
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseURL,
    model: config.openai.model,
  };
}

export function hasFileOverride(): boolean {
  return fs.existsSync(SETTINGS_FILE);
}

let lastMtime = 0;

export function getLLMSettings(): LLMSettings {
  if (hasFileOverride()) {
    try {
      const stat = fs.statSync(SETTINGS_FILE);
      if (cache && stat.mtimeMs === lastMtime) {
        return cache;
      }
      lastMtime = stat.mtimeMs;
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as Partial<LLMSettings>;
      const merged: LLMSettings = { ...envDefaults() };
      if (typeof raw.baseURL === "string" && raw.baseURL.trim()) merged.baseURL = validateBaseURL(raw.baseURL);
      if (typeof raw.apiKey === "string" && raw.apiKey.trim()) merged.apiKey = validateOpenAIKey(raw.apiKey);
      if (typeof raw.model === "string" && raw.model.trim()) merged.model = raw.model.trim();
      cache = merged;
      logger.info("LLM settings loaded from data/settings.json", {
        baseURL: merged.baseURL,
        model: merged.model,
        apiKey: maskKey(merged.apiKey),
      });
      return cache;
    } catch (err) {
      logger.warn("Invalid data/settings.json — falling back to environment", { error: String(err) });
    }
  }

  if (!cache) {
    cache = envDefaults();
  }
  return cache;
}

/** Validates and persists dashboard-provided settings. Returns the active values. */
export function updateLLMSettings(patch: SettingsPatch): LLMSettings {
  const current = getLLMSettings();
  const next: LLMSettings = { ...current };

  if (patch.baseURL !== undefined) {
    if (!String(patch.baseURL).trim()) throw new Error("A URL da API não pode ser vazia.");
    next.baseURL = validateBaseURL(String(patch.baseURL));
  }

  if (patch.apiKey !== undefined) {
    if (!String(patch.apiKey).trim()) throw new Error("A chave de API não pode ser vazia.");
    next.apiKey = validateOpenAIKey(String(patch.apiKey));
  }

  if (patch.model !== undefined) {
    const model = String(patch.model).trim();
    if (!model) throw new Error("O modelo não pode ser vazio.");
    next.model = model;
  }

  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  try {
    lastMtime = fs.statSync(SETTINGS_FILE).mtimeMs;
  } catch {}
  cache = next;

  // Chave completa nunca entra em log
  logger.info("LLM settings updated via dashboard", {
    baseURL: next.baseURL,
    model: next.model,
    apiKey: maskKey(next.apiKey),
  });

  return next;
}
