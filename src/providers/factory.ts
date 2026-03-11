// src/providers/factory.ts
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { LLMProvider, ChatMessage, ToolCall, ToolDefinitionParam } from "./types";
import { CerebrasProvider } from "./cerebras";
import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { DeepSeekProvider } from "./deepseek";

function buildProvider(name: string): LLMProvider {
  switch (name) {
    case "cerebras":
      return new CerebrasProvider(config.providers.cerebras.apiKey);
    case "groq":
      return new GroqProvider(config.providers.groq.apiKey);
    case "gemini":
      return new GeminiProvider(config.providers.gemini.apiKey);
    case "deepseek":
      return new DeepSeekProvider(config.providers.deepseek.apiKey);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export class ProviderFactory {
  private primary: LLMProvider;
  private fallback: LLMProvider;

  constructor() {
    this.primary  = buildProvider(config.providers.primary);
    this.fallback = buildProvider(config.providers.fallback);
    logger.info("ProviderFactory ready", {
      primary:  this.primary.name,
      fallback: this.fallback.name,
    });
  }

  async chat(messages: ChatMessage[]): Promise<{ response: string; provider: string }> {
    try {
      const response = await this.primary.chat(messages);
      return { response, provider: this.primary.name };
    } catch (err) {
      logger.warn("Primary provider failed, trying fallback", {
        primary: this.primary.name,
        error: String(err),
      });

      try {
        const response = await this.fallback.chat(messages);
        return { response, provider: this.fallback.name };
      } catch (fallbackErr) {
        logger.error("Both providers failed", { error: String(fallbackErr) });
        throw new Error("Both providers failed. Please try again later.");
      }
    }
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[]; provider: string }> {
    try {
      const result = await this.primary.chatWithTools(messages, tools);
      return { ...result, provider: this.primary.name };
    } catch (err) {
      logger.warn("Primary provider failed (tools), trying fallback", {
        primary: this.primary.name,
        error: String(err),
      });

      try {
        const result = await this.fallback.chatWithTools(messages, tools);
        return { ...result, provider: this.fallback.name };
      } catch (fallbackErr) {
        logger.error("Both providers failed (tools)", { error: String(fallbackErr) });
        throw new Error("Both providers failed. Please try again later.");
      }
    }
  }
}
