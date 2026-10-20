// src/providers/types.ts

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface ToolCallFunction {
  name: string;
  arguments: string; // JSON string
}

export interface ToolDefinitionParam {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }>;
  /**
   * Igual a `chatWithTools`, mas entrega o texto em deltas conforme chega.
   *
   * `onDelta` é chamado apenas com conteúdo de texto — fragmentos de tool call
   * são acumulados internamente. O retorno é idêntico ao de `chatWithTools`.
   */
  chatWithToolsStream(
    messages: ChatMessage[],
    tools: ToolDefinitionParam[],
    onDelta: (text: string) => void
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }>;
}
