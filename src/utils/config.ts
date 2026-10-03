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

/**
 * Validates an OpenAI API key format.
 * Accepts: sk-... (standard), sk-proj-... (project keys), sk-svcacct-... (service accounts)
 */
function validateOpenAIKey(key: string): string {
  const trimmed = key.trim();
  if (!/^sk-[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    throw new Error(
      `Invalid OPENAI_API_KEY format. Must start with "sk-" followed by 20+ alphanumeric characters. ` +
      `Got: "${trimmed.slice(0, 8)}..." (${trimmed.length} chars)`
    );
  }
  return trimmed;
}

/**
 * Validates a URL format for the OpenAI base URL.
 */
function validateBaseURL(url: string): string {
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
    port: parseInt(optional("WEB_PORT", "3000")),
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
    maxContextMessages: parseInt(optional("MAX_CONTEXT_MESSAGES", "20")),
    maxIterations: parseInt(optional("MAX_AGENT_ITERATIONS", "5")),
  },
  audio: {
    ttsVoice: optional("TTS_VOICE", "pt-BR-ThalitaMultilingualNeural"),
  },
};
