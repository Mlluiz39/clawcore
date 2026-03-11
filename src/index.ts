// src/index.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getDb } from "./memory/database";
import { loadAllSkills, watchSkills } from "./skills/loader";
import { ToolRegistry } from "./tools/registry";
import { CreateFileTool } from "./tools/create-file";
import { createWebServer } from "./web/server";
import { config } from "./utils/config";
import { logger } from "./utils/logger";

async function main() {
  logger.info("ClawCore v2.0 starting...");

  // Ensure required directories exist
  const dirs = [
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "tmp"),
    path.resolve(process.cwd(), "public"),
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

  // Init Tool Registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new CreateFileTool());

  // Start web server
  const app = createWebServer(toolRegistry);
  const port = config.web.port;

  const server = app.listen(port, () => {
    logger.info(`ClawCore back-end online at http://localhost:${port}`);
  });

  // Graceful shutdown
  process.once("SIGINT", () => {
    logger.info("SIGINT received, shutting down");
    server.close();
  });
  process.once("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down");
    server.close();
  });
}

main().catch((err) => {
  logger.error("Fatal startup error", { error: String(err) });
  process.exit(1);
});
