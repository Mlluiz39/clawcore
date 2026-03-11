// src/providers/gemini.ts
import OpenAI from "openai";
import { ChatMessage, LLMProvider, ToolCall, ToolDefinitionParam } from "./types";
import { logger } from "../utils/logger";

export class GeminiProvider implements LLMProvider {
  name = "gemini";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    logger.debug("Calling Gemini", { model: "gemini-2.0-flash", msgs: messages.length });

    const res = await this.client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: 8192,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("Gemini returned empty response");
    return content;
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    logger.debug("Calling Gemini with tools", {
      model: "gemini-2.0-flash",
      msgs: messages.length,
      tools: tools.length,
    });

    const res = await this.client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: tools as OpenAI.ChatCompletionTool[],
      max_tokens: 8192,
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
