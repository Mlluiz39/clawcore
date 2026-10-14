// frontend/src/components/ProjectWorkspaceView.tsx
import { useState, useEffect, useRef } from "react";
import type { Project, Agent, Conversation, Message, ScheduledTask, Deliverable, MessageMetadata } from "../types";
import {
  getConversations,
  createConversation,
  getMessages,
  getScheduledTasks,
  runScheduledTask,
  getDeliverables,
} from "../api";
import {
  MessageSquare,
  FileText,
  Bot,
  RefreshCw,
  Send,
  Sparkles,
  Loader2,
  FileSpreadsheet,
  Check,
  Play,
  Calendar,
  Mail,
  Copy,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  TrendingUp,
  Activity,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ArrowRight,
} from "lucide-react";
import { marked } from "marked";

interface ProjectWorkspaceViewProps {
  project: Project;
  agents: Agent[];
  onGoToStudio?: (agentId?: string) => void;
  onGoToInbox?: () => void;
}

type WorkspaceTab = "conversation" | "pages" | "agents" | "routines";

function parseRoutineMetadata(msg: Message): MessageMetadata | null {
  if (!msg.metadata_json) return null;
  try {
    const parsed = JSON.parse(msg.metadata_json) as MessageMetadata;
    return parsed?.source === "routine" && parsed.routine_title ? parsed : null;
  } catch {
    return null;
  }
}

export function ProjectWorkspaceView({
  project,
  agents,
  onGoToStudio,
  onGoToInbox,
}: ProjectWorkspaceViewProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("conversation");
  const [showRightSidebar, setShowRightSidebar] = useState<boolean>(true);
  const [rightSidebarTab, setRightSidebarTab] = useState<"info" | "worklog">("info");

  // Project state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [routines, setRoutines] = useState<ScheduledTask[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [input, setInput] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("coo");
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);

  // Active project agent
  const projectAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  useEffect(() => {
    loadProjectData();
  }, [project.id]);

  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Polling for proactive messages & background routines
  useEffect(() => {
    if (isStreaming) return;
    const interval = setInterval(() => {
      if (isStreamingRef.current) return;
      if (activeConvId) {
        loadMessages(activeConvId);
      }
      loadProjectRoutines();
    }, 10_000);
    return () => clearInterval(interval);
  }, [activeConvId, project.id, isStreaming]);

  const loadProjectData = async () => {
    await Promise.all([loadProjectConversations(), loadProjectRoutines(), loadProjectDeliverables()]);
  };

  const loadProjectConversations = async () => {
    try {
      const res = await getConversations(undefined, project.id);
      setConversations(res.conversations);
      if (res.conversations.length > 0) {
        setActiveConvId(res.conversations[0].id);
      } else {
        // Criar conversa padrão para o projeto
        const newConv = await createConversation("coo", project.id);
        setConversations([newConv.conversation]);
        setActiveConvId(newConv.conversation.id);
      }
    } catch (err) {
      console.error("Erro ao carregar conversas do projeto:", err);
    }
  };

  const loadProjectRoutines = async () => {
    try {
      const res = await getScheduledTasks(project.id);
      setRoutines(res.tasks);
    } catch (err) {
      console.error("Erro ao carregar rotinas do projeto:", err);
    }
  };

  const loadProjectDeliverables = async () => {
    try {
      const res = await getDeliverables(undefined, project.id);
      setDeliverables(res.deliverables);
    } catch (err) {
      console.error("Erro ao carregar entregáveis do projeto:", err);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const res = await getMessages(convId);
      if (isStreamingRef.current) return;
      setMessages(res.messages);
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userText = input.trim();
    setInput("");

    // Otimista
    const tempUserMsg: Message = {
      role: "user",
      content: userText,
      created_at: Math.floor(Date.now() / 1000),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsStreaming(true);
    isStreamingRef.current = true;

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: userText,
          conversationId: activeConvId,
          agentId: selectedAgentId,
          projectId: project.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      let assistantContent = "";
      const tempAssistantMsg: Message = {
        role: "assistant",
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, tempAssistantMsg]);

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type === "chunk" && data.text) {
                  assistantContent += data.text;
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                      last.content = assistantContent;
                    }
                    return next;
                  });
                } else if (data.type === "conv_id" && data.conversationId) {
                  setActiveConvId(data.conversationId);
                }
              } catch {
                // ignora linhas não-JSON
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Erro no streaming do chat:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Erro ao comunicar com o agente: ${String(err)}`,
          created_at: Math.floor(Date.now() / 1000),
        },
      ]);
    } finally {
      setIsStreaming(false);
      isStreamingRef.current = false;
      if (activeConvId) {
        loadMessages(activeConvId);
      }
    }
  };

  const handleRunRoutine = async (taskId: string) => {
    try {
      setRunningTaskId(taskId);
      await runScheduledTask(taskId);
      await Promise.all([loadProjectRoutines(), loadProjectConversations()]);
    } catch (err) {
      alert("Erro ao disparar rotina: " + String(err));
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Renderizador do Chat (reutilizado na coluna principal e no Drawer lateral)
  const renderChatFeed = (isDrawer = false) => (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0d14]/60">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-[#64748b] text-xs">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
            <p>Nenhuma mensagem nesta conversa ainda.</p>
            <p className="mt-1 text-[11px] text-[#475569]">Pergunte algo ou solicite uma tarefa para a equipe do projeto.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const meta = parseRoutineMetadata(msg);
          const isAssistant = msg.role === "assistant";
          const msgKey = msg.id || `msg-${idx}`;

          return (
            <div
              key={msgKey}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* Badge Proactive */}
              {meta && (
                <div className="flex items-center gap-2 mb-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold">Proactive</span>
                  <span className="text-[#64748b]">·</span>
                  <span>Worked for {Math.round(meta.duration_ms / 1000)}s</span>
                  <span className="text-[#64748b]">·</span>
                  <span>{meta.steps} steps</span>
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                    : "bg-[#121622] text-[#e2e8f0] border border-white/[0.06]"
                }`}
              >
                {/* Cabeçalho de rotina */}
                {meta && (
                  <div className="mb-2 pb-2 border-b border-white/[0.08] flex items-center justify-between text-[11px] text-[#94a3b8]">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px]">
                        Fired
                      </span>
                      <span className="font-semibold text-white">{meta.routine_title}</span>
                    </div>
                  </div>
                )}

                {/* Conteúdo Markdown */}
                <div
                  className="prose prose-invert prose-xs max-w-none break-words"
                  dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || "") as string }}
                />

                {/* Card de Entregável Acoplado (caso haja entregáveis no projeto) */}
                {isAssistant && deliverables.length > 0 && idx === messages.length - 1 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="p-2.5 rounded-xl bg-[#0f172a] border border-emerald-500/30 flex items-center justify-between hover:border-emerald-500/50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-white truncate font-medium">
                            {deliverables[0].title}.csv
                          </p>
                          <span className="text-[10px] text-emerald-400 font-mono uppercase">CSV · Pronto</span>
                        </div>
                      </div>
                      {onGoToInbox && (
                        <button
                          onClick={onGoToInbox}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition-colors cursor-pointer"
                        >
                          Ver Inbox
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Ações da Mensagem */}
              {isAssistant && !msg.isStreaming && (
                <div className="flex items-center gap-1 mt-1 px-1 text-[#64748b]">
                  <button
                    onClick={() => handleCopyMessage(msgKey, msg.content)}
                    title="Copiar resposta"
                    className="p-1 hover:text-white rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    {copiedMsgId === msgKey ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    title="Útil"
                    className="p-1 hover:text-white rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    title="Não foi útil"
                    className="p-1 hover:text-white rounded hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => alert("Credit Rescue: verificação de execução sem débito registrada.")}
                    className="text-[10px] px-1.5 py-0.5 rounded text-[#94a3b8] hover:text-purple-300 hover:bg-purple-500/10 transition-colors cursor-pointer"
                  >
                    ✦ Credit Rescue
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de Chat */}
      <div className="p-3 border-t border-white/[0.06] bg-[#0c101a]">
        <div className="flex items-center justify-between mb-2 text-[11px] text-[#94a3b8]">
          <div className="flex items-center gap-1.5">
            <span>Talk to:</span>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="bg-[#161b26] border border-white/[0.08] text-white text-[11px] rounded-lg px-2 py-0.5 cursor-pointer outline-none focus:border-purple-500"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>
          {onGoToStudio && (
            <button
              onClick={() => onGoToStudio(selectedAgentId)}
              className="hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
            >
              <span>Abrir no Studio</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder="Boss, what stresses you out? Hand it over."
            className="w-full bg-[#121622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 pr-20 text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500/50"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            <span className="text-[10px] font-mono text-[#64748b] px-1.5 py-0.5 rounded bg-white/[0.02]">
              Smart ▾
            </span>
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors cursor-pointer"
            >
              {isStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#07090e]">
      {/* Workspace Header */}
      <header className="h-14 border-b border-white/[0.06] bg-[#0a0d14] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-sm text-white tracking-tight">{project.name}</h2>
          </div>

          {/* Abas Centrais */}
          <nav className="flex items-center gap-1 ml-4 border-l border-white/[0.08] pl-4">
            <button
              onClick={() => setActiveTab("conversation")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "conversation"
                  ? "bg-white/[0.08] text-white border border-white/[0.1]"
                  : "text-[#94a3b8] hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversation</span>
            </button>

            <button
              onClick={() => setActiveTab("pages")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "pages"
                  ? "bg-white/[0.08] text-white border border-white/[0.1]"
                  : "text-[#94a3b8] hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Pages</span>
            </button>

            <button
              onClick={() => setActiveTab("agents")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "agents"
                  ? "bg-white/[0.08] text-white border border-white/[0.1]"
                  : "text-[#94a3b8] hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Agents</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
                1
              </span>
            </button>

            <button
              onClick={() => setActiveTab("routines")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "routines"
                  ? "bg-white/[0.08] text-white border border-white/[0.1]"
                  : "text-[#94a3b8] hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Routines</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
                {routines.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Toggle Right Sidebar */}
        <button
          onClick={() => setShowRightSidebar(!showRightSidebar)}
          title={showRightSidebar ? "Ocultar painel direito" : "Mostrar painel direito"}
          className="p-1.5 rounded-lg hover:bg-white/[0.05] text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
        >
          {showRightSidebar ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </button>
      </header>

      {/* Workspace Body (Colunas Centrais + Coluna Direita) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Painel Central */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ABA CONVERSATION */}
          {activeTab === "conversation" && renderChatFeed(false)}

          {/* ABA PAGES */}
          {activeTab === "pages" && (
            <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
              <div className="max-w-2xl w-full text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                  <Activity className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">No pages yet</h3>
                  <p className="text-xs text-[#94a3b8] mt-1.5">
                    Create a page to get a live window into what your agents are doing and producing.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="p-4 rounded-xl bg-[#0d111a] border border-white/[0.06] hover:border-white/[0.1] transition-all">
                    <div className="flex items-center gap-2 mb-1.5 text-white font-semibold text-xs">
                      <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                      <h4>Track AI task progress</h4>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      See live updates as your AI agents execute tasks — step by step, in real time.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0d111a] border border-white/[0.06] hover:border-white/[0.1] transition-all">
                    <div className="flex items-center gap-2 mb-1.5 text-white font-semibold text-xs">
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <h4>View AI-processed data</h4>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      Inspect the data your AI has handled, such as processed emails, parsed records, or extracted...
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0d111a] border border-white/[0.06] hover:border-white/[0.1] transition-all">
                    <div className="flex items-center gap-2 mb-1.5 text-white font-semibold text-xs">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <h4>Charts and metrics</h4>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      Visualize trends and outcomes from AI tasks through auto-generated charts.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0d111a] border border-white/[0.06] hover:border-white/[0.1] transition-all">
                    <div className="flex items-center gap-2 mb-1.5 text-white font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <h4>Take action directly</h4>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      Interact with the AI's work — approve, reject, or trigger follow-up actions right from the UI.
                    </p>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => alert("Criador de Pages: em desenvolvimento nesta fatia.")}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition-all cursor-pointer flex items-center gap-2 mx-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Page</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ABA AGENTS */}
          {activeTab === "agents" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
                  Agentes Alocados no Projeto
                </h3>
                {onGoToStudio && (
                  <button
                    onClick={() => onGoToStudio(selectedAgentId)}
                    className="text-xs text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                  >
                    + Gerenciar Agentes
                  </button>
                )}
              </div>

              <div className="p-5 rounded-2xl bg-[#0d111a] border border-white/[0.06] max-w-xl space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white text-sm">
                      {projectAgent.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-white">{projectAgent.name}</h4>
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono">
                          Default
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748b]">{projectAgent.role}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#94a3b8] leading-relaxed">
                  {projectAgent.description}
                </p>

                {/* Rotinas do Agente */}
                <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                  <span className="text-[10px] font-mono text-[#64748b] uppercase">Rotinas Vinculadas</span>
                  {routines.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] text-xs text-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="truncate max-w-[280px]">{r.title}</span>
                      </div>
                      <span className="text-[10px] text-[#64748b] font-mono">{r.frequency}</span>
                    </div>
                  ))}
                </div>

                {/* Conectores & Canais */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#64748b]">Conectores:</span>
                    <div className="flex items-center gap-1">
                      <span className="p-1 rounded bg-white/[0.04] text-[#94a3b8]"><Mail className="w-3 h-3" /></span>
                      <span className="p-1 rounded bg-white/[0.04] text-[#94a3b8]"><Calendar className="w-3 h-3" /></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => alert("Canal Slack: disponível em breve.")}
                      className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-[#94a3b8] cursor-pointer"
                    >
                      + Add to Slack
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA ROUTINES */}
          {activeTab === "routines" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">Active ({routines.length})</span>
                  <span className="text-xs text-[#64748b]">Completed (0)</span>
                  <span className="text-xs text-[#64748b]">Paused (0)</span>
                </div>
              </div>

              {routines.length === 0 ? (
                <div className="text-center py-12 text-[#64748b] text-xs">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
                  <p>Nenhuma rotina configurada para este projeto.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {routines.map((routine) => (
                    <div
                      key={routine.id}
                      className="p-4 rounded-xl bg-[#0d111a] border border-white/[0.06] flex items-center justify-between hover:border-white/[0.1] transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <h4 className="font-semibold text-xs text-white">{routine.title}</h4>
                        </div>
                        <p className="text-[11px] text-[#64748b] flex items-center gap-2 font-mono">
                          <span>Repeats {routine.frequency}</span>
                          <span>·</span>
                          <span>Project: {project.name}</span>
                          <span>·</span>
                          <span>Agent: {projectAgent.name}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRunRoutine(routine.id)}
                          disabled={runningTaskId === routine.id}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          {runningTaskId === routine.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          <span>Run Now</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Painel Lateral Direito Contextual */}
        {showRightSidebar && (
          <aside className="w-80 border-l border-white/[0.06] bg-[#090c12] flex flex-col shrink-0 overflow-hidden">
            {/* Se aba for Conversation -> Project Info & AI Work Log */}
            {activeTab === "conversation" ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header das Tabs da Sidebar */}
                <div className="h-12 border-b border-white/[0.06] px-4 flex items-center gap-4">
                  <button
                    onClick={() => setRightSidebarTab("info")}
                    className={`text-xs font-medium transition-colors cursor-pointer ${
                      rightSidebarTab === "info" ? "text-white font-semibold border-b-2 border-purple-500 pb-1" : "text-[#64748b] hover:text-[#94a3b8]"
                    }`}
                  >
                    Project Info
                  </button>
                  <button
                    onClick={() => setRightSidebarTab("worklog")}
                    className={`text-xs font-medium transition-colors cursor-pointer ${
                      rightSidebarTab === "worklog" ? "text-white font-semibold border-b-2 border-purple-500 pb-1" : "text-[#64748b] hover:text-[#94a3b8]"
                    }`}
                  >
                    AI Work Log
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                  {rightSidebarTab === "info" ? (
                    <>
                      <div>
                        <h4 className="font-bold text-xs text-white">{project.name}</h4>
                        <p className="text-[11px] text-[#64748b] mt-0.5">{project.description}</p>
                      </div>

                      {/* STATS LAST 3 MONTHS */}
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider">
                          STATS · LAST 3 MONTHS
                        </span>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                          <div>
                            <span className="text-base font-bold text-white">1</span>
                            <p className="text-[10px] text-[#64748b]">Agents</p>
                          </div>
                          <div>
                            <span className="text-base font-bold text-white">{routines.length}</span>
                            <p className="text-[10px] text-[#64748b]">Runs</p>
                          </div>
                          <div>
                            <span className="text-base font-bold text-purple-300">364,2</span>
                            <p className="text-[10px] text-[#64748b]">Credits</p>
                          </div>
                        </div>
                      </div>

                      {/* Card do Agente Ativo */}
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-purple-600/30 text-purple-200 flex items-center justify-center font-bold text-xs">
                            {projectAgent.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-xs text-white">{projectAgent.name}</p>
                            <span className="text-[10px] text-[#64748b] font-mono">{routines.length} routines · 364 credits</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 pt-2">
                          <button
                            onClick={() => alert("Slack integration")}
                            className="flex-1 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-[#94a3b8] cursor-pointer"
                          >
                            + Add to Slack
                          </button>
                          <button
                            onClick={() => alert("Other tools integration")}
                            className="flex-1 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-[#94a3b8] cursor-pointer"
                          >
                            + Add tools
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider">
                        Atividades Recentes
                      </span>
                      {routines.map((r) => (
                        <div key={r.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-white">{r.title}</span>
                            <span className="text-[10px] text-emerald-400 font-mono">Sucesso</span>
                          </div>
                          <p className="text-[10px] text-[#64748b] mt-1">Executado proativamente pelo agente.</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Se estiver em Pages, Agents ou Routines -> Transiciona para Project Conversation Drawer */
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="h-12 border-b border-white/[0.06] px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                    <span>Project Conversation</span>
                  </div>
                </div>
                {renderChatFeed(true)}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
