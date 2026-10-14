// src/providers/openai.ts
import OpenAI from "openai";
import { ChatMessage, LLMProvider, ToolCall, ToolDefinitionParam } from "./types";
import { logger } from "../utils/logger";
import { getLLMSettings, maskKey } from "../utils/settings";

export class OpenAIProvider implements LLMProvider {
  name = "openai";

  private client!: OpenAI;
  private model!: string;
  private clientKey = "";

  constructor() {
    this.refresh();
  }

  /**
   * Rebuilds the client when dashboard settings change (API key / base URL).
   * Cheap: only re-creates the SDK client when the credentials actually differ.
   */
  private refresh(): this {
    const settings = getLLMSettings();
    const key = `${settings.apiKey}|${settings.baseURL}`;
    if (key !== this.clientKey) {
      this.client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
        timeout: 60_000,
        maxRetries: 3,
      });
      this.clientKey = key;
      logger.info("OpenAI client (re)configured", {
        baseURL: settings.baseURL,
        apiKey: maskKey(settings.apiKey),
      });
    }
    this.model = settings.model;
    return this;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    this.refresh();
    logger.debug("Calling OpenAI", {
      model: this.model,
      baseURL: getLLMSettings().baseURL,
      msgs: messages.length,
    });

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: 8192,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty response");
    return content;
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    this.refresh();
    logger.debug("Calling OpenAI with tools", {
      model: this.model,
      baseURL: getLLMSettings().baseURL,
      msgs: messages.length,
      tools: tools.length,
    });

    const res = await this.client.chat.completions.create({
      model: this.model,
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
