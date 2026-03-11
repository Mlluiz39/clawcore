// src/memory/repository.ts
import { randomUUID } from "crypto";
import { getDb } from "./database";
import { config } from "../utils/config";

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  provider: string;
  created_at: number;
  title: string;
}

export function getOrCreateConversation(userId: string): Conversation {
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId) as Conversation | undefined;

  if (existing) return existing;

  return createNewConversation(userId);
}

export function createNewConversation(userId: string): Conversation {
  const db = getDb();
  const conv: Conversation = {
    id: randomUUID(),
    user_id: userId,
    provider: config.providers.primary,
    created_at: Math.floor(Date.now() / 1000),
    title: "Nova Conversa",
  };

  db.prepare(
    "INSERT INTO conversations (id, user_id, provider, created_at, title) VALUES (?, ?, ?, ?, ?)"
  ).run(conv.id, conv.user_id, conv.provider, conv.created_at, conv.title);

  return conv;
}

export function updateConversationTitle(conversationId: string, title: string): void {
  const db = getDb();
  db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, conversationId);
}

export function getAllConversations(userId: string): Conversation[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as Conversation[];
}

export function deleteConversation(conversationId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
}

export function getConversationMessages(conversationId: string): Message[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    )
    .all(conversationId) as Message[];
}

export function saveMessage(
  conversationId: string,
  role: Message["role"],
  content: string
): Message {
  const db = getDb();
  const msg: Message = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    created_at: Math.floor(Date.now() / 1000),
  };

  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(msg.id, msg.conversation_id, msg.role, msg.content, msg.created_at);

  return msg;
}

export function getRecentMessages(
  conversationId: string,
  limit: number = config.agent.maxContextMessages
): Message[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(conversationId, limit) as Message[];
  // reverse so oldest first (correct LLM order)
}

export function getStats(userId: string) {
  const db = getDb();
  const conv = db
    .prepare("SELECT COUNT(*) as total FROM conversations WHERE user_id = ?")
    .get(userId) as { total: number };
  const msgs = db
    .prepare(
      `SELECT COUNT(*) as total FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ?`
    )
    .get(userId) as { total: number };

  return { conversations: conv.total, messages: msgs.total };
}
