// src/bot/telegram.ts
import { Bot, Context } from "grammy";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { AgentController } from "../agent/controller";
import { TelegramInputHandler } from "./input-handler";
import { TelegramOutputHandler } from "./output-handler";
import { ToolRegistry } from "../tools/registry";
import { getStats } from "../memory/repository";
import { getAllSkills } from "../skills/loader";

export function createBot(toolRegistry: ToolRegistry): Bot {
  const bot = new Bot(config.telegram.botToken);
  const inputHandler = new TelegramInputHandler();
  const outputHandler = new TelegramOutputHandler();
  const controller = new AgentController(toolRegistry);

  // ── Whitelist Middleware ─────────────────────────────────────────────────
  bot.use(async (ctx: Context, next) => {
    const userId = String(ctx.from?.id ?? "");
    if (!config.telegram.allowedUserIds.includes(userId)) {
      logger.debug("Blocked unauthorized user", { userId });
      return; // silent ignore
    }
    await next();
  });

  // ── /start ───────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const skills = getAllSkills();
    await ctx.reply(
      `👋 *ClawCore online!*\n\n` +
      `Sou seu agente pessoal de IA. Envie qualquer mensagem e eu respondo.\n\n` +
      `🧠 Skills carregadas: ${skills.length}\n\n` +
      `Comandos:\n` +
      `/status — saúde do agente\n` +
      `/skills — skills carregadas\n\n` +
      `💡 Aceito texto, PDFs, arquivos .md e mensagens de voz!`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /status ──────────────────────────────────────────────────────────────
  bot.command("status", async (ctx) => {
    const userId = String(ctx.from!.id);
    const stats = getStats(userId);
    const uptime = Math.floor(process.uptime());
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const skills = getAllSkills();
    const tools = toolRegistry.getToolNames();

    await ctx.reply(
      `*ClawCore Status*\n\n` +
      `🟢 Uptime: ${uptime}s\n` +
      `💾 Memory: ${mem}MB\n` +
      `🧠 Skills: ${skills.length}\n` +
      `🔧 Tools: ${tools.length} (${tools.join(", ") || "nenhuma"})\n` +
      `💬 Suas conversas: ${stats.conversations}\n` +
      `📨 Suas mensagens: ${stats.messages}\n` +
      `🤖 Provider: ${config.providers.primary} (fallback: ${config.providers.fallback})`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /skills ──────────────────────────────────────────────────────────────
  bot.command("skills", async (ctx) => {
    const skills = getAllSkills();
    if (skills.length === 0) {
      await ctx.reply("Nenhuma skill carregada. Adicione pastas com SKILL.md em .agents/skills/");
      return;
    }
    const list = skills.map((s) => `• *${s.name}*: ${s.description}`).join("\n");
    await ctx.reply(`*Skills Carregadas:*\n\n${list}`, { parse_mode: "Markdown" });
  });

  // ── Text messages ────────────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const userId = String(ctx.from!.id);
    const rawText = ctx.message.text.trim();

    if (!rawText) {
      await ctx.reply("Envie uma mensagem de texto.");
      return;
    }

    await ctx.api.sendChatAction(ctx.chat.id, "typing");

    try {
      const input = inputHandler.processText(rawText);
      const result = await controller.processMessage(userId, input.text, {
        requiresAudioReply: input.requiresAudioReply,
      });
      await outputHandler.send(ctx, result);
    } catch (err) {
      logger.error("Error in text handler", { error: String(err), userId });
      await outputHandler.sendError(ctx, "Algo deu errado. Tente novamente.");
    }
  });

  // ── Document messages (PDF, MD) ──────────────────────────────────────────
  bot.on("message:document", async (ctx) => {
    const userId = String(ctx.from!.id);
    await ctx.api.sendChatAction(ctx.chat.id, "typing");

    try {
      const input = await inputHandler.processDocument(ctx);

      // If it's an unsupported format warning, just send as text
      if (input.text.startsWith("⚠️")) {
        await ctx.reply(input.text);
        return;
      }

      const result = await controller.processMessage(userId, input.text, {
        requiresAudioReply: input.requiresAudioReply,
      });
      await outputHandler.send(ctx, result);
    } catch (err) {
      logger.error("Error in document handler", { error: String(err), userId });
      await outputHandler.sendError(ctx, "Falha ao processar o documento. Tente novamente.");
    }
  });

  // ── Voice / Audio messages ───────────────────────────────────────────────
  bot.on(["message:voice", "message:audio"], async (ctx) => {
    const userId = String(ctx.from!.id);
    await ctx.api.sendChatAction(ctx.chat.id, "record_voice");

    try {
      const input = await inputHandler.processVoice(ctx);

      // If transcription failed
      if (input.text.startsWith("⚠️")) {
        await ctx.reply(input.text);
        return;
      }

      // Show typing now that we have text
      await ctx.api.sendChatAction(ctx.chat.id, "typing");

      const result = await controller.processMessage(userId, input.text, {
        requiresAudioReply: input.requiresAudioReply,
      });
      await outputHandler.send(ctx, result);
    } catch (err) {
      logger.error("Error in voice handler", { error: String(err), userId });
      await outputHandler.sendError(ctx, "Falha ao processar o áudio. Tente novamente.");
    }
  });

  // ── Unsupported message types ────────────────────────────────────────────
  bot.on("message", async (ctx) => {
    await ctx.reply("⚠️ No momento, só consigo processar texto, PDF, arquivos .md e mensagens de voz.");
  });

  return bot;
}
