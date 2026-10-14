// frontend/src/types.ts

export interface Agent {
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

export interface Integration {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  is_connected: number;
  credentials_json: string;
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

export interface MessageMetadata {
  source: "routine";
  routine_id: string;
  routine_title: string;
  frequency: ScheduledTask["frequency"];
  trigger: RoutineRun["trigger"];
  duration_ms: number;
  steps: number;
}

export interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  isAudio?: boolean;
  agentId?: string;
  created_at?: number;
  /** JSON com a atribuição da mensagem, quando publicada por uma rotina. */
  metadata_json?: string | null;
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
  title: string;
  created_at: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  created_at: number;
  updated_at: number;
  routines_count?: number;
  active_routines_count?: number;
  deliverables_count?: number;
}

export interface SystemStats {
  uptime: number;
  memory: number;
  skills: number;
  tools: number;
  toolNames: string[];
  conversations: number;
  messages: number;
  deliverables?: number;
  pendingApprovals?: number;
  provider: string;
  model: string;
  baseURL: string;
  apiKeyMasked: string;
}
