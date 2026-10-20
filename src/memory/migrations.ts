// src/memory/migrations.ts
//
// Migrações de esquema versionadas.
//
// Antes disso o esquema evoluía com uma pilha de `try { ALTER TABLE ... } catch {}`
// no boot: sem ordem, sem registro do que já rodou e engolindo qualquer erro
// (inclusive os que não eram "coluna já existe"). Agora cada mudança tem número,
// nome e roda uma única vez, dentro de uma transação.
//
// A versão aplicada vive no `user_version` do próprio SQLite — não precisa de
// tabela extra nem de arquivo de estado.
import type Database from "better-sqlite3";
import { logger } from "../utils/logger";

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Uma coluna existe nesta tabela? */
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as { name: string }[];
  return rows.some((r) => r.name === column);
}

/**
 * Adiciona a coluna só se ela ainda não existir.
 *
 * Checa `pragma_table_info` em vez de capturar o erro do ALTER: assim um erro
 * real (disco cheio, tabela corrompida) sobe em vez de virar "já existe".
 */
function addColumn(db: Database.Database, table: string, column: string, definition: string): void {
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  logger.info("Migration added column", { table, column });
}

// ── Migrações ────────────────────────────────────────────────────────────────

/**
 * v1 — esquema base.
 *
 * Reproduz o estado que os bancos existentes já alcançaram via ALTER TABLE
 * ad-hoc. É idempotente de propósito: bancos de produção estão em
 * `user_version = 0` e precisam atravessar esta migração sem perder dados.
 */
const baseline: Migration = {
  version: 1,
  name: "baseline-schema",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        provider   TEXT NOT NULL DEFAULT 'openai',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        title      TEXT NOT NULL DEFAULT 'Nova Conversa'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role            TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
        content         TEXT NOT NULL,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS routine_runs (
        id           TEXT PRIMARY KEY,
        task_id      TEXT NOT NULL,
        agent_id     TEXT NOT NULL,
        trigger      TEXT NOT NULL DEFAULT 'schedule',
        status       TEXT NOT NULL DEFAULT 'running',
        steps        INTEGER NOT NULL DEFAULT 0,
        duration_ms  INTEGER NOT NULL DEFAULT 0,
        output       TEXT NOT NULL DEFAULT '',
        error        TEXT,
        started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
        finished_at  INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_routine_runs_task ON routine_runs(task_id, started_at);

      CREATE TABLE IF NOT EXISTS agents (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        role          TEXT NOT NULL,
        avatar        TEXT NOT NULL,
        description   TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        tools         TEXT NOT NULL DEFAULT '[]',
        is_builtin    INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS company_profile (
        id              TEXT PRIMARY KEY DEFAULT 'default',
        company_name    TEXT NOT NULL DEFAULT 'Minha Empresa',
        niche           TEXT NOT NULL DEFAULT 'Tecnologia & B2B SaaS',
        target_audience TEXT NOT NULL DEFAULT 'Empreendedores e Líderes de Negócios',
        tone_of_voice   TEXT NOT NULL DEFAULT 'Profissional, direto, persuasivo e fundamentado em dados',
        value_prop      TEXT NOT NULL DEFAULT 'Automação inteligente e crescimento com IA',
        guidelines      TEXT NOT NULL DEFAULT 'Nunca prometa resultados irreais. Entregue materiais prontos para publicação.',
        updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS deliverables (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT,
        agent_id        TEXT NOT NULL,
        title           TEXT NOT NULL,
        type            TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending_approval',
        summary         TEXT NOT NULL DEFAULT '',
        content_json    TEXT NOT NULL,
        review_notes    TEXT,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_deliverables_status ON deliverables(status, created_at);

      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id              TEXT PRIMARY KEY,
        agent_id        TEXT NOT NULL,
        title           TEXT NOT NULL,
        frequency       TEXT NOT NULL DEFAULT 'daily',
        prompt          TEXT NOT NULL,
        is_enabled      INTEGER NOT NULL DEFAULT 1,
        last_run_at     INTEGER,
        next_run_at     INTEGER,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS integrations (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        category         TEXT NOT NULL,
        icon             TEXT NOT NULL,
        description      TEXT NOT NULL,
        is_connected     INTEGER NOT NULL DEFAULT 0,
        credentials_json TEXT NOT NULL DEFAULT '{}',
        updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon        TEXT NOT NULL DEFAULT 'briefcase',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    // Colunas adicionadas ao esquema original, na ordem em que foram surgindo.
    addColumn(db, "conversations", "title", "TEXT NOT NULL DEFAULT 'Nova Conversa'");
    addColumn(db, "conversations", "agent_id", "TEXT NOT NULL DEFAULT 'coo'");
    addColumn(db, "conversations", "project_id", "TEXT");
    addColumn(db, "scheduled_tasks", "project_id", "TEXT");
    addColumn(db, "deliverables", "project_id", "TEXT");
    addColumn(db, "messages", "metadata_json", "TEXT");
  },
};

export const MIGRATIONS: Migration[] = [baseline];

// ── Runner ───────────────────────────────────────────────────────────────────

/** Versão mais alta conhecida por este build. */
export function latestVersion(): number {
  return MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
}

/**
 * Aplica as migrações pendentes, em ordem, cada uma em sua própria transação.
 *
 * Se uma falhar, as anteriores ficam aplicadas e o `user_version` reflete isso —
 * a próxima execução retoma de onde parou, em vez de reaplicar tudo.
 */
export function runMigrations(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  const latest = latestVersion();

  if (current > latest) {
    // Banco escrito por uma versão mais nova do app: aplicar migrações antigas
    // sobre um esquema futuro corromperia dados. Melhor recusar o boot.
    throw new Error(
      `Database schema version ${current} is newer than this build supports (${latest}). ` +
        `Upgrade the application or restore a matching database backup.`
    );
  }

  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    logger.info("Database schema up to date", { version: current });
    return;
  }

  for (const migration of pending) {
    logger.info("Applying migration", { version: migration.version, name: migration.name });
    const apply = db.transaction(() => {
      migration.up(db);
      // `user_version` aceita só literal — daí a interpolação. O valor vem de
      // uma constante do próprio código, não de entrada externa.
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
    logger.info("Migration applied", { version: migration.version, name: migration.name });
  }

  logger.info("Database schema migrated", { from: current, to: latest });
}
