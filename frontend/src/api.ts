// frontend/src/api.ts
import type { Agent, CompanyProfile, Deliverable, ScheduledTask, SystemStats, Conversation, Message, Integration, RoutineRun, Project } from "./types";

const API_BASE = "/api";

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("token");
      window.dispatchEvent(new Event("auth-changed"));
    }
    throw new Error(data.error || "Erro na requisição");
  }

  return data;
}

// ── Auth ──
export async function login(password: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

// ── Agents ──
export async function getAgents(): Promise<{ agents: Agent[] }> {
  return apiFetch<{ agents: Agent[] }>("/agents");
}

export async function createAgent(data: Partial<Agent>): Promise<{ agent: Agent }> {
  return apiFetch<{ agent: Agent }>("/agents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteAgent(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/agents/${id}`, {
    method: "DELETE",
  });
}

// ── Company Profile ──
export async function getCompanyProfile(): Promise<{ profile: CompanyProfile }> {
  return apiFetch<{ profile: CompanyProfile }>("/company-profile");
}

export async function updateCompanyProfile(data: Partial<CompanyProfile>): Promise<{ profile: CompanyProfile }> {
  return apiFetch<{ profile: CompanyProfile }>("/company-profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Projects ──
export async function getProjects(): Promise<{ projects: Project[] }> {
  return apiFetch<{ projects: Project[] }>("/projects");
}

export async function getProject(id: string): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>(`/projects/${id}`);
}

export async function createProject(data: Partial<Project>): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/projects/${id}`, {
    method: "DELETE",
  });
}

// ── Deliverables ──
export async function getDeliverables(status?: string, projectId?: string): Promise<{ deliverables: Deliverable[] }> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (projectId) params.set("projectId", projectId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ deliverables: Deliverable[] }>(`/deliverables${q}`);
}

export async function approveDeliverable(id: string, publishNow: boolean = false): Promise<{ deliverable: Deliverable }> {
  return apiFetch<{ deliverable: Deliverable }>(`/deliverables/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ publishNow }),
  });
}

export async function rejectDeliverable(id: string, notes?: string): Promise<{ deliverable: Deliverable }> {
  return apiFetch<{ deliverable: Deliverable }>(`/deliverables/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ review_notes: notes }),
  });
}

export async function deleteDeliverable(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/deliverables/${id}`, {
    method: "DELETE",
  });
}

// ── Scheduled Tasks ──
export async function getScheduledTasks(projectId?: string): Promise<{ tasks: ScheduledTask[] }> {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return apiFetch<{ tasks: ScheduledTask[] }>(`/scheduled-tasks${q}`);
}

export async function createScheduledTask(data: Partial<ScheduledTask>): Promise<{ task: ScheduledTask }> {
  return apiFetch<{ task: ScheduledTask }>("/scheduled-tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateScheduledTask(id: string, data: Partial<ScheduledTask>): Promise<{ task: ScheduledTask }> {
  return apiFetch<{ task: ScheduledTask }>(`/scheduled-tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteScheduledTask(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/scheduled-tasks/${id}`, {
    method: "DELETE",
  });
}

export async function runScheduledTask(id: string): Promise<{ ok: boolean; output: string; run: RoutineRun }> {
  return apiFetch<{ ok: boolean; output: string; run: RoutineRun }>(`/scheduled-tasks/${id}/run`, {
    method: "POST",
  });
}

export async function getScheduledTaskRuns(id: string, limit: number = 20): Promise<{ runs: RoutineRun[] }> {
  return apiFetch<{ runs: RoutineRun[] }>(`/scheduled-tasks/${id}/runs?limit=${limit}`);
}

// ── Integrations ──
export async function getIntegrations(category?: string): Promise<{ integrations: Integration[] }> {
  const q = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<{ integrations: Integration[] }>(`/integrations${q}`);
}

export async function updateIntegration(
  id: string,
  data: { is_connected?: number; credentials_json?: string }
): Promise<{ integration: Integration }> {
  return apiFetch<{ integration: Integration }>(`/integrations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Conversations & Messages ──
export async function getConversations(agentId?: string, projectId?: string): Promise<{ conversations: Conversation[] }> {
  const params = new URLSearchParams();
  if (agentId) params.set("agentId", agentId);
  if (projectId) params.set("projectId", projectId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ conversations: Conversation[] }>(`/conversations${q}`);
}

export async function createConversation(agentId?: string, projectId?: string): Promise<{ conversation: Conversation }> {
  return apiFetch<{ conversation: Conversation }>("/conversations", {
    method: "POST",
    body: JSON.stringify({ agentId, projectId }),
  });
}

export async function getMessages(conversationId: string): Promise<{ messages: Message[] }> {
  return apiFetch<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
}

export async function deleteConversation(conversationId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

// ── Settings & Status ──
export async function getStatus(): Promise<SystemStats> {
  return apiFetch<SystemStats>("/status");
}

export async function getSettings(): Promise<{ baseURL: string; model: string; apiKeyMasked: string; source: string }> {
  return apiFetch<{ baseURL: string; model: string; apiKeyMasked: string; source: string }>("/settings");
}

export async function updateSettings(data: { baseURL?: string; model?: string; apiKey?: string }): Promise<any> {
  return apiFetch("/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function testSettings(data?: { baseURL?: string; apiKey?: string }): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>("/settings/test", {
    method: "POST",
    body: JSON.stringify(data || {}),
  });
}
