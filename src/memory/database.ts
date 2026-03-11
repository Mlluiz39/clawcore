// src/memory/database.ts
import Database from "better-sqlite3";
import path from "path";
import { logger } from "../utils/logger";

const DB_PATH = path.resolve(process.cwd(), "data", "clawcore.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      provider   TEXT NOT NULL DEFAULT 'cerebras',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      title      TEXT NOT NULL DEFAULT 'Nova Conversa'
    );

    -- Migration: Add title column if it doesn't exist (for existing DBs)
    BEGIN;
    SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'title';
    -- This is a bit tricky with raw SQLite in this context, 
    -- but usually we can check table_info. 
    -- For simplicity in this script, we'll try to add it and ignore error if it exists.
    -- Or more robustly:
    COMMIT;
  `);

  try {
    _db.exec("ALTER TABLE conversations ADD COLUMN title TEXT NOT NULL DEFAULT 'Nova Conversa'");
  } catch (e) {
    // Column already exists or other error we can ignore if it's just 'duplicate column'
  }

  _db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role            TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content         TEXT NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
  `);

  logger.info("Database initialized", { path: DB_PATH });
  return _db;
}
