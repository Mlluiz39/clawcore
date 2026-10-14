// src/agent/controller.ts
import {
  getConversationById,
  getOrCreateConversation,
  saveMessage,
  MessageMetadata,
  getRecentMessages,
  updateConversationTitle,
  getAgentById,
  getCompanyProfile,
  createNewConversation,
} from "../memory/repository";
import { routeSkill } from "../skills/router";
import { getSkillContent } from "../skills/executor";
import { getSkillSummaries } from "../skills/loader";
import { runAgentLoop, AgentResult } from "./loop";
import { ToolRegistry } from "../tools/registry";
import { ChatMessage } from "../providers/types";
import { logger } from "../utils/logger";
import { config } from "../utils/config";

export interface ProcessMessageOptions {
  agentId?: string;
  conversationId?: string;
  requiresAudioReply?: boolean;
  /** Atribuição gravada junto à resposta (ex.: rotina que publicou no thread). */
  messageMetadata?: MessageMetadata;
  /** Reaproveita o thread do agente em vez de criar uma conversa nova a cada execução. */
  reuseThread?: boolean;
}

/**
 * AgentController — Facade
 *
 * Orchestrates: Multi-Agent Personas + Company Brain + ReAct Engine
 */
export class AgentController {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async processMessage(
    userId: string,
    userInput: string,
    options?: ProcessMessageOptions
  ): Promise<AgentResult> {
    const start = Date.now();
    const agentId = options?.agentId || "coo";

    // 1. Load or create conversation thread for this agent
    let conversation;
    if (options?.conversationId) {
      conversation = getConversationById(options.conversationId, userId, agentId);
      if (!conversation) throw new Error("Conversa não encontrada para este usuário e agente.");
    } else if (options?.reuseThread) {
      // Rotinas publicam no thread do agente em vez de abrir uma conversa por execução.
      conversation = getOrCreateConversation(userId, agentId);
    } else {
      conversation = createNewConversation(userId, agentId);
    }

    // 2. Persist user message
    // Execuções de rotina não gravam mensagem do usuário: o prompt da rotina já
    // vem descrito na atribuição exibida junto à resposta.
    if (!options?.messageMetadata) {
      saveMessage(conversation.id, "user", userInput);
    }

    // 2.1 Update title if it's new or still "Nova Conversa"
    if (conversation.title === "Nova Conversa") {
      const newTitle = userInput.length > 35 ? userInput.substring(0, 35) + "..." : userInput;
      updateConversationTitle(conversation.id, newTitle);
      logger.info("Conversation title updated", { id: conversation.id, title: newTitle });
    }

    // 3. Route to skill if applicable
    let skillContent: string | null = null;
    try {
      const skillName = await routeSkill(userInput);
      if (skillName) {
        skillContent = getSkillContent(skillName);
        logger.info("Skill routed", { skillName, hasContent: !!skillContent });
      }
    } catch (err) {
      logger.warn("Skill routing failed, proceeding without skill", { error: String(err) });
    }

    // 4. Build context with Agent Persona + Shared Company Brain
    const recent = getRecentMessages(conversation.id, config.agent.maxContextMessages);
    const history = [...recent].reverse(); // DB returns DESC, we need ASC

    const systemPrompt = this.buildSystemPrompt(agentId, skillContent);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as ChatMessage["role"], content: m.content })),
    ];

    logger.info("AgentController processing", {
      userId,
      agentId,
      conversationId: conversation.id,
      contextMessages: history.length,
      hasSkill: !!skillContent,
    });

    // 5. Run ReAct Agent Loop
    const result = await runAgentLoop(messages, this.toolRegistry);

    // 6. Handle audio flag from input metadata
    if (options?.requiresAudioReply) {
      result.isAudio = true;
    }

    // 7. Persist assistant response (com atribuição, quando publicada por rotina)
    const durationMs = Date.now() - start;
    saveMessage(
      conversation.id,
      "assistant",
      result.text,
      options?.messageMetadata ? { ...options.messageMetadata, duration_ms: durationMs, steps: result.steps } : undefined
    );

    logger.info("AgentController done", {
      userId,
      agentId,
      durationMs,
      isFile: result.isFile,
      isAudio: result.isAudio,
    });

    return result;
  }

  private buildSystemPrompt(agentId: string, skillContent: string | null): string {
    const now = new Date().toISOString().split("T")[0];
    const skillSummaries = getSkillSummaries();
    const toolNames = this.toolRegistry.getToolNames();
    const agent = getAgentById(agentId);
    const company = getCompanyProfile();

    const agentName = agent?.name || "ClawCore AI";
    const agentRole = agent?.role || "Assistente de Negócios";
    const agentInstructions = agent?.system_prompt || "Ajude o usuário com excelência técnica e foco em resultados.";

    let prompt = `Você é ${agentName}, ${agentRole} em nossa agência autônoma de IA (inspirada no modelo SureThing).
Hoje é ${now}.
Responda sempre em português brasileiro de forma profissional, direta, com rigor técnico e foco em entregar trabalho pronto (não apenas sugestões superficiais).

=== PAPEL E DIRETRIZES DO AGENTE ===
${agentInstructions}

=== CÉREBRO COMPARTILHADO DA EMPRESA ===
- Empresa: ${company.company_name}
- Nicho: ${company.niche}
- Público-Alvo: ${company.target_audience}
- Tom de Voz: ${company.tone_of_voice}
- Proposta de Valor: ${company.value_prop}
- Diretrizes da Marca: ${company.guidelines}

=== REGRAS DE EXECUÇÃO E ENTREGÁVEIS (SURETHING MOTOR) ===
1. Não seja apenas um chatbot que cospe conselhos vagos. Gere entregáveis completos e prontos para uso.
2. Quando o usuário pedir conteúdos de redes sociais, anúncios, páginas, relatórios ou sequências de e-mail, utilize OBRIGATORIAMENTE a ferramenta 'create_deliverable'. Isso registrará o material estruturado na Inbox do usuário com status 'pending_approval' para que ele possa aprovar e publicar.
3. Se você for executar uma ação externa crítica ou irreversível, chame 'request_approval' para aguardar autorização humana.
4. Você pode consultar ou atualizar os dados da empresa usando a ferramenta 'company_brain'.
5. Use 'web_search' sempre que precisar de dados atualizados da web, concorrentes ou referências de mercado.`;

    if (skillSummaries.length > 0) {
      prompt += `\n\nHabilidades disponíveis:\n${skillSummaries
        .map((s) => `- ${s.name}: ${s.description}`)
        .join("\n")}`;
    }

    if (toolNames.length > 0) {
      prompt += `\n\nFerramentas ativas no sistema: ${toolNames.join(", ")}`;
    }

    if (skillContent) {
      prompt += `\n\n--- SKILL ATIVA ---\n${skillContent}\n--- FIM DA SKILL ---`;
    }

    prompt += `\n\nSe a resposta for um documento/arquivo completo, você também pode adicionar a tag [ARQUIVO: nome-do-arquivo.md] no início da resposta.`;

    return prompt;
  }
}
