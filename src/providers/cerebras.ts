// src/providers/cerebras.ts
import OpenAI from "openai";
import { ChatMessage, LLMProvider, ToolCall, ToolDefinitionParam } from "./types";
import { logger } from "../utils/logger";

export class CerebrasProvider implements LLMProvider {
  name = "cerebras";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.cerebras.ai/v1",
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    logger.debug("Calling Cerebras", { model: "llama-3.3-70b", msgs: messages.length });

    const res = await this.client.chat.completions.create({
      model: "llama-3.3-70b",
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: 4096,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("Cerebras returned empty response");
    return content;
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    logger.debug("Calling Cerebras with tools", {
      model: "llama-3.3-70b",
      msgs: messages.length,
      tools: tools.length,
    });

    const res = await this.client.chat.completions.create({
      model: "llama-3.3-70b",
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
