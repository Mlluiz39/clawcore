// frontend/src/components/AutomationsView.tsx
import { useState, useEffect, type FormEvent } from "react";
import type { ScheduledTask, Agent, RoutineRun } from "../types";
import {
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  runScheduledTask,
  getScheduledTaskRuns,
} from "../api";
import {
  Clock,
  Plus,
  Play,
  Trash2,
  Loader2,
  History,
} from "lucide-react";

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  return ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)}s`;
}

function formatRunStatus(run: RoutineRun): string {
  if (run.status === "running") return "Em execução";
  if (run.status === "error") return `Falhou${run.error ? `: ${run.error}` : ""}`;
  return "Sucesso";
}

interface AutomationsViewProps {
  agents: Agent[];
  onGoToInbox?: () => void;
}

export function AutomationsView({ agents }: AutomationsViewProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [runsByTask, setRunsByTask] = useState<Record<string, RoutineRun[]>>({});
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Form
  const [agentId, setAgentId] = useState("cmo");
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<ScheduledTask["frequency"]>("daily");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const res = await getScheduledTasks();
      setTasks(res.tasks);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title || !prompt) return;

    try {
      await createScheduledTask({ agent_id: agentId, title, frequency, prompt });
      setShowCreateModal(false);
      setTitle("");
      setPrompt("");
      loadTasks();
    } catch (err) {
      alert("Erro ao criar automação: " + String(err));
    }
  };

  const handleToggleEnable = async (task: ScheduledTask) => {
    try {
      await updateScheduledTask(task.id, { is_enabled: task.is_enabled ? 0 : 1 });
      loadTasks();
    } catch (err) {
      alert("Erro ao atualizar: " + String(err));
    }
  };

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    try {
      const res = await runScheduledTask(id);
      // O resultado vai para o thread do agente no Studio, com atribuição da rotina.
      alert(
        `✅ Rotina executada (${res.run?.steps ?? 0} passos em ${formatDuration(res.run?.duration_ms ?? 0)}). ` +
          "O resultado foi publicado no thread do agente e pode ter gerado entregáveis na Inbox."
      );
      loadTasks();
      await loadRuns(id);
      setExpandedTaskId(id);
    } catch (err) {
      alert("Erro ao disparar rotina: " + String(err));
      loadTasks();
    } finally {
      setRunningId(null);
    }
  };

  const loadRuns = async (taskId: string) => {
    try {
      const res = await getScheduledTaskRuns(taskId);
      setRunsByTask((prev) => ({ ...prev, [taskId]: res.runs }));
      setHistoryError(null);
    } catch (err) {
      setHistoryError("Não foi possível carregar o histórico de execuções.");
      console.error(err);
    }
  };

  const handleToggleHistory = async (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    if (!runsByTask[taskId]) await loadRuns(taskId);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta tarefa agendada?")) return;
    try {
      await deleteScheduledTask(id);
      loadTasks();
    } catch (err) {
      alert("Erro ao excluir: " + String(err));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#07090e] overflow-y-auto p-8 custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-white/[0.06] max-w-6xl mx-auto w-full">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Automações em Segundo Plano</h2>
          </div>
          <p className="text-xs text-[#94a3b8] mt-1">
            Tarefas periódicas executadas pelo motor que geram entregáveis e alimentam sua Inbox automaticamente.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Automação</span>
        </button>
      </div>

      <section aria-label="Modelos de rotinas" className="max-w-6xl mx-auto w-full mt-6">
        <h3 className="text-sm font-semibold text-white">Comece com uma rotina pronta</h3>
        <p className="text-xs text-[#94a3b8] mt-1">Gatilho por horário. E-mail e calendário ainda não disponíveis; nenhuma integração é conectada automaticamente.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {[
            { title: "Resumo diário", agent: "coo", prompt: "Leia o perfil compartilhado da empresa e prepare um resumo das prioridades informadas, pendências e próximos passos. Não invente dados de e-mail ou calendário. Salve usando create_deliverable." },
            { title: "Monitorar concorrentes", agent: "researcher", prompt: "Use o perfil da empresa e web_search para pesquisar notícias do nicho e concorrentes. Inclua fontes, datas e limitações. Salve relatório usando create_deliverable." },
            { title: "Conteúdo semanal", agent: "cmo", prompt: "Com base no perfil compartilhado e tom de voz, gere três posts para LinkedIn com texto completo e chamada para ação. Salve usando create_deliverable para aprovação humana. Não publique." },
          ].map((template) => (
            <button key={template.title} type="button" onClick={() => {
              setTitle(template.title);
              setAgentId(template.agent);
              setFrequency(template.agent === "cmo" ? "weekly" : "daily");
              setPrompt(template.prompt);
              setShowCreateModal(true);
            }} className="min-h-11 p-4 text-left rounded-xl border border-white/10 bg-[#0b0f17] hover:border-purple-400 focus-visible:outline-2 focus-visible:outline-purple-400">
              <span className="text-sm font-semibold">{template.title}</span>
              <span className="block text-xs text-[#94a3b8] mt-1">Revisar instrução e criar rotina</span>
            </button>
          ))}
        </div>
      </section>

      {/* Task List */}
      <div className="max-w-6xl mx-auto w-full mt-8 space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center py-24 text-[#64748b]">
            <Clock className="w-12 h-12 mx-auto stroke-1 opacity-50 mb-3" />
            <p className="text-sm font-medium text-white">Nenhuma automação agendada</p>
            <p className="text-xs mt-1">
              Configure uma tarefa diária para o CMO gerar posts ou para o Engenheiro auditar métricas.
            </p>
          </div>
        ) : (
          tasks.map((task) => {
            const agent = agents.find((a) => a.id === task.agent_id);
            const isRunning = runningId === task.id;

            return (
              <div
                key={task.id}
                className="p-5 rounded-2xl bg-[#0b0f17] border border-white/[0.06] hover:border-purple-500/30 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-300 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{task.title}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[#cbd5e1] font-mono capitalize">
                        {task.frequency}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        {agent?.name || task.agent_id}
                      </span>
                    </div>

                    <p className="text-xs text-[#94a3b8] mt-1 line-clamp-1">{task.prompt}</p>

                    <div className="mt-2 flex items-center gap-4 text-[10px] text-[#64748b]">
                      <span>
                        Última execução:{" "}
                        {task.last_run_at
                          ? new Date(task.last_run_at * 1000).toLocaleString("pt-BR")
                          : "Nunca executado"}
                      </span>
                      <span>
                        Próxima execução:{" "}
                        {task.next_run_at
                          ? new Date(task.next_run_at * 1000).toLocaleString("pt-BR")
                          : "Em breve"}
                      </span>
                      {runsByTask[task.id]?.[0] && (
                        <span>
                          Última execução: {formatRunStatus(runsByTask[task.id][0])} ·{" "}
                          {formatDuration(runsByTask[task.id][0].duration_ms)} · {runsByTask[task.id][0].steps} passos
                        </span>
                      )}
                    </div>

                    {expandedTaskId === task.id && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06]">
                        <p className="text-[11px] font-semibold text-[#94a3b8] mb-2">Histórico de execuções</p>
                        {(runsByTask[task.id]?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-[#64748b]">Nenhuma execução registrada ainda.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {runsByTask[task.id].map((run) => (
                              <li key={run.id} className="text-[11px] text-[#94a3b8] flex flex-wrap items-center gap-x-2">
                                <span className={run.status === "error" ? "text-red-300" : run.status === "running" ? "text-amber-300" : "text-emerald-300"}>
                                  {formatRunStatus(run)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{new Date(run.started_at * 1000).toLocaleString("pt-BR")}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatDuration(run.duration_ms)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{run.steps} passos</span>
                                <span aria-hidden="true">·</span>
                                <span>{run.trigger === "manual" ? "manual" : "agendada"}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {historyError && <p className="text-[11px] text-red-300 mt-2">{historyError}</p>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleEnable(task)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                      task.is_enabled
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                        : "bg-white/[0.03] text-[#64748b] border-white/[0.06] hover:bg-white/[0.06]"
                    }`}
                  >
                    {task.is_enabled ? "Ativo" : "Pausado"}
                  </button>

                  <button
                    onClick={() => handleToggleHistory(task.id)}
                    className="p-2.5 rounded-xl text-[#94a3b8] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                    title="Histórico de execuções"
                    aria-expanded={expandedTaskId === task.id}
                  >
                    <History className="w-4 h-4" />
                  </button>

                  <button
                    disabled={isRunning}
                    onClick={() => handleRunNow(task.id)}
                    className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-all shadow-md cursor-pointer"
                    title="Disparar manualmente agora"
                  >
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                  </button>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-2.5 rounded-xl text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Criar Tarefa */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f17] border border-white/[0.1] rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Criar Nova Automação</h3>
            <p className="text-xs text-[#94a3b8] mt-1">
              O motor rodará esta tarefa periodicamente em background e depositará o resultado na Inbox.
            </p>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Título da Automação</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Geração do Lote Semanal de Posts para LinkedIn"
                  required
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Agente Responsável</label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Frequência</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as ScheduledTask["frequency"])}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="hourly">A cada hora</option>
                    <option value="daily">Diariamente</option>
                    <option value="weekly">Semanalmente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#cbd5e1] block mb-1">Instrução / Prompt para o Agente</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: Gere 3 posts inovadores para o LinkedIn com chamada para direct e salve como entregável..."
                  rows={4}
                  required
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#94a3b8] hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all cursor-pointer"
                >
                  Criar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
