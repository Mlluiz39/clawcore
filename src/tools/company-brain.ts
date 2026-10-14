// src/tools/company-brain.ts
import { BaseTool, ToolResult } from "./types";
import { getCompanyProfile, updateCompanyProfile } from "../memory/repository";

export class CompanyBrainTool extends BaseTool {
  name = "company_brain";
  description = "Acessa ou atualiza a memória e diretrizes centrais da empresa compartilhadas por todos os agentes (nicho, tom de voz, público-alvo, proposta de valor e regras da marca).";

  parameters = {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: "'get' para consultar o perfil da empresa ou 'update' para atualizar informações.",
      },
      company_name: {
        type: "string",
        description: "Nome da empresa (opcional para update).",
      },
      niche: {
        type: "string",
        description: "Nicho de atuação da empresa (opcional para update).",
      },
      target_audience: {
        type: "string",
        description: "Público-alvo / ICP (opcional para update).",
      },
      tone_of_voice: {
        type: "string",
        description: "Tom de voz e estilo de comunicação da marca.",
      },
      value_prop: {
        type: "string",
        description: "Proposta única de valor.",
      },
      guidelines: {
        type: "string",
        description: "Diretrizes e restrições obrigatórias para os conteúdos e ações.",
      },
    },
    required: ["action"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action || "get");

    if (action === "update") {
      const updateData: any = {};
      if (args.company_name) updateData.company_name = String(args.company_name);
      if (args.niche) updateData.niche = String(args.niche);
      if (args.target_audience) updateData.target_audience = String(args.target_audience);
      if (args.tone_of_voice) updateData.tone_of_voice = String(args.tone_of_voice);
      if (args.value_prop) updateData.value_prop = String(args.value_prop);
      if (args.guidelines) updateData.guidelines = String(args.guidelines);

      const profile = updateCompanyProfile(updateData);
      return {
        output: JSON.stringify({
          message: "Perfil da empresa atualizado com sucesso no cérebro central.",
          profile,
        }),
      };
    }

    const profile = getCompanyProfile();
    return {
      output: JSON.stringify(profile),
    };
  }
}
