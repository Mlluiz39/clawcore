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
  metadata_json?: string | null;
}

/** Atribuição de uma mensagem publicada por rotina no thread do agente. */
export interface MessageMetadata {
  source: "routine";
  routine_id: string;
  routine_title: string;
  frequency: ScheduledTask["frequency"];
  trigger: RoutineRun["trigger"];
  duration_ms: number;
  steps: number;
}

export interface RoutineRun {
  id: string;
  task_id: string;
  agent_id: string;
  trigger: "schedule" | "manual";
  status: "running" | "success" | "error";
  steps: number;
  duration_ms: number;
  output: string;
  error?: string | null;
  started_at: number;
  finished_at?: number | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  agent_id?: string;
  project_id?: string | null;
  provider: string;
  created_at: number;
  title: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  created_at: number;
  updated_at: number;
}

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  system_prompt: string;
  tools: string;
  is_builtin: number;
  created_at: number;
}

export interface CompanyProfile {
  id: string;
  company_name: string;
  niche: string;
  target_audience: string;
  tone_of_voice: string;
  value_prop: string;
  guidelines: string;
  updated_at: number;
}

export interface Deliverable {
  id: string;
  conversation_id?: string | null;
  agent_id: string;
  project_id?: string | null;
  title: string;
  type: "social_pack" | "ad_campaign" | "landing_page_copy" | "research_brief" | "email_sequence" | "prospect_list" | "custom";
  status: "pending_approval" | "approved" | "rejected" | "published";
  summary: string;
  content_json: string;
  review_notes?: string | null;
  created_at: number;
  updated_at: number;
}

export interface ScheduledTask {
  id: string;
  agent_id: string;
  project_id?: string | null;
  title: string;
  frequency: "hourly" | "daily" | "weekly";
  prompt: string;
  is_enabled: number;
  last_run_at?: number | null;
  next_run_at?: number | null;
  created_at: number;
}

// ── Projects ─────────────────────────────────────────────────────────────
export function getAllProjects(): Project[] {
  const db = getDb();
  return db.prepare("SELECT * FROM projects ORDER BY created_at ASC").all() as Project[];
}

export function getProjectById(id: string): Project | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined) ?? null;
}

export function createProject(data: {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
}): Project {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const project: Project = {
    id: data.id || randomUUID(),
    name: data.name,
    description: data.description || "",
    icon: data.icon || "briefcase",
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO projects (id, name, description, icon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.name,
    project.description,
    project.icon,
    project.created_at,
    project.updated_at
  );

  return project;
}

export function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "description" | "icon">>
): Project | null {
  const db = getDb();
  const current = getProjectById(id);
  if (!current) return null;
  const now = Math.floor(Date.now() / 1000);
  const updated: Project = {
    ...current,
    ...data,
    updated_at: now,
  };
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, icon = ?, updated_at = ? WHERE id = ?
  `).run(updated.name, updated.description, updated.icon, updated.updated_at, id);
  return updated;
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return res.changes > 0;
}

// ── Conversations ────────────────────────────────────────────────────────
export function getOrCreateConversation(userId: string, agentId: string = "coo", projectId?: string): Conversation {
  const db = getDb();

  let query = "SELECT * FROM conversations WHERE user_id = ? AND agent_id = ?";
  const params: unknown[] = [userId, agentId];
  if (projectId) {
    query += " AND project_id = ?";
    params.push(projectId);
  }
  query += " ORDER BY created_at DESC LIMIT 1";

  const existing = db.prepare(query).get(...params) as Conversation | undefined;

  if (existing) return existing;

  return createNewConversation(userId, agentId, projectId);
}

export function getConversationById(id: string, userId: string, agentId: string): Conversation | null {
  return (getDb().prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ? AND agent_id = ?")
    .get(id, userId, agentId) as Conversation | undefined) ?? null;
}

export function createNewConversation(userId: string, agentId: string = "coo", projectId?: string): Conversation {
  const db = getDb();
  const conv: Conversation = {
    id: randomUUID(),
    user_id: userId,
    agent_id: agentId,
    project_id: projectId || null,
    provider: "openai",
    created_at: Math.floor(Date.now() / 1000),
    title: "Nova Conversa",
  };

  db.prepare(
    "INSERT INTO conversations (id, user_id, agent_id, project_id, provider, created_at, title) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(conv.id, conv.user_id, conv.agent_id, conv.project_id, conv.provider, conv.created_at, conv.title);

  return conv;
}

export function updateConversationTitle(conversationId: string, title: string): void {
  const db = getDb();
  db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, conversationId);
}

export function getAllConversations(userId: string, agentId?: string, projectId?: string): Conversation[] {
  const db = getDb();
  let query = "SELECT * FROM conversations WHERE user_id = ?";
  const params: unknown[] = [userId];
  if (agentId) {
    query += " AND agent_id = ?";
    params.push(agentId);
  }
  if (projectId) {
    query += " AND project_id = ?";
    params.push(projectId);
  }
  query += " ORDER BY created_at DESC";
  return db.prepare(query).all(...params) as Conversation[];
}

export function deleteConversation(conversationId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
}

export function getConversationMessages(conversationId: string): Message[] {
  const db = getDb();
  // rowid desempata mensagens gravadas no mesmo segundo, preservando a ordem real.
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(conversationId) as Message[];
}

export function saveMessage(
  conversationId: string,
  role: Message["role"],
  content: string,
  metadata?: MessageMetadata
): Message {
  const db = getDb();
  const msg: Message = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    created_at: Math.floor(Date.now() / 1000),
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  };

  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(msg.id, msg.conversation_id, msg.role, msg.content, msg.created_at, msg.metadata_json ?? null);

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
}

// ── Agents ───────────────────────────────────────────────────────────────
export function getAllAgents(): AgentRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM agents ORDER BY is_builtin DESC, created_at ASC").all() as AgentRecord[];
}

/**
 * Remove de agentes nativos ferramentas declaradas que não existem no registro.
 *
 * A lista `agents.tools` é exibida na interface e não filtra a execução: uma
 * ferramenta inexistente vira promessa falsa ao usuário. Agentes criados pelo
 * usuário não são alterados — são apenas reportados.
 */
export function pruneUnknownBuiltinTools(knownToolNames: string[]): {
  updated: Array<{ id: string; removed: string[] }>;
  unknown: Array<{ id: string; tool: string }>;
} {
  const db = getDb();
  const known = new Set(knownToolNames);
  const updated: Array<{ id: string; removed: string[] }> = [];
  const unknown: Array<{ id: string; tool: string }> = [];

  for (const agent of getAllAgents()) {
    let declared: unknown;
    try {
      declared = JSON.parse(agent.tools || "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(declared)) continue;

    const missing = declared.filter((tool): tool is string => typeof tool === "string" && !known.has(tool));
    if (missing.length === 0) continue;

    if (!agent.is_builtin) {
      unknown.push(...missing.map((tool) => ({ id: agent.id, tool })));
      continue;
    }

    const kept = declared.filter((tool) => typeof tool === "string" && known.has(tool));
    db.prepare("UPDATE agents SET tools = ? WHERE id = ?").run(JSON.stringify(kept), agent.id);
    updated.push({ id: agent.id, removed: missing });
  }

  return { updated, unknown };
}

export function getAgentById(id: string): AgentRecord | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRecord | undefined;
}

export function createCustomAgent(data: {
  name: string;
  role: string;
  /** Default "bot" quando omitido. */
  avatar?: string;
  description: string;
  system_prompt: string;
  tools?: string[];
}): AgentRecord {
  const db = getDb();
  const agent: AgentRecord = {
    id: "agent_" + randomUUID().substring(0, 8),
    name: data.name,
    role: data.role,
    avatar: data.avatar || "bot",
    description: data.description,
    system_prompt: data.system_prompt,
    tools: JSON.stringify(data.tools || ["create_deliverable", "company_brain", "web_search"]),
    is_builtin: 0,
    created_at: Math.floor(Date.now() / 1000),
  };

  db.prepare(`
    INSERT INTO agents (id, name, role, avatar, description, system_prompt, tools, is_builtin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agent.id,
    agent.name,
    agent.role,
    agent.avatar,
    agent.description,
    agent.system_prompt,
    agent.tools,
    agent.is_builtin,
    agent.created_at
  );

  return agent;
}

export function deleteCustomAgent(id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM agents WHERE id = ? AND is_builtin = 0").run(id);
  return res.changes > 0;
}

// ── Company Profile ──────────────────────────────────────────────────────
export function getCompanyProfile(): CompanyProfile {
  const db = getDb();
  const profile = db.prepare("SELECT * FROM company_profile WHERE id = 'default'").get() as CompanyProfile | undefined;
  if (profile) return profile;

  return {
    id: "default",
    company_name: "Minha Empresa",
    niche: "Tecnologia & B2B SaaS",
    target_audience: "Empreendedores e Líderes",
    tone_of_voice: "Profissional, direto e inovador",
    value_prop: "Agência autônoma completa com IA",
    guidelines: "Entregar sempre materiais estruturados.",
    updated_at: Math.floor(Date.now() / 1000),
  };
}

export function updateCompanyProfile(data: Partial<Omit<CompanyProfile, "id" | "updated_at">>): CompanyProfile {
  const db = getDb();
  const current = getCompanyProfile();
  const updated: CompanyProfile = {
    ...current,
    ...data,
    updated_at: Math.floor(Date.now() / 1000),
  };

  db.prepare(`
    UPDATE company_profile
    SET company_name = ?, niche = ?, target_audience = ?, tone_of_voice = ?, value_prop = ?, guidelines = ?, updated_at = ?
    WHERE id = 'default'
  `).run(
    updated.company_name,
    updated.niche,
    updated.target_audience,
    updated.tone_of_voice,
    updated.value_prop,
    updated.guidelines,
    updated.updated_at
  );

  return updated;
}

// ── Deliverables ─────────────────────────────────────────────────────────
export function getAllDeliverables(status?: string, projectId?: string): Deliverable[] {
  const db = getDb();
  let query = "SELECT * FROM deliverables WHERE 1=1";
  const params: unknown[] = [];
  if (status && status !== "all") {
    query += " AND status = ?";
    params.push(status);
  }
  if (projectId) {
    query += " AND project_id = ?";
    params.push(projectId);
  }
  query += " ORDER BY created_at DESC";
  return db.prepare(query).all(...params) as Deliverable[];
}

export function getPendingDeliverables(): Deliverable[] {
  return getAllDeliverables("pending_approval");
}

export function getDeliverableById(id: string): Deliverable | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM deliverables WHERE id = ?").get(id) as Deliverable | undefined;
}

export function createDeliverable(data: {
  conversation_id?: string | null;
  agent_id: string;
  project_id?: string | null;
  title: string;
  type: Deliverable["type"];
  summary: string;
  /** Payload estruturado gerado pelo LLM — validado por quem consome. */
  content: unknown;
  status?: Deliverable["status"];
}): Deliverable {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const deliverable: Deliverable = {
    id: "deliv_" + randomUUID().substring(0, 8),
    conversation_id: data.conversation_id || null,
    agent_id: data.agent_id,
    project_id: data.project_id || null,
    title: data.title,
    type: data.type,
    status: data.status || "pending_approval",
    summary: data.summary,
    content_json: typeof data.content === "string" ? data.content : JSON.stringify(data.content),
    review_notes: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO deliverables (id, conversation_id, agent_id, project_id, title, type, status, summary, content_json, review_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deliverable.id,
    deliverable.conversation_id,
    deliverable.agent_id,
    deliverable.project_id,
    deliverable.title,
    deliverable.type,
    deliverable.status,
    deliverable.summary,
    deliverable.content_json,
    deliverable.review_notes,
    deliverable.created_at,
    deliverable.updated_at
  );

  return deliverable;
}

export function updateDeliverableStatus(
  id: string,
  status: Deliverable["status"],
  review_notes?: string
): Deliverable | null {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE deliverables
    SET status = ?, review_notes = COALESCE(?, review_notes), updated_at = ?
    WHERE id = ?
  `).run(status, review_notes || null, now, id);

  return getDeliverableById(id) || null;
}

export function deleteDeliverable(id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM deliverables WHERE id = ?").run(id);
  return res.changes > 0;
}

// ── Scheduled Tasks ──────────────────────────────────────────────────────
export function getAllScheduledTasks(projectId?: string): ScheduledTask[] {
  const db = getDb();
  if (projectId) {
    return db
      .prepare("SELECT * FROM scheduled_tasks WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as ScheduledTask[];
  }
  return db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC").all() as ScheduledTask[];
}

export function createScheduledTask(data: {
  agent_id: string;
  project_id?: string | null;
  title: string;
  frequency: ScheduledTask["frequency"];
  prompt: string;
}): ScheduledTask {
  const db = getDb();
  if (!getAgentById(data.agent_id)) throw new Error("Agente não encontrado.");
  if (typeof data.title !== "string" || !data.title.trim() || typeof data.prompt !== "string" || !data.prompt.trim()) {
    throw new Error("Título e instrução são obrigatórios.");
  }
  getFrequencySeconds(data.frequency);
  const now = Math.floor(Date.now() / 1000);
  const task: ScheduledTask = {
    id: "task_" + randomUUID().substring(0, 8),
    agent_id: data.agent_id,
    project_id: data.project_id || null,
    title: data.title,
    frequency: data.frequency,
    prompt: data.prompt,
    is_enabled: 1,
    last_run_at: null,
    next_run_at: now + getFrequencySeconds(data.frequency),
    created_at: now,
  };

  db.prepare(`
    INSERT INTO scheduled_tasks (id, agent_id, project_id, title, frequency, prompt, is_enabled, last_run_at, next_run_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.agent_id,
    task.project_id,
    task.title,
    task.frequency,
    task.prompt,
    task.is_enabled,
    task.last_run_at,
    task.next_run_at,
    task.created_at
  );

  return task;
}

export function updateScheduledTask(
  id: string,
  data: Partial<Pick<ScheduledTask, "title" | "frequency" | "prompt" | "is_enabled">>
): ScheduledTask | null {
  const db = getDb();
  const task = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id) as ScheduledTask | undefined;
  if (!task) return null;

  if (data.title !== undefined && (typeof data.title !== "string" || !data.title.trim())) throw new Error("Título inválido.");
  if (data.prompt !== undefined && (typeof data.prompt !== "string" || !data.prompt.trim())) throw new Error("Instrução inválida.");
  if (data.is_enabled !== undefined && data.is_enabled !== 0 && data.is_enabled !== 1) throw new Error("Estado inválido.");
  if (data.frequency !== undefined) getFrequencySeconds(data.frequency);
  const updated: ScheduledTask = {
    ...task,
    title: data.title ?? task.title,
    frequency: data.frequency ?? task.frequency,
    prompt: data.prompt ?? task.prompt,
    is_enabled: data.is_enabled ?? task.is_enabled,
  };
  if (updated.frequency !== task.frequency) updated.next_run_at = Math.floor(Date.now() / 1000) + getFrequencySeconds(updated.frequency);
  db.prepare(`
    UPDATE scheduled_tasks
    SET title = ?, frequency = ?, prompt = ?, is_enabled = ?, next_run_at = ?
    WHERE id = ?
  `).run(updated.title, updated.frequency, updated.prompt, updated.is_enabled, updated.next_run_at, id);

  return updated;
}

export function deleteScheduledTask(id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
  return res.changes > 0;
}

export function updateTaskRun(id: string, lastRunAt: number, frequency: ScheduledTask["frequency"]): void {
  const db = getDb();
  const nextRun = lastRunAt + getFrequencySeconds(frequency);
  db.prepare("UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ? WHERE id = ?").run(
    lastRunAt,
    nextRun,
    id
  );
}

// ── Routine Runs (histórico de execução) ─────────────────────────────────

export function startRoutineRun(data: {
  task_id: string;
  agent_id: string;
  trigger: RoutineRun["trigger"];
}): RoutineRun {
  const db = getDb();
  const run: RoutineRun = {
    id: "run_" + randomUUID().substring(0, 8),
    task_id: data.task_id,
    agent_id: data.agent_id,
    trigger: data.trigger,
    status: "running",
    steps: 0,
    duration_ms: 0,
    output: "",
    started_at: Math.floor(Date.now() / 1000),
  };

  db.prepare(`
    INSERT INTO routine_runs (id, task_id, agent_id, trigger, status, steps, duration_ms, output, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, run.task_id, run.agent_id, run.trigger, run.status, run.steps, run.duration_ms, run.output, run.started_at);

  return run;
}

export function finishRoutineRun(
  id: string,
  result: { status: Exclude<RoutineRun["status"], "running">; steps?: number; duration_ms?: number; output?: string; error?: string }
): RoutineRun | null {
  const db = getDb();
  const run = db.prepare("SELECT * FROM routine_runs WHERE id = ?").get(id) as RoutineRun | undefined;
  if (!run) return null;

  db.prepare(`
    UPDATE routine_runs
    SET status = ?, steps = ?, duration_ms = ?, output = ?, error = ?, finished_at = ?
    WHERE id = ?
  `).run(
    result.status,
    result.steps ?? run.steps,
    result.duration_ms ?? run.duration_ms,
    result.output ?? run.output,
    result.error ?? null,
    Math.floor(Date.now() / 1000),
    id
  );

  return db.prepare("SELECT * FROM routine_runs WHERE id = ?").get(id) as RoutineRun;
}

export function getRoutineRuns(taskId: string, limit: number = 20): RoutineRun[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM routine_runs WHERE task_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?")
    .all(taskId, Math.max(1, Math.min(200, limit))) as RoutineRun[];
}

function getFrequencySeconds(freq: ScheduledTask["frequency"]): number {
  switch (freq) {
    case "hourly":
      return 3600;
    case "daily":
      return 86400;
    case "weekly":
      return 604800;
    default:
      throw new Error("Frequência inválida: use hourly, daily ou weekly.");
  }
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
  const delivs = db
    .prepare("SELECT COUNT(*) as total FROM deliverables")
    .get() as { total: number };
  const pending = db
    .prepare("SELECT COUNT(*) as total FROM deliverables WHERE status = 'pending_approval'")
    .get() as { total: number };

  return {
    conversations: conv.total,
    messages: msgs.total,
    deliverables: delivs.total,
    pendingApprovals: pending.total,
  };
}

// ── Integrations (SureThing App Ecosystem) ───────────────────────────────────

export interface IntegrationRecord {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  is_connected: number;
  credentials_json: string;
  updated_at: number;
}

export function getAllIntegrations(category?: string): IntegrationRecord[] {
  const db = getDb();
  if (category && category !== "all") {
    return db
      .prepare("SELECT * FROM integrations WHERE category = ? ORDER BY is_connected DESC, name ASC")
      .all(category) as IntegrationRecord[];
  }
  return db
    .prepare("SELECT * FROM integrations ORDER BY is_connected DESC, name ASC")
    .all() as IntegrationRecord[];
}

export function getIntegrationById(id: string): IntegrationRecord | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM integrations WHERE id = ?").get(id) as IntegrationRecord | undefined;
}

export function updateIntegration(
  id: string,
  data: { is_connected?: number; credentials_json?: string }
): IntegrationRecord | undefined {
  const db = getDb();
  const existing = getIntegrationById(id);
  if (!existing) return undefined;

  const isConnected = data.is_connected !== undefined ? data.is_connected : existing.is_connected;
  const creds = data.credentials_json !== undefined ? data.credentials_json : existing.credentials_json;

  db.prepare(`
    UPDATE integrations
    SET is_connected = ?, credentials_json = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(isConnected, creds, id);

  return getIntegrationById(id);
}
