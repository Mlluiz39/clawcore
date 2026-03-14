// src/providers/openrouter.ts
import OpenAI from "openai";
import { ChatMessage, LLMProvider, ToolCall, ToolDefinitionParam } from "./types";
import { logger } from "../utils/logger";

export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/mlluiz/clawcore",
        "X-Title": "ClawCore",
      },
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    logger.debug("Calling OpenRouter", { model: "anthropic/claude-3.5-sonnet", msgs: messages.length });

    const res = await this.client.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: 1000,
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
      model: "anthropic/claude-3.5-sonnet",
      msgs: messages.length,
      tools: tools.length,
    });

    const res = await this.client.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: tools as OpenAI.ChatCompletionTool[],
      max_tokens: 1000,
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
