// src/bot/output-handler.ts
import { Context, InputFile } from "grammy";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";
import { config } from "../utils/config";
import { AgentResult } from "../agent/loop";

const TMP_DIR = path.resolve(process.cwd(), "tmp");
const TELEGRAM_MAX_LENGTH = 4096;

/**
 * TelegramOutputHandler — Strategy Pattern for output delivery.
 *
 * Strategies:
 * - TextOutputStrategy: chunked text messages (4096 char limit)
 * - FileOutputStrategy: send as Telegram document attachment
 * - AudioOutputStrategy: TTS via edge-tts → voice note
 * - ErrorOutputStrategy: formatted error with emoji
 */
export class TelegramOutputHandler {

  constructor() {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  }

  /** Main dispatch — choose strategy based on AgentResult flags */
  async send(ctx: Context, result: AgentResult): Promise<void> {
    try {
      if (result.isAudio) {
        await this.sendAudio(ctx, result.text);
      } else if (result.isFile && result.fileName) {
        await this.sendFile(ctx, result.text, result.fileName);
      } else {
        await this.sendText(ctx, result.text);
      }
    } catch (err) {
      logger.error("OutputHandler failed", { error: String(err) });
      await this.sendError(ctx, "Falha ao enviar a resposta. Tente novamente.");
    }
  }

  /** TextOutputStrategy — chunk large messages */
  async sendText(ctx: Context, text: string): Promise<void> {
    if (text.length <= TELEGRAM_MAX_LENGTH) {
      await ctx.reply(text);
      return;
    }

    // Split into chunks without breaking words
    const chunks = this.splitText(text, TELEGRAM_MAX_LENGTH);
    logger.info("Sending chunked text", { totalChunks: chunks.length });

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk);
      } catch (err: unknown) {
        // Handle rate limiting (429)
        if (this.isRateLimited(err)) {
          const retryAfter = this.getRetryAfter(err);
          logger.warn("Rate limited by Telegram, waiting", { retryAfter });
          await this.sleep(retryAfter * 1000);
          await ctx.reply(chunk);
        } else {
          throw err;
        }
      }
    }
  }

  /** FileOutputStrategy — send as document attachment */
  async sendFile(ctx: Context, content: string, fileName: string): Promise<void> {
    let tmpPath = "";
    try {
      // Signal file upload
      await ctx.api.sendChatAction(ctx.chat!.id, "upload_document");

      tmpPath = path.join(TMP_DIR, `${Date.now()}_${fileName}`);
      fs.writeFileSync(tmpPath, content, "utf-8");

      await ctx.replyWithDocument(new InputFile(tmpPath, fileName), {
        caption: `📄 ${fileName}`,
      });

      logger.info("File sent", { fileName, size: content.length });
    } catch (err) {
      logger.error("File send failed, falling back to text", { error: String(err) });
      // Fallback: send as chunked text
      await this.sendText(ctx, `📄 *${fileName}*\n\n${content}`);
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }
  }

  /** AudioOutputStrategy — TTS via edge-tts-universal */
  async sendAudio(ctx: Context, text: string): Promise<void> {
    let tmpPath = "";
    try {
      // Signal voice recording
      await ctx.api.sendChatAction(ctx.chat!.id, "record_voice");

      // Clean markdown for TTS
      const cleanText = this.cleanForTTS(text);

      // Import edge-tts-universal dynamically
      const { EdgeTTS } = await import("edge-tts-universal");
      const tts = new EdgeTTS(cleanText, config.audio.ttsVoice);
      const result = await tts.synthesize();

      tmpPath = path.join(TMP_DIR, `${Date.now()}_tts.mp3`);
      const arrayBuffer = await result.audio.arrayBuffer();
      fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

      // Send as voice note
      await ctx.replyWithVoice(new InputFile(tmpPath));

      logger.info("Audio sent", { textLength: cleanText.length });
    } catch (err) {
      logger.warn("TTS failed, falling back to text", { error: String(err) });
      // Fallback to text
      await this.sendText(ctx, text);
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }
  }

  /** ErrorOutputStrategy — formatted error message */
  async sendError(ctx: Context, message: string): Promise<void> {
    try {
      await ctx.reply(`⚠️ ${message}`);
    } catch (err) {
      logger.error("Failed to send error message", { error: String(err) });
    }
  }

  /** Split text into chunks without breaking words */
  private splitText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find last newline or space before maxLength
      let splitIdx = remaining.lastIndexOf("\n", maxLength);
      if (splitIdx === -1 || splitIdx < maxLength * 0.5) {
        splitIdx = remaining.lastIndexOf(" ", maxLength);
      }
      if (splitIdx === -1 || splitIdx < maxLength * 0.3) {
        splitIdx = maxLength; // Force split
      }

      chunks.push(remaining.slice(0, splitIdx).trimEnd());
      remaining = remaining.slice(splitIdx).trimStart();
    }

    return chunks;
  }

  /** Remove markdown for cleaner TTS */
  private cleanForTTS(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/`[^`]+`/g, "")        // Remove inline code
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
      .replace(/#{1,6}\s+/g, "")      // Remove headers
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Convert links to text
      .replace(/[>|~_]/g, "")         // Remove markdown chars
      .replace(/\n{3,}/g, "\n\n")     // Consolidate newlines
      .trim();
  }

  private isRateLimited(err: unknown): boolean {
    return err instanceof Error && err.message.includes("429");
  }

  private getRetryAfter(err: unknown): number {
    // Try to extract retry_after from error, default to 5 seconds
    const match = String(err).match(/retry.after[:\s]+(\d+)/i);
    return match ? parseInt(match[1]) : 5;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
