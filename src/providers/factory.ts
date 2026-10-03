// src/providers/factory.ts
import { logger } from "../utils/logger";
import { LLMProvider, ChatMessage, ToolCall, ToolDefinitionParam } from "./types";
import { OpenAIProvider } from "./openai";

/**
 * ProviderFactory — Singleton wrapper around the OpenAI provider.
 * Handles retry logic with exponential backoff for transient errors (429, 500, 502, 503).
 */

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  return typeof status === "number" && RETRYABLE_STATUS_CODES.has(status);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let _instance: ProviderFactory | null = null;

export class ProviderFactory {
  private provider: LLMProvider;

  constructor() {
    this.provider = new OpenAIProvider();
    logger.info("ProviderFactory ready", { provider: this.provider.name });
  }

  /**
   * Returns the singleton instance of ProviderFactory.
   */
  static getInstance(): ProviderFactory {
    if (!_instance) _instance = new ProviderFactory();
    return _instance;
  }

  async chat(messages: ChatMessage[]): Promise<{ response: string; provider: string }> {
    return this.withRetry(async () => {
      const response = await this.provider.chat(messages);
      return { response, provider: this.provider.name };
    });
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[]; provider: string }> {
    return this.withRetry(async () => {
      const result = await this.provider.chatWithTools(messages, tools);
      return { ...result, provider: this.provider.name };
    });
  }

  /**
   * Retry wrapper with exponential backoff for transient API errors.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;

        if (!isRetryable(err) || attempt === MAX_RETRIES) {
          break;
        }

        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`OpenAI request failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delayMs}ms`, {
          error: String(err),
          status: err?.status ?? err?.response?.status ?? "unknown",
          code: err?.code ?? "unknown",
        });

        await sleep(delayMs);
      }
    }

    logger.error("OpenAI request failed after all retries", {
      error: String(lastError),
      status: (lastError as any)?.status ?? "unknown",
    });
    throw new Error(
      "O provedor de IA está indisponível no momento. Verifique sua OPENAI_API_KEY e OPENAI_BASE_URL e tente novamente."
    );
  }
}
