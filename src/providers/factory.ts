// src/providers/factory.ts
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { LLMProvider, ChatMessage, ToolCall, ToolDefinitionParam } from "./types";
import { CerebrasProvider } from "./cerebras";
import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { DeepSeekProvider } from "./deepseek";
import { OpenRouterProvider } from "./openrouter";

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
    case "openrouter":
      return new OpenRouterProvider(config.providers.openrouter.apiKey);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export class ProviderFactory {
  private providers: LLMProvider[] = [];

  constructor() {
    try {
      this.providers.push(buildProvider(config.providers.primary));
      for (const fallbackName of config.providers.fallbacks) {
        if (fallbackName && fallbackName !== config.providers.primary) {
          this.providers.push(buildProvider(fallbackName));
        }
      }
      logger.info("ProviderFactory ready", {
        chain: this.providers.map(p => p.name),
      });
    } catch (err) {
      logger.error("Failed to initialize ProviderFactory", { error: String(err) });
      throw err;
    }
  }

  async chat(messages: ChatMessage[]): Promise<{ response: string; provider: string }> {
    let lastError: any = null;

    for (const provider of this.providers) {
      try {
        const response = await provider.chat(messages);
        return { response, provider: provider.name };
      } catch (err) {
        lastError = err;
        logger.warn(`Provider ${provider.name} failed, trying next in chain`, {
          error: String(err),
        });
      }
    }

    logger.error("All providers in chain failed", { error: String(lastError) });
    throw new Error("Todos os provedores de IA falharam. Por favor, tente novamente mais tarde.");
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[]; provider: string }> {
    let lastError: any = null;

    for (const provider of this.providers) {
      try {
        const result = await provider.chatWithTools(messages, tools);
        return { ...result, provider: provider.name };
      } catch (err) {
        lastError = err;
        logger.warn(`Provider ${provider.name} (tools) failed, trying next in chain`, {
          error: String(err),
        });
      }
    }

    logger.error("All providers in chain failed (tools)", { error: String(lastError) });
    throw new Error("Todos os provedores de IA falharam ao processar ferramentas.");
  }
}
