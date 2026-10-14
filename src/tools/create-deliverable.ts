// src/tools/create-deliverable.ts
import { BaseTool, ToolResult } from "./types";
import { createDeliverable, Deliverable } from "../memory/repository";

export class CreateDeliverableTool extends BaseTool {
  name = "create_deliverable";
  description = "Cria um entregável estruturado de alta qualidade (lote de posts de redes sociais, copy de landing page, campanha de anúncios, relatório de pesquisa ou sequência de e-mails) e o envia diretamente para a Inbox de Aprovações do usuário.";

  parameters = {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Título descritivo do entregável (ex: 'Lote de Conteúdo Semanal para LinkedIn e Instagram', 'Campanha de Anúncios Google Ads')",
      },
      type: {
        type: "string",
        description: "Tipo do entregável: 'social_pack' | 'ad_campaign' | 'landing_page_copy' | 'research_brief' | 'email_sequence' | 'prospect_list' | 'custom'",
      },
      summary: {
        type: "string",
        description: "Resumo executivo de 1 a 2 linhas do que foi produzido e por quê.",
      },
      content: {
        type: "string",
        description: "Conteúdo completo e formatado do entregável (Markdown rico ou JSON com os posts individuais, copys, carrosséis, ganchos e CTAs).",
      },
      agent_id: {
        type: "string",
        description: "Identificador do agente autor (ex: 'cmo', 'coo', 'researcher', 'engineer').",
      },
    },
    required: ["title", "type", "summary", "content"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const title = String(args.title || "Entregável sem título");
    const type = (args.type as Deliverable["type"]) || "custom";
    const summary = String(args.summary || "");
    const content = args.content;
    const agent_id = String(args.agent_id || "cmo");

    try {
      const deliverable = createDeliverable({
        agent_id,
        title,
        type,
        summary,
        content,
        status: "pending_approval",
      });

      return {
        output: JSON.stringify({
          success: true,
          deliverable_id: deliverable.id,
          title: deliverable.title,
          status: deliverable.status,
          message: `✅ Entregável '${deliverable.title}' criado com sucesso e adicionado à Inbox com status 'pending_approval'. O usuário pode revisar, editar e aprovar no painel.`,
        }),
      };
    } catch (err) {
      return {
        output: `Erro ao criar entregável: ${String(err)}`,
        isError: true,
      };
    }
  }
}
