// src/agent/controller.ts
import { getOrCreateConversation, saveMessage, getRecentMessages, updateConversationTitle } from "../memory/repository";
import { routeSkill } from "../skills/router";
import { getSkillContent } from "../skills/executor";
import { getSkillSummaries } from "../skills/loader";
import { runAgentLoop, AgentResult } from "./loop";
import { ToolRegistry } from "../tools/registry";
import { ChatMessage } from "../providers/types";
import { logger } from "../utils/logger";
import { config } from "../utils/config";

/**
 * AgentController — Facade
 *
 * Orchestrates: Input → SkillRouter → SkillExecutor → AgentLoop → Output
 * Handles memory persistence and context building.
 */
export class AgentController {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async processMessage(
    userId: string,
    userInput: string,
    metadata?: { requiresAudioReply?: boolean }
  ): Promise<AgentResult> {
    const start = Date.now();

    // 1. Load or create conversation thread
    const conversation = getOrCreateConversation(userId);

    // 2. Persist user message
    saveMessage(conversation.id, "user", userInput);

    // 2.1 Update title if it's new or still "Nova Conversa"
    if (conversation.title === "Nova Conversa") {
      const newTitle = userInput.length > 30 ? userInput.substring(0, 30) + "..." : userInput;
      updateConversationTitle(conversation.id, newTitle);
      logger.info("Conversation title updated", { id: conversation.id, title: newTitle });
    }

    // 3. Route to appropriate skill
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

    // 4. Build context: system prompt + skill + recent messages
    const recent = getRecentMessages(conversation.id, config.agent.maxContextMessages);
    const history = [...recent].reverse(); // DB returns DESC, we need ASC

    const systemPrompt = this.buildSystemPrompt(skillContent);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as ChatMessage["role"], content: m.content })),
    ];

    logger.info("AgentController processing", {
      userId,
      conversationId: conversation.id,
      contextMessages: history.length,
      hasSkill: !!skillContent,
    });

    // 5. Run ReAct Agent Loop
    const result = await runAgentLoop(messages, this.toolRegistry);

    // 6. Handle audio flag from input metadata
    if (metadata?.requiresAudioReply) {
      result.isAudio = true;
    }

    // 7. Persist assistant response
    saveMessage(conversation.id, "assistant", result.text);

    logger.info("AgentController done", {
      userId,
      durationMs: Date.now() - start,
      isFile: result.isFile,
      isAudio: result.isAudio,
    });

    return result;
  }

  private buildSystemPrompt(skillContent: string | null): string {
    const now = new Date().toISOString().split("T")[0];
    const skillSummaries = getSkillSummaries();
    const toolNames = this.toolRegistry.getToolNames();

    let prompt = `Você é o ClawCore, um agente pessoal de IA criado por MlluizDev. Seja conciso, útil e direto.
Hoje é ${now}.
Responda sempre em português brasileiro, a menos que o usuário peça outro idioma.`;

    if (skillSummaries.length > 0) {
      prompt += `\n\nHabilidades disponíveis:\n${skillSummaries
        .map((s) => `- ${s.name}: ${s.description}`)
        .join("\n")}`;
    }

    if (toolNames.length > 0) {
      prompt += `\n\nFerramentas disponíveis: ${toolNames.join(", ")}`;
    }

    if (skillContent) {
      prompt += `\n\n--- SKILL ATIVA ---\n${skillContent}\n--- FIM DA SKILL ---`;
    }

    prompt += `\n\nSe a resposta for um documento/arquivo completo, adicione a tag [ARQUIVO: nome-do-arquivo.md] no início da resposta.`;

    return prompt;
  }
}
