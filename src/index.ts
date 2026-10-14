// src/index.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getDb } from "./memory/database";
import { pruneUnknownBuiltinTools } from "./memory/repository";
import { loadAllSkills, watchSkills } from "./skills/loader";
import { ToolRegistry } from "./tools/registry";
import { CreateFileTool } from "./tools/create-file";
import { RunCommandTool } from "./tools/run-command";
import { WhatsAppTool } from "./tools/whatsapp";
import { CreateDeliverableTool } from "./tools/create-deliverable";
import { RequestApprovalTool } from "./tools/request-approval";
import { CompanyBrainTool } from "./tools/company-brain";
import { WebSearchTool } from "./tools/web-search";
import { GlasserTool } from "./tools/glasser";
import { B2BProspectorTool } from "./tools/prospector";
import { WhatsAppClient } from "./utils/whatsapp-client";
import { AgentController } from "./agent/controller";
import { startScheduler, stopScheduler } from "./scheduler/runner";
import { createWebServer } from "./web/server";
import { config } from "./utils/config";
import { getLLMSettings, maskKey, hasFileOverride } from "./utils/settings";
import { logger } from "./utils/logger";

async function main() {
  logger.info("ClawCore v2.0 starting...");

  // Log provider configuration (mask API key for security)
  const llm = getLLMSettings();
  logger.info("OpenAI provider configured", {
    model: llm.model,
    baseURL: llm.baseURL,
    apiKey: maskKey(llm.apiKey),
    source: hasFileOverride() ? "dashboard (data/settings.json)" : "env",
  });

  // Ensure required directories exist
  const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
  const dirs = [
    dataDir,
    path.resolve(process.cwd(), "tmp"),
    path.resolve(process.cwd(), "public"),
    // A sessão do WhatsApp só é criada quando o cliente é inicializado (init() já faz isso).

    path.resolve(process.cwd(), ".agents", "skills"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info("Created directory", { dir });
    }
  }

  // Init DB
  getDb();

  // Load skills + start watcher
  loadAllSkills();
  watchSkills();

  // Init WhatsApp (will auto-reconnect if session exists)
  if (config.whatsapp.enabled) {
    WhatsAppClient.getInstance().init();
  } else {
    logger.warn("WhatsApp disabled — set WHATSAPP_ENABLED=true and restart to pair");
  }

  // Init Tool Registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new CreateFileTool());
  if (config.agent.enableShellTool) {
    toolRegistry.register(new RunCommandTool());
  } else {
    logger.warn("Shell tool (run_command) disabled — set ENABLE_SHELL_TOOL=true to enable");
  }
  if (config.whatsapp.enabled) {
    toolRegistry.register(new WhatsAppTool());
  }
  toolRegistry.register(new CreateDeliverableTool());
  toolRegistry.register(new RequestApprovalTool());
  toolRegistry.register(new CompanyBrainTool());
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new GlasserTool());
  toolRegistry.register(new B2BProspectorTool());

  // Alinha agentes nativos com as ferramentas que existem de fato: a lista é
  // exibida na interface, então ferramenta inexistente vira promessa falsa.
  // Ferramentas condicionais (desligadas por configuração) continuam válidas na
  // lista — o agente volta a usá-las quando a flag for ligada.
  const knownToolNames = [...toolRegistry.getToolNames(), new RunCommandTool().name];
  const { updated, unknown } = pruneUnknownBuiltinTools(knownToolNames);
  for (const agent of updated) {
    logger.warn("Removed unknown tools from builtin agent", { agentId: agent.id, removed: agent.removed });
  }
  for (const item of unknown) {
    logger.warn("Agent declares an unregistered tool", { agentId: item.id, tool: item.tool });
  }

  // Init Agent Controller
  const controller = new AgentController(toolRegistry);

  // Start Background Automations Scheduler
  startScheduler(controller);

  // Start web server
  const app = createWebServer(toolRegistry, controller);
  const port = config.web.port;

  const server = app.listen(port, () => {
    logger.info(`ClawCore back-end online at http://localhost:${port}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    stopScheduler();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Fatal startup error", { error: String(err) });
  process.exit(1);
});
