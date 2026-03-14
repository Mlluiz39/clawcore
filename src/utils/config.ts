// src/utils/config.ts
function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  web: {
    port: parseInt(optional("WEB_PORT", "3000")),
    authPassword: required("WEB_AUTH_PASSWORD"),
    jwtSecret: optional("JWT_SECRET", "clawcore-secret-" + Date.now()),
  },
  providers: {
    cerebras: { apiKey: optional("CEREBRAS_API_KEY", "") },
    groq:     { apiKey: optional("GROQ_API_KEY", "") },
    gemini:   { apiKey: optional("GEMINI_API_KEY", "") },
    deepseek: { apiKey: optional("DEEPSEEK_API_KEY", "") },
    openrouter: { apiKey: optional("OPENROUTER_API_KEY", ""), model: optional("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free") },
    primary:  optional("PRIMARY_PROVIDER", "gemini"),
    fallbacks: optional("FALLBACK_PROVIDERS", "groq,cerebras,openrouter").split(",").map(p => p.trim()),
  },
  agent: {
    maxContextMessages: parseInt(optional("MAX_CONTEXT_MESSAGES", "20")),
    maxIterations:      parseInt(optional("MAX_AGENT_ITERATIONS", "5")),
  },
  audio: {
    whisperModel: optional("WHISPER_MODEL", "base"),
    ttsVoice:     optional("TTS_VOICE", "pt-BR-ThalitaMultilingualNeural"),
  },
};
