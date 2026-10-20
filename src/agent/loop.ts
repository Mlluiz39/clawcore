// src/agent/loop.ts
import { ProviderFactory } from "../providers/factory";
import { ChatMessage } from "../providers/types";
import { ToolRegistry } from "../tools/registry";
import { logger } from "../utils/logger";
import { config } from "../utils/config";
import { createFileMarkerFilter } from "./output-filter";

export interface AgentResult {
  text: string;
  isFile: boolean;
  isAudio: boolean;
  fileName?: string;
  /** Quantidade de ações de ferramenta executadas — exibida como "passos" no thread. */
  steps: number;
}

export interface AgentLoopOptions {
  /** Recebe o texto do assistente conforme ele é gerado. */
  onDelta?: (text: string) => void;
  /**
   * Avisa que o texto já entregue nesta rodada NÃO é a resposta final.
   *
   * O modelo costuma "pensar em voz alta" antes de chamar uma ferramenta, e esse
   * texto não pode ficar como resposta ao usuário. Como o streaming é imediato
   * (não dá para retirar o que já foi enviado), o consumidor recebe este sinal
   * para limpar o que exibiu.
   */
  onDiscard?: () => void;
}

/**
 * ReAct Agent Loop — Reasoning and Acting Engine
 *
 * Implements: Thought → Action → Observation → Answer
 * Hard-limited by MAX_AGENT_ITERATIONS to prevent runaway billing.
 */
export async function runAgentLoop(
  messages: ChatMessage[],
  toolRegistry: ToolRegistry,
  options: AgentLoopOptions = {}
): Promise<AgentResult> {
  const factory = ProviderFactory.getInstance();
  const maxIterations = config.agent.maxIterations || 5;
  const tools = toolRegistry.getDefinitions();
  const hasTools = tools.length > 0;

  // If no tools registered, do a simple chat
  if (!hasTools) {
    const { response } = await factory.chat(messages);
    options.onDelta?.(response);
    return { ...detectOutputType(response), steps: 0 };
  }

  const currentMessages = [...messages];
  let steps = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    logger.info(`ReAct Loop — Iteration ${iteration}/${maxIterations}`);

    // O texto é filtrado (tira a tag [ARQUIVO: ...]) e repassado na hora. Se a
    // rodada acabar em ferramenta, o consumidor é avisado para descartar o que
    // já exibiu — o texto era raciocínio interno, não resposta.
    const filter = createFileMarkerFilter();
    let streamed = "";

    const emit = (chunk: string) => {
      if (!chunk) return;
      streamed += chunk;
      options.onDelta?.(chunk);
    };

    let result;
    try {
      result = await factory.chatWithToolsStream(currentMessages, tools, (delta) => {
        emit(filter.push(delta));
      });
    } catch (err: any) {
      logger.error("ReAct Loop — LLM call failed", { error: String(err), iteration });
      const errDetail = err?.message || String(err);
      return {
        text: `⚠️ Erro no provedor de IA (${errDetail}). Verifique o modelo nas Configurações do painel.`,
        isFile: false,
        isAudio: false,
        steps,
      };
    }

    // If no tool calls, we got a final answer
    if (result.toolCalls.length === 0) {
      const rawText = result.content ?? "Não consegui gerar uma resposta.";
      const detected = detectOutputType(rawText);

      // Resposta final: libera a cauda que o filtro reteve (a tag, ou o começo
      // dela). O que for tag é descartado — não é conteúdo.
      filter.flush();

      logger.info("ReAct Loop — Final answer", {
        iteration,
        provider: result.provider,
        responseLength: detected.text.length,
      });
      return { ...detected, steps };
    }

    // Rodada com ferramenta: o que foi transmitido era raciocínio interno.
    // Avisa para o consumidor limpar antes da próxima rodada.
    if (streamed) options.onDiscard?.();

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

      steps += 1;
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
  logger.warn("ReAct Loop — Max iterations reached", { maxIterations, steps });

  // O trabalho já coletado não pode ser descartado: pede uma resposta final sem
  // ferramentas, usando apenas as observações acumuladas.
  const synthesis = await synthesizeFromObservations(currentMessages, maxIterations);
  if (synthesis) {
    logger.info("ReAct Loop — Synthesized final answer after iteration limit", {
      steps,
      responseLength: synthesis.length,
    });
    return { ...detectOutputType(synthesis), steps };
  }

  return {
    text:
      `⚠️ Atingi o limite de ${maxIterations} rodadas de ferramentas e não consegui montar o resumo final. ` +
      "O que já foi executado pode estar registrado na Inbox de aprovação. Peça para eu continuar de onde parei, " +
      "ou aumente MAX_AGENT_ITERATIONS.",
    isFile: false,
    isAudio: false,
    steps,
  };
}

/**
 * Pede ao modelo uma resposta final a partir das observações já coletadas.
 *
 * Envia um transcript compacto das observações de ferramenta em vez das mensagens
 * originais: mensagens de assistente com `tool_calls` não são aceitas em uma
 * chamada sem ferramentas.
 */
async function synthesizeFromObservations(
  currentMessages: ChatMessage[],
  maxIterations: number
): Promise<string | null> {
  const observations = currentMessages
    .filter((m) => m.role === "tool" && typeof m.content === "string" && m.content.trim())
    .map((m, index) => `[observação ${index + 1}]\n${truncate(m.content as string, 2_000)}`)
    .join("\n\n");

  if (!observations) return null;

  const systemMessage = currentMessages.find((m) => m.role === "system");
  const lastUserMessage = [...currentMessages].reverse().find((m) => m.role === "user");

  const instruction = [
    `Você já usou ${maxIterations} rodadas de ferramentas e não pode chamar mais nenhuma.`,
    "Responda AGORA ao pedido original com o que foi coletado nas observações abaixo.",
    "Não invente dados ausentes: diga explicitamente o que não foi verificado.",
    "Se algum item já foi registrado como entregável, não tente registrar de novo — apenas informe.",
    "",
    `Pedido original do usuário:\n${truncate(String(lastUserMessage?.content ?? ""), 2_000)}`,
    "",
    `Observações coletadas:\n${observations}`,
  ].join("\n");

  try {
    const { response } = await ProviderFactory.getInstance().chat([
      ...(systemMessage ? [systemMessage] : []),
      { role: "user", content: instruction },
    ]);
    return response?.trim() ? response : null;
  } catch (err) {
    logger.error("ReAct Loop — Final synthesis failed", { error: String(err) });
    return null;
  }
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}… [truncado]`;
}

/**
 * Detect if the response should be sent as a file or audio
 */
function detectOutputType(text: string): Omit<AgentResult, "steps"> {
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
