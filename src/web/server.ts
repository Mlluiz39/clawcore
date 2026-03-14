// src/web/server.ts
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
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

const TMP_DIR = path.resolve(process.cwd(), "tmp");

// Multer for audio uploads — store in tmp directory
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

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

  // ── Voice → Text (STT via Groq Whisper) ─────────────────────────────────
  app.post("/api/voice", authMiddleware, upload.single("audio"), async (req: any, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Nenhum arquivo de áudio enviado." });
      return;
    }

    try {
      const apiKey = config.providers.groq.apiKey;
      if (!apiKey) throw new Error("GROQ_API_KEY não configurada.");

      const client = new OpenAI({
        apiKey,
        baseURL: "https://api.groq.com/openai/v1",
      });

      logger.info("Transcribing web voice input via Groq Whisper", { size: file.size });

      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(file.path),
        model: "whisper-large-v3-turbo",
        language: "pt",
        response_format: "text",
      });

      const text = typeof transcription === "string"
        ? transcription
        : (transcription as { text: string }).text;

      res.json({ text: text.trim() });
    } catch (err) {
      logger.error("Voice transcription failed", { error: String(err) });
      res.status(500).json({ error: "Falha na transcrição de áudio." });
    } finally {
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch { /* ignore */ }
      }
    }
  });

  // ── Text → Speech (TTS via edge-tts-universal) ───────────────────────────
  app.post("/api/tts", authMiddleware, async (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) {
      res.status(400).json({ error: "Texto vazio." });
      return;
    }

    let tmpPath = "";
    try {
      // Clean markdown for TTS
      const cleanText = text
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`]+`/g, "")
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
        .replace(/#{1,6}\s+/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[>|~_]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (!cleanText) {
        res.status(400).json({ error: "Texto vazio após limpeza." });
        return;
      }

      const { EdgeTTS } = await import("edge-tts-universal");
      const tts = new EdgeTTS(cleanText, config.audio.ttsVoice);
      const result = await tts.synthesize();

      tmpPath = path.join(TMP_DIR, `${Date.now()}_tts.mp3`);
      const arrayBuffer = await result.audio.arrayBuffer();
      fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

      logger.info("TTS generated for web", { chars: cleanText.length });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `inline; filename="tts.mp3"`);
      const audioBuffer = fs.readFileSync(tmpPath);
      res.send(audioBuffer);
    } catch (err) {
      logger.error("TTS failed", { error: String(err) });
      res.status(500).json({ error: "Falha na geração de áudio." });
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
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
      fallbacks: config.providers.fallbacks,
    });
  });

  // ── Fallback 404 para rotas não API ──────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  return app;
}
