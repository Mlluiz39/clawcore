// src/providers/openrouter.ts
import OpenAI from "openai";
import { ChatMessage, LLMProvider, ToolCall, ToolDefinitionParam } from "./types";
import { logger } from "../utils/logger";
import { config } from "../utils/config";

export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/mlluiz/clawcore",
        "X-Title": "ClawCore",
      },
    });
    this.model = config.providers.openrouter.model;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    logger.debug("Calling OpenRouter", { model: this.model, msgs: messages.length });

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: 4096,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response");
    return content;
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    logger.debug("Calling OpenRouter with tools", {
      model: this.model,
      msgs: messages.length,
      tools: tools.length,
    });

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: tools as OpenAI.ChatCompletionTool[],
      max_tokens: 4096,
    });

    const choice = res.choices[0]?.message;
    const toolCalls: ToolCall[] = (choice?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return { content: choice?.content ?? null, toolCalls };
  }
}
