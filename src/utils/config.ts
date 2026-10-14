// src/utils/config.ts

function required(key: string): string {
  const val = process.env[key]?.trim();
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  const val = process.env[key]?.trim();
  return val || fallback;
}

/** Parses a positive integer env var, falling back on missing/invalid values. */
function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key}: "${raw}" must be a positive integer.`);
  }
  return parsed;
}

/** Boolean flag — accepts true/1/yes/on (case-insensitive). Default: false. */
function flag(key: string, fallback = false): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["true", "1", "yes", "on"].includes(raw);
}

/**
 * Validates an OpenAI API key format.
 * Accepts: sk-... (standard), sk-proj-... (project keys), sk-svcacct-... (service accounts)
 */
export function validateOpenAIKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("OPENAI_API_KEY must not be empty.");
  }
  return trimmed;
}

/**
 * Validates a URL format for the OpenAI base URL.
 */
export function validateBaseURL(url: string): string {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`OPENAI_BASE_URL must use http or https protocol. Got: ${parsed.protocol}`);
    }
    // Remove trailing slash for consistency
    return parsed.toString().replace(/\/+$/, "");
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("OPENAI_BASE_URL")) throw err;
    throw new Error(`Invalid OPENAI_BASE_URL: "${url}" is not a valid URL.`);
  }
}

const openaiApiKey = validateOpenAIKey(required("OPENAI_API_KEY"));
const openaiBaseURL = validateBaseURL(optional("OPENAI_BASE_URL", "https://api.openai.com/v1"));

export const config = {
  web: {
    port: optionalInt("WEB_PORT", 8080),
    authPassword: required("WEB_AUTH_PASSWORD"),
    jwtSecret: required("JWT_SECRET"),
    corsOrigin: optional("CORS_ORIGIN", "*"),
  },
  openai: {
    apiKey: openaiApiKey,
    baseURL: openaiBaseURL,
    model: optional("OPENAI_MODEL", "gpt-4o-mini"),
  },
  agent: {
    maxContextMessages: optionalInt("MAX_CONTEXT_MESSAGES", 20),
    // 5 rodadas não fecham trabalhos multi-etapa (buscar, filtrar, auditar,
    // enriquecer e entregar). O teto continua configurável por env.
    maxIterations: optionalInt("MAX_AGENT_ITERATIONS", 12),
    // run_command executa shell arbitrário — desligue em produção/exposição pública.
    enableShellTool: flag("ENABLE_SHELL_TOOL", false),
  },
  whatsapp: {
    // Desligado, não inicializa o cliente nem registra a ferramenta: evita loop de
    // reconexão, QR no log e uma capacidade anunciada que não funcionaria.
    enabled: flag("WHATSAPP_ENABLED", true),
  },
  audio: {
    ttsVoice: optional("TTS_VOICE", "pt-BR-ThalitaMultilingualNeural"),
  },
};
