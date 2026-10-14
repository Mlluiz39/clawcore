// src/tools/request-approval.ts
import { BaseTool, ToolResult } from "./types";
import { createDeliverable } from "../memory/repository";

export class RequestApprovalTool extends BaseTool {
  name = "request_approval";
  description = "Solicita aprovação humana antes de executar qualquer ação irreversível ou externa (como publicar nas redes, disparar e-mails para lista ou alterar infraestrutura).";

  parameters = {
    type: "object" as const,
    properties: {
      action_name: {
        type: "string",
        description: "Nome claro da ação que precisa de aprovação humana.",
      },
      details: {
        type: "string",
        description: "Detalhes exatos do que será executado e o impacto.",
      },
      risk_level: {
        type: "string",
        description: "Nível de risco: 'low' | 'medium' | 'high'",
      },
      agent_id: {
        type: "string",
        description: "ID do agente solicitante.",
      },
    },
    required: ["action_name", "details"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action_name = String(args.action_name);
    const details = String(args.details);
    const risk_level = String(args.risk_level || "medium");
    const agent_id = String(args.agent_id || "coo");

    const deliverable = createDeliverable({
      agent_id,
      title: `Solicitação de Ação: ${action_name}`,
      type: "custom",
      summary: `[Risco: ${risk_level.toUpperCase()}] ${action_name}`,
      content: { action: action_name, details, risk_level },
      status: "pending_approval",
    });

    return {
      output: JSON.stringify({
        approval_id: deliverable.id,
        action: action_name,
        status: "pending_approval",
        message: `Ação registrada na fila de aprovação (ID: ${deliverable.id}). Aguardando confirmação do usuário no painel Inbox antes de prosseguir.`,
      }),
    };
  }
}
