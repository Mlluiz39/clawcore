// src/web/server.ts
import express, { Request } from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "../utils/config";
import { getLLMSettings, updateLLMSettings, maskKey, hasFileOverride } from "../utils/settings";
import { logger } from "../utils/logger";
import { AgentController } from "../agent/controller";
import { ToolRegistry } from "../tools/registry";
import cookieParser from "cookie-parser";
import { authMiddleware, generateToken, verifyPassword, sessionCookieOptions, AUTH_COOKIE } from "./auth";
import {
  getAllConversations,
  createNewConversation,
  deleteConversation,
  getStats,
  getConversationMessages,
  getConversationById,
  getAllAgents,
  createCustomAgent,
  deleteCustomAgent,
  getCompanyProfile,
  updateCompanyProfile,
  getAllDeliverables,
  getDeliverableById,
  updateDeliverableStatus,
  deleteDeliverable,
  getAllScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getRoutineRuns,
  getAllIntegrations,
  updateIntegration,
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from "../memory/repository";
import { getAllSkills } from "../skills/loader";
import { executeScheduledTask } from "../scheduler/execute";
import type { Conversation } from "../memory/repository";

const TMP_DIR = path.resolve(process.cwd(), "tmp");

// Multer for audio uploads — store in tmp directory
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

export function createWebServer(toolRegistry: ToolRegistry, externalController?: AgentController) {
  const app = express();
  const controller = externalController || new AgentController(toolRegistry);

  // Cadeia em produção: cliente → Caddy → nginx → backend (dois proxies).
  // Com `trust proxy: 1` o Express para no penúltimo salto e enxerga o nginx,
  // não o cliente — o que faria todos os usuários dividirem o mesmo balde de
  // rate limit (e o log registrar sempre o IP interno).
  //
  // Valor padrão 2 = os dois hops do compose. Ajustável por env para quem
  // rodar atrás de outra topologia; `TRUST_PROXY=0` desliga.
  app.set("trust proxy", config.web.trustProxy);

  // ── Security middleware ──────────────────────────────────────────────────
  // CSP restritiva. O ponto crítico é `script-src 'self'` — sem 'unsafe-inline'
  // nem 'unsafe-eval' — porque o HTML renderizado no painel vem do LLM e passa
  // por DOMPurify: a CSP é a segunda barreira se um payload escapar.
  //
  // `style-src` precisa de 'unsafe-inline': o React 19 injeta elementos <style>
  // em runtime para os recursos de stylesheet (não há atributos `style={}` no
  // código, mas o próprio runtime cria a tag). 'unsafe-inline' em style não
  // permite execução de script.
  //
  // `connect-src 'self'` cobre o SSE do chat, que é same-origin.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "worker-src": ["'self'", "blob:"], // service worker do PWA
        "manifest-src": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
      },
    },
  }));

  // `credentials: true` é obrigatório para o cookie de sessão atravessar
  // origens distintas (dev: frontend em :5173, API em :8080). É seguro porque
  // `origin` é um valor exato — nunca "*", que o browser rejeita com credenciais.
  app.use(cors({
    origin: config.web.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  // Rate limiting — 100 requests per 15 minutes per IP.
  // `skip` deixa o login usar seu próprio balde (abaixo): senão um atacante
  // esgota o orçamento do usuário legítimo com tentativas de senha.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/auth/login",
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
  });
  app.use("/api/", limiter);

  // Login tem balde separado e bem mais apertado: é a única rota que aceita
  // segredo adivinhável, e o painel inteiro fica atrás dela.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas de login. Aguarde alguns minutos." },
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", loginLimiter, (req, res) => {
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Senha é obrigatória" });
      return;
    }
    if (!verifyPassword(password, config.web.authPassword)) {
      logger.warn("Failed login attempt", { ip: req.ip });
      res.status(401).json({ error: "Senha incorreta" });
      return;
    }

    // O token vai em cookie HttpOnly — o painel não o guarda em localStorage,
    // então um XSS não consegue lê-lo. Não é devolvido no corpo de propósito.
    res.cookie(AUTH_COOKIE, generateToken(), sessionCookieOptions());
    res.json({ ok: true });
  });

  // Encerra a sessão. Sem isso o cookie só expirava sozinho.
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  });

  // Diz ao painel se a sessão do cookie ainda vale (usado no boot do app).
  app.get("/api/auth/session", authMiddleware, (_req, res) => {
    res.json({ authenticated: true });
  });

  // ── Chat (SSE streaming) ─────────────────────────────────────────────────
  app.post("/api/chat", authMiddleware, async (req, res) => {
    const { message, conversationId, agentId, projectId } = req.body;

    if (!message?.trim()) {
      res.status(400).json({ error: "Mensagem vazia" });
      return;
    }

    const currentAgentId = typeof agentId === "string" && agentId ? agentId : "coo";
    const currentProjectId = typeof projectId === "string" && projectId ? projectId : undefined;
    const userId = "web-user";

    // Resolve a conversa ANTES de abrir o stream: enviar em uma conversa inexistente
    // (ou de outro agente) deve falhar de forma explícita, sem criar thread paralelo.
    let conversation: Conversation | null = null;
    if (conversationId) {
      conversation = getConversationById(conversationId, userId, currentAgentId);
      if (!conversation) {
        res.status(404).json({ error: "Conversa não encontrada para este agente." });
        return;
      }
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    try {
      const conv = conversation ?? createNewConversation(userId, currentAgentId, currentProjectId);

      // Send conversation ID immediately
      res.write(`data: ${JSON.stringify({ type: "conv_id", conversationId: conv.id })}\n\n`);

      // Send typing indicator
      res.write(`data: ${JSON.stringify({ type: "typing", agentId: currentAgentId })}\n\n`);

      // Streaming real: o texto é repassado conforme o modelo gera. Antes disso
      // a resposta inteira era produzida e depois fatiada em blocos de 15
      // caracteres com um setTimeout — latência artificial e nenhum feedback
      // durante as rodadas de ferramenta.
      const result = await controller.processMessage(userId, message.trim(), {
        agentId: currentAgentId,
        conversationId: conv.id,
        onDelta: (text) => {
          if (!text) return;
          res.write(`data: ${JSON.stringify({ type: "chunk", content: text })}\n\n`);
        },
        // A rodada foi de ferramenta: o texto transmitido era raciocínio
        // interno, não resposta. Manda o cliente limpar o balão.
        onDiscard: () => {
          res.write(`data: ${JSON.stringify({ type: "discard" })}\n\n`);
        },
      });

      // Send done event
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          isFile: result.isFile,
          fileName: result.fileName,
          agentId: currentAgentId,
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

  // ── Voice → Text (STT via OpenAI Whisper) ────────────────────────────────
  app.post("/api/voice", authMiddleware, upload.single("audio"), async (req: Request, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Nenhum arquivo de áudio enviado." });
      return;
    }

    try {
      const settings = getLLMSettings();
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
      });

      logger.info("Transcribing voice input via OpenAI Whisper", { size: file.size });

      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(file.path),
        model: "whisper-1",
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

  // ── Multi-Agent Registry (SureThing) ────────────────────────────────────
  app.get("/api/agents", authMiddleware, (_req, res) => {
    const agents = getAllAgents();
    res.json({ agents });
  });

  app.post("/api/agents", authMiddleware, (req, res) => {
    const { name, role, avatar, description, system_prompt, tools } = req.body || {};
    if (!name || !role || !description || !system_prompt) {
      res.status(400).json({ error: "Campos obrigatórios: name, role, description, system_prompt" });
      return;
    }
    const agent = createCustomAgent({ name, role, avatar, description, system_prompt, tools });
    res.json({ agent });
  });

  app.delete("/api/agents/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const ok = deleteCustomAgent(id);
    if (!ok) {
      res.status(400).json({ error: "Agente nativo não pode ser excluído ou ID não encontrado." });
      return;
    }
    res.json({ ok: true });
  });

  // ── Company Profile / Brain ─────────────────────────────────────────────
  app.get("/api/company-profile", authMiddleware, (_req, res) => {
    const profile = getCompanyProfile();
    res.json({ profile });
  });

  app.put("/api/company-profile", authMiddleware, (req, res) => {
    const profile = updateCompanyProfile(req.body || {});
    res.json({ profile });
  });

  // ── Deliverables (SureThing Inbox & Library) ─────────────────────────────
  app.get("/api/deliverables", authMiddleware, (req, res) => {
    const status = req.query.status as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const deliverables = getAllDeliverables(status, projectId);
    res.json({ deliverables });
  });

  app.get("/api/deliverables/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const deliverable = getDeliverableById(id);
    if (!deliverable) {
      res.status(404).json({ error: "Entregável não encontrado" });
      return;
    }
    res.json({ deliverable });
  });

  app.post("/api/deliverables/:id/approve", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const { review_notes, publishNow } = req.body || {};
    // ponytail: aprovação local apenas; adicionar publicação quando houver conector real e confirmação externa.
    if (publishNow) {
      res.status(409).json({ error: "Publicação externa indisponível. Aprove o entregável e publique manualmente." });
      return;
    }
    const newStatus = "approved";
    const updated = updateDeliverableStatus(id, newStatus, review_notes);
    if (!updated) {
      res.status(404).json({ error: "Entregável não encontrado" });
      return;
    }
    logger.info("Deliverable approved", { id, status: newStatus });
    res.json({ deliverable: updated });
  });

  app.post("/api/deliverables/:id/reject", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const { review_notes } = req.body || {};
    const updated = updateDeliverableStatus(id, "rejected", review_notes);
    if (!updated) {
      res.status(404).json({ error: "Entregável não encontrado" });
      return;
    }
    logger.info("Deliverable rejected", { id, review_notes });
    res.json({ deliverable: updated });
  });

  app.delete("/api/deliverables/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    deleteDeliverable(id);
    res.json({ ok: true });
  });

  // ── Scheduled Tasks (Background Automations) ───────────────────────────
  app.get("/api/scheduled-tasks", authMiddleware, (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const tasks = getAllScheduledTasks(projectId);
    res.json({ tasks });
  });

  app.post("/api/scheduled-tasks", authMiddleware, (req, res) => {
    const { agent_id, project_id, title, frequency, prompt } = req.body || {};
    if (!agent_id || !title || !prompt) {
      res.status(400).json({ error: "Campos obrigatórios: agent_id, title, prompt" });
      return;
    }
    try {
      const task = createScheduledTask({
        agent_id,
        project_id: typeof project_id === "string" ? project_id : null,
        title,
        frequency: frequency ?? "daily",
        prompt,
      });
      res.json({ task });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Rotina inválida." });
    }
  });

  app.put("/api/scheduled-tasks/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    try {
      const updated = updateScheduledTask(id, req.body || {});
      if (!updated) {
        res.status(404).json({ error: "Tarefa não encontrada" });
        return;
      }
      res.json({ task: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Rotina inválida." });
    }
  });

  app.get("/api/scheduled-tasks/:id/runs", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const limit = Number.parseInt(String(req.query.limit ?? "20"), 10);
    const runs = getRoutineRuns(id, Number.isFinite(limit) ? limit : 20);
    res.json({ runs });
  });

  app.delete("/api/scheduled-tasks/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    deleteScheduledTask(id);
    res.json({ ok: true });
  });

  app.post("/api/scheduled-tasks/:id/run", authMiddleware, async (req, res) => {
    const id = req.params.id as string;
    const tasks = getAllScheduledTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada" });
      return;
    }

    logger.info("Manually triggering scheduled task", { id: task.id, title: task.title });
    const execution = await executeScheduledTask(controller, task, "manual");
    if (execution.status === "error") {
      res.status(500).json({ error: execution.error, run_id: execution.run_id });
      return;
    }
    res.json({ ok: true, output: execution.text, run: execution });
  });

  // ── Integrations (SureThing Ecosystem) ───────────────────────────────────
  app.get("/api/integrations", authMiddleware, (req, res) => {
    const category = req.query.category as string | undefined;
    const integrations = getAllIntegrations(category);
    res.json({ integrations });
  });

  app.put("/api/integrations/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const { is_connected, credentials_json } = req.body || {};
    const updated = updateIntegration(id, {
      is_connected: typeof is_connected === "number" ? is_connected : undefined,
      credentials_json: typeof credentials_json === "string" ? credentials_json : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: "Integração não encontrada." });
      return;
    }
    logger.info("Integration updated", { id, is_connected: updated.is_connected });
    res.json({ integration: updated });
  });

  // ── Projects (SureThing Workspaces /p/:id) ───────────────────────────────
  app.get("/api/projects", authMiddleware, (_req, res) => {
    const projects = getAllProjects();
    const tasks = getAllScheduledTasks();
    const deliverables = getAllDeliverables();

    // Enriquecer projetos com contagem de rotinas ativas e entregáveis
    const enriched = projects.map((p) => {
      const projectTasks = tasks.filter((t) => t.project_id === p.id);
      const projectDelivs = deliverables.filter((d) => d.project_id === p.id);
      return {
        ...p,
        routines_count: projectTasks.length,
        active_routines_count: projectTasks.filter((t) => t.is_enabled).length,
        deliverables_count: projectDelivs.length,
      };
    });

    res.json({ projects: enriched });
  });

  app.get("/api/projects/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const project = getProjectById(id);
    if (!project) {
      res.status(404).json({ error: "Projeto não encontrado" });
      return;
    }
    const tasks = getAllScheduledTasks(id);
    const deliverables = getAllDeliverables(undefined, id);
    res.json({
      project: {
        ...project,
        routines_count: tasks.length,
        active_routines_count: tasks.filter((t) => t.is_enabled).length,
        deliverables_count: deliverables.length,
      },
    });
  });

  app.post("/api/projects", authMiddleware, (req, res) => {
    const { name, description, icon } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Nome do projeto é obrigatório." });
      return;
    }
    const project = createProject({ name: name.trim(), description, icon });
    res.json({ project });
  });

  app.put("/api/projects/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const { name, description, icon } = req.body || {};
    const updated = updateProject(id, { name, description, icon });
    if (!updated) {
      res.status(404).json({ error: "Projeto não encontrado" });
      return;
    }
    res.json({ project: updated });
  });

  app.delete("/api/projects/:id", authMiddleware, (req, res) => {
    const id = req.params.id as string;
    const ok = deleteProject(id);
    if (!ok) {
      res.status(404).json({ error: "Projeto não encontrado" });
      return;
    }
    res.json({ ok: true });
  });

  // ── Conversations ────────────────────────────────────────────────────────
  app.get("/api/conversations", authMiddleware, (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const conversations = getAllConversations("web-user", agentId, projectId);
    res.json({ conversations });
  });

  app.post("/api/conversations", authMiddleware, (req, res) => {
    const agentId = (req.body?.agentId as string) || "coo";
    const projectId = req.body?.projectId as string | undefined;
    const conv = createNewConversation("web-user", agentId, projectId);
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

  // ── LLM Settings (dashboard) ─────────────────────────────────────────────
  // Active values (key always masked) — safe to render in the UI.
  app.get("/api/settings", authMiddleware, (_req, res) => {
    const s = getLLMSettings();
    res.json({
      baseURL: s.baseURL,
      model: s.model,
      apiKeyMasked: maskKey(s.apiKey),
      source: hasFileOverride() ? "dashboard" : "env",
    });
  });

  // Update URL / key / model at runtime — persisted to data/settings.json.
  app.put("/api/settings", authMiddleware, (req, res) => {
    const { apiKey, baseURL, model } = req.body ?? {};

    if (apiKey === undefined && baseURL === undefined && model === undefined) {
      res.status(400).json({ error: "Nenhum campo enviado para atualizar." });
      return;
    }

    try {
      const s = updateLLMSettings({ apiKey, baseURL, model });
      res.json({
        baseURL: s.baseURL,
        model: s.model,
        apiKeyMasked: maskKey(s.apiKey),
        source: "dashboard",
      });
    } catch (err) {
      logger.warn("Settings update rejected", { error: String(err) });
      res.status(400).json({ error: err instanceof Error ? err.message : "Falha ao salvar as configurações." });
    }
  });

  // Connectivity check — validates the active (or provided) credentials.
  app.post("/api/settings/test", authMiddleware, async (req, res) => {
    const current = getLLMSettings();
    const candidate = {
      apiKey: typeof req.body?.apiKey === "string" && req.body.apiKey.trim() ? req.body.apiKey.trim() : current.apiKey,
      baseURL:
        typeof req.body?.baseURL === "string" && req.body.baseURL.trim() ? req.body.baseURL.trim() : current.baseURL,
    };

    try {
      const client = new OpenAI({ apiKey: candidate.apiKey, baseURL: candidate.baseURL, timeout: 15_000, maxRetries: 1 });
      const models = await client.models.list();
      logger.info("LLM settings test succeeded", { baseURL: candidate.baseURL, apiKey: maskKey(candidate.apiKey) });
      res.json({ ok: true, message: `Conexão OK — endpoint acessível (${models.data.length} modelos listados).` });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      logger.warn("LLM settings test failed", { baseURL: candidate.baseURL, status: status ?? "unknown" });

      let message: string;
      if (status === 401 || status === 403) {
        message = `A URL respondeu, mas a chave foi recusada (HTTP ${status}). Confira a chave de API.`;
      } else if (status) {
        message = `Falha na conexão (HTTP ${status}). Verifique a URL.`;
      } else {
        message = "Falha na conexão: endpoint inacessível.";
      }

      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(candidate.baseURL)) {
        message +=
          " Dica: em Docker, 'localhost' é o próprio container — use http://host.docker.internal:<porta>/v1 para alcançar um serviço na máquina host.";
      }

      res.json({ ok: false, message });
    }
  });

  // ── Status ───────────────────────────────────────────────────────────────
  app.get("/api/status", authMiddleware, (_req, res) => {
    const stats = getStats("web-user");
    const uptime = Math.floor(process.uptime());
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const skills = getAllSkills();
    const tools = toolRegistry.getToolNames();
    const llm = getLLMSettings();

    res.json({
      uptime,
      memory: mem,
      skills: skills.length,
      tools: tools.length,
      toolNames: tools,
      conversations: stats.conversations,
      messages: stats.messages,
      deliverables: stats.deliverables,
      pendingApprovals: stats.pendingApprovals,
      provider: "openai",
      model: llm.model,
      baseURL: llm.baseURL,
      apiKeyMasked: maskKey(llm.apiKey),
      settingsSource: hasFileOverride() ? "dashboard" : "env",
    });
  });

  // ── Health check (no auth) ───────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
  });

  // ── Serve Frontend SPA (Production) ─────────────────────────────────────
  const frontendDist = path.resolve(process.cwd(), "frontend", "dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.resolve(frontendDist, "index.html"));
    });
  }

  // ── Fallback 404 para rotas não API ──────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  return app;
}
