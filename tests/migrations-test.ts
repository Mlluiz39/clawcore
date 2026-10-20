// tests/migrations-test.ts
//
// O caso que importa: bancos de produção estão em `user_version = 0` e já têm
// todas as colunas (foram criadas pelos ALTER TABLE ad-hoc do boot antigo).
// Atravessar a baseline não pode perder dado nem recriar o que existe.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { runMigrations, latestVersion } from "../src/memory/migrations";

function tmpDb(name: string): { db: Database.Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), `clawcore-mig-${name}-`));
  return { db: new Database(join(dir, "t.db")), dir };
}

// ── 1. Banco novo: aplica tudo e chega na última versão ──────────────────────
{
  const { db, dir } = tmpDb("fresh");
  assert.equal(db.pragma("user_version", { simple: true }), 0);

  runMigrations(db);

  assert.equal(db.pragma("user_version", { simple: true }), latestVersion());
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map((r) => r.name);
  for (const t of ["conversations", "messages", "agents", "deliverables", "projects", "scheduled_tasks", "integrations", "routine_runs", "company_profile"]) {
    assert(tables.includes(t), `tabela ${t} ausente`);
  }

  // Rodar de novo é no-op (idempotente).
  runMigrations(db);
  assert.equal(db.pragma("user_version", { simple: true }), latestVersion());
  db.close();
  rmSync(dir, { recursive: true, force: true });
}

// ── 2. Banco "legado": esquema antigo, user_version = 0, com dados ───────────
{
  const { db, dir } = tmpDb("legacy");

  // Reproduz o esquema como ele existia ANTES das colunas adicionadas depois.
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'openai',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  db.prepare("INSERT INTO conversations (id, user_id, provider, created_at) VALUES (?,?,?,?)")
    .run("c1", "owner", "openai", 1000);
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)")
    .run("m1", "c1", "user", "mensagem antiga", 1001);

  runMigrations(db);

  // Dados preservados.
  const conv = db.prepare("SELECT * FROM conversations WHERE id='c1'").get() as Record<string, unknown>;
  assert.equal(conv.user_id, "owner");
  assert.equal(conv.title, "Nova Conversa", "coluna title não recebeu o default");
  assert.equal(conv.agent_id, "coo", "coluna agent_id não recebeu o default");

  const msg = db.prepare("SELECT * FROM messages WHERE id='m1'").get() as Record<string, unknown>;
  assert.equal(msg.content, "mensagem antiga");
  assert.equal(msg.metadata_json, null);

  // Tabelas novas criadas.
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map((r) => r.name);
  assert(tables.includes("agents"), "tabela agents não foi criada no banco legado");
  assert(tables.includes("projects"), "tabela projects não foi criada no banco legado");

  db.close();
  rmSync(dir, { recursive: true, force: true });
}

// ── 3. Banco já migrado: não reaplica nem mexe nos dados ─────────────────────
{
  const { db, dir } = tmpDb("done");
  runMigrations(db);
  db.prepare("INSERT INTO projects (id, name, description, icon) VALUES (?,?,?,?)")
    .run("p1", "Projeto", "desc", "briefcase");

  runMigrations(db); // segunda passada

  const count = db.prepare("SELECT count(*) c FROM projects").get() as { c: number };
  assert.equal(count.c, 1, "migração duplicou dados");
  db.close();
  rmSync(dir, { recursive: true, force: true });
}

// ── 4. Banco de uma versão FUTURA: recusa em vez de corromper ────────────────
{
  const { db, dir } = tmpDb("future");
  runMigrations(db);
  db.pragma(`user_version = ${latestVersion() + 5}`);

  assert.throws(
    () => runMigrations(db),
    /newer than this build supports/,
    "deveria recusar um banco de versão futura"
  );

  db.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log("✅ Migrações verificadas: banco novo, legado com dados, reexecução e versão futura.");
