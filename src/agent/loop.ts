// src/agent/loop.ts
import { ProviderFactory } from "../providers/factory";
import { ChatMessage } from "../providers/types";
import { ToolRegistry } from "../tools/registry";
import { logger } from "../utils/logger";
import { config } from "../utils/config";

let _factory: ProviderFactory | null = null;

function getFactory(): ProviderFactory {
  if (!_factory) _factory = new ProviderFactory();
  return _factory;
}

export interface AgentResult {
  text: string;
  isFile: boolean;
  isAudio: boolean;
  fileName?: string;
}

/**
 * ReAct Agent Loop — Reasoning and Acting Engine
 *
 * Implements: Thought → Action → Observation → Answer
 * Hard-limited by MAX_AGENT_ITERATIONS to prevent runaway billing.
 */
export async function runAgentLoop(
  messages: ChatMessage[],
  toolRegistry: ToolRegistry
): Promise<AgentResult> {
  const maxIterations = config.agent.maxIterations || 5;
  const tools = toolRegistry.getDefinitions();
  const hasTools = tools.length > 0;

  // If no tools registered, do a simple chat
  if (!hasTools) {
    const { response } = await getFactory().chat(messages);
    return detectOutputType(response);
  }

  let currentMessages = [...messages];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    logger.info(`ReAct Loop — Iteration ${iteration}/${maxIterations}`);

    let result;
    try {
      result = await getFactory().chatWithTools(currentMessages, tools);
    } catch (err) {
      logger.error("ReAct Loop — LLM call failed", { error: String(err), iteration });
      return {
        text: "⚠️ Todos os provedores de IA configurados estão indisponíveis no momento. Tente novamente em instantes.",
        isFile: false,
        isAudio: false,
      };
    }

    // If no tool calls, we got a final answer
    if (result.toolCalls.length === 0) {
      const finalText = result.content ?? "Não consegui gerar uma resposta.";
      logger.info("ReAct Loop — Final answer", {
        iteration,
        provider: result.provider,
        responseLength: finalText.length,
      });
      return detectOutputType(finalText);
    }

    // Process tool calls
    logger.info("ReAct Loop — Tool calls received", {
      iteration,
      count: result.toolCalls.length,
      tools: result.toolCalls.map((tc) => tc.function.name),
    });

    // Add assistant message with tool_calls
    currentMessages.push({
      role: "assistant",
      content: result.content ?? "",
      tool_calls: result.toolCalls,
    });

    // Execute each tool call and add observation
    for (const toolCall of result.toolCalls) {
      const { name, arguments: argsJson } = toolCall.function;

      logger.info(`ReAct Loop — Action: ${name}`, { args: argsJson.slice(0, 200) });

      const toolResult = await toolRegistry.execute(name, argsJson);

      logger.info(`ReAct Loop — Observation`, {
        tool: name,
        output: toolResult.output.slice(0, 200),
        isError: toolResult.isError,
      });

      // Inject tool result back into conversation
      currentMessages.push({
        role: "tool",
        content: toolResult.output,
        tool_call_id: toolCall.id,
      });
    }
  }

  // Hard limit reached
  logger.warn("ReAct Loop — Max iterations reached", { maxIterations });
  return {
    text: `⚠️ Desculpe, atingi o limite máximo de ${maxIterations} iterações de processamento. Tente reformular sua solicitação de forma mais específica.`,
    isFile: false,
    isAudio: false,
  };
}

/**
 * Detect if the response should be sent as a file or audio
 */
function detectOutputType(text: string): AgentResult {
  // Check for file markers — the LLM may wrap content in ```markdown blocks
  // or use explicit markers like [ARQUIVO: filename.md]
  const fileMatch = text.match(/\[ARQUIVO:\s*(.+?)\]/i);
  if (fileMatch) {
    const fileName = fileMatch[1].trim();
    // Remove the marker from the text
    const cleanText = text.replace(/\[ARQUIVO:\s*.+?\]/i, "").trim();
    return { text: cleanText, isFile: true, isAudio: false, fileName };
  }

  return { text, isFile: false, isAudio: false };
}
