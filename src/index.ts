// src/index.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getDb } from "./memory/database";
import { loadAllSkills, watchSkills } from "./skills/loader";
import { ToolRegistry } from "./tools/registry";
import { CreateFileTool } from "./tools/create-file";
import { RunCommandTool } from "./tools/run-command";
import { WhatsAppTool } from "./tools/whatsapp";
import { WhatsAppClient } from "./utils/whatsapp-client";
import { createWebServer } from "./web/server";
import { config } from "./utils/config";
import { logger } from "./utils/logger";

async function main() {
  logger.info("ClawCore v2.0 starting...");

  // Log provider configuration (mask API key for security)
  const maskedKey = config.openai.apiKey.slice(0, 7) + "..." + config.openai.apiKey.slice(-4);
  logger.info("OpenAI provider configured", {
    model: config.openai.model,
    baseURL: config.openai.baseURL,
    apiKey: maskedKey,
  });

  // Ensure required directories exist
  const dirs = [
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "tmp"),
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "data/whatsapp-session"),
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
  WhatsAppClient.getInstance().init();

  // Init Tool Registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new CreateFileTool());
  if (config.agent.enableShellTool) {
    toolRegistry.register(new RunCommandTool());
  } else {
    logger.warn("Shell tool (run_command) disabled — set ENABLE_SHELL_TOOL=true to enable");
  }
  toolRegistry.register(new WhatsAppTool());

  // Start web server
  const app = createWebServer(toolRegistry);
  const port = config.web.port;

  const server = app.listen(port, () => {
    logger.info(`ClawCore back-end online at http://localhost:${port}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
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
