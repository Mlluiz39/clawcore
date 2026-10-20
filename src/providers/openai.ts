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

  /**
   * Versão com streaming de `chatWithTools`.
   *
   * Os deltas chegam intercalados: texto do assistente e fragmentos de tool call
   * compartilham o mesmo stream. Fragmentos de tool call são remontados por
   * índice (o `id` e o `name` só vêm no primeiro fragmento; `arguments` chega
   * picado e precisa ser concatenado).
   */
  async chatWithToolsStream(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[],
    onDelta: (text: string) => void
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    this.refresh();

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: tools as OpenAI.ChatCompletionTool[],
      max_tokens: 8192,
      stream: true,
    });

    let content = "";
    const partials = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }

      for (const tc of delta.tool_calls ?? []) {
        const index = tc.index ?? 0;
        const acc = partials.get(index) ?? { id: "", name: "", args: "" };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
        partials.set(index, acc);
      }
    }

    const toolCalls: ToolCall[] = [...partials.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, acc]) => acc.name)
      .map(([, acc]) => ({
        id: acc.id,
        type: "function" as const,
        function: { name: acc.name, arguments: acc.args || "{}" },
      }));

    return { content: content || null, toolCalls };
  }
}
