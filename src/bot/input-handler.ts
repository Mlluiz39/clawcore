// src/bot/input-handler.ts
import { Context } from "grammy";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";
import { config } from "../utils/config";

const TMP_DIR = path.resolve(process.cwd(), "tmp");

export interface ProcessedInput {
  text: string;
  requiresAudioReply: boolean;
}

/**
 * TelegramInputHandler — processes raw Telegram events into clean text.
 * Handles: text, documents (PDF/MD), voice, and audio messages.
 */
export class TelegramInputHandler {

  constructor() {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  }

  /** Process a plain text message */
  processText(text: string): ProcessedInput {
    // Strip null bytes for SQLite safety
    const cleaned = text.replace(/\u0000/g, "").trim();

    // Check for explicit audio request keywords
    const audioKeywords = /responda?\s+em\s+[aá]udio|fale\s+comigo|em\s+voz/i;
    const requiresAudioReply = audioKeywords.test(cleaned);

    return { text: cleaned, requiresAudioReply };
  }

  /** Process a document attachment (PDF or MD) */
  async processDocument(ctx: Context): Promise<ProcessedInput> {
    const doc = ctx.message?.document;
    if (!doc) throw new Error("No document in message");

    const fileName = doc.file_name ?? "unknown";
    const mimeType = doc.mime_type ?? "";
    const caption = ctx.message?.caption ?? "";

    // Check supported types
    const isPdf = mimeType === "application/pdf" || fileName.endsWith(".pdf");
    const isMd = fileName.endsWith(".md");

    if (!isPdf && !isMd) {
      return {
        text: "⚠️ No momento, só consigo processar texto estruturado (.md), áudio e PDF.",
        requiresAudioReply: false,
      };
    }

    let tmpPath = "";
    try {
      // Download file
      const file = await ctx.getFile();
      tmpPath = path.join(TMP_DIR, `${Date.now()}_${fileName}`);

      // Get download URL and fetch
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(tmpPath, buffer);

      let extractedText = "";

      if (isPdf) {
        // Dynamic import for pdf-parse
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } else if (isMd) {
        extractedText = fs.readFileSync(tmpPath, "utf-8");
      }

      if (!extractedText.trim()) {
        return { text: "⚠️ Arquivo vazio ou sem texto extraível.", requiresAudioReply: false };
      }

      // Combine with caption
      const finalText = caption
        ? `${caption}\n\n--- Conteúdo do arquivo ${fileName} ---\n${extractedText}`
        : `Conteúdo do arquivo ${fileName}:\n\n${extractedText}`;

      logger.info("Document processed", { fileName, chars: extractedText.length });
      return { text: finalText, requiresAudioReply: false };
    } catch (err) {
      logger.error("Document processing failed", { fileName, error: String(err) });
      return {
        text: `⚠️ Falha ao processar o documento "${fileName}": ${String(err)}`,
        requiresAudioReply: false,
      };
    } finally {
      // Cleanup temp file
      if (tmpPath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }
  }

  /** Process a voice or audio message via Whisper API */
  async processVoice(ctx: Context): Promise<ProcessedInput> {
    const voice = ctx.message?.voice ?? ctx.message?.audio;
    if (!voice) throw new Error("No voice/audio in message");

    let tmpPath = "";
    try {
      const file = await ctx.getFile();
      const ext = voice.mime_type?.includes("ogg") ? ".ogg" : ".mp3";
      tmpPath = path.join(TMP_DIR, `${Date.now()}_voice${ext}`);

      // Download audio file
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(tmpPath, buffer);

      // Transcribe via Groq Whisper API
      const transcript = await this.transcribeWithWhisperAPI(tmpPath);

      if (!transcript.trim()) {
        return {
          text: "⚠️ Áudio vazio captado. Pode reenviar?",
          requiresAudioReply: false,
        };
      }

      logger.info("Voice transcribed", { chars: transcript.length });

      return {
        text: transcript,
        requiresAudioReply: true, // Voice input defaults to audio reply
      };
    } catch (err) {
      logger.error("Voice processing failed", { error: String(err) });
      return {
        text: `⚠️ Falha ao processar o áudio: ${String(err)}`,
        requiresAudioReply: false,
      };
    } finally {
      // Cleanup temp file
      if (tmpPath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Transcribe audio file using Groq Whisper API (OpenAI-compatible).
   * Uses whisper-large-v3-turbo model for fast, accurate transcription.
   */
  private async transcribeWithWhisperAPI(filePath: string): Promise<string> {
    const apiKey = config.providers.groq.apiKey;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY não configurada. Necessária para transcrição de áudio.");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    logger.debug("Transcribing with Groq Whisper API", { file: path.basename(filePath) });

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3-turbo",
      language: "pt",
      response_format: "text",
    });

    // The response is the transcribed text directly
    const text = typeof transcription === "string"
      ? transcription
      : (transcription as { text: string }).text;

    logger.info("Whisper API transcription complete", { chars: text.length });
    return text.trim();
  }
}
