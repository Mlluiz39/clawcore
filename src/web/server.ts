// src/web/server.ts
import express from "express";
import cors from "cors";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { AgentController } from "../agent/controller";
import { ToolRegistry } from "../tools/registry";
import { authMiddleware, generateToken } from "./auth";
import {
  getOrCreateConversation,
  getAllConversations,
  createNewConversation,
  deleteConversation,
  getRecentMessages,
  getStats,
  getConversationMessages,
} from "../memory/repository";
import { getAllSkills } from "../skills/loader";

export function createWebServer(toolRegistry: ToolRegistry) {
  const app = express();
  const controller = new AgentController(toolRegistry);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (password !== config.web.authPassword) {
      res.status(401).json({ error: "Senha incorreta" });
      return;
    }
    const token = generateToken();
    res.json({ token });
  });

  // ── Chat (SSE streaming) ─────────────────────────────────────────────────
  app.post("/api/chat", authMiddleware, async (req, res) => {
    const { message, conversationId } = req.body;

    if (!message?.trim()) {
      res.status(400).json({ error: "Mensagem vazia" });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const userId = "web-user";

    try {
      // Ensure conversation exists
      let conv;
      if (conversationId) {
        conv = getOrCreateConversation(userId);
      } else {
        conv = createNewConversation(userId);
      }

      // Send conversation ID immediately
      res.write(`data: ${JSON.stringify({ type: "conv_id", conversationId: conv.id })}\n\n`);

      // Send typing indicator
      res.write(`data: ${JSON.stringify({ type: "typing" })}\n\n`);

      // Process message through the agent
      const result = await controller.processMessage(userId, message.trim());

      // Send the full response
      // Simulate streaming by sending chunks
      const text = result.text;
      const chunkSize = 15; // characters per chunk
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        // Small delay for streaming effect
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Send done event
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          isFile: result.isFile,
          fileName: result.fileName,
        })}\n\n`
      );
    } catch (err) {
      logger.error("Chat error", { error: String(err) });
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Erro ao processar mensagem. Tente novamente.",
        })}\n\n`
      );
    } finally {
      res.end();
    }
  });

  // ── Conversations ────────────────────────────────────────────────────────
  app.get("/api/conversations", authMiddleware, (_req, res) => {
    const conversations = getAllConversations("web-user");
    res.json({ conversations });
  });

  app.post("/api/conversations", authMiddleware, (_req, res) => {
    const conv = createNewConversation("web-user");
    res.json({ conversation: conv });
  });

  app.get("/api/conversations/:id/messages", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const messages = getConversationMessages(id);
    res.json({ messages });
  });

  app.delete("/api/conversations/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    deleteConversation(id);
    res.json({ ok: true });
  });

  // ── Status ───────────────────────────────────────────────────────────────
  app.get("/api/status", authMiddleware, (_req, res) => {
    const stats = getStats("web-user");
    const uptime = Math.floor(process.uptime());
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const skills = getAllSkills();
    const tools = toolRegistry.getToolNames();

    res.json({
      uptime,
      memory: mem,
      skills: skills.length,
      tools: tools.length,
      toolNames: tools,
      conversations: stats.conversations,
      messages: stats.messages,
      provider: config.providers.primary,
      fallback: config.providers.fallback,
    });
  });

  // ── Fallback 404 para rotas não API ──────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  return app;
}
