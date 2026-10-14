// src/tools/glasser.ts
import { exec } from "child_process";
import { promisify } from "util";
import { BaseTool, ToolResult } from "./types";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

export class GlasserTool extends BaseTool {
  name = "glasser_tool";
  description =
    "Acessa dados externos e pagos via Glasser (app.glasser.ai): busca e enriquecimento de empresas, contatos, perfis do LinkedIn, busca web/notícias/mapas e raspagem de dados. Permite consultar saldo, pesquisar endpoints disponíveis, inspecionar preços e executar chamadas com pay-per-call.";

  parameters = {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description:
          "Ação a executar: 'balance' (consultar saldo), 'search' (pesquisar APIs/fontes de dados), 'inspect' (ver contrato e preço de um endpoint), 'run' (executar a chamada de dados).",
      },
      query: {
        type: "string",
        description:
          "Termo de busca para a ação 'search' (ex: 'linkedin company', 'google search', 'email enrichment', 'web scraping').",
      },
      use_case: {
        type: "string",
        description:
          "Obrigatório para 'search': o que o usuário pediu, nas palavras dele, com o assunto incluído. Ex: 'buscar 15 clínicas de estética em Fortaleza-CE com telefone e site'.",
      },
      provider: {
        type: "string",
        description:
          "Slug do provedor para 'inspect' ou 'run' (obtido via search, ex: 'pdl', 'serpapi', etc).",
      },
      endpoint: {
        type: "string",
        description:
          "Nome do endpoint para 'inspect' ou 'run' (obtido via search, ex: 'company/search', 'person/enrich').",
      },
      input: {
        type: "string",
        description:
          "Objeto JSON como string contendo os parâmetros de entrada exigidos pelo endpoint para a ação 'run'.",
      },
    },
    required: ["action"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action || "").trim();
    const env = { ...process.env };

    try {
      if (action === "balance") {
        const { stdout, stderr } = await execAsync("glasser balance -j", { env });
        const res = stdout.trim() || stderr.trim();
        return { output: res, isError: false };
      }

      if (action === "search") {
        const q = String(args.query || "").trim();
        // --use-case é exigido pela CLI: sem ele a busca sempre falha. Usa o valor
        // informado pelo modelo e cai para o termo pesquisado quando ausente.
        const useCase = String(args.use_case || "").trim() || `Buscar ${q || "endpoints de dados"} para prospecção e enriquecimento B2B`;
        const cmd = [
          "glasser search",
          q ? `-q "${q.replace(/"/g, '\\"')}"` : "",
          `--use-case "${useCase.replace(/"/g, '\\"')}"`,
          "-j",
        ]
          .filter(Boolean)
          .join(" ");
        const { stdout, stderr } = await execAsync(cmd, { env });
        return { output: stdout.trim() || stderr.trim(), isError: false };
      }

      if (action === "inspect") {
        const provider = String(args.provider || "").trim();
        const endpoint = String(args.endpoint || "").trim();
        if (!provider || !endpoint) {
          return { output: "Parâmetros 'provider' e 'endpoint' são obrigatórios para inspect.", isError: true };
        }
        const cmd = `glasser inspect -p "${provider}" -e "${endpoint}" -j`;
        const { stdout, stderr } = await execAsync(cmd, { env });
        return { output: stdout.trim() || stderr.trim(), isError: false };
      }

      if (action === "run") {
        const provider = String(args.provider || "").trim();
        const endpoint = String(args.endpoint || "").trim();
        const rawInput = args.input;
        if (!provider || !endpoint) {
          return { output: "Parâmetros 'provider' e 'endpoint' são obrigatórios para run.", isError: true };
        }

        let inputJson = "{}";
        if (typeof rawInput === "string" && rawInput.trim()) {
          inputJson = rawInput;
        } else if (typeof rawInput === "object" && rawInput !== null) {
          inputJson = JSON.stringify(rawInput);
        }

        const sanitizedJson = inputJson.replace(/'/g, "'\\''");
        const cmd = `glasser run -p "${provider}" -e "${endpoint}" -i '${sanitizedJson}' -j --wait`;
        const { stdout, stderr } = await execAsync(cmd, { env });
        return { output: stdout.trim() || stderr.trim(), isError: false };
      }

      return { output: `Ação desconhecida: ${action}`, isError: true };
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message || String(err);
      logger.error("Glasser execution error", { error: msg });
      return {
        output:
          `Erro ao executar glasser: ${msg}\n` +
          "Se a chave não estiver configurada, rode 'glasser keys add --label <label> --key <key>' ou defina GLASSER_API_KEY " +
          "no ambiente do servidor. Sem chave, nenhuma consulta de dados Glasser funciona.",
        isError: true,
      };
    }
  }
}
